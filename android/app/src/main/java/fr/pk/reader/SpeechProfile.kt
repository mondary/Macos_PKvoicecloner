package fr.pk.reader

import org.json.JSONObject

/** Resolves every sentence independently, also while the WebView is asleep. */
data class SpeechProfile(val voice: String, val pitch: Float, val rate: Float, val role: String) {
    companion object {
        fun at(queue: JSONObject, index: Int): SpeechProfile {
            val casting = queue.optJSONObject("casting")
            val enabled = casting?.optBoolean("enabled") == true
            val id = if (enabled) casting?.optJSONObject("assignments")?.optString(index.toString(), "narrator") ?: "narrator" else ""
            val characters = casting?.optJSONArray("characters")
            var role: JSONObject? = null
            var narrator: JSONObject? = null
            if (enabled && characters != null) for (i in 0 until characters.length()) {
                val candidate = characters.optJSONObject(i) ?: continue
                if (candidate.optString("id") == id) role = candidate
                if (candidate.optString("id") == "narrator") narrator = candidate
            }
            if (enabled && role == null) role = narrator
            var selected = role?.optString("voice").orEmpty().ifBlank { queue.optString("voice", "system:default") }
            if (enabled && selected.startsWith("clone:")) selected = "system:default"
            val pitch = (role?.optDouble("pitch", 1.0) ?: 1.0).takeIf { it.isFinite() } ?: 1.0
            val localRate = (role?.optDouble("rate", 1.0) ?: 1.0).takeIf { it.isFinite() } ?: 1.0
            val rate = queue.optDouble("rate", 1.0).takeIf { it.isFinite() } ?: 1.0
            return SpeechProfile(selected, pitch.toFloat().coerceIn(.5f, 2f),
                (rate * localRate).toFloat().coerceIn(.5f, 3f), role?.optString("name").orEmpty())
        }
    }
}
