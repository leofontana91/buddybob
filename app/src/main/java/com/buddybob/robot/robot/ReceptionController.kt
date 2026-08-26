package com.buddybob.robot.robot

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.ainirobot.coreservice.client.listener.Person
import com.buddybob.robot.BuddybobApp
import com.buddybob.robot.config.BobConfig
import kotlin.math.abs

/**
 * Idle (nobody in front) → person stably in front → welcome + menu.
 * Back to idle when the guest leaves.
 */
class ReceptionController(
    private val motion: MotionController,
    private val speech: SpeechController,
    private val follow: FollowController
) {

    enum class Phase {
        IDLE,
        GREETING,
        MENU
    }

    var onPhaseChanged: ((Phase) -> Unit)? = null
    var onStatus: ((String) -> Unit)? = null
    var onGuestDetected: (() -> Unit)? = null

    @Volatile
    var phase: Phase = Phase.IDLE
        private set

    /**
     * Se true e idleMediaStopMode=tap, il rilevamento non avvia il saluto
     * finché l'UI non chiama [clearIdleMediaBlock].
     */
    @Volatile
    var idleMediaBlockingDetection: Boolean = false

    fun clearIdleMediaBlock() {
        idleMediaBlockingDetection = false
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private var listening = false
    private var lastGreetingAtMs = 0L
    private var guestPresent = false
    private var presentSinceMs = 0L
    private var absentSinceMs = 0L
    private var greetingToken = 0
    private var greetingPerson: Person? = null
    private val pollRunnable = object : Runnable {
        override fun run() {
            if (!listening) return
            pollPersons()
            mainHandler.postDelayed(this, POLL_MS)
        }
    }

    fun startListening() {
        if (!BuddybobApp.instance.config.current.modules.reception) {
            onStatus?.invoke("Reception module disabled in config")
            return
        }
        if (listening) return
        listening = true
        follow.onPersons = { people -> mainHandler.post { onPersons(people) } }
        follow.onStatus = { msg -> onStatus?.invoke(msg) }
        follow.startDetectingPersons()
        mainHandler.removeCallbacks(pollRunnable)
        mainHandler.post(pollRunnable)
        onStatus?.invoke("Reception waiting for guests")
        onPhaseChanged?.invoke(phase)
    }

    fun stopListening() {
        if (!listening) return
        listening = false
        mainHandler.removeCallbacks(pollRunnable)
        follow.stopDetectingPersons()
        follow.onPersons = null
    }

    fun release() {
        greetingToken++
        stopListening()
        runCatching { follow.stopFocusFollow() }
        speech.stop()
        setPhase(Phase.IDLE)
    }

    fun simulateGuest() {
        if (!BuddybobApp.instance.config.current.modules.reception) return
        if (!listening) startListening()
        if (phase != Phase.IDLE) return
        val now = System.currentTimeMillis()
        if (now - lastGreetingAtMs < REGREET_MS) return
        // Nessuna persona reale: non armare il timeout di assenza, altrimenti
        // il menu si chiude dopo pochi secondi. Torna in idle dal menu o reset.
        guestPresent = false
        presentSinceMs = 0L
        absentSinceMs = 0L
        beginGreeting(person = null)
    }

    fun skipGreetingToMenu() {
        if (phase != Phase.GREETING) return
        greetingToken++
        speech.stop()
        setPhase(Phase.MENU)
        onStatus?.invoke("Reception menu ready (skipped)")
        openPostGreetingListen()
    }

    /** Dopo un “vai a” con stay: mostra subito il menu (scegli cosa fare). */
    fun openMenuAfterArrival() {
        greetingToken++
        speech.stop()
        guestPresent = false
        presentSinceMs = 0L
        absentSinceMs = 0L
        setPhase(Phase.MENU)
        onStatus?.invoke("Reception menu after arrival")
    }

    fun resetToIdle() {
        greetingToken++
        speech.stop()
        runCatching { follow.stopFocusFollow() }
        runCatching { motion.resetHead() }
        lastGreetingAtMs = System.currentTimeMillis()
        guestPresent = false
        presentSinceMs = 0L
        setPhase(Phase.IDLE)
        onStatus?.invoke("Reception idle")
        maybeReturnToStandby()
    }

    fun enabledButtons(): List<BobConfig.MenuButton> {
        val cfg = BuddybobApp.instance.config.current
        val buttons = cfg.reception.buttons.ifEmpty { BobConfig.defaultMenuButtons() }
        return buttons.filter { it.enabled }
    }

    private fun pollPersons() {
        val max = BuddybobApp.instance.config.current.reception.maxDistanceMeters
        val people = runCatching { follow.getVisiblePersons(max) }.getOrDefault(emptyList())
        onPersons(people)
    }

    private fun onPersons(people: List<Person>) {
        if (!listening) return
        val cfg = BuddybobApp.instance.config.current.reception
        val nearby = people.filter { inFront(it, cfg.maxDistanceMeters) }
        val present = nearby.isNotEmpty()
        val now = System.currentTimeMillis()

        if (present) {
            absentSinceMs = 0L
            nearby.minByOrNull { abs(it.angle.toDouble()) }?.let { p ->
                BuddybobApp.instance.robot.avatar.onPersonAt(
                    p.angle.toFloat(), p.distance.toFloat()
                )
            }
            if (!guestPresent) {
                guestPresent = true
                presentSinceMs = now
            }
            if (phase == Phase.IDLE && now - presentSinceMs >= PRESENCE_MS) {
                // Media idle con stop «solo tocco»: non salutare finché non si tocca
                if (cfg.idleMediaStopMode.equals("tap", ignoreCase = true) &&
                    idleMediaBlockingDetection
                ) {
                    return
                }
                if (now - lastGreetingAtMs < REGREET_MS) return
                // Serve una figura umana stabile (volto), non solo un blob di movimento
                val face = runCatching {
                    follow.getBestFace(cfg.maxDistanceMeters)
                }.getOrNull()?.takeIf { inFront(it, cfg.maxDistanceMeters) }
                if (face == null) {
                    // Corpo sì ma senza volto: aspetta ancora un po', poi lascia perdere
                    if (now - presentSinceMs < PRESENCE_FACE_MS) return
                    Log.d(TAG, "skip greeting: presence without face")
                    return
                }
                beginGreeting(face)
            }
            return
        }

        if (guestPresent) {
            guestPresent = false
            absentSinceMs = now
            BuddybobApp.instance.robot.avatar.onPersonLost()
        }
        presentSinceMs = 0L
        if (absentSinceMs == 0L) return
        val absenceNeeded = when (phase) {
            Phase.MENU -> ABSENCE_FROM_MENU_MS
            Phase.GREETING -> ABSENCE_MS
            Phase.IDLE -> ABSENCE_MS
        }
        if (now - absentSinceMs < absenceNeeded) return

        when (phase) {
            Phase.GREETING -> {
                greetingToken++
                speech.stop()
                resetToIdle()
            }
            Phase.MENU -> resetToIdle()
            Phase.IDLE -> Unit
        }
    }

    private fun inFront(person: Person, maxDistance: Double): Boolean {
        val distance = person.distance.toDouble()
        // Troppo vicino = spesso rumore / braccio / movimento interno
        if (distance <= 0.35 || distance > maxDistance) return false
        val maxAngle = BuddybobApp.instance.config.current.reception.detectAngleDeg
            .coerceIn(20.0, 60.0)
        if (abs(person.angle.toDouble()) > maxAngle) return false
        return true
    }

    private fun beginGreeting(person: Person?) {
        onGuestDetected?.invoke()
        val token = ++greetingToken
        greetingPerson = person
        lastGreetingAtMs = System.currentTimeMillis()
        setPhase(Phase.GREETING)
        onStatus?.invoke("Greeting guest id=${person?.id}")

        lookAtGuest(person)

        val phrases = BuddybobApp.instance.config.current.phrases
        mainHandler.postDelayed({
            if (token != greetingToken) return@postDelayed
            if (phase == Phase.GREETING) {
                setPhase(Phase.MENU)
                onStatus?.invoke("Reception menu ready (TTS timeout)")
                openPostGreetingListen()
            }
        }, GREETING_FALLBACK_MS)

        speech.speak(phrases.welcome) {
            mainHandler.post(welcomeDone@{
                if (token != greetingToken) return@welcomeDone
                if (phase != Phase.GREETING) return@welcomeDone
                speech.speak(phrases.howCanIHelp) {
                    mainHandler.post(helpDone@{
                        if (token != greetingToken) return@helpDone
                        setPhase(Phase.MENU)
                        onStatus?.invoke("Reception menu ready")
                        openPostGreetingListen()
                    })
                }
            })
        }
    }

    /** Microfono ~5s senza wake word; poi hint «Dimmi ehi Bob…». */
    private fun openPostGreetingListen() {
        if (!BuddybobApp.instance.config.current.modules.speech) return
        BuddybobApp.instance.armVoiceAfterReceptionGreeting(greetingPerson)
    }

    private fun lookAtGuest(person: Person?) {
        val cfg = BuddybobApp.instance.config.current
        val vertical = cfg.reception.raiseHeadVertical.coerceIn(0, 90)

        runCatching {
            val robot = BuddybobApp.instance.robot
            robot.navigation.stopNavigation()
            robot.motion.stopMove()
            robot.follow.stopFocusFollow()
        }

        // Solo testa verso l'ospite. Niente smart-follow sul chassis qui:
        // il follow fa spesso perdere il tracking e ri-innesca il saluto.
        val headH = if (person != null) {
            (-person.angle.toInt()).coerceIn(-90, 90)
        } else {
            0
        }
        runCatching {
            motion.moveHead(
                hMode = "absolute",
                vMode = "absolute",
                hAngle = headH,
                vAngle = vertical
            )
        }.onFailure {
            Log.w(TAG, "lookAtGuest head failed: ${it.message}")
        }
    }

    private fun maybeReturnToStandby() {
        val place = BuddybobApp.instance.config.current.reception.standbyPlace.trim()
        if (place.isBlank()) return
        runCatching {
            BuddybobApp.instance.robot.goTo.go(
                placeName = place,
                after = com.buddybob.robot.platform.GoToController.After.QUIET
            )
        }
    }

    private fun setPhase(next: Phase) {
        if (phase == next) {
            mainHandler.post { onPhaseChanged?.invoke(next) }
            return
        }
        phase = next
        mainHandler.post { onPhaseChanged?.invoke(next) }
    }

    companion object {
        private const val TAG = "ReceptionController"
        private const val GREETING_FALLBACK_MS = 6_000L
        private const val POLL_MS = 400L
        /** Persona stabile davanti prima di considerare un saluto. */
        private const val PRESENCE_MS = 1_600L
        /** Tempo extra per confermare un volto (figura umana). */
        private const val PRESENCE_FACE_MS = 3_000L
        /** Perso di vista durante saluto → idle. */
        private const val ABSENCE_MS = 6_000L
        /** Dal menu: più tollerante ai flicker del sensore. */
        private const val ABSENCE_FROM_MENU_MS = 14_000L
        /** Non ri-salutare di continuo la stessa persona/passaggio. */
        private const val REGREET_MS = 45_000L
    }
}
