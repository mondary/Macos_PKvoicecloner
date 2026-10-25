package fr.pk.reader

import org.json.JSONObject

/** Limites persistées avec la file : une commande casque ne peut pas démarrer
 *  un chapitre dont les nouveaux personnages attendent encore confirmation. */
object ChapterGate {
    fun requiresReview(queue: JSONObject, index: Int): Boolean {
        val stops = queue.optJSONArray("chapterStops") ?: return false
        val starts = queue.optJSONArray("chapterStarts")
        val chapter = if (starts == null) index else
            (0 until starts.length()).map { starts.optInt(it) }.lastOrNull { it <= index } ?: index
        return (0 until stops.length()).any { stops.optInt(it) == chapter }
    }
}
