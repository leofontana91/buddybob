package com.buddybob.robot.platform

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.buddybob.robot.BuddybobApp
import com.buddybob.robot.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Invia il testo ASR al cloud e esegue le azioni (apri moduli, vai a, ferma…).
 */
class VoiceRouter {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val main = Handler(Looper.getMainLooper())
    private val api = PlatformApi()

    @Volatile
    private var busy = false
    private var lastText = ""
    private var lastAtMs = 0L

    fun onAsrFinal(raw: String) {
        val text = raw.trim()
        if (text.length < 2) return
        if (!BuddybobApp.instance.config.current.modules.speech) return
        if (!api.isConfigured()) return
        if (busy) {
            Log.d(TAG, "skip busy: $text")
            return
        }
        val now = System.currentTimeMillis()
        if (text.equals(lastText, ignoreCase = true) && now - lastAtMs < 2500) return
        lastText = text
        lastAtMs = now

        scope.launch {
            busy = true
            try {
                BuddybobApp.instance.robot.log("Voce: $text")
                val res = api.postVoice(text)
                main.post { execute(res) }
            } catch (e: Exception) {
                Log.w(TAG, "voice failed: ${e.message}")
                main.post {
                    BuddybobApp.instance.robot.speech.speak(
                        "Non riesco a contattare il server."
                    )
                }
            } finally {
                busy = false
            }
        }
    }

    private fun execute(res: PlatformApi.VoiceResponse) {
        val robot = BuddybobApp.instance.robot
        val speak = res.speak?.trim().orEmpty()
        val actions = res.actions.orEmpty()

        fun runActions() {
            for (a in actions) {
                when (a.type) {
                    "stop" -> robot.haltAllMotion()
                    "menu" -> {
                        (BuddybobApp.instance.currentActivity as? MainActivity)
                            ?.openReceptionOrHome()
                    }
                    "open" -> {
                        val mod = a.module?.trim().orEmpty()
                        (BuddybobApp.instance.currentActivity as? MainActivity)
                            ?.openModule(mod)
                    }
                    "goto" -> {
                        val place = a.placeName?.trim().orEmpty()
                        if (place.isNotBlank() && robot.canUseApi()) {
                            robot.navigation.startNavigation(place)
                        }
                    }
                    "speak" -> {
                        val t = a.text?.trim().orEmpty()
                        if (t.isNotBlank()) robot.speech.speak(t)
                    }
                }
            }
        }

        if (speak.isNotBlank()) {
            robot.speech.speak(speak) { main.post { runActions() } }
        } else {
            runActions()
        }
    }

    companion object {
        private const val TAG = "VoiceRouter"
    }
}
