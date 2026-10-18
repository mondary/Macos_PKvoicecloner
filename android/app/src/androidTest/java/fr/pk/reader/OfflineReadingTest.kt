package fr.pk.reader

import android.content.Context
import android.content.Intent
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import java.io.File
import java.util.concurrent.atomic.AtomicReference

/** A real downloaded Piper model, real PCM and real background service. */
@RunWith(AndroidJUnit4::class)
class OfflineReadingTest {
    private fun eventually(timeout:Long=60000, condition:()->Boolean) {
        val deadline=System.currentTimeMillis()+timeout
        while(System.currentTimeMillis()<deadline){if(condition())return;Thread.sleep(150)}
        assertTrue("Condition was not reached before timeout",condition())
    }
    @Test fun downloadedVoiceReadsWithTheActivityInBackgroundAndResumes(){
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        ModelStore.install(context,"neural:siwis")
        assertTrue(ModelStore.installed(context,"neural:siwis"))
        val wave=File(context.cacheDir,"integration.wav")
        ModelStore.generate(context,"neural:siwis","Bonjour, votre livre vous attend.",wave)
        val bytes=wave.readBytes()
        assertTrue(bytes.size>10000)
        assertEquals("RIFF",String(bytes,0,4))
        assertTrue("PCM contains non-silent samples",bytes.drop(44).count{it.toInt()!=0}>1000)
        val queue=JSONObject().put("bookId","integration").put("title","Test de lecture")
            .put("voice","neural:siwis").put("language","fr").put("rate",1).put("index",0)
            .put("segments",JSONArray(listOf("Les livres nous accompagnent au fil des jours, dans les trains et dans le calme de nos maisons.","La deuxième phrase doit continuer même lorsque l’écran du lecteur est fermé.","Voici le dernier passage de notre livre de vérification.")))
        File(context.filesDir,"reading-queue.json").writeText(queue.toString())
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            val pageText=AtomicReference("")
            eventually(30000){
                scenario.onActivity { it.bridge.webView.evaluateJavascript("document.body.innerText") { value->pageText.set(value) } }
                pageText.get().contains("Mes livres")
            }
            scenario.onActivity { it.startForegroundService(Intent(it,ReadingService::class.java).setAction("load")) }
            eventually{ReadingService.savedState(context).optString("bookId")=="integration"}
            scenario.onActivity { it.startForegroundService(Intent(it,ReadingService::class.java).setAction("play")) }
            eventually{val state=ReadingService.savedState(context);state.optBoolean("playing")&&!state.optBoolean("loading")}
            // HOME backgrounds the WebView. The native service must still reach sentence two.
            InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand("input keyevent KEYCODE_HOME").close()
            InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand("input keyevent KEYCODE_SLEEP").close()
            eventually(90000){ReadingService.savedState(context).optInt("index")>=1}
            context.startService(Intent(context,ReadingService::class.java).setAction("pause"))
            eventually{!ReadingService.savedState(context).optBoolean("playing")}
            val position=ReadingService.savedState(context).optInt("index")
            Thread.sleep(1200)
            assertEquals(position,ReadingService.savedState(context).optInt("index"))
            assertTrue(File(context.filesDir,"audio/integration").listFiles().orEmpty().any{it.extension=="wav"})
            InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand("input keyevent KEYCODE_WAKEUP").close()
        }
        context.stopService(Intent(context,ReadingService::class.java))
    }
}
