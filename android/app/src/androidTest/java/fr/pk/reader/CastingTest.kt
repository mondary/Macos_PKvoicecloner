package fr.pk.reader

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CastingTest {
    @Test fun unconfirmedChapterCannotBeReadEvenAfterSeekingInsideIt() {
        val queue = JSONObject().put("chapterStarts", JSONArray().put(0).put(12).put(30))
            .put("chapterStops", JSONArray().put(12))
        assertFalse(ChapterGate.requiresReview(queue, 0))
        assertTrue(ChapterGate.requiresReview(queue, 12))
        assertTrue(ChapterGate.requiresReview(queue, 18))
        assertFalse(ChapterGate.requiresReview(queue, 30))
        queue.put("chapterStops", JSONArray())
        assertFalse(ChapterGate.requiresReview(queue, 18))
        assertFalse(ChapterGate.requiresReview(JSONObject(), 0))
    }
    @Test fun eachSentenceUsesItsRoleWithIndependentPitchAndCombinedRate() {
        val cast = JSONObject().put("enabled",true).put("characters",JSONArray()
            .put(JSONObject().put("id","narrator").put("name","Narrateur").put("voice","neural:siwis").put("pitch",1.2).put("rate",1))
            .put(JSONObject().put("id","pierre").put("name","Pierre").put("voice","neural:tom").put("pitch",.8).put("rate",.9)))
            .put("assignments",JSONObject().put("1","pierre").put("2","removed"))
        val queue = JSONObject().put("voice","system:default").put("rate",1.5).put("casting",cast)
        assertEquals("neural:siwis",SpeechProfile.at(queue,0).voice)
        assertEquals(1.2f,SpeechProfile.at(queue,0).pitch,.001f)
        assertEquals("neural:tom",SpeechProfile.at(queue,1).voice)
        assertEquals(.8f,SpeechProfile.at(queue,1).pitch,.001f)
        assertEquals(1.35f,SpeechProfile.at(queue,1).rate,.001f)
        assertEquals("Narrateur",SpeechProfile.at(queue,2).role)
        cast.put("enabled",false)
        assertEquals("system:default",SpeechProfile.at(queue,1).voice)
        assertEquals(1f,SpeechProfile.at(queue,1).pitch,.001f)
        cast.put("enabled",true).getJSONArray("characters").getJSONObject(0).put("voice","")
        queue.put("voice","clone:abcdef")
        assertEquals("system:default",SpeechProfile.at(queue,0).voice)
    }
}
