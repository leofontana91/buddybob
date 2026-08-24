package com.buddybob.robot.platform

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.ainirobot.coreservice.client.listener.Person
import com.buddybob.robot.BuddybobApp
import com.buddybob.robot.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlin.math.abs

/**
 * Invia il testo ASR al cloud e esegue le azioni.
 *
 * Requisiti:
 * - wake word «bob»
 * - persona di fronte (visiva) che attiva / tiene la sessione
 * - microfono puntato sul cono frontale / sulla persona agganciata (SDK setAngleCenterRange)
 */
class VoiceRouter {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val main = Handler(Looper.getMainLooper())
    private val api = PlatformApi()

    @Volatile
    private var busy = false
    private var lastText = ""
    private var lastAtMs = 0L

    @Volatile
    private var armedUntilMs = 0L

    /** Persona che ha detto Bob: solo i suoi comandi valgono finché resta davanti. */
    @Volatile
    private var lockedPersonId: Int? = null

    /** Alla prossima richiesta cloud: azzera memoria (cambio persona). */
    @Volatile
    private var resetMemoryNext = false

    private var weStartedFocus = false

    private val presenceCheck = object : Runnable {
        override fun run() {
            if (!isArmed()) {
                clearSpeakerLock(resetMic = true)
                return
            }
            if (!speakerStillPresent()) {
                Log.d(TAG, "speaker left — disarm")
                disarm(resetMic = true)
                return
            }
            refreshMicTowardLocked()
            main.postDelayed(this, PRESENCE_POLL_MS)
        }
    }

    fun isArmed(): Boolean = System.currentTimeMillis() < armedUntilMs

    fun onAsrPartial(raw: String) {
        val text = raw.trim()
        if (text.isEmpty()) return
        if (!BuddybobApp.instance.config.current.modules.speech) return
        if (!WakeWord.contains(text) && !isArmed()) return
        if (!isArmed() && !hasAnyoneInFront()) return
        if (isArmed() && !speakerStillPresent()) return
        main.post {
            (BuddybobApp.instance.currentActivity as? MainActivity)
                ?.showVoiceTranscript(text, final = false)
        }
    }

