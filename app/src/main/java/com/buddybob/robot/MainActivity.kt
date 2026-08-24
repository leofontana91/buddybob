package com.buddybob.robot

import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.VideoView
import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.Fragment
import com.buddybob.robot.platform.PlaceContentStore
import com.buddybob.robot.ui.AccessControlFragment
import com.buddybob.robot.ui.AppointmentsHubFragment
import com.buddybob.robot.ui.CallOperatorFragment
import com.buddybob.robot.ui.DocumentsFragment
import com.buddybob.robot.ui.HomeFragment
import com.buddybob.robot.ui.PlaceholderFeatureFragment
import com.buddybob.robot.ui.PlacesFragment
import com.buddybob.robot.ui.ReceptionFragment
import com.buddybob.robot.ui.SpeechFragment
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

class MainActivity : AppCompatActivity() {

    private val handler = Handler(Looper.getMainLooper())
    private var inactivityRunnable: Runnable? = null
    private var transcriptHideRunnable: Runnable? = null
    private val imageClient = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    /** True when showing a sub-feature (not reception). */
    private var inSubFeature = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_splash)

        handler.postDelayed({
            setContentView(R.layout.activity_main)
            openReceptionOrHome()
        }, 700)
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
            startInactivityTimer()
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

    /** Barra in basso: testo ASR dopo wake word / sessione attiva. */
    fun showVoiceTranscript(text: String, final: Boolean) {
        handler.post {
            val bar = findViewById<LinearLayout?>(R.id.bar_voice_transcript) ?: return@post
            val label = findViewById<TextView?>(R.id.text_voice_transcript) ?: return@post
            label.text = text.trim()
            bar.visibility = View.VISIBLE
            transcriptHideRunnable?.let { handler.removeCallbacks(it) }
            if (final) {
                val hide = Runnable {
                    findViewById<LinearLayout?>(R.id.bar_voice_transcript)?.visibility =
                        View.GONE
                }
                transcriptHideRunnable = hide
                handler.postDelayed(hide, 6_000L)
            }
        }
    }

    fun hideVoiceTranscript() {
        handler.post {
            transcriptHideRunnable?.let { handler.removeCallbacks(it) }
            findViewById<LinearLayout?>(R.id.bar_voice_transcript)?.visibility = View.GONE
        }
    }

    /** Overlay durante lo spostamento: media configurato oppure logo BOB. */
    fun showMovingPlaceholder(
        destinationLabel: String,
        text: String?,
        media: PlaceContentStore.Media?
    ) {
        val caption = text?.trim()?.takeIf { it.isNotEmpty() }
            ?: getString(R.string.voice_moving_placeholder, destinationLabel)
        showPlaceDisplay(caption, media, logoIfNoMedia = true)
    }

    fun showPlaceDisplay(
        text: String?,
        media: PlaceContentStore.Media?,
        logoIfNoMedia: Boolean = false
    ) {
        handler.post {
            val overlay = findViewById<FrameLayout?>(R.id.overlay_place_media) ?: return@post
            val image = findViewById<ImageView>(R.id.overlay_place_image)
            val video = findViewById<VideoView>(R.id.overlay_place_video)
            val caption = findViewById<TextView>(R.id.overlay_place_text)

            stopVideo()
            image.setImageDrawable(null)
            image.visibility = View.GONE
            video.visibility = View.GONE

            val hasText = !text.isNullOrBlank()
            val url = media?.url?.trim().orEmpty()
            val type = media?.contentType.orEmpty()
            if (!hasText && url.isBlank() && !logoIfNoMedia) {
                overlay.visibility = View.GONE
                return@post
            }

            overlay.visibility = View.VISIBLE
            if (hasText) {
                caption.text = text
                caption.visibility = View.VISIBLE
            } else {
                caption.visibility = View.GONE
            }

            when {
                url.isBlank() -> {
                    if (logoIfNoMedia) {
                        image.setImageResource(R.drawable.logo_bob_mark)
                        image.scaleType = ImageView.ScaleType.CENTER_INSIDE
                        image.visibility = View.VISIBLE
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
                    if (logoIfNoMedia) {
                        image.setImageResource(R.drawable.logo_bob_mark)
                        image.scaleType = ImageView.ScaleType.CENTER_INSIDE
                        image.visibility = View.VISIBLE
                    }
                }
                else -> {
                    image.visibility = View.VISIBLE
                    image.scaleType = ImageView.ScaleType.FIT_CENTER
                    if (logoIfNoMedia) {
                        image.setImageResource(R.drawable.logo_bob_mark)
                    }
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
                                image.scaleType = ImageView.ScaleType.FIT_CENTER
                            } else if (logoIfNoMedia) {
                                image.setImageResource(R.drawable.logo_bob_mark)
                                image.scaleType = ImageView.ScaleType.CENTER_INSIDE
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
            overlay.visibility = View.GONE
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
            "documents" -> DocumentsFragment.newInstance()
            "goTo" -> PlacesFragment.newInstance()
            "talkToMe" -> SpeechFragment.newInstance()
            "callOperator" -> CallOperatorFragment.newInstance()
            "accessControl" -> AccessControlFragment.newInstance()
            "games" -> PlaceholderFeatureFragment.newInstance("games", "Giochi")
            "voiceMemos" -> PlaceholderFeatureFragment.newInstance("voiceMemos", "Memo vocali")
            else -> return
        }
        switchFragment(fragment)
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
        cancelInactivityTimer()
        hidePlaceDisplay()
        hideVoiceTranscript()
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }
}
