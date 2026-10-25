package fr.pk.reader

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Fournisseur propre au lecteur. La clé ne revient jamais dans la WebView. */
object PhoneAI {
    private const val STORE = "phone-ai"
    private const val KEY_ALIAS = "pk-reader-phone-ai"
    data class Config(val url: String, val model: String, val key: String, val revision: String)

    fun publicConfig(context: Context): JSONObject {
        val prefs = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)
        return JSONObject().put("url", prefs.getString("url", ""))
            .put("modele", prefs.getString("model", ""))
            .put("revision", prefs.getString("revision", ""))
            .put("enabled", prefs.contains("revision")).put("hasKey", !prefs.getString("secret", "").isNullOrEmpty())
    }

    fun endpoint(value: String): String {
        val base = value.trim().trimEnd('/').replace(Regex("/chat/completions$", RegexOption.IGNORE_CASE), "")
        val uri = URI(base)
        require(uri.scheme == "https" && !uri.host.isNullOrBlank() && uri.userInfo == null && uri.query == null && uri.fragment == null) {
            "Saisissez l’adresse HTTPS du fournisseur (sans clé dans l’URL)."
        }
        return base
    }

    /** Enregistre la configuration (clé comprise) avant de la tester : un échec
     *  réseau ou une option refusée ne fait plus ressaisir la clé. La configuration
     *  n'est activée (revision) que si le test réussit. */
    fun configure(context: Context, url: String, model: String, suppliedKey: String): JSONObject {
        val base = endpoint(url)
        require(model.trim().isNotEmpty() && model.length <= 200) { "Nom du modèle requis." }
        val prefs = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)
        val ancienneUrl = prefs.getString("url", "")
        // Zen et Go partagent la même clé OpenCode : la réutiliser évite de la
        // ressaisir quand on bascule de l'un à l'autre.
        val cleReutilisable = base == ancienneUrl || (estOpenCode(base) && estOpenCode(ancienneUrl))
        val key = suppliedKey.trim().ifEmpty {
            if (cleReutilisable) decrypt(context) else ""
        }
        require(!key.contains('\n') && !key.contains('\r')) { "Clé API invalide." }
        if (key.isEmpty() && !cleReutilisable) {
            return publicConfig(context).put("erreur", "Collez la clé API du fournisseur choisi.")
        }
        val config = Config(base, model.trim(), key, UUID.randomUUID().toString())

        val edition = prefs.edit().putString("url", config.url).putString("model", config.model)
        if (key.isEmpty()) edition.remove("secret").remove("iv")
        else {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, secretKey()) }
            val encrypted = cipher.doFinal(key.toByteArray(Charsets.UTF_8))
            edition.putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
                .putString("secret", Base64.encodeToString(encrypted, Base64.NO_WRAP))
        }
        check(edition.commit()) { "Enregistrement impossible." }

        val test = runCatching {
            complete(context, config, "Réponds uniquement en JSON : {\"pret\": true}", true, 60)
        }
        val erreur = test.fold(
            onSuccess = { if (it.isNullOrBlank()) "Le fournisseur a renvoyé une réponse vide." else null },
            onFailure = { it.message ?: "Le test a échoué." },
        )
        if (erreur != null) {
            prefs.edit().remove("revision").apply()
            return publicConfig(context).put("erreur", erreur)
        }
        check(prefs.edit().putString("revision", config.revision).commit()) { "Enregistrement impossible." }
        return publicConfig(context)
    }

    fun clear(context: Context): JSONObject {
        check(context.getSharedPreferences(STORE, Context.MODE_PRIVATE).edit().clear().commit())
        return publicConfig(context)
    }

    /** Liste des modèles du fournisseur (GET /models). La clé n'est utilisée que
     *  pour cet appel : elle n'est pas enregistrée ici. */
    fun modeles(context: Context, url: String, cle: String): List<String> {
        val base = endpoint(url)
        require(cle.isNotBlank()) { "Collez la clé API pour charger les modèles." }
        val connexion = (URL(modelesUrl(base)).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15000; readTimeout = 20000; requestMethod = "GET"
            setRequestProperty("Authorization", "Bearer $cle")
            setRequestProperty("Accept", "application/json")
            setRequestProperty("User-Agent", agent(context))
            if (estOpenCode(base)) setRequestProperty("x-opencode-session", session(context))
        }
        try {
            val code = connexion.responseCode
            val bytes = lire(if (code in 200..299) connexion.inputStream else connexion.errorStream)
            require(code in 200..299) { when (code) {
                401, 403 -> "Clé refusée par le fournisseur — vérifiez-la."
                else -> "Le fournisseur n’a pas renvoyé sa liste de modèles (HTTP $code). Choisissez un modèle proposé ou saisissez son identifiant."
            } }
            val data = JSONObject(String(bytes, Charsets.UTF_8)).optJSONArray("data")
                ?: error("Liste de modèles inattendue. Choisissez un modèle proposé ou saisissez son identifiant.")
            val inutiles = listOf("embed", "whisper", "tts", "dall-e", "moderation", "audio", "image", "rerank")
            val noms = (0 until data.length()).mapNotNull { data.optJSONObject(it)?.optString("id")?.takeIf { id -> id.isNotBlank() } }
                .filterNot { id -> inutiles.any { id.contains(it, ignoreCase = true) } }
                .distinct().sorted()
            require(noms.isNotEmpty()) { "Aucun modèle de conversation dans la liste du fournisseur." }
            return noms.take(300)
        } finally { connexion.disconnect() }
    }

    fun chat(context: Context, revision: String, message: String, json: Boolean): String {
        val prefs = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)
        require(revision.isNotEmpty() && revision == prefs.getString("revision", "")) {
            "La configuration IA a changé. Reprenez l’analyse avec le modèle actuel."
        }
        require(message.length in 1..160000) { "Extrait trop volumineux pour l’analyse." }
        return complete(context, Config(prefs.getString("url", "")!!, prefs.getString("model", "")!!, decrypt(context), revision), message, json)
    }

    /** Agent identifiable : OpenCode Go demande un client explicite, pas un
     *  agent HTTP générique. */
    private fun agent(context: Context): String {
        val version = runCatching {
            context.packageManager.getPackageInfo(context.packageName, 0).versionName
        }.getOrNull().orEmpty().ifBlank { "1.0" }
        return "PK-Reader/$version (Android)"
    }

    /** OpenCode Go expose sa liste sous /inference/go/v1/models, alors que le
     *  chat passe par /inference/go/openai/v1 : appeler /models sur ce dernier
     *  renvoie 404. Les autres fournisseurs gardent <base>/models. */
    private fun modelesUrl(base: String): String {
        val propre = base.trimEnd('/')
        val go = "https://opencode.ai/inference/go/openai/v1"
        return if (propre.equals(go, ignoreCase = true)) "https://opencode.ai/inference/go/v1/models"
        else "$propre/models"
    }

    /** Identifiant de session stable : OpenCode Go s'en sert pour le routage et
     *  le cache de prompt. Il reste local au téléphone. */
    private fun session(context: Context): String {
        val prefs = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)
        prefs.getString("session", null)?.let { return it }
        val id = UUID.randomUUID().toString()
        prefs.edit().putString("session", id).apply()
        return id
    }

    private fun estOpenCode(url: String): Boolean {
        val host = runCatching { URI(url).host }.getOrNull() ?: return false
        return host.equals("opencode.ai", true) || host.endsWith(".opencode.ai", true)
    }

    private fun secretKey(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }

    private fun decrypt(context: Context): String {
        val prefs = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)
        val secret = prefs.getString("secret", null) ?: return ""
        val iv = Base64.decode(prefs.getString("iv", ""), Base64.NO_WRAP)
        return Cipher.getInstance("AES/GCM/NoPadding").run {
            init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, iv))
            String(doFinal(Base64.decode(secret, Base64.NO_WRAP)), Charsets.UTF_8)
        }
    }

    private fun lire(stream: java.io.InputStream?): ByteArray {
        if (stream == null) return ByteArray(0)
        return stream.use {
            val sortie = java.io.ByteArrayOutputStream()
            val tampon = ByteArray(16 * 1024)
            while (sortie.size() <= 1_048_576) {
                val n = it.read(tampon)
                if (n < 0) break
                sortie.write(tampon, 0, n)
            }
            sortie.toByteArray()
        }
    }

    private fun complete(context: Context, config: Config, message: String, json: Boolean, timeout: Int = 300): String {
        val payload = JSONObject().put("model", config.model).put("temperature", 0.1)
            .put("messages", JSONArray().put(JSONObject().put("role", "user").put("content", message)))
        if (json) payload.put("response_format", JSONObject().put("type", "json_object"))
        repeat(3) {
            val connection = (URL("${config.url}/chat/completions").openConnection() as HttpURLConnection).apply {
                connectTimeout = 20000; readTimeout = timeout * 1000; requestMethod = "POST"; doOutput = true
                instanceFollowRedirects = false
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("User-Agent", agent(context))
                if (estOpenCode(config.url)) setRequestProperty("x-opencode-session", session(context))
                if (config.key.isNotEmpty()) setRequestProperty("Authorization", "Bearer ${config.key}")
            }
            try {
                connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
                val code = connection.responseCode
                val stream = if (code in 200..299) connection.inputStream else connection.errorStream
                val bytes = lire(stream)
                require(bytes.size <= 1_048_576) { "Réponse IA trop volumineuse." }
                val body = String(bytes, Charsets.UTF_8)
                // Le mode JSON est l'option la plus souvent refusée (Zen, certains
                // modèles) : un seul réessai sans, puis sans temperature si refusée.
                if (code == 400 && payload.has("response_format")) {
                    payload.remove("response_format"); return@repeat
                }
                if (code == 400 && payload.has("temperature") && body.contains("temperature", true)) {
                    payload.remove("temperature"); return@repeat
                }
                require(code in 200..299) {
                    val masque = if (config.key.length >= 6) body.replace(config.key, "***") else body
                    val detail = masque.replace(Regex("\\s+"), " ").take(400).ifBlank { "sans détail" }
                    when {
                        body.contains("FreeUsageLimitError") || body.contains("Free usage limit", true) ->
                            "Ce modèle gratuit OpenCode ne fonctionne que dans l’application OpenCode. Choisissez un modèle payant, ou OpenCode Go avec un abonnement. Détail : $detail"
                        body.contains("MissingSessionID") ->
                            "OpenCode Go a refusé la requête faute d’identifiant de session. Mettez l’application à jour puis réessayez. Détail : $detail"
                        code == 401 || code == 403 -> "Clé refusée ou modèle non accessible (HTTP $code). Détail : $detail"
                        code == 429 -> "Quota IA atteint (HTTP 429). Détail : $detail"
                        code in 500..599 -> "Fournisseur IA indisponible (HTTP $code). Détail : $detail"
                        else -> "Requête IA refusée (HTTP $code) : $detail"
                    }
                }
                val choice = JSONObject(body).getJSONArray("choices").getJSONObject(0)
                require(choice.optString("finish_reason") != "length") { "Réponse IA tronquée. Réessayez avec un autre modèle." }
                val content = choice.getJSONObject("message").opt("content")
                require(content is String && content.isNotBlank()) { "Le modèle n’a renvoyé aucun texte exploitable." }
                return content
            } finally { connection.disconnect() }
        }
        error("Le fournisseur ne prend pas en charge le format demandé.")
    }
}
