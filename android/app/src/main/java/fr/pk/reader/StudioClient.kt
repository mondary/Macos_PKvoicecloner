package fr.pk.reader

import org.json.JSONObject
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URI
import java.io.File

class StudioClient(private val server: String, private val token: String) {
    init {
        val uri = URI(server)
        require(uri.scheme in listOf("http", "https") && !uri.host.isNullOrBlank() && uri.userInfo == null && uri.query == null && uri.fragment == null) { "Adresse du studio invalide." }
        require(token.length >= 16) { "Recopiez le code de connexion affiché par le Mac." }
    }
    private fun connection(path: String, timeout: Int = 20000): HttpURLConnection {
        val c = URI(server.trimEnd('/') + path).toURL().openConnection() as HttpURLConnection
        c.connectTimeout = 10000; c.readTimeout = timeout; c.instanceFollowRedirects = false
        c.setRequestProperty("Authorization", "Bearer $token")
        return c
    }
    private fun request(path: String, body: JSONObject? = null, timeout: Int = 20000): String {
        val c = connection(path, timeout)
        try {
            if (body != null) { c.requestMethod="POST"; c.doOutput=true; c.setRequestProperty("Content-Type","application/json"); c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) } }
            val status = c.responseCode
            if (status !in 200..299) {
                val detail = c.errorStream?.bufferedReader()?.use { it.readText().take(300) } ?: ""
                error(if(status==401) "Code de connexion incorrect." else "Studio : HTTP $status. $detail")
            }
            return c.inputStream.bufferedReader().use { it.readText() }
        } finally { c.disconnect() }
    }
    /** Analyse studio : distribution (personnages + genre) et un locuteur par phrase.
     *  L'IA tourne sur le Mac ; le téléphone n'embarque aucun modèle de langage. */
    fun analyser(titre: String, phrases: List<String>): String {
        val body = JSONObject().put("titre", titre).put("phrases", JSONArray(phrases))
        return request("/api/attribuer", body, timeout = 600000)
    }
    fun voices(): JSONArray {
        val raw = request("/api/voix")
        val source = if(raw.trimStart().startsWith("[")) JSONArray(raw) else JSONObject(raw).optJSONArray("voix") ?: JSONArray()
        return JSONArray().apply { for(i in 0 until source.length()) {
            val voice=source.getJSONObject(i)
            put(JSONObject().put("id","clone:${voice.getString("id")}").put("name",voice.optString("nom","Ma voix"))
                .put("language","fr-FR").put("kind","clone").put("installed",true).put("network",true).put("detail","PK Voice Studio · génération sur votre Mac"))
        } }
    }
    fun generate(voice: String, text: String, destination: File, cancelled: () -> Boolean) {
        val job = JSONObject(request("/api/generer",JSONObject().put("texte",text).put("reference_id",voice.removePrefix("clone:")).put("vitesse",1))).getString("job")
        val deadline = System.currentTimeMillis() + 300000
        while(System.currentTimeMillis()<deadline) {
            if(cancelled()) throw InterruptedException("Génération interrompue")
            val state = JSONObject(request("/api/job/$job"))
            when(state.optString("etat")) {
                "erreur" -> error(state.optString("erreur","Erreur de génération"))
                "pret" -> {
                    val file = state.getString("fichier"); require(file.matches(Regex("[a-zA-Z0-9_.-]+")))
                    val c=connection("/api/audio/$file")
                    try {
                        check(c.responseCode==200) { "Audio indisponible." }
                        c.inputStream.use { input -> destination.outputStream().use { output ->
                            val buffer=ByteArray(65536); var total=0
                            while(true) { val n=input.read(buffer); if(n<0)break; total+=n;require(total<100*1024*1024);output.write(buffer,0,n) }
                        } }
                    } finally { c.disconnect() }
                    return
                }
            }
            Thread.sleep(700)
        }
        error("Le studio n’a pas répondu en cinq minutes. Vérifiez le modèle sur votre Mac.")
    }
}
