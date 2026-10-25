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

data class VoiceModel(val id: String, val name: String, val lang: String, val archive: String, val sha: String, val bytes: Long,
                      /** Locuteur d'un modèle multi-voix (UPMC : jessica 0, pierre 1). */
                      val sid: Int = 0,
                      /** Modèle partagé par plusieurs entrées (même archive, locuteurs différents). */
                      val base: String = "")

object ModelStore {
    /** Moteurs résidents : trois suffisent aux rôles d'un chapitre (narrateur +
     *  deux personnages) ; chaque moteur pèse ~30 Mo, on ne garde pas les cinq
     *  voix françaises en mémoire. L'éviction est LRU : une voix réutilisée
     *  repasse en tête (voir generate). */
    private const val MOTEURS_CHAUDS = 3
    val catalog = listOf(
        VoiceModel("siwis", "Siwis", "fr-FR", "vits-piper-fr_FR-siwis-medium-int8", "3909cff9b3cfd4820c66aa13bf554315c82e34899c161f0b446ece372bc4b5ec", 20914888),
        VoiceModel("siwis_leger", "Siwis · légère", "fr-FR", "vits-piper-fr_FR-siwis-low-int8", "c001d38068a316c93601a7d10d0b983c9e61adf2af0c4533595483c7f6cba614", 13317962),
        VoiceModel("tom", "Tom", "fr-FR", "vits-piper-fr_FR-tom-medium-int8", "b158f884eb4231b8dddd372c3dc506949630c992a8e48ca692a90323e8bb4e09", 21019617),
        VoiceModel("gilles", "Gilles", "fr-FR", "vits-piper-fr_FR-gilles-low-int8", "92d2bfd9b6b32b9787557c466b15620e453aecc10ec521762660e034941b3c43", 21248965),
        VoiceModel("upmc", "UPMC · Jessica", "fr-FR", "vits-piper-fr_FR-upmc-medium-int8", "ec4930dd3778e19e6ea2bc0d16c5a50a82f428ba7ee43dceab1df7efbaf9f1d3", 22588190, sid = 0),
        VoiceModel("upmc_pierre", "UPMC · Pierre", "fr-FR", "vits-piper-fr_FR-upmc-medium-int8", "ec4930dd3778e19e6ea2bc0d16c5a50a82f428ba7ee43dceab1df7efbaf9f1d3", 22588190, sid = 1, base = "upmc"),
        VoiceModel("tjiho1", "Tjiho 1", "fr-FR", "vits-piper-fr_FR-tjiho-model1-int8", "37b67c70f16495737eb053dad44ce3fb57e6cc1137de33c9ac72b5c4c7f82cb7", 21032428),
        VoiceModel("tjiho2", "Tjiho 2", "fr-FR", "vits-piper-fr_FR-tjiho-model2-int8", "28b22750bffbcdcb69065bf1151dea552e449a1e729f7fd07ec02a0cc273f942", 21030373),
        VoiceModel("tjiho3", "Tjiho 3", "fr-FR", "vits-piper-fr_FR-tjiho-model3-int8", "bf12e13b73c55ff57d54eaf4fa0f0223c738c9549e2b62358fe9814cc2a6c623", 21062372),
        VoiceModel("miro", "Miro", "fr-FR", "vits-piper-fr_FR-miro-high-int8", "301fc4b6a49f6feb466cb2e03e8f26e81060cc82675f7ef77b812fee36781911", 21268816),
        VoiceModel("lessac", "Lessac", "en-US", "vits-piper-en_US-lessac-medium-int8", "f1c6d0295cf16087b05f80fdca5b44daca5cd78e2c425d419a42ba34929805f9", 20969179)
    )
    val downloads = ConcurrentHashMap<String, JSONObject>()
    private val engines = linkedMapOf<String, OfflineTts>()
    private fun rootId(m: VoiceModel) = m.base.ifEmpty { m.id }
    private fun directory(context: Context, id: String) = File(context.filesDir, "models/$id")
    private fun model(id: String) = catalog.find { it.id == id.removePrefix("neural:") } ?: error("Modèle inconnu")
    fun installed(context: Context, id: String) = File(directory(context, rootId(model(id))), "ready").exists()
    fun list(context: Context): JSONArray = JSONArray().apply {
        catalog.forEach { m -> put(JSONObject().put("id", "neural:${m.id}").put("name", m.name).put("language", m.lang)
            .put("kind", "neural").put("detail", "${m.lang} · Piper · sur votre téléphone").put("size", Math.round(m.bytes/100000.0)/10.0)
            .put("installed", installed(context, m.id))) }
    }
    fun install(context: Context, voiceId: String) {
        val m = model(voiceId)
        val key = "neural:${m.id}"
        if (installed(context, m.id)) { downloads[key] = JSONObject().put("progress", 100); return }
        require(context.filesDir.usableSpace > 250L*1024*1024) { "Libérez au moins 250 Mo avant de télécharger cette voix." }
        val root = directory(context, rootId(m))
        val staging = File(root.parentFile, "${rootId(m)}.installing")
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
        engines.remove(rootId(m))?.release()
        directory(context,rootId(m)).deleteRecursively()
        catalog.filter { rootId(it) == rootId(m) }.forEach { downloads.remove("neural:${it.id}") }
    }
    @Synchronized fun generate(context: Context, voiceId: String, text: String, destination: File) {
        val m = model(voiceId)
        val racine = rootId(m)
        require(installed(context,m.id)) { "Téléchargez d’abord la voix ${m.name}." }
        val cached = engines.remove(racine)
        val engine = cached ?: run {
            if (engines.size >= MOTEURS_CHAUDS) engines.remove(engines.keys.first())?.release()
            val root = directory(context,racine)
            val onnx = root.walkTopDown().first { it.extension == "onnx" }
            val tokens = root.walkTopDown().first { it.name == "tokens.txt" }
            val data = root.walkTopDown().first { it.name == "espeak-ng-data" && it.isDirectory }
            OfflineTts(config = OfflineTtsConfig(model = OfflineTtsModelConfig(
                vits = OfflineTtsVitsModelConfig(model=onnx.absolutePath, tokens=tokens.absolutePath, dataDir=data.absolutePath),
                numThreads = 2
            )))
        }
        engines[racine] = engine
        val generated = engine.generate(text = text, sid = m.sid, speed = 1f)
        require(generated.samples.isNotEmpty()) { "La voix n’a produit aucun son." }
        check(generated.save(destination.absolutePath)) { "Impossible d’enregistrer l’audio." }
    }
}
