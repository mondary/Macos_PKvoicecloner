package fr.pk.reader

import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.core.content.FileProvider
import androidx.core.content.pm.PackageInfoCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors

/**
 * Mise à jour intégrée : lit les releases GitHub `pk-…`, télécharge l'APK,
 * vérifie son empreinte SHA-256 puis sa signature avant d'ouvrir l'installateur
 * Android. Aucune donnée de lecture ne quitte le téléphone.
 */
@CapacitorPlugin(name = "Update")
class UpdatePlugin : Plugin() {
    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val releasesUrl =
        "https://api.github.com/repos/mondary/Macos_PKvoicecloner/releases?per_page=100"

    @PluginMethod
    fun check(call: PluginCall) {
        worker.execute {
            try {
                val current = versionName()
                val releases = JSONArray(httpGet(releasesUrl))
                var best: JSONObject? = null
                var bestVersion = current
                for (i in 0 until releases.length()) {
                    val release = releases.getJSONObject(i)
                    if (release.optBoolean("draft") || release.optBoolean("prerelease")) continue
                    val tag = release.optString("tag_name")
                    if (!tag.startsWith("pk-")) continue
                    val candidate = tag.removePrefix("pk-")
                    if (compareVersions(candidate, bestVersion) > 0) {
                        best = release
                        bestVersion = candidate
                    }
                }
                val release = best
                val asset = release?.let { bestAsset(it) }
                if (release == null || asset == null) {
                    call.resolve(JSObject().put("current", current).put("available", false))
                    return@execute
                }
                call.resolve(
                    JSObject()
                        .put("current", current)
                        .put("version", bestVersion)
                        .put("available", true)
                        .put("url", asset.optString("browser_download_url"))
                        .put("size", asset.optLong("size"))
                        .put("digest", asset.optString("digest"))
                        .put("notes", release.optString("body").take(6000))
                        .put("page", release.optString("html_url"))
                )
            } catch (e: Exception) {
                call.reject(e.message ?: "Vérification impossible", e)
            }
        }
    }

    @PluginMethod
    fun download(call: PluginCall) {
        val url = call.getString("url") ?: return call.reject("Adresse de mise à jour manquante")
        val version = call.getString("version") ?: return call.reject("Version manquante")
        val digest = call.getString("digest").orEmpty()
        val expectedSize = call.getLong("size") ?: 0L
        worker.execute {
            var part: File? = null
            var finalFile: File? = null
            try {
                require(version.matches(Regex("[0-9]+(\\.[0-9]+)*"))) { "Version de mise à jour invalide." }
                require(url.startsWith("https://")) { "La mise à jour doit venir d’une adresse sécurisée." }
                verifierHote(URL(url))
                val dir = File(context.cacheDir, "updates").apply { mkdirs() }
                dir.listFiles()?.forEach { it.delete() }
                val apk = File(dir, "PK-Reader-$version.apk")
                val partFile = File(dir, "PK-Reader-$version.part")
                part = partFile
                val connection = openFollowing(url, "PK-Reader/$version")
                try {
                    val code = connection.responseCode
                    require(code in 200..299) { "Téléchargement refusé (HTTP $code)." }
                    val total = connection.contentLengthLong.takeIf { it > 0 } ?: expectedSize
                    val sha = MessageDigest.getInstance("SHA-256")
                    var copied = 0L
                    var lastPercent = -1
                    connection.inputStream.use { input ->
                        FileOutputStream(partFile).use { output ->
                            val buffer = ByteArray(64 * 1024)
                            while (true) {
                                val read = input.read(buffer)
                                if (read < 0) break
                                output.write(buffer, 0, read)
                                sha.update(buffer, 0, read)
                                copied += read
                                if (total > 0) {
                                    val percent = ((copied * 100) / total).toInt()
                                    if (percent != lastPercent && percent % 2 == 0) {
                                        lastPercent = percent
                                        publierProgression(percent)
                                    }
                                }
                            }
                        }
                    }
                    require(expectedSize <= 0 || copied == expectedSize) { "Le téléchargement est incomplet." }
                    if (digest.startsWith("sha256:")) {
                        val expected = digest.removePrefix("sha256:").lowercase()
                        val actual = sha.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
                        require(actual == expected) { "Le fichier téléchargé est corrompu (empreinte différente)." }
                    }
                    require(partFile.renameTo(apk)) { "Impossible de finaliser le téléchargement." }
                    part = null
                    finalFile = apk
                    verifierApk(apk)
                    publierProgression(100)
                    call.resolve(JSObject().put("path", apk.absolutePath))
                } finally {
                    connection.disconnect()
                }
            } catch (e: Exception) {
                part?.delete()
                finalFile?.delete()
                call.reject(e.message ?: "Téléchargement interrompu", e)
            }
        }
    }

    @PluginMethod
    fun canInstall(call: PluginCall) {
        val allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
            context.packageManager.canRequestPackageInstalls()
        call.resolve(JSObject().put("allowed", allowed))
    }

