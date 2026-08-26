package com.buddybob.robot.platform

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.ainirobot.coreservice.client.listener.Person
import com.buddybob.robot.BuddybobApp
import com.buddybob.robot.MainActivity
import com.buddybob.robot.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlin.math.abs

/**
 * Invia il testo ASR al cloud e esegue le azioni.
 *
 * «Bob» attiva la sessione una sola volta; poi conversazione continua
 * finché la persona resta davanti (o timeout lungo senza presenza).
 * Durante TTS / azioni il microfono è spento e compare STOP.
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

    /** Mic spento + pulsante STOP (parlato / movimento / elaborazione). */
    @Volatile
    private var dialogueLocked = false

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
            if (lockedPersonId != null && !speakerStillPresent()) {
                Log.d(TAG, "speaker left — disarm")
                disarm(resetMic = true)
                return
            }
            // Persona ancora davanti: rinnova la sessione (niente «Bob» di nuovo)
            if (lockedPersonId != null || manualArmWithoutPerson) {
                renewArmWindow()
            }
            if (lockedPersonId != null) refreshMicTowardLocked()
            main.postDelayed(this, PRESENCE_POLL_MS)
        }
    }

    fun isArmed(): Boolean = System.currentTimeMillis() < armedUntilMs

    fun isDialogueLocked(): Boolean = dialogueLocked

    /**
     * Attiva l'ascolto dal pulsante microfono (senza dire «Bob»).
     */
    fun armFromMic() {
        if (!BuddybobApp.instance.config.current.modules.speech) return
        if (dialogueLocked) return
        val speaker = pickFrontSpeaker()
        if (speaker != null) {
            lockSpeaker(speaker)
        } else {
            lockedPersonId = null
            BuddybobApp.instance.robot.speech.resetMicToFront()
            manualArmWithoutPerson = true
        }
        armSession()
        BuddybobApp.instance.robot.speech.setListeningDesired(true)
        greetAndListen()
    }

    @Volatile
    private var manualArmWithoutPerson = false

    fun onAsrPartial(raw: String) {
        val text = raw.trim()
        if (text.isEmpty()) return
        if (!BuddybobApp.instance.config.current.modules.speech) return
        if (dialogueLocked) return
        if (!WakeWord.contains(text) && !isArmed()) return
        if (!isArmed() && !hasAnyoneInFront()) return
        if (isArmed() && lockedPersonId != null && !speakerStillPresent()) return
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
        if (dialogueLocked) {
            Log.d(TAG, "ignore (dialogue locked): $text")
            return
        }

        val hasWake = WakeWord.contains(text)
        val armed = isArmed()
        if (!hasWake && !armed) {
            Log.d(TAG, "ignore (no wake): $text")
            return
        }

        if (hasWake) {
            val speaker = pickFrontSpeaker()
            if (speaker == null && !manualArmWithoutPerson) {
                Log.d(TAG, "ignore wake (nobody in front): $text")
                return
            }
            if (speaker != null) lockSpeaker(speaker)
        } else if (lockedPersonId != null && !speakerStillPresent()) {
            Log.d(TAG, "ignore command (speaker not in front): $text")
            disarm(resetMic = true)
            return
        }

        val command = if (hasWake) WakeWord.strip(text) else text
        main.post {
            (BuddybobApp.instance.currentActivity as? MainActivity)
                ?.showVoiceTranscript(text, final = true)
        }

        // Solo «Bob» → saluto e apri conversazione
        if (WakeWord.isOnlyWake(text) || command.length < 2) {
            armSession()
            greetAndListen()
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
            lockDialogue(MainActivity.StopPlacement.SPEAKING)
            main.post { BuddybobApp.instance.robot.avatar.onThinking() }
            try {
                val session = lockedPersonId?.toString() ?: "anon"
                val reset = resetMemoryNext
                resetMemoryNext = false
                BuddybobApp.instance.robot.log(
                    "Voce: $command (person=$session reset=$reset)"
                )
                val res = api.postVoice(command, sessionKey = session, reset = reset)
                main.post {
                    execute(res) {
                        busy = false
                        // Se è partita una navigazione, resta locked (stop movimento)
                        if (!BuddybobApp.instance.robot.goTo.isRunning) {
                            unlockDialogue()
                            resumeListeningAfterTurn()
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "voice failed: ${e.message}")
                busy = false
                main.post {
                    BuddybobApp.instance.robot.speech.speak(
                        "Non riesco a contattare il server."
                    ) {
                        main.post {
                            unlockDialogue()
                            resumeListeningAfterTurn()
                        }
                    }
                }
            }
        }
    }

    /** Premuto STOP sul monitor: ferma parlato/azione e riapre il dialogo. */
    fun userStop() {
        Log.i(TAG, "user STOP")
        busy = false
        val robot = BuddybobApp.instance.robot
        runCatching { robot.goTo.cancel() }
        runCatching { robot.speech.stop() }
        runCatching {
            robot.navigation.stopNavigation()
            robot.follow.stopFocusFollow()
            robot.motion.stopMove()
        }
        (BuddybobApp.instance.currentActivity as? MainActivity)?.hidePlaceDisplay()
        unlockDialogue()
        if (isArmed() || lockedPersonId != null || manualArmWithoutPerson) {
            armSession()
            resumeListeningAfterTurn()
            main.post {
                robot.avatar.onListening()
                (BuddybobApp.instance.currentActivity as? MainActivity)
                    ?.showVoiceTranscript(
                        BuddybobApp.instance.getString(R.string.voice_listening_hint),
                        final = true
                    )
            }
        } else {
            robot.speech.setListeningDesired(
                BuddybobApp.instance.config.current.modules.speech
            )
        }
    }

    /** Chiamato da GoTo all'inizio / fine navigazione. */
    fun onNavigationBusy(busyNav: Boolean) {
        if (busyNav) {
            lockDialogue(MainActivity.StopPlacement.MOVING)
        } else if (!busy && !BuddybobApp.instance.robot.speech.isSpeaking) {
            unlockDialogue()
            if (isArmed()) resumeListeningAfterTurn()
        }
    }

    private fun greetAndListen() {
        lockDialogue(MainActivity.StopPlacement.SPEAKING)
        val greeting = BuddybobApp.instance.getString(R.string.voice_wake_greeting)
        BuddybobApp.instance.robot.speech.speak(greeting) {
            main.post {
                unlockDialogue()
                resumeListeningAfterTurn()
                BuddybobApp.instance.robot.avatar.onListening()
                (BuddybobApp.instance.currentActivity as? MainActivity)
                    ?.showVoiceTranscript(
                        BuddybobApp.instance.getString(R.string.voice_listening_hint),
                        final = true
                    )
            }
        }
    }

    private fun lockDialogue(placement: MainActivity.StopPlacement) {
        dialogueLocked = true
        BuddybobApp.instance.robot.speech.setListeningSuppressed(true)
        main.post {
            (BuddybobApp.instance.currentActivity as? MainActivity)
                ?.showDialogueStop(placement)
        }
    }

    private fun unlockDialogue() {
        dialogueLocked = false
        BuddybobApp.instance.robot.speech.setListeningSuppressed(false)
        main.post {
            (BuddybobApp.instance.currentActivity as? MainActivity)
                ?.hideDialogueStop()
        }
    }

    private fun resumeListeningAfterTurn() {
        armSession()
        BuddybobApp.instance.robot.speech.setListeningDesired(true)
        if (lockedPersonId != null) {
            refreshMicTowardLocked()
        } else {
            BuddybobApp.instance.robot.speech.resetMicToFront()
        }
        BuddybobApp.instance.robot.avatar.onListening()
    }

    private fun maxDistance(): Double =
        BuddybobApp.instance.config.current.reception.maxDistanceMeters

    private fun frontPeople(): List<Person> =
        BuddybobApp.instance.robot.follow.getPersonsInFront(
            maxDistanceMeters = maxDistance(),
            maxAbsAngleDeg = FRONT_PERSON_ANGLE_DEG
        )

    private fun hasAnyoneInFront(): Boolean = frontPeople().isNotEmpty()

    private fun pickFrontSpeaker(): Person? {
        val front = frontPeople()
        if (front.isEmpty()) {
            val any = BuddybobApp.instance.robot.follow
                .getVisiblePersons(maxDistance())
                .filter { it.distance > 0.15 && abs(it.angle) <= FALLBACK_PERSON_ANGLE_DEG }
                .sortedBy { abs(it.angle) }
            if (any.isEmpty()) return null
            val focus = BuddybobApp.instance.robot.follow.getFocusPerson()
            if (focus != null && any.any { it.id == focus.id }) return focus
            return any.first()
        }
        val focus = BuddybobApp.instance.robot.follow.getFocusPerson()
        if (focus != null && front.any { it.id == focus.id }) return focus
        return front.minByOrNull { abs(it.angle) }
    }

    private fun speakerStillPresent(): Boolean {
        val id = lockedPersonId ?: return false
        val front = frontPeople()
        if (front.any { it.id == id }) return true
        val focus = BuddybobApp.instance.robot.follow.getFocusPerson()
        if (focus != null && focus.id == id) {
            val d = focus.distance
            val max = maxDistance()
            if (d > 0.15 && d <= max && abs(focus.angle) <= FALLBACK_PERSON_ANGLE_DEG) return true
        }
        return BuddybobApp.instance.robot.follow
            .getVisiblePersons(maxDistance())
            .any { it.id == id && it.distance > 0.15 && abs(it.angle) <= FALLBACK_PERSON_ANGLE_DEG }
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
                        lostTimeoutSec = 18L,
                        maxDistanceMeters = maxDistance().toFloat().coerceAtLeast(4.5f)
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

    private fun renewArmWindow() {
        armedUntilMs = System.currentTimeMillis() + ARMED_MS
    }

    private fun armSession() {
        renewArmWindow()
        main.removeCallbacks(presenceCheck)
        main.post(presenceCheck)
        notifyListening(true)
    }

    private fun disarm(resetMic: Boolean) {
        armedUntilMs = 0L
        manualArmWithoutPerson = false
        main.removeCallbacks(presenceCheck)
        clearSpeakerLock(resetMic)
        notifyListening(false)
        unlockDialogue()
        main.post {
            (BuddybobApp.instance.currentActivity as? MainActivity)
                ?.hideVoiceTranscript()
        }
    }

    private fun notifyListening(listening: Boolean) {
        main.post {
            listeningListeners.forEach { it(listening) }
        }
    }

    fun addListeningListener(listener: (Boolean) -> Unit) {
        listeningListeners.add(listener)
        listener(isArmed())
    }

    fun removeListeningListener(listener: (Boolean) -> Unit) {
        listeningListeners.remove(listener)
    }

    private val listeningListeners =
        java.util.concurrent.CopyOnWriteArrayList<(Boolean) -> Unit>()

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

    private fun execute(res: PlatformApi.VoiceResponse, onDone: () -> Unit) {
        val robot = BuddybobApp.instance.robot
        val speak = res.speak?.trim().orEmpty()
        val actions = res.actions.orEmpty()
        val hadActions = actions.isNotEmpty()
        val hasGoto = actions.any { it.type == "goto" }

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
                            weStartedFocus = false
                            val after = when (a.after?.trim()?.lowercase()) {
                                "return" -> GoToController.After.RETURN
                                else -> GoToController.After.STAY
                            }
                            robot.goTo.go(placeName = place, after = after) {
                                main.post { onDone() }
                            }
                        } else {
                            onDone()
                        }
                    }
                    "speak" -> {
                        val t = a.text?.trim().orEmpty()
                        if (t.isNotBlank()) robot.speech.speak(t)
                    }
                }
            }
        }

        fun finishTurn() {
            if (hadActions) robot.avatar.onSuccess()
            // goto chiama onDone dal suo callback
            if (!hasGoto) onDone()
        }

        if (speak.isNotBlank()) {
            lockDialogue(MainActivity.StopPlacement.SPEAKING)
            robot.speech.speak(speak) {
                main.post {
                    runActions()
                    finishTurn()
                }
            }
        } else {
            runActions()
            finishTurn()
        }
    }

    companion object {
        private const val TAG = "VoiceRouter"
        /** Sessione conversazione: si rinnova se la persona resta davanti. */
        private const val ARMED_MS = 5 * 60_000L
        private const val PRESENCE_POLL_MS = 1_000L
        private const val FRONT_PERSON_ANGLE_DEG = 45.0
        private const val FALLBACK_PERSON_ANGLE_DEG = 55
    }
}
