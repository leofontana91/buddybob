package com.buddybob.robot.robot

import android.util.Log
import com.ainirobot.coreservice.client.listener.TextListener
import com.ainirobot.coreservice.client.speech.SkillApi
import com.ainirobot.coreservice.client.speech.entity.TTSEntity
import com.buddybob.robot.BuddybobApp

/** TTS + recognition helpers via SkillApi. */
class SpeechController {

    var onTtsState: ((String) -> Unit)? = null
    var onSpeakingChanged: ((Boolean) -> Unit)? = null
    /** Testo in riproduzione TTS (per UI «Ho detto»). */
    var onSpeakText: ((String) -> Unit)? = null

    @Volatile
    var listeningDesired: Boolean = false
        private set

    @Volatile
    private var speaking: Boolean = false

    private fun skill(): SkillApi? = BuddybobApp.instance.getSkillApi()

    fun setListeningDesired(enabled: Boolean) {
        listeningDesired = enabled
        applyRecognition()
        if (enabled) {
            // Di default ascolta solo il cono frontale (non laterale/dietro).
            resetMicToFront()
        }
    }

    private fun applyRecognition() {
        val api = skill() ?: return
        val on = listeningDesired && !speaking
        // Chiude il “hint” di sistema sul wake (spesso dice «Hi» / saluto OS).
        runCatching { api.setWakeupHintClosed(true) }
        api.setRecognizable(on)
        if (on) api.setRecognizeMode(true)
    }

    /**
     * Limita il microfono a un cono: [centerDeg] rispetto al robot,
     * [rangeDeg] ampiezza (parametri OrionStar setAngleCenterRange).
     */
    fun setMicAngle(centerDeg: Float, rangeDeg: Float = LOCKED_RANGE_DEG) {
        val api = skill() ?: return
        val center = centerDeg.coerceIn(-90f, 90f)
        val range = rangeDeg.coerceIn(20f, 160f)
        runCatching {
            api.setAngleCenterRange(center, range)
            Log.d(TAG, "mic angle center=$center range=$range")
        }.onFailure {
            Log.w(TAG, "setAngleCenterRange failed: ${it.message}")
        }
    }

    /** Ascolto generico solo di fronte (prima della wake word). */
    fun resetMicToFront() {
        setMicAngle(0f, FRONT_RANGE_DEG)
    }

    /** Punta il microfono verso una persona (angolo PersonApi). */
    fun aimMicAtPersonAngle(personAngleDeg: Int) {
        setMicAngle(personAngleDeg.toFloat(), LOCKED_RANGE_DEG)
    }

    fun speak(
        text: String,
        sid: String = "buddybob-tts",
        onComplete: (() -> Unit)? = null
    ) {
        val api = skill()
        if (api == null) {
            onTtsState?.invoke("SkillApi not connected")
            onComplete?.invoke()
            return
        }
        val trimmed = text.take(1000)
        onSpeakText?.invoke(trimmed)
        var finished = false
        fun finishOnce() {
            if (finished) return
            finished = true
            speaking = false
            applyRecognition()
            onSpeakingChanged?.invoke(false)
            onComplete?.invoke()
        }
        speaking = true
        onSpeakingChanged?.invoke(true)
        applyRecognition()
        api.playText(TTSEntity(sid, trimmed), object : TextListener() {
            override fun onStart() {
                onTtsState?.invoke("TTS start")
            }

            override fun onStop() {
                onTtsState?.invoke("TTS stop")
                finishOnce()
            }

            override fun onComplete() {
                onTtsState?.invoke("TTS complete")
                finishOnce()
            }

            override fun onError() {
                onTtsState?.invoke("TTS error")
                Log.e(TAG, "TTS error for text=$trimmed")
                finishOnce()
            }
        })
    }

    fun stop() {
        skill()?.stopTTS()
        val wasSpeaking = speaking
        speaking = false
        applyRecognition()
        if (wasSpeaking) onSpeakingChanged?.invoke(false)
        onTtsState?.invoke("TTS stopped")
    }

    fun setContinuousRecognition(enabled: Boolean) {
        skill()?.setRecognizeMode(enabled)
    }

    fun setRecognizable(enabled: Boolean) {
        listeningDesired = enabled
        applyRecognition()
    }

    fun queryByText(text: String) {
        skill()?.queryByText(text)
    }

    companion object {
        private const val TAG = "SpeechController"
        /** Cono frontale stretto: meno rumore laterale/dietro. */
        const val FRONT_RANGE_DEG = 70f
        /** Dopo lock: cono stretto sulla persona davanti. */
        const val LOCKED_RANGE_DEG = 45f
    }
}