    @PluginMethod
    fun openInstallSettings(call: PluginCall) {
        try {
            activity.startActivity(
                Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:${context.packageName}")
                )
            )
            call.resolve()
        } catch (e: Exception) {
            call.reject("Impossible d’ouvrir les autorisations d’installation.", e)
        }
    }

    @PluginMethod
    fun install(call: PluginCall) {
        val path = call.getString("path") ?: return call.reject("Fichier de mise à jour manquant")
        val file = File(path)
        if (!file.exists()) return call.reject("Le fichier de mise à jour a disparu. Relance la vérification.")
        try {
            verifierApk(file)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                !context.packageManager.canRequestPackageInstalls()
            ) {
                return call.reject("PK Reader doit être autorisé à installer des applications.")
            }
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            activity.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject(e.message ?: "Installation impossible", e)
        }
    }

    override fun handleOnDestroy() {
        worker.shutdown()
    }

    private fun publierProgression(percent: Int) {
        main.post { notifyListeners("progress", JSObject().put("progress", percent)) }
    }

    private fun versionName(): String =
        context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "0"

    private fun bestAsset(release: JSONObject): JSONObject? {
        val assets = release.optJSONArray("assets") ?: return null
        for (i in 0 until assets.length()) {
            val asset = assets.getJSONObject(i)
            if (asset.optString("name") == "PK-Reader-latest.apk") return asset
        }
        for (i in 0 until assets.length()) {
            val asset = assets.getJSONObject(i)
            val name = asset.optString("name")
            if (name.startsWith("PK-Reader-") && name.endsWith(".apk") && name != "PK-Reader-latest.apk") {
                return asset
            }
        }
        return null
    }

    private fun httpGet(url: String): String {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15000
            readTimeout = 20000
            instanceFollowRedirects = true
            setRequestProperty("Accept", "application/vnd.github+json")
            setRequestProperty("User-Agent", "PK-Reader/${versionName()}")
            setRequestProperty("X-GitHub-Api-Version", "2022-11-28")
        }
        try {
            val code = connection.responseCode
            if (code !in 200..299) {
                val detail = connection.errorStream?.bufferedReader()?.use { it.readText() }?.take(300)
                error("GitHub a refusé la vérification (HTTP $code). ${detail.orEmpty()}")
            }
            return connection.inputStream.bufferedReader().use { it.readText() }
        } finally {
            connection.disconnect()
        }
    }

    /** Suit les redirections GitHub sans quitter les domaines autorisés. */
    private fun openFollowing(rawUrl: String, userAgent: String): HttpURLConnection {
        var current = URL(rawUrl)
        for (i in 0 until 5) {
            verifierHote(current)
            val connection = (current.openConnection() as HttpURLConnection).apply {
                connectTimeout = 20000
                readTimeout = 60000
                instanceFollowRedirects = false
                setRequestProperty("User-Agent", userAgent)
                setRequestProperty("Accept", "application/octet-stream")
            }
            val code = connection.responseCode
            if (code in 300..399) {
                val location = connection.getHeaderField("Location")?.takeIf { it.isNotBlank() }
                    ?: error("Redirection de téléchargement invalide.")
                connection.disconnect()
                current = URL(current, location)
                continue
            }
            return connection
        }
        error("Trop de redirections pour télécharger la mise à jour.")
    }

    private fun verifierHote(url: URL) {
        val host = url.host.lowercase()
        require(
            url.protocol == "https" &&
                (host == "github.com" || host.endsWith(".github.com") || host.endsWith(".githubusercontent.com"))
        ) { "Adresse de mise à jour inattendue : $host." }
    }

    @Suppress("DEPRECATION")
    private fun verifierApk(file: File) {
        val pm = context.packageManager
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            PackageManager.GET_SIGNING_CERTIFICATES
        } else {
            PackageManager.GET_SIGNATURES
        }
        val archive = pm.getPackageArchiveInfo(file.absolutePath, flags)
            ?: error("Le fichier téléchargé n’est pas une application Android valide.")
        val current = pm.getPackageInfo(context.packageName, flags)
        require(archive.packageName == context.packageName) {
            "Cette mise à jour ne concerne pas PK Reader."
        }
        require(PackageInfoCompat.getLongVersionCode(archive) > PackageInfoCompat.getLongVersionCode(current)) {
            "Cette mise à jour n’est pas plus récente que la version installée."
        }
        require(signatures(archive).isNotEmpty() && signatures(archive) == signatures(current)) {
            "La mise à jour n’est pas signée par la même clé que l’application installée."
        }
    }

    @Suppress("DEPRECATION")
    private fun signatures(info: PackageInfo): Set<String> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        info.signingInfo?.apkContentsSigners?.map { it.toCharsString() }?.toSet().orEmpty()
    } else {
        info.signatures?.map { it.toCharsString() }?.toSet().orEmpty()
    }

    private fun compareVersions(a: String, b: String): Int {
        val left = a.split('.')
        val right = b.split('.')
        for (i in 0 until maxOf(left.size, right.size)) {
            val x = left.getOrNull(i)?.toIntOrNull() ?: 0
            val y = right.getOrNull(i)?.toIntOrNull() ?: 0
            if (x != y) return x.compareTo(y)
        }
        return 0
    }
}
