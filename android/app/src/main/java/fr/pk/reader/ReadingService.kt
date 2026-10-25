package fr.pk.reader

import android.app.*
import android.annotation.SuppressLint
import android.content.*
import android.content.pm.ServiceInfo
import android.media.*
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.*
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.Locale
import java.util.concurrent.Executors

class ReadingService : Service() {
    companion object {
        const val STATE="fr.pk.reader.PLAYBACK_STATE"
        private const val CHANNEL="pk_reader_playback"
        private const val NOTIFICATION=71
        fun savedState(context:Context):JSONObject {
            val raw=context.getSharedPreferences("playback",MODE_PRIVATE).getString("state",null)
            val state=try { JSONObject(raw ?: "{}") } catch(_:Exception) { JSONObject() }
            if(instance==null) state.put("playing",false).put("loading",false).put("preparing",false)
            return state
        }
        @Volatile private var instance:ReadingService?=null
    }
    private val main=Handler(Looper.getMainLooper())
    private val worker=Executors.newSingleThreadExecutor()
    private var queue=JSONObject()
    private var index=0
    private var playing=false
    private var loading=false
    private var awaitingChapter=false
    private var preparing=false
    private var prepared=0
    private var prepareTotal=0
    private var error=""
    private var rate=1f
    private var dureeMs=0
    private var motDebut=-1          // plage de caractères du mot lu (TTS Android)
    private var motFin=-1
    private var progressTicker:Runnable?=null
    @Volatile private var generation=0
    private var sleepAt=0L
    private var tts:TextToSpeech?=null
    private var ttsReady=false
    private var ttsEngine=""
    private var player:MediaPlayer?=null
    private lateinit var session:MediaSession
    private lateinit var audioManager:AudioManager
    private lateinit var focus:AudioFocusRequest
    private lateinit var wake:PowerManager.WakeLock
    private var foreground=false
    private val noisy=object:BroadcastReceiver(){override fun onReceive(c:Context?,i:Intent?){pause()}}
    private val sleepCheck=object:Runnable{
        override fun run(){ if(sleepAt>0 && System.currentTimeMillis()>=sleepAt){sleepAt=0;pause()}else if(sleepAt>0)main.postDelayed(this,1000) }
    }
    override fun onBind(intent:Intent?)=null
    override fun onCreate(){
        super.onCreate(); instance=this
        getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(CHANNEL,"Lecture des livres",NotificationManager.IMPORTANCE_LOW))
        audioManager=getSystemService(AudioManager::class.java)
        focus=AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            .setOnAudioFocusChangeListener({change->if(change<0)pause()},main).build()
        wake=(getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"PKReader:Speech")
        session=MediaSession(this,"PK Reader").apply {
            setCallback(object:MediaSession.Callback(){
                override fun onPlay(){play()}
                override fun onPause(){pause()}
                override fun onStop(){pause();stopSelf()}
                override fun onSkipToNext(){seek(index+1)}
                override fun onSkipToPrevious(){seek(index-1)}
            },main)
            isActive=true
        }
        ContextCompat.registerReceiver(this,noisy,IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),ContextCompat.RECEIVER_NOT_EXPORTED)
        restoreQueue()
    }
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int{
        val action=intent?.action ?: "pause"
        startMediaForeground(action=="prepare")
        val opts=try{JSONObject(intent?.getStringExtra("options") ?: "{}")}catch(_:Exception){JSONObject()}
        try {
            when(action){
                "load"->{awaitingChapter=false;pause();restoreQueue(true);publish()}
                "play"->play()
                "pause"->pause()
                "toggle"->if(playing||preparing)pause() else play()
                "next"->seek(index+1)
                "previous"->seek(index-1)
                "seek"->seek(opts.optInt("index",index))
                "rate"->{rate=opts.optDouble("rate",1.0).toFloat().coerceIn(.75f,3f);queue.put("rate",rate);persistQueue();if(playing){val at=index;pause();index=at;play()}else publish()}
                "sleep"->{val minutes=opts.optInt("minutes",0).coerceIn(0,180);sleepAt=if(minutes>0)System.currentTimeMillis()+minutes*60000L else 0;main.removeCallbacks(sleepCheck);if(sleepAt>0)main.post(sleepCheck);publish();if(!playing&&!preparing)endForeground()}
                "prepare"->prepare(opts.optInt("index",index),opts.optInt("end",index+1))
            }
        }catch(e:Exception){fail(e.message ?: "Lecture impossible")}
        return START_NOT_STICKY
    }
    private fun restoreQueue(fresh:Boolean=false){
        val file=File(filesDir,"reading-queue.json")
        if(!file.exists())return
        queue=JSONObject(file.readText())
        val saved=savedState(this)
        index=if(!fresh&&saved.optString("bookId")==queue.optString("bookId"))saved.optInt("index",queue.optInt("index")) else queue.optInt("index")
        rate=queue.optDouble("rate",1.0).toFloat().coerceIn(.75f,3f)
        error=""
        awaitingChapter=false
    }
    private fun count()=queue.optJSONArray("segments")?.length() ?: 0
    private fun text(at:Int)=queue.getJSONArray("segments").getString(at)
    private fun profile(at:Int=index)=SpeechProfile.at(queue,at)
    private fun voice()=profile().voice
    private fun persistQueue(){queue.put("index",index);File(filesDir,"reading-queue.json").writeText(queue.toString())}
    private fun play(){
        if(count()==0){fail("Ouvrez un livre pour commencer.");return}
        if(index>=count())index=0
        error="";startMediaForeground()
        if(audioManager.requestAudioFocus(focus)!=AudioManager.AUDIOFOCUS_REQUEST_GRANTED){fail("Une autre application utilise le son. Réessayez.");return}
        generation++;playing=true;preparing=false
        if(!wake.isHeld)wake.acquire(6*60*60*1000L)
        speak()
    }
    private fun pause(){
        generation++;playing=false;loading=false;preparing=false
        stopProgress();motDebut=-1;motFin=-1;dureeMs=0
        tts?.stop();player?.release();player=null
        audioManager.abandonAudioFocusRequest(focus)
        if(wake.isHeld)wake.release()
        publish();endForeground()
    }
    private fun seek(position:Int){
        val resume=playing
        pause();index=position.coerceIn(0,(count()-1).coerceAtLeast(0));error="";publish()
        if(resume)play()
    }
    private fun fail(message:String){error=message;pause()}
    private fun speak(){
        if(!playing)return
        if(index>=count()){pause();return}
        // Arrêt avant de prononcer un chapitre qui attend encore la validation
        // des voix. Les limites restent valables écran verrouillé.
        if(ChapterGate.requiresReview(queue,index)){
            awaitingChapter=true;pause();return
        }
        if(sleepAt>0&&System.currentTimeMillis()>=sleepAt){sleepAt=0;pause();return}
        val ticket=generation
        loading=true;publish()
        if(voice().startsWith("system:")){systemSpeak(ticket);return}
        val at=index;val config=JSONObject(queue.toString())
        worker.execute{
            try {
                val file=audioFile(config,at){ticket!=generation}
                main.post{
                    if(ticket!=generation||!playing)return@post
                    try {
                        player?.release()
                        player=MediaPlayer().apply{
                            setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                            setDataSource(file.absolutePath)
                            setOnPreparedListener { mp->
                                if(ticket!=generation){mp.release();return@setOnPreparedListener}
                                val speech=profile(at)
                                dureeMs=mp.duration;motDebut=-1;motFin=-1
                                mp.playbackParams=PlaybackParams().setSpeed(speech.rate).setPitch(speech.pitch)
                                loading=false;mp.start();publish();startProgress()
                            }
                            setOnCompletionListener{if(ticket==generation){stopProgress();motDebut=-1;dureeMs=0;index++;publish();speak()}}
                            setOnErrorListener{_,_,_->stopProgress();if(ticket==generation)fail("Ce passage audio est illisible.");true}
                            prepareAsync()
                        }
                    }catch(e:Exception){fail(e.message ?: "Lecture audio impossible")}
                }
            }catch(e:Exception){main.post{if(ticket==generation)fail(e.message ?: "Génération impossible")}}
        }
    }
    private fun systemSpeak(ticket:Int){
        val selected=voice().removePrefix("system:")
        val engine=if(selected=="default")"" else selected.substringBefore('|')
        if(tts==null||engine!=ttsEngine){
            tts?.shutdown();ttsReady=false;ttsEngine=engine
            val callback=TextToSpeech.OnInitListener{status->main.post{
                if(status!=TextToSpeech.SUCCESS){if(ticket==generation)fail("Aucune voix Android disponible. Téléchargez une voix Piper dans l’onglet Voix.");return@post}
                ttsReady=true
                if(ticket==generation&&playing)systemSpeak(ticket)
            }}
            tts=if(engine.isBlank())TextToSpeech(this,callback) else TextToSpeech(this,callback,engine)
            return
        }
        if(!ttsReady){main.postDelayed({if(ticket==generation&&playing)systemSpeak(ticket)},150);return}
        val synthesizer=tts!!
        val locale=Locale.forLanguageTag(queue.optString("language","fr"))
        val lang=synthesizer.setLanguage(locale)
        if(lang==TextToSpeech.LANG_MISSING_DATA||lang==TextToSpeech.LANG_NOT_SUPPORTED){fail("Cette langue n’est pas installée. Choisissez une autre voix ou ouvrez les réglages des voix Android.");return}
        if('|' in selected && selected.substringAfter('|').isNotEmpty()){
            val chosen=synthesizer.voices?.find{it.name==selected.substringAfter('|')}
            if(chosen==null){fail("Cette voix n’est plus disponible. Choisissez une autre voix.");return}
            synthesizer.voice=chosen
        }
        motDebut=-1;motFin=-1;dureeMs=0
        synthesizer.setSpeechRate(profile().rate)
        synthesizer.setPitch(profile().pitch)
        synthesizer.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
        val utterance="$ticket:$index"
        synthesizer.setOnUtteranceProgressListener(object:UtteranceProgressListener(){
            override fun onStart(id:String?){main.post{if(ticket==generation){loading=false;publish()}}}
            // Karaoké : le moteur Android donne la plage du mot prononcé.
            override fun onRangeStart(id:String?,start:Int,end:Int,frame:Int){
                main.post{if(ticket==generation){motDebut=start;motFin=end;publishProgress()}}
            }
            override fun onDone(id:String?){main.post{if(ticket==generation&&id==utterance&&playing){index++;publish();speak()}}}
            @Deprecated("Android callback") override fun onError(id:String?){main.post{if(ticket==generation)fail("La voix Android ne peut pas lire ce passage.")}}
        })
        if(synthesizer.speak(text(index),TextToSpeech.QUEUE_FLUSH,Bundle(),utterance)==TextToSpeech.ERROR)fail("La voix Android n’a pas démarré.")
    }
    private fun audioFile(config:JSONObject,at:Int,cancelled:()->Boolean):File{
        val voice=SpeechProfile.at(config,at).voice;val text=config.getJSONArray("segments").getString(at)
        val fingerprint=listOf(voice,text,if(voice.startsWith("clone:"))config.optString("server") else "", "v1").joinToString("\n")
        val hash=MessageDigest.getInstance("SHA-256").digest(fingerprint.toByteArray()).joinToString(""){"%02x".format(it)}
        val root=File(filesDir,"audio/${config.getString("bookId")}");root.mkdirs()
        val target=File(root,"$hash.wav")
        if(target.length()>44)return target
        if(cancelled())throw InterruptedException("Annulé")
        require(root.usableSpace>100L*1024*1024){"Libérez au moins 100 Mo pour préparer les passages."}
        val temp=File(root,"$hash.part.wav")
        try{
            when{
                voice.startsWith("neural:")->ModelStore.generate(this,voice,text,temp)
                voice.startsWith("clone:")->StudioClient(config.optString("server"),config.optString("token")).generate(voice,text,temp,cancelled)
                else->error("Choisissez une voix téléchargée ou clonée.")
            }
            if(cancelled())throw InterruptedException("Annulé")
            check(temp.length()>44 && temp.renameTo(target)){"Impossible d’enregistrer le passage."}
            return target
        }finally{temp.delete()}
    }
    private fun prepare(start:Int,end:Int){
        pause();error=""
        val first=start.coerceIn(0,count());val last=end.coerceIn(first,count())
        require((first until last).all { !profile(it).voice.startsWith("system:") }) { "Pour préparer ce chapitre, attribuez une voix Piper à chaque rôle utilisé." }
        val ticket=++generation;val config=JSONObject(queue.toString())
        preparing=true;prepared=0;prepareTotal=last-first
        startMediaForeground(true);if(!wake.isHeld)wake.acquire(6*60*60*1000L);publish()
        worker.execute{
            try{
                for(at in first until last){
                    if(ticket!=generation)break
                    audioFile(config,at){ticket!=generation}
                    main.post{if(ticket==generation){prepared++;publish()}}
                }
                main.post{if(ticket==generation){preparing=false;publish();if(wake.isHeld)wake.release();endForeground()}}
            }catch(e:Exception){main.post{if(ticket==generation)fail(e.message ?: "Préparation interrompue")}}
        }
    }
    private fun state()=JSONObject().put("bookId",queue.optString("bookId")).put("index",index).put("playing",playing).put("loading",loading).put("awaitingChapter",awaitingChapter).put("error",error).put("sleepAt",sleepAt).put("preparing",preparing).put("prepared",prepared).put("total",prepareTotal).put("speaker",profile().role).put("voice",profile().voice)
        .put("position",if(player?.isPlaying==true)player?.currentPosition ?: 0 else 0).put("duree",dureeMs)
        .put("mot",if(motDebut>=0)JSONObject().put("debut",motDebut).put("fin",motFin) else JSONObject.NULL)
    /** Diffusion seule (sans notification ni écriture disque) : ~5 fois par seconde
     *  pendant la lecture, pour le karaoké mot à mot. */
    private fun publishProgress(){
        sendBroadcast(Intent(STATE).setPackage(packageName).putExtra("state",state().toString()))
    }
    private fun startProgress(){
        stopProgress()
        val tick=object:Runnable{
            override fun run(){
                if(!playing||player?.isPlaying!=true)return
                publishProgress();main.postDelayed(this,200)
            }
        }
        progressTicker=tick;main.postDelayed(tick,200)
    }
    private fun stopProgress(){progressTicker?.let{main.removeCallbacks(it)};progressTicker=null}
    @SuppressLint("MissingPermission") // Active media-session notifications are exempt on Android 13+.
    private fun publish(){
        val state=state().toString()
        getSharedPreferences("playback",MODE_PRIVATE).edit().putString("state",state).apply()
        sendBroadcast(Intent(STATE).setPackage(packageName).putExtra("state",state))
        session.setMetadata(MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE,queue.optString("title","PK Reader")).putString(MediaMetadata.METADATA_KEY_ARTIST,if(preparing)"Préparation $prepared / $prepareTotal" else "Passage ${index+1} / ${count()}").build())
        session.setPlaybackState(PlaybackState.Builder().setActions(PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_STOP or PlaybackState.ACTION_SKIP_TO_NEXT or PlaybackState.ACTION_SKIP_TO_PREVIOUS).setState(if(loading)PlaybackState.STATE_BUFFERING else if(playing)PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED,PlaybackState.PLAYBACK_POSITION_UNKNOWN,rate).build())
        if(foreground)getSystemService(NotificationManager::class.java).notify(NOTIFICATION,notification())
    }
    private fun pending(action:String)=PendingIntent.getService(this,action.hashCode(),Intent(this,ReadingService::class.java).setAction(action),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    private fun notification():Notification{
        val open=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this,CHANNEL).setSmallIcon(R.drawable.ic_audio).setContentTitle(queue.optString("title","PK Reader"))
            .setContentText(if(error.isNotBlank())error else if(awaitingChapter)"Ouvrez PK Reader pour valider les voix du chapitre" else if(preparing)"Préparation $prepared / $prepareTotal" else if(loading)"Préparation de la voix…" else "Passage ${index+1} / ${count()}")
            .setContentIntent(open).setOnlyAlertOnce(true).setOngoing(playing||preparing)
            .addAction(Notification.Action.Builder(android.R.drawable.ic_media_previous,"Précédent",pending("previous")).build())
            .addAction(Notification.Action.Builder(if(playing||preparing)android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,if(playing||preparing)"Pause" else "Lire",pending("toggle")).build())
            .addAction(Notification.Action.Builder(android.R.drawable.ic_media_next,"Suivant",pending("next")).build())
            .setStyle(Notification.MediaStyle().setMediaSession(session.sessionToken).setShowActionsInCompactView(0,1,2)).build()
    }
    private fun startMediaForeground(data:Boolean=false){
        if(Build.VERSION.SDK_INT>=29)startForeground(NOTIFICATION,notification(),if(data)ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC else ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        else startForeground(NOTIFICATION,notification())
        foreground=true
    }
    private fun endForeground(){if(foreground){stopForeground(STOP_FOREGROUND_DETACH);foreground=false}}
    override fun onTimeout(startId:Int,fgsType:Int){fail("Préparation interrompue par Android. Reprenez depuis le chapitre.");stopSelf()}
    override fun onDestroy(){
        pause();instance=null;tts?.shutdown();session.release();unregisterReceiver(noisy);worker.shutdown();main.removeCallbacks(sleepCheck);super.onDestroy()
    }
}
