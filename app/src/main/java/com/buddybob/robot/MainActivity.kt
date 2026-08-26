package com.buddybob.robot

import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.VideoView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.fragment.app.Fragment
import com.buddybob.robot.platform.PlaceContentStore
import com.buddybob.robot.ui.AccessControlFragment
import com.buddybob.robot.ui.AppointmentsHubFragment
import com.buddybob.robot.ui.TodayAppointmentsFragment
import com.buddybob.robot.ui.CallOperatorFragment
import com.buddybob.robot.ui.DocumentsFragment
import com.buddybob.robot.ui.HomeFragment
import com.buddybob.robot.ui.PlaceholderFeatureFragment
import com.buddybob.robot.ui.PlacesFragment
import com.buddybob.robot.ui.ReceptionFragment
import com.buddybob.robot.ui.avatar.BobAvatarMode
import com.buddybob.robot.ui.avatar.BobAvatarView
import com.buddybob.robot.ui.SpeechFragment
import com.buddybob.robot.ui.VoiceMemosFragment
import com.buddybob.robot.ui.widget.SystemStatusBinder
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

class MainActivity : AppCompatActivity() {

    private val handler = Handler(Looper.getMainLooper())
    private var inactivityRunnable: Runnable? = null
    private var transcriptHideRunnable: Runnable? = null
    private var statusBinder: SystemStatusBinder? = null
    private val imageClient = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    /** True when showing a sub-feature (not reception). */
    private var inSubFeature = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        applyImmersiveChrome()
        setContentView(R.layout.activity_splash)

