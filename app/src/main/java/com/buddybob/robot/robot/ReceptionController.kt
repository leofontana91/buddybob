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

    private val mainHandler = Handler(Looper.getMainLooper())
    private var listening = false
    private var lastGreetingAtMs = 0L
    private var guestPresent = false
    private var presentSinceMs = 0L
    private var absentSinceMs = 0L
    private var greetingToken = 0
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
            // lo sguardo dell'avatar segue la persona più centrata davanti al robot
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
                if (now - lastGreetingAtMs < REGREET_MS) return
                val best = nearby.minByOrNull { abs(it.angle.toDouble()) } ?: nearby.first()
                beginGreeting(best)
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
        if (now - absentSinceMs < ABSENCE_MS) return

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
        if (distance <= 0.15 || distance > maxDistance) return false
        if (abs(person.angle.toDouble()) > 70.0) return false
        return true
    }

    private fun beginGreeting(person: Person?) {
        onGuestDetected?.invoke()
        val token = ++greetingToken
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
                    })
                }
            })
        }
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

        runCatching {
            motion.moveHead(
                hMode = "absolute",
                vMode = "absolute",
                hAngle = 0,
                vAngle = vertical
            )
        }

        if (person != null) {
            val angle = person.angle.toFloat()
            runCatching {
                when {
                    angle > 8f -> motion.turnLeft(angleDeg = angle.coerceAtMost(90f))
                    angle < -8f -> motion.turnRight(angleDeg = abs(angle).coerceAtMost(90f))
                }
            }
        }

        val followCfg = cfg.follow
        val face = runCatching {
            follow.getBestFace(cfg.reception.maxDistanceMeters)
        }.getOrNull() ?: person

        runCatching {
            if (followCfg.preferSmartFollow) {
                follow.startSmartFocusFollow(
                    lostTimeoutSec = followCfg.lostTimeoutSec.toLong(),
                    maxDistanceMeters = followCfg.maxDistanceMeters.toFloat()
                )
            } else {
                follow.startFocusFollow(
                    faceId = face?.id,
                    lostTimeoutSec = followCfg.lostTimeoutSec.toLong(),
                    maxDistanceMeters = followCfg.maxDistanceMeters.toFloat()
                )
            }
        }.onFailure {
            Log.w(TAG, "lookAtGuest follow failed: ${it.message}")
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
        private const val PRESENCE_MS = 800L
        private const val ABSENCE_MS = 4_000L
        private const val REGREET_MS = 2_500L
    }
}
