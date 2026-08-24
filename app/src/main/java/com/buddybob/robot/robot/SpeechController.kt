package com.buddybob.robot.robot

import android.util.Log
import com.ainirobot.coreservice.client.listener.TextListener
import com.ainirobot.coreservice.client.speech.SkillApi
import com.ainirobot.coreservice.client.speech.entity.TTSEntity
import com.buddybob.robot.BuddybobApp

/** TTS + recognition helpers via SkillApi. */
class SpeechController {

    var onTtsState: ((String) -> Unit)? = null

    @Volatile
    var listeningDesired: Boolean = false
        private set

    @Volatile
    private var speaking: Boolean = false

    private fun skill(): SkillApi? = BuddybobApp.instance.getSkillApi()

    fun setListeningDesired(enabled: Boolean) {
        listeningDesired = enabled
        applyRecognition()
    }

    private fun applyRecognition() {
        val api = skill() ?: return
        val on = listeningDesired && !speaking
        api.setRecognizable(on)
        if (on) api.setRecognizeMode(true)
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
        var finished = false
        fun finishOnce() {
            if (finished) return
            finished = true
            speaking = false
            applyRecognition()
            onComplete?.invoke()
        }
        speaking = true
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
        speaking = false
        applyRecognition()
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
    }
}
