package fr.pk.reader

import android.content.*
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import androidx.core.content.ContextCompat
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.ConcurrentHashMap

@CapacitorPlugin(name="Reader")
class ReaderPlugin : Plugin() {
    private val worker = Executors.newSingleThreadExecutor()
    private val analysisWorker = Executors.newSingleThreadExecutor()
    private val downloads = Executors.newSingleThreadExecutor()
    private val installing = ConcurrentHashMap.newKeySet<String>()
    private val main = Handler(Looper.getMainLooper())
    private var tts: TextToSpeech? = null
    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            intent?.getStringExtra("state")?.let { notifyListeners("state",JSObject(it)) }
        }
    }
    override fun load() {
        ContextCompat.registerReceiver(context,receiver,IntentFilter(ReadingService.STATE),ContextCompat.RECEIVER_NOT_EXPORTED)
    }
    override fun handleOnDestroy() {
        context.unregisterReceiver(receiver); tts?.shutdown(); worker.shutdown(); downloads.shutdown(); analysisWorker.shutdown()
    }
    @PluginMethod fun getState(call: PluginCall) { call.resolve(JSObject(ReadingService.savedState(context).toString())) }
    @PluginMethod fun models(call: PluginCall) {
        call.resolve(JSObject().put("voices",ModelStore.list(context)).put("downloads",JSONObject(ModelStore.downloads as Map<*, *>)))
    }
    @PluginMethod fun installModel(call: PluginCall) {
        val id=call.getString("id") ?: return call.reject("Voix manquante")
        if(!ModelStore.catalog.any { "neural:${it.id}"==id }) return call.reject("Voix inconnue")
        if(installing.add(id)) {
            ModelStore.downloads[id]=JSONObject().put("progress",0)
            downloads.execute { try { ModelStore.install(context,id) } catch(e:Exception) {
                ModelStore.downloads[id]=JSONObject().put("progress",0).put("error",e.message ?: "Téléchargement interrompu")
            } finally { installing.remove(id) } }
        }
        call.resolve()
    }
    @PluginMethod fun removeModel(call: PluginCall) = work(call) {
        val id=call.getString("id") ?: error("Voix manquante")
        require(!installing.contains(id)) { "Attendez la fin du téléchargement." }
        ModelStore.remove(context,id); call.resolve()
    }
    @PluginMethod fun voices(call: PluginCall) {
        main.post {
            tts?.shutdown()
            tts = TextToSpeech(context) { status -> main.post {
                if(status!=TextToSpeech.SUCCESS) { call.resolve(JSObject().put("voices",JSONArray())); return@post }
                val engine=tts ?: return@post
                val list=JSONArray()
                list.put(JSONObject().put("id","system:default").put("name","Voix du téléphone").put("language","fr-FR").put("kind","system").put("installed",true).put("detail","Voix Android par défaut"))
                engine.voices.orEmpty().sortedWith(compareBy({ !it.locale.language.equals("fr") }, { it.name })).forEach { v ->
                    list.put(JSONObject().put("id","system:${engine.defaultEngine}|${v.name}").put("name",v.name).put("language",v.locale.toLanguageTag())
                        .put("kind","system").put("installed",true).put("network",v.isNetworkConnectionRequired).put("detail","${v.locale.displayLanguage} · ${if(v.isNetworkConnectionRequired) "connexion requise" else "hors ligne"}"))
                }
                engine.engines.filter { it.name != engine.defaultEngine }.forEach { e ->
                    list.put(JSONObject().put("id","system:${e.name}|").put("name",e.label).put("language","fr-FR").put("kind","system").put("installed",true).put("detail","Moteur Android installé"))
                }
                call.resolve(JSObject().put("voices",list))
            } }
        }
    }
    @PluginMethod fun voiceSettings(call: PluginCall) {
        try { activity.startActivity(Intent("com.android.settings.TTS_SETTINGS")); call.resolve() }
        catch(e: Exception) { call.reject("Les réglages de synthèse vocale ne sont pas disponibles.",e) }
    }
    @PluginMethod fun connect(call: PluginCall) = work(call) {
        val client=StudioClient(call.getString("server") ?: "",call.getString("token") ?: "")
        call.resolve(JSObject().put("voices",client.voices()))
    }
    @PluginMethod fun analyser(call: PluginCall) { analysisWorker.execute { try {
        val server = call.getString("server") ?: error("Adresse du studio manquante")
        val token = call.getString("token") ?: error("Code de connexion manquant")
        val titre = (call.getString("titre") ?: "Livre").take(120)
        val source = call.getArray("phrases") ?: error("Chapitre vide")
        require(source.length() in 1..400) { "Chapitre trop long pour l’analyse (400 phrases maximum)." }
        val phrases = ArrayList<String>(source.length())
        for (i in 0 until source.length()) {
            val phrase = runCatching { source.getString(i) }.getOrNull()?.trim().orEmpty()
            require(phrase.length in 1..600) { "Passage invalide pour l’analyse." }
            phrases.add(phrase)
        }
        val personnages = call.getArray("personnages") ?: JSArray()
        require(personnages.length() <= 200) { "Distribution trop volumineuse." }
        call.resolve(JSObject.fromJSONObject(JSONObject(StudioClient(server, token).analyser(titre, phrases, personnages))))
    } catch (e: Exception) { call.reject(e.message ?: "Analyse interrompue", e) } } }

    @PluginMethod fun iaConfig(call: PluginCall) { call.resolve(JSObject.fromJSONObject(PhoneAI.publicConfig(context))) }
    @PluginMethod fun saveIA(call: PluginCall) { analysisWorker.execute { try {
        call.resolve(JSObject.fromJSONObject(PhoneAI.configure(context, call.getString("url").orEmpty(),
            call.getString("modele").orEmpty(), call.getString("cle").orEmpty())))
    } catch (e: Exception) { call.reject(e.message ?: "Configuration IA impossible", e) } } }
    @PluginMethod fun clearIA(call: PluginCall) { call.resolve(JSObject.fromJSONObject(PhoneAI.clear(context))) }
    @PluginMethod fun chatIA(call: PluginCall) { analysisWorker.execute { try {
        val texte = PhoneAI.chat(context, call.getString("revision").orEmpty(), call.getString("message").orEmpty(), call.getBoolean("json") ?: true)
        call.resolve(JSObject().put("texte", texte))
    } catch (e: Exception) { call.reject(e.message ?: "Fournisseur IA injoignable", e) } } }
    @PluginMethod fun load(call: PluginCall) = work(call) {
        val data=call.data
        val id=data.optString("bookId")
        require(id.matches(Regex("[a-zA-Z0-9-]{1,80}"))) { "Livre invalide" }
        val segments=data.optJSONArray("segments") ?: error("Livre vide")
        require(segments.length() in 1..200000) { "Livre trop volumineux" }
        for(i in 0 until segments.length()) require(segments.getString(i).length in 1..1000) { "Passage trop long" }
        val file=File(context.filesDir,"reading-queue.json")
        val temporary=File(context.filesDir,"reading-queue.tmp")
        temporary.writeText(data.toString()); check(temporary.renameTo(file))
        main.post {
            try { ContextCompat.startForegroundService(context,Intent(context,ReadingService::class.java).setAction("load")); call.resolve() }
            catch(e:Exception) { call.reject(e.message,e) }
        }
    }
    @PluginMethod fun command(call: PluginCall) {
        val action=call.getString("action") ?: return call.reject("Action manquante")
        if(action !in listOf("play","pause","seek","rate","sleep","prepare")) return call.reject("Action inconnue")
        val intent=Intent(context,ReadingService::class.java).setAction(action).putExtra("options",call.data.toString())
        main.post {
            try { ContextCompat.startForegroundService(context,intent); call.resolve() }
            catch(e:Exception) { call.reject(e.message,e) }
        }
    }
    @PluginMethod fun clearAudio(call: PluginCall) = work(call) {
        val id=call.getString("bookId") ?: error("Livre manquant")
        require(id.matches(Regex("[a-zA-Z0-9-]{1,80}")))
        File(context.filesDir,"audio/$id").deleteRecursively(); call.resolve()
    }
    private fun work(call: PluginCall, action: ()->Unit) {
        worker.execute { try { action() } catch(e:Exception) { call.reject(e.message ?: "Opération impossible",e) } }
    }
}
