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
            // Arm manuale senza persona: non spegnere se nessuno è davanti
            if (lockedPersonId != null && !speakerStillPresent()) {
                Log.d(TAG, "speaker left — disarm")
                disarm(resetMic = true)
                return
            }
            if (lockedPersonId != null) refreshMicTowardLocked()
            main.postDelayed(this, PRESENCE_POLL_MS)
        }
    }

    fun isArmed(): Boolean = System.currentTimeMillis() < armedUntilMs

    /**
     * Attiva l'ascolto dal pulsante microfono (senza dire «Bob»).
     * Non parla «Ti ascolto» così il mic resta acceso.
     */
    fun armFromMic() {
        if (!BuddybobApp.instance.config.current.modules.speech) return
        val speaker = pickFrontSpeaker()
        if (speaker != null) {
            lockSpeaker(speaker)
        } else {
            // Override manuale: ascolta comunque il fronte
            lockedPersonId = null
            BuddybobApp.instance.robot.speech.resetMicToFront()
            manualArmWithoutPerson = true
        }
        armSession()
        BuddybobApp.instance.robot.speech.setListeningDesired(true)
        main.post {
            BuddybobApp.instance.robot.avatar.onListening()
            (BuddybobApp.instance.currentActivity as? MainActivity)
                ?.showVoiceTranscript(
                    BuddybobApp.instance.getString(com.buddybob.robot.R.string.voice_listening_hint),
                    final = true
                )
        }
    }

    @Volatile
    private var manualArmWithoutPerson = false

    fun onAsrPartial(raw: String) {
        val text = raw.trim()
        if (text.isEmpty()) return
        if (!BuddybobApp.instance.config.current.modules.speech) return
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

        if (WakeWord.isOnlyWake(text) || command.length < 2) {
            armSession()
            // Niente TTS qui: spegnerebbe l'ASR e sembrerebbe di dover ripetere «Bob».
            main.post {
                BuddybobApp.instance.robot.avatar.onListening()
                (BuddybobApp.instance.currentActivity as? MainActivity)
                    ?.showVoiceTranscript(
                        BuddybobApp.instance.getString(com.buddybob.robot.R.string.voice_listening_hint),
                        final = true
                    )
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
            main.post { BuddybobApp.instance.robot.avatar.onThinking() }
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
        BuddybobApp.instance.robot.follow.getPersonsInFront(
            maxDistanceMeters = maxDistance(),
            maxAbsAngleDeg = FRONT_PERSON_ANGLE_DEG
        )

    private fun hasAnyoneInFront(): Boolean = frontPeople().isNotEmpty()

    private fun pickFrontSpeaker(): Person? {
        val front = frontPeople()
        if (front.isEmpty()) {
            // Fallback più largo: chiunque sia visibile entro distanza
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
        // Ancora nella lista allargata?
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

    private fun armSession() {
        armedUntilMs = System.currentTimeMillis() + ARMED_MS
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

    private fun execute(res: PlatformApi.VoiceResponse) {
        val robot = BuddybobApp.instance.robot
        val speak = res.speak?.trim().orEmpty()
        val actions = res.actions.orEmpty()
        val hadActions = actions.isNotEmpty()

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
                            // Il follow tiene il chassis: startNavigation lo rilascia + ritenta se busy
                            weStartedFocus = false
                            robot.navigation.startNavigation(place)
                            robot.avatar.onMoving()
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
            robot.speech.speak(speak) {
                main.post {
                    runActions()
                    if (hadActions) robot.avatar.onSuccess()
                }
            }
        } else {
            runActions()
            if (hadActions) robot.avatar.onSuccess()
        }
    }

    private fun watchNavigationEnd() {
        scope.launch {
            val nav = BuddybobApp.instance.robot.navigation
            // Attendi che parta davvero (release chassis + start)
            kotlinx.coroutines.delay(900)
            var elapsed = 0
            while (elapsed < 120) {
                kotlinx.coroutines.delay(1000)
                elapsed += 1
                val s = nav.lastStatusText
                if (s.contains("result status=") ||
                    s.contains("Already at") ||
                    s.contains("Cannot reach") ||
                    s.contains("Destination missing") ||
                    s.contains("Not localized") ||
                    s.contains("Nav error") ||
                    s.contains("Navigation already") ||
                    (s.contains("Chassis busy") && !nav.isNavigating)
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
        private const val ARMED_MS = 60_000L
        private const val PRESENCE_POLL_MS = 1_000L
        /** Solo di fronte (non dietro / di lato). */
        private const val FRONT_PERSON_ANGLE_DEG = 45.0
        /** Fallback stretto se il tracking perde un attimo. */
        private const val FALLBACK_PERSON_ANGLE_DEG = 55
    }
}
