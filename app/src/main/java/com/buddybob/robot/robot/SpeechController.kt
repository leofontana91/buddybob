package com.buddybob.robot.robot

import android.util.Log
import com.ainirobot.coreservice.client.listener.TextListener
import com.ainirobot.coreservice.client.speech.SkillApi
import com.ainirobot.coreservice.client.speech.entity.TTSEntity
import com.buddybob.robot.BuddybobApp

/** TTS + recognition helpers via SkillApi. */
class SpeechController {

    var onTtsState: ((String) -> Unit)? = null

    private fun skill(): SkillApi? = BuddybobApp.instance.getSkillApi()

    fun speak(
        text: String,
        sid: String = "buddybob-tts",
        onComplete: (() -> Unit)? = null
    ) {
        val api = skill()
        if (api == null) {
            onTtsState?.invoke("SkillApi not connected")
            // Still advance UX flows when robot speech is unavailable (desk testing).
            onComplete?.invoke()
            return
        }
        val trimmed = text.take(1000)
        var finished = false
        fun finishOnce() {
            if (finished) return
            finished = true
            onComplete?.invoke()
        }
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
        onTtsState?.invoke("TTS stopped")
    }

    fun setContinuousRecognition(enabled: Boolean) {
        skill()?.setRecognizeMode(enabled)
    }

    fun setRecognizable(enabled: Boolean) {
        skill()?.setRecognizable(enabled)
    }

    fun queryByText(text: String) {
        skill()?.queryByText(text)
    }

    companion object {
        private const val TAG = "SpeechController"
    }
}