    fun onAsrFinal(raw: String) {
        val text = raw.trim()
        if (text.length < 2) return
        if (!BuddybobApp.instance.config.current.modules.speech) return
        if (!api.isConfigured()) return

        val hasWake = WakeWord.contains(text)
        val armed = isArmed()
        if (!hasWake && !armed) {
            Log.d(TAG, "ignore (no wake): $text")
            return
        }

        if (hasWake) {
            val speaker = pickFrontSpeaker()
            if (speaker == null) {
                Log.d(TAG, "ignore wake (nobody in front): $text")
                return
            }
            lockSpeaker(speaker)
        } else if (!speakerStillPresent()) {
            Log.d(TAG, "ignore command (speaker not in front): $text")
            disarm(resetMic = true)
            return
        }

        val command = if (hasWake) WakeWord.strip(text) else text
        main.post {
            (BuddybobApp.instance.currentActivity as? MainActivity)
                ?.showVoiceTranscript(text, final = true)
        }

        if (WakeWord.isOnlyWake(text) || command.length < 2) {
            armSession()
            main.post {
                BuddybobApp.instance.robot.speech.speak("Ti ascolto")
            }
            return
        }

        if (busy) {
            Log.d(TAG, "skip busy: $command")
            return
        }
        val now = System.currentTimeMillis()
        if (command.equals(lastText, ignoreCase = true) && now - lastAtMs < 2500) return
        lastText = command
        lastAtMs = now
        armSession()

        scope.launch {
            busy = true
            try {
                val session = lockedPersonId?.toString() ?: "anon"
                val reset = resetMemoryNext
                resetMemoryNext = false
                BuddybobApp.instance.robot.log(
                    "Voce: $command (person=$session reset=$reset)"
                )
                val res = api.postVoice(command, sessionKey = session, reset = reset)
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

    private fun maxDistance(): Double =
        BuddybobApp.instance.config.current.reception.maxDistanceMeters

    private fun frontPeople(): List<Person> =
        BuddybobApp.instance.robot.follow.getPersonsInFront(maxDistance())

    private fun hasAnyoneInFront(): Boolean = frontPeople().isNotEmpty()

    private fun pickFrontSpeaker(): Person? {
        val front = frontPeople()
        if (front.isEmpty()) return null
        val focus = BuddybobApp.instance.robot.follow.getFocusPerson()
        if (focus != null && front.any { it.id == focus.id }) return focus
        return front.minByOrNull { abs(it.angle) }
    }

    private fun speakerStillPresent(): Boolean {
        val id = lockedPersonId ?: return false
        val front = frontPeople()
        if (front.any { it.id == id }) return true
        val focus = BuddybobApp.instance.robot.follow.getFocusPerson() ?: return false
        if (focus.id != id) return false
        val d = focus.distance
        val max = maxDistance()
        return d > 0.2 && d <= max && abs(focus.angle) <= 55
    }

    private fun lockSpeaker(person: Person) {
        val prev = lockedPersonId
        if (prev != null && prev != person.id) {
            resetMemoryNext = true
            Log.d(TAG, "person changed $prev → ${person.id}, reset memory")
        }
        lockedPersonId = person.id
        main.post {
            val robot = BuddybobApp.instance.robot
            robot.speech.aimMicAtPersonAngle(person.angle)
            if (!robot.follow.isFollowing) {
                runCatching {
                    robot.follow.startFocusFollow(
                        faceId = person.id,
                        lostTimeoutSec = 12L,
                        maxDistanceMeters = maxDistance().toFloat()
                    )
                    weStartedFocus = true
                }
            } else {
                weStartedFocus = false
            }
        }
        Log.d(TAG, "locked speaker id=${person.id} angle=${person.angle}")
    }

    private fun refreshMicTowardLocked() {
        val id = lockedPersonId ?: return
        val p = frontPeople().find { it.id == id }
            ?: BuddybobApp.instance.robot.follow.getFocusPerson()?.takeIf { it.id == id }
            ?: return
        BuddybobApp.instance.robot.speech.aimMicAtPersonAngle(p.angle)
    }

    private fun armSession() {
        armedUntilMs = System.currentTimeMillis() + ARMED_MS
        main.removeCallbacks(presenceCheck)
        main.post(presenceCheck)
    }

    private fun disarm(resetMic: Boolean) {
        armedUntilMs = 0L
        main.removeCallbacks(presenceCheck)
        clearSpeakerLock(resetMic)
        main.post {
            (BuddybobApp.instance.currentActivity as? MainActivity)
                ?.hideVoiceTranscript()
        }
    }

    private fun clearSpeakerLock(resetMic: Boolean) {
        if (lockedPersonId != null) {
            resetMemoryNext = true
        }
        lockedPersonId = null
        if (resetMic) {
            main.post {
                val robot = BuddybobApp.instance.robot
                robot.speech.resetMicToFront()
                if (weStartedFocus) {
                    runCatching { robot.follow.stopFocusFollow() }
                    weStartedFocus = false
                }
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
                    "stop" -> {
                        robot.haltAllMotion()
                        (BuddybobApp.instance.currentActivity as? MainActivity)
                            ?.hidePlaceDisplay()
                    }
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
                            val cfg = robot.placeContent.get(place)
                            val label = cfg?.labelOrName() ?: place
                            (BuddybobApp.instance.currentActivity as? MainActivity)
                                ?.showMovingPlaceholder(
                                    destinationLabel = label,
                                    text = cfg?.displayWhileMoving,
                                    media = cfg?.mediaWhileMoving
                                )
                            robot.navigation.startNavigation(place)
                            watchNavigationEnd()
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

    private fun watchNavigationEnd() {
        scope.launch {
            val nav = BuddybobApp.instance.robot.navigation
            var elapsed = 0
            while (elapsed < 120) {
                kotlinx.coroutines.delay(2000)
                elapsed += 2
                val s = nav.lastStatusText
                if (s.contains("result status=") ||
                    s.contains("Already at") ||
                    s.contains("Cannot reach") ||
                    s.contains("Destination missing") ||
                    s.contains("Not localized") ||
                    s.contains("error", ignoreCase = true)
                ) {
                    main.post {
                        (BuddybobApp.instance.currentActivity as? MainActivity)
                            ?.hidePlaceDisplay()
                    }
                    return@launch
                }
            }
            main.post {
                (BuddybobApp.instance.currentActivity as? MainActivity)
                    ?.hidePlaceDisplay()
            }
        }
    }

    companion object {
        private const val TAG = "VoiceRouter"
        /** Finestra conversazione: dopo ogni turno resta in ascolto. */
        private const val ARMED_MS = 45_000L
        private const val PRESENCE_POLL_MS = 1_000L
    }
}
