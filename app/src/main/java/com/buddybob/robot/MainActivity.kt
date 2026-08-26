package com.buddybob.robot

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageButton
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
            bindVoiceMuteButton()
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

    private val muteListener: (Boolean) -> Unit = { muted ->
        applyVoiceMuteUi(muted)
    }

    private fun bindVoiceMuteButton() {
        val btn = findViewById<ImageButton?>(R.id.btn_voice_mute) ?: return
        btn.setOnClickListener {
            BuddybobApp.instance.toggleVoiceMute()
        }
        BuddybobApp.instance.addVoiceMuteListener(muteListener)
        refreshVoiceMuteVisibility()
        applyVoiceMuteUi(BuddybobApp.instance.isVoiceMuted())
    }

    /** Mostra il mute solo se il modulo speech è attivo. */
    fun refreshVoiceMuteVisibility() {
        handler.post {
            val btn = findViewById<ImageButton?>(R.id.btn_voice_mute) ?: return@post
            val speechOn = BuddybobApp.instance.config.current.modules.speech
            btn.visibility = if (speechOn) View.VISIBLE else View.GONE
        }
    }

    private fun applyVoiceMuteUi(muted: Boolean) {
        val btn = findViewById<ImageButton?>(R.id.btn_voice_mute) ?: return
        btn.setBackgroundResource(
            if (muted) R.drawable.bg_mic_mute else R.drawable.bg_mic_mute_off
        )
        btn.contentDescription = getString(
            if (muted) R.string.voice_unmute_button else R.string.voice_mute_button
        )
        btn.alpha = if (muted) 1f else 0.92f
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

    /** Barra in basso: testo ascoltato (si aggiorna). Resta finché non arriva la risposta o chiude la sessione. */
    fun showVoiceTranscript(text: String, final: Boolean) {
        handler.post {
            val bar = findViewById<LinearLayout?>(R.id.bar_voice_transcript) ?: return@post
            val label = findViewById<TextView?>(R.id.label_voice_heard)
            val body = findViewById<TextView?>(R.id.text_voice_transcript) ?: return@post
            label?.setText(R.string.voice_heard_label)
            label?.setTextColor(getColor(R.color.bob_teal))
            body.text = ensureQuestionMark(text.trim())
            bar.visibility = View.VISIBLE
            // Niente auto-hide: sparisce solo a fine conversazione (serve di nuovo «Bob»)
            cancelTranscriptHide()
        }
    }

    /** Risposta di BOB: resta visibile fino a chiusura conversazione. */
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
            cancelTranscriptHide()
        }
    }

    /** Hint a schermo: serve la wake word («ehi Bob»). */
    fun showVoiceWakeHint() {
        handler.post {
            val bar = findViewById<LinearLayout?>(R.id.bar_voice_transcript) ?: return@post
            val label = findViewById<TextView?>(R.id.label_voice_heard)
            val body = findViewById<TextView?>(R.id.text_voice_transcript) ?: return@post
            label?.setText(R.string.voice_wake_hint_label)
            label?.setTextColor(getColor(R.color.bob_navy))
            body.setText(R.string.voice_wake_hint)
            bar.visibility = View.VISIBLE
            cancelTranscriptHide()
        }
    }

    fun hideVoiceTranscript() {
        handler.post {
            cancelTranscriptHide()
            findViewById<LinearLayout?>(R.id.bar_voice_transcript)?.visibility = View.GONE
        }
    }

    private fun cancelTranscriptHide() {
        transcriptHideRunnable?.let { handler.removeCallbacks(it) }
        transcriptHideRunnable = null
    }

    /** ASR / TTS spesso omettono «?»: aggiungilo sulle domande italiane. */
    private fun ensureQuestionMark(raw: String): String {
        val t = raw.trim()
        if (t.isEmpty() || t.endsWith("?") || t.endsWith("!") || t.endsWith("…")) return t
        val last = t.split(Regex("(?<=[.!;])\\s+")).lastOrNull()?.trim()?.lowercase() ?: t.lowercase()
        val stripped = last.replace(
            Regex(
                "^(ciao|salve|buongiorno|buonasera|ok|okay|bene|certo|allora|quindi|dunque|" +
                    "e|ma|però|pero|senti|scusa|scusami|dimmi|guarda|ecco)[,!\\s]+",
                RegexOption.IGNORE_CASE
            ),
            ""
        ).trim()
        val questionLead = Regex(
            "^(chi|che|cosa|come|dove|quando|perché|perche|quanto|quanti|quante|quale|quali|" +
                "puoi|potresti|vuoi|vorresti|sai|sapresti|c'è|ci sono|" +
                "posso|possiamo|mi (puoi|sai|dici|diresti|aiuti)|" +
                "ti (va|piace|ricordi|chiami)|hai (già |un |una |degli |delle |appuntamento)|avete )\\b"
        ).containsMatchIn(stripped)
        val hasWh = Regex(
            "\\b(chi|che cosa|cosa|come|dove|quando|perché|perche|quale|quali|quanto|quanti|quante)\\b"
        ).containsMatchIn(last)
        val tagQ = Regex("\\b(vero|no|giusto|ok)\\s*$").containsMatchIn(last)
        return if (questionLead || (hasWh && last.length <= 160) || tagQ) "$t?" else t
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
        showBobIfNoMedia: Boolean = false,
        showStopButton: Boolean = true,
        onOverlayClick: (() -> Unit)? = null
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
                overlay.setOnClickListener(null)
                overlay.visibility = View.GONE
                return@post
            }

            overlay.visibility = View.VISIBLE
            if (onOverlayClick != null) {
                overlay.setOnClickListener { onOverlayClick() }
            } else {
                overlay.setOnClickListener(null)
            }
            if (showStopButton) {
                showDialogueStop(StopPlacement.MOVING)
            } else {
                findViewById<Button?>(R.id.btn_stop_moving)?.visibility = View.GONE
            }
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
                    video.setOnErrorListener { _, what, extra ->
                        Log.w(TAG, "video load failed what=$what extra=$extra url=$url")
                        video.visibility = View.GONE
                        if (showBobIfNoMedia && bob != null) {
                            bob.visibility = View.VISIBLE
                            bob.bindSignals(BuddybobApp.instance.robot.avatar)
                            bob.setMode(BobAvatarMode.MOVING)
                        }
                        true
                    }
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
                        val bmp = loadRemoteBitmap(url)
                        handler.post {
                            if (bmp != null) {
                                image.setImageBitmap(bmp)
                                image.scaleType = ImageView.ScaleType.CENTER_CROP
                            } else {
                                Log.w(TAG, "image load failed url=$url")
                                image.visibility = View.GONE
                                if (showBobIfNoMedia && bob != null) {
                                    bob.visibility = View.VISIBLE
                                    bob.bindSignals(BuddybobApp.instance.robot.avatar)
                                    bob.setMode(BobAvatarMode.MOVING)
                                }
                            }
                        }
                    }.start()
                }
            }
        }
    }

    /** Scarica e decodifica con downsample (foto grandi) + retry. */
    private fun loadRemoteBitmap(url: String): Bitmap? {
        repeat(3) { attempt ->
            val bmp = runCatching {
                val req = Request.Builder()
                    .url(url)
                    .header("Accept", "image/*,*/*")
                    .get()
                    .build()
                imageClient.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) {
                        Log.w(TAG, "image HTTP ${resp.code} attempt=$attempt")
                        return@use null
                    }
                    val bytes = resp.body?.bytes() ?: return@use null
                    if (bytes.isEmpty()) return@use null
                    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
                        Log.w(TAG, "image decode bounds failed")
                        return@use null
                    }
                    var sample = 1
                    val maxSide = 1600
                    while (
                        bounds.outWidth / sample > maxSide ||
                        bounds.outHeight / sample > maxSide
                    ) {
                        sample *= 2
                    }
                    val opts = BitmapFactory.Options().apply { inSampleSize = sample }
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
                }
            }.onFailure {
                Log.w(TAG, "image fetch error attempt=$attempt: ${it.message}")
            }.getOrNull()
            if (bmp != null) return bmp
            try {
                Thread.sleep(250L * (attempt + 1))
            } catch (_: InterruptedException) {
                return null
            }
        }
        return null
    }

    fun hidePlaceDisplay() {
        handler.post {
            val overlay = findViewById<FrameLayout?>(R.id.overlay_place_media) ?: return@post
            stopVideo()
            overlay.setOnClickListener(null)
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
            refreshVoiceMuteVisibility()
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
        BuddybobApp.instance.removeVoiceMuteListener(muteListener)
        statusBinder?.stop()
        statusBinder = null
        cancelInactivityTimer()
        hidePlaceDisplay()
        hideVoiceTranscript()
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    companion object {
        private const val TAG = "MainActivity"
    }
}