        handler.postDelayed({
            setContentView(R.layout.activity_main)
            applyImmersiveChrome()
            bindSystemStatus()
            bindDialogueStopButtons()
            openReceptionOrHome()
        }, 700)
    }

    private fun bindDialogueStopButtons() {
        val stop = View.OnClickListener {
            BuddybobApp.instance.voiceUserStop()
        }
        findViewById<Button?>(R.id.btn_stop_speak)?.setOnClickListener(stop)
        findViewById<Button?>(R.id.btn_stop_moving)?.setOnClickListener(stop)
    }

    enum class StopPlacement { SPEAKING, MOVING }

    /** Pulsante STOP rosso: a destra (dialogo) o in basso al centro (movimento). */
    fun showDialogueStop(placement: StopPlacement) {
        handler.post {
            val speakBtn = findViewById<Button?>(R.id.btn_stop_speak)
            val moveBtn = findViewById<Button?>(R.id.btn_stop_moving)
            when (placement) {
                StopPlacement.SPEAKING -> {
                    speakBtn?.visibility = View.VISIBLE
                    // Se c'è overlay movimento, lo stop movimento ha priorità visiva
                    val overlay = findViewById<View?>(R.id.overlay_place_media)
                    if (overlay?.visibility == View.VISIBLE) {
                        speakBtn?.visibility = View.GONE
                        moveBtn?.visibility = View.VISIBLE
                    } else {
                        moveBtn?.visibility = View.GONE
                    }
                }
                StopPlacement.MOVING -> {
                    speakBtn?.visibility = View.GONE
                    moveBtn?.visibility = View.VISIBLE
                }
            }
        }
    }

    fun hideDialogueStop() {
        handler.post {
            findViewById<Button?>(R.id.btn_stop_speak)?.visibility = View.GONE
            findViewById<Button?>(R.id.btn_stop_moving)?.visibility = View.GONE
        }
    }

    /**
     * Edge-to-edge: la nostra barra nera parte dal bordo fisico dello schermo.
     * Nasconde le icone di sistema (sgranate su OrionStar).
     */
    private fun applyImmersiveChrome() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        // Fallback API vecchia / RobotOS che ignora WindowInsetsController
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            )
    }

    private fun bindSystemStatus() {
        statusBinder?.stop()
        val bar = findViewById<View?>(R.id.bar_system_status) ?: return
        // Estende la fascia nera sotto l'area status (se RobotOS ne lascia una)
        val baseH = resources.getDimensionPixelSize(R.dimen.system_status_bar_height)
        ViewCompat.setOnApplyWindowInsetsListener(bar) { v, insets ->
            val top = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top
            v.setPadding(v.paddingLeft, top, v.paddingRight, v.paddingBottom)
            val lp = v.layoutParams
            if (lp != null) {
                lp.height = baseH + top
                v.layoutParams = lp
            }
            insets
        }
        ViewCompat.requestApplyInsets(bar)
        statusBinder = SystemStatusBinder(bar).also { it.start() }
        bindBottomSafeArea()
    }

    /** Evita che «Ho sentito» / STOP finiscano sotto nav bar o bezel. */
    private fun bindBottomSafeArea() {
        val root = findViewById<View?>(R.id.bar_voice_transcript)?.parent as? View ?: return
        val voiceBar = findViewById<View>(R.id.bar_voice_transcript) ?: return
        val stopSpeak = findViewById<View?>(R.id.btn_stop_speak)
        val density = resources.displayMetrics.density
        val baseVoice = (36 * density).toInt()
        val baseStop = (48 * density).toInt()
        // Su OrionStar spesso insets.bottom = 0: margine minimo extra di sicurezza
        val fallbackExtra = (20 * density).toInt()

        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            val bottom = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            ).bottom
            val pad = if (bottom > 0) bottom else fallbackExtra
            (voiceBar.layoutParams as? android.view.ViewGroup.MarginLayoutParams)?.let { lp ->
                lp.bottomMargin = baseVoice + pad
                voiceBar.layoutParams = lp
            }
            (stopSpeak?.layoutParams as? android.view.ViewGroup.MarginLayoutParams)?.let { lp ->
                lp.bottomMargin = baseStop + pad
                stopSpeak.layoutParams = lp
            }
            insets
        }
        ViewCompat.requestApplyInsets(root)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) applyImmersiveChrome()
    }

    fun openReceptionOrHome() {
        inSubFeature = false
        cancelInactivityTimer()
        hidePlaceDisplay()
        val receptionOn = BuddybobApp.instance.config.current.modules.reception
        replaceFragment(
            if (receptionOn) ReceptionFragment.newInstance()
            else HomeFragment.newInstance()
        )
    }

    fun switchFragment(fragment: Fragment) {
        val isReception = fragment is ReceptionFragment
        inSubFeature = !isReception
        hidePlaceDisplay()
        replaceFragment(fragment)
        if (inSubFeature) {
            // Conversazione libera: niente timeout che chiude la schermata
            if (fragment is SpeechFragment) {
                cancelInactivityTimer()
            } else {
                startInactivityTimer()
            }
        } else {
            cancelInactivityTimer()
        }
    }

    private fun replaceFragment(fragment: Fragment) {
        val container = findViewById<View?>(R.id.container_content) ?: return
        supportFragmentManager.beginTransaction()
            .replace(container.id, fragment, fragment.javaClass.name)
            .commitAllowingStateLoss()
    }

    /** Barra in basso: un solo testo (ascoltato), si aggiorna al posto. */
    fun showVoiceTranscript(text: String, final: Boolean) {
        handler.post {
            val bar = findViewById<LinearLayout?>(R.id.bar_voice_transcript) ?: return@post
            val label = findViewById<TextView?>(R.id.label_voice_heard)
            val body = findViewById<TextView?>(R.id.text_voice_transcript) ?: return@post
            label?.setText(R.string.voice_heard_label)
            label?.setTextColor(getColor(R.color.bob_teal))
            body.text = ensureQuestionMark(text.trim())
            bar.visibility = View.VISIBLE
            scheduleTranscriptHide(if (final) 5_000L else 8_000L)
        }
    }

    /** Cosa sta dicendo BOB: sostituisce lo stesso spazio (non aggiunge una seconda riga). */
    fun showVoiceSaid(text: String) {
        handler.post {
            val bar = findViewById<LinearLayout?>(R.id.bar_voice_transcript) ?: return@post
            val label = findViewById<TextView?>(R.id.label_voice_heard)
            val body = findViewById<TextView?>(R.id.text_voice_transcript) ?: return@post
            val trimmed = ensureQuestionMark(text.trim())
            if (trimmed.isEmpty()) return@post
            label?.setText(R.string.voice_said_label)
            label?.setTextColor(getColor(R.color.bob_navy))
            body.text = trimmed
            bar.visibility = View.VISIBLE
            val hideMs = (trimmed.length * 55L).coerceIn(4_000L, 10_000L)
            scheduleTranscriptHide(hideMs)
        }
    }

    fun hideVoiceTranscript() {
        handler.post {
            transcriptHideRunnable?.let { handler.removeCallbacks(it) }
            findViewById<LinearLayout?>(R.id.bar_voice_transcript)?.visibility = View.GONE
        }
    }

    private fun scheduleTranscriptHide(delayMs: Long) {
        transcriptHideRunnable?.let { handler.removeCallbacks(it) }
        val hide = Runnable {
            findViewById<LinearLayout?>(R.id.bar_voice_transcript)?.visibility = View.GONE
        }
        transcriptHideRunnable = hide
        handler.postDelayed(hide, delayMs)
    }

    /** ASR / TTS spesso omettono «?»: aggiungilo sulle domande italiane ovvie. */
    private fun ensureQuestionMark(raw: String): String {
        val t = raw.trim()
        if (t.isEmpty() || t.endsWith("?") || t.endsWith("！") || t.endsWith("…")) return t
        val lower = t.lowercase()
        val startsQuestion = Regex(
            "^(chi|che|cosa|come|dove|quando|perché|perche|quanto|quale|quali|" +
                "puoi|potresti|vuoi|vorresti|sai|mi (puoi|sai|dici)|" +
                "hai |c'?è |ci sono|posso|possiamo)\\b"
        ).containsMatchIn(lower)
        return if (startsQuestion) "$t?" else t
    }

    /** Schermo pieno durante lo spostamento: media dal web oppure Bob che cammina. */
    fun showMovingPlaceholder(
        destinationLabel: String,
        text: String?,
        media: PlaceContentStore.Media?
    ) {
        BuddybobApp.instance.robot.avatar.onMoving()
        val caption = text?.trim()?.takeIf { it.isNotEmpty() }
            ?: getString(R.string.voice_moving_placeholder, destinationLabel)
        showPlaceDisplay(caption, media, showBobIfNoMedia = true)
    }

    fun showPlaceDisplay(
        text: String?,
        media: PlaceContentStore.Media?,
        showBobIfNoMedia: Boolean = false
    ) {
        handler.post {
            val overlay = findViewById<FrameLayout?>(R.id.overlay_place_media) ?: return@post
            val image = findViewById<ImageView>(R.id.overlay_place_image)
            val video = findViewById<VideoView>(R.id.overlay_place_video)
            val bob = findViewById<BobAvatarView?>(R.id.overlay_place_bob)
            val caption = findViewById<TextView>(R.id.overlay_place_text)

            stopVideo()
            image.setImageDrawable(null)
            image.visibility = View.GONE
            video.visibility = View.GONE
            bob?.unbindSignals()
            bob?.visibility = View.GONE

            val hasText = !text.isNullOrBlank()
            val url = media?.url?.trim().orEmpty()
            val type = media?.contentType.orEmpty()
            if (!hasText && url.isBlank() && !showBobIfNoMedia) {
                overlay.visibility = View.GONE
                return@post
            }

            overlay.visibility = View.VISIBLE
            showDialogueStop(StopPlacement.MOVING)
            if (hasText) {
                caption.text = text
                caption.visibility = View.VISIBLE
            } else {
                caption.visibility = View.GONE
            }

            when {
                url.isBlank() -> {
                    if (showBobIfNoMedia && bob != null) {
                        bob.visibility = View.VISIBLE
                        bob.bindSignals(BuddybobApp.instance.robot.avatar)
                        bob.setMode(
                            if (BuddybobApp.instance.robot.navigation.isBlockedByObstacle) {
                                BobAvatarMode.BLOCKED
                            } else {
                                BobAvatarMode.MOVING
                            }
                        )
                    }
                }
                type.startsWith("video/") || url.endsWith(".mp4") || url.endsWith(".webm") -> {
                    video.visibility = View.VISIBLE
                    video.setVideoURI(Uri.parse(url))
                    video.setOnPreparedListener { mp ->
                        mp.isLooping = true
                        video.start()
                    }
                }
                type.startsWith("audio/") -> {
                    if (showBobIfNoMedia && bob != null) {
                        bob.visibility = View.VISIBLE
                        bob.bindSignals(BuddybobApp.instance.robot.avatar)
                        bob.setMode(BobAvatarMode.MOVING)
                    }
                }
                else -> {
                    image.visibility = View.VISIBLE
                    image.scaleType = ImageView.ScaleType.CENTER_CROP
                    Thread {
                        val bmp = runCatching {
                            val req = Request.Builder().url(url).build()
                            imageClient.newCall(req).execute().use { resp ->
                                if (!resp.isSuccessful) return@use null
                                resp.body?.byteStream()?.use { BitmapFactory.decodeStream(it) }
                            }
                        }.getOrNull()
                        handler.post {
                            if (bmp != null) {
                                image.setImageBitmap(bmp)
                                image.scaleType = ImageView.ScaleType.CENTER_CROP
                            } else if (showBobIfNoMedia && bob != null) {
                                image.visibility = View.GONE
                                bob.visibility = View.VISIBLE
                                bob.bindSignals(BuddybobApp.instance.robot.avatar)
                                bob.setMode(BobAvatarMode.MOVING)
                            }
                        }
                    }.start()
                }
            }
        }
    }

    fun hidePlaceDisplay() {
        handler.post {
            val overlay = findViewById<FrameLayout?>(R.id.overlay_place_media) ?: return@post
            stopVideo()
            findViewById<ImageView?>(R.id.overlay_place_image)?.setImageDrawable(null)
            findViewById<BobAvatarView?>(R.id.overlay_place_bob)?.let { bob ->
                bob.unbindSignals()
                bob.visibility = View.GONE
            }
            overlay.visibility = View.GONE
            findViewById<Button?>(R.id.btn_stop_moving)?.visibility = View.GONE
            BuddybobApp.instance.robot.avatar.onVoiceIdle(
                BuddybobApp.instance.robot.reception.phase
            )
        }
    }

    private fun stopVideo() {
        findViewById<VideoView?>(R.id.overlay_place_video)?.let { v ->
            runCatching { v.stopPlayback() }
            v.visibility = View.GONE
        }
    }

    fun openModule(moduleId: String) {
        val fragment: Fragment = when (moduleId) {
            "appointments" -> AppointmentsHubFragment.newInstance()
            "appointmentsToday" -> TodayAppointmentsFragment.newInstance()
            "documents" -> DocumentsFragment.newInstance()
            "goTo" -> PlacesFragment.newInstance()
            "talkToMe" -> SpeechFragment.newInstance()
            "callOperator" -> CallOperatorFragment.newInstance()
            "accessControl" -> AccessControlFragment.newInstance()
            "games" -> PlaceholderFeatureFragment.newInstance("games", "Giochi")
            "voiceMemos" -> VoiceMemosFragment.newInstance(awaitStart = true)
            else -> return
        }
        switchFragment(fragment)
    }

    /** True se è aperta la schermata conversazione con Bob grande. */
    fun isTalkScreenOpen(): Boolean {
        return supportFragmentManager.fragments.any { it is SpeechFragment && it.isVisible }
    }

    /** Menu moduli aggiornato dalla piattaforma. */
    fun onRemoteConfigUpdated() {
        handler.post {
            if (inSubFeature) return@post
            val visible = supportFragmentManager.fragments.firstOrNull { it.isVisible }
            when (visible) {
                is ReceptionFragment -> {
                    visible.reloadFromConfig()
                    BuddybobApp.instance.robot.speech.setListeningDesired(
                        BuddybobApp.instance.config.current.modules.speech
                    )
                }
                is HomeFragment -> openReceptionOrHome()
            }
        }
    }

    fun onGuestDetectedWhileAway() {
        if (!inSubFeature) return
        handler.post { openReceptionOrHome() }
    }

    /** Resets the inactivity countdown (e.g. on user touch). */
    fun resetInactivityTimer() {
        if (inSubFeature) {
            cancelInactivityTimer()
            startInactivityTimer()
        }
    }

    private fun startInactivityTimer() {
        cancelInactivityTimer()
        val timeoutMs = BuddybobApp.instance.config.current.reception.cooldownSec * 1000L
        val delay = timeoutMs.coerceAtLeast(10_000L)
        val r = Runnable { openReceptionOrHome() }
        inactivityRunnable = r
        handler.postDelayed(r, delay)
    }

    private fun cancelInactivityTimer() {
        inactivityRunnable?.let { handler.removeCallbacks(it) }
        inactivityRunnable = null
    }

    override fun onUserInteraction() {
        super.onUserInteraction()
        resetInactivityTimer()
    }

    override fun onDestroy() {
        statusBinder?.stop()
        statusBinder = null
        cancelInactivityTimer()
        hidePlaceDisplay()
        hideVoiceTranscript()
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }
}
