package fr.pk.reader

import android.content.Context
import com.k2fsa.sherpa.onnx.*
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap

data class VoiceModel(val id: String, val name: String, val lang: String, val archive: String, val sha: String, val bytes: Long)

object ModelStore {
    val catalog = listOf(
        VoiceModel("siwis", "Siwis", "fr-FR", "vits-piper-fr_FR-siwis-medium-int8", "3909cff9b3cfd4820c66aa13bf554315c82e34899c161f0b446ece372bc4b5ec", 20914888),
        VoiceModel("tom", "Tom", "fr-FR", "vits-piper-fr_FR-tom-medium-int8", "b158f884eb4231b8dddd372c3dc506949630c992a8e48ca692a90323e8bb4e09", 21019617),
        VoiceModel("lessac", "Lessac", "en-US", "vits-piper-en_US-lessac-medium-int8", "f1c6d0295cf16087b05f80fdca5b44daca5cd78e2c425d419a42ba34929805f9", 20969179)
    )
    val downloads = ConcurrentHashMap<String, JSONObject>()
    private var engine: OfflineTts? = null
    private var engineId = ""
    private fun directory(context: Context, id: String) = File(context.filesDir, "models/$id")
    private fun model(id: String) = catalog.find { it.id == id.removePrefix("neural:") } ?: error("Modèle inconnu")
    fun installed(context: Context, id: String) = File(directory(context, model(id).id), "ready").exists()
    fun list(context: Context): JSONArray = JSONArray().apply {
        catalog.forEach { m -> put(JSONObject().put("id", "neural:${m.id}").put("name", m.name).put("language", m.lang)
            .put("kind", "neural").put("detail", "${m.lang} · Piper · sur votre téléphone").put("size", Math.round(m.bytes/100000.0)/10.0).put("installed", installed(context, m.id))) }
    }
    fun install(context: Context, voiceId: String) {
        val m = model(voiceId)
        val key = "neural:${m.id}"
        if (installed(context, m.id)) { downloads[key] = JSONObject().put("progress", 100); return }
        require(context.filesDir.usableSpace > 250L*1024*1024) { "Libérez au moins 250 Mo avant de télécharger cette voix." }
        val root = directory(context, m.id)
        val staging = File(root.parentFile, "${m.id}.installing")
        val archive = File(context.cacheDir, "${m.id}.tar.bz2")
        downloads[key] = JSONObject().put("progress", 0)
        try {
            staging.deleteRecursively(); check(staging.mkdirs())
            val connection = URI("https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/${m.archive}.tar.bz2").toURL().openConnection() as HttpURLConnection
            connection.connectTimeout = 20000; connection.readTimeout = 30000
            val hash = MessageDigest.getInstance("SHA-256")
            try {
                check(connection.responseCode == 200) { "Téléchargement impossible (HTTP ${connection.responseCode})." }
                connection.inputStream.use { input -> archive.outputStream().use { output ->
                    val buffer = ByteArray(65536); var total = 0L
                    while (true) {
                        val count = input.read(buffer); if (count < 0) break
                        total += count; require(total <= m.bytes + 1024) { "Archive trop volumineuse" }
                        output.write(buffer,0,count); hash.update(buffer,0,count)
                        downloads[key] = JSONObject().put("progress", total*90.0/m.bytes)
                    }
                } }
            } finally { connection.disconnect() }
            check(hash.digest().joinToString("") { "%02x".format(it) } == m.sha) { "Le fichier téléchargé est incomplet. Réessayez." }
            BZip2CompressorInputStream(archive.inputStream().buffered()).use { compressed ->
                TarArchiveInputStream(compressed).use { tar ->
                    var total = 0L
                    while (true) {
                        val entry = tar.nextTarEntry ?: break
                        require(!entry.isSymbolicLink && !entry.isLink) { "Lien interdit dans le modèle" }
                        val destination = File(staging, entry.name)
                        require(destination.canonicalPath.startsWith(staging.canonicalPath + File.separator)) { "Chemin de modèle invalide" }
                        if (entry.isDirectory) { destination.mkdirs(); continue }
                        require(entry.isFile) { "Type de fichier de modèle invalide" }
                        total += entry.size; require(total < 250L*1024*1024) { "Modèle trop volumineux" }
                        destination.parentFile?.mkdirs(); destination.outputStream().use { tar.copyTo(it) }
                    }
                }
            }
            check(staging.walkTopDown().any { it.extension == "onnx" } && staging.walkTopDown().any { it.name == "tokens.txt" }) { "Modèle incomplet" }
            root.deleteRecursively(); check(staging.renameTo(root)) { "Impossible d’installer le modèle." }
            File(root, "ready").writeText(m.sha)
            downloads[key] = JSONObject().put("progress", 100)
        } catch (e: Exception) {
            downloads[key] = JSONObject().put("progress", 0).put("error", e.message ?: "Téléchargement interrompu")
            throw e
        } finally { archive.delete(); staging.deleteRecursively() }
    }
    @Synchronized fun remove(context: Context, voiceId: String) {
        val m = model(voiceId)
        if (engineId == m.id) { engine?.release(); engine = null; engineId = "" }
        directory(context,m.id).deleteRecursively(); downloads.remove("neural:${m.id}")
    }
    @Synchronized fun generate(context: Context, voiceId: String, text: String, destination: File) {
        val m = model(voiceId)
        require(installed(context,m.id)) { "Téléchargez d’abord la voix ${m.name}." }
        if (engineId != m.id || engine == null) {
            engine?.release(); engine = null; engineId = ""
            val root = directory(context,m.id)
            val onnx = root.walkTopDown().first { it.extension == "onnx" }
            val tokens = root.walkTopDown().first { it.name == "tokens.txt" }
            val data = root.walkTopDown().first { it.name == "espeak-ng-data" && it.isDirectory }
            engine = OfflineTts(config = OfflineTtsConfig(model = OfflineTtsModelConfig(
                vits = OfflineTtsVitsModelConfig(model=onnx.absolutePath, tokens=tokens.absolutePath, dataDir=data.absolutePath),
                numThreads = 2
            )))
            engineId = m.id
        }
        val generated = engine!!.generate(text = text, sid = 0, speed = 1f)
        require(generated.samples.isNotEmpty()) { "La voix n’a produit aucun son." }
        check(generated.save(destination.absolutePath)) { "Impossible d’enregistrer l’audio." }
    }
}
