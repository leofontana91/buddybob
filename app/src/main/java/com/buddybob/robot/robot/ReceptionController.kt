package com.buddybob.robot.robot

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.ainirobot.coreservice.client.listener.Person
import com.buddybob.robot.BuddybobApp
import com.buddybob.robot.config.BobConfig
import kotlin.math.abs

/**
 * Reception / welcome flow:
 * idle → person detected → look + smile + "Benvenuto" → "Come posso aiutarti?" → menu.
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
    /** Called when a guest is detected — even if no fragment is observing phases. */
    var onGuestDetected: (() -> Unit)? = null

    @Volatile
    var phase: Phase = Phase.IDLE
        private set

    private val mainHandler = Handler(Looper.getMainLooper())
    private var listening = false
    private var lastGreetingAtMs = 0L
    private var guestPresent = false
    private var greetingToken = 0

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
        onStatus?.invoke("Reception watching for guests (phase=$phase)")
        onPhaseChanged?.invoke(phase)
    }

    fun stopListening() {
        if (!listening) return
        listening = false
        follow.stopDetectingPersons()
        follow.onPersons = null
    }

    /** Full stop: leave listening and return to idle. */
    fun release() {
        greetingToken++
        stopListening()
        runCatching { follow.stopFocusFollow() }
        speech.stop()
        setPhase(Phase.IDLE)
    }

    /** Desk / QA: run the greeting without a real PersonApi event. */
    fun simulateGuest() {
        if (!BuddybobApp.instance.config.current.modules.reception) return
        if (!listening) startListening()
        if (phase != Phase.IDLE) return
        beginGreeting(person = null)
    }

    fun resetToIdle() {
        greetingToken++
        speech.stop()
        runCatching { follow.stopFocusFollow() }
        runCatching { motion.resetHead() }
        lastGreetingAtMs = System.currentTimeMillis()
        setPhase(Phase.IDLE)
        onStatus?.invoke("Reception idle")
    }

    fun enabledButtons(): List<BobConfig.MenuButton> {
        val cfg = BuddybobApp.instance.config.current
        val buttons = cfg.reception.buttons.ifEmpty { BobConfig.defaultMenuButtons() }
        return buttons.filter { it.enabled }
    }

    private fun onPersons(people: List<Person>) {
        if (!listening) return
        val cfg = BuddybobApp.instance.config.current.reception
        val nearby = people.filter { person ->
            val distance = person.distance.toDouble()
            distance in 0.0..cfg.maxDistanceMeters
        }
        val present = nearby.isNotEmpty()

        if (!present) {
            if (guestPresent && phase == Phase.MENU) {
                guestPresent = false
                mainHandler.postDelayed({
                    if (listening && phase == Phase.MENU && !guestPresent) {
                        resetToIdle()
                    }
                }, (cfg.cooldownSec * 1000L).coerceAtLeast(5_000L))
            } else {
                guestPresent = false
            }
            return
        }

        guestPresent = true
        if (phase != Phase.IDLE) return

        val now = System.currentTimeMillis()
        if (now - lastGreetingAtMs < cfg.cooldownSec * 1000L) return

        val best = nearby.minByOrNull { abs(it.angle.toDouble()) } ?: nearby.first()
        beginGreeting(best)
    }

    private fun beginGreeting(person: Person?) {
        onGuestDetected?.invoke()
        val token = ++greetingToken
        lastGreetingAtMs = System.currentTimeMillis()
        setPhase(Phase.GREETING)
        onStatus?.invoke("Greeting guest id=${person?.id}")

        lookAtGuest(person)

        val phrases = BuddybobApp.instance.config.current.phrases
        speech.speak(phrases.welcome) {
            mainHandler.post(welcomeDone@{
                if (token != greetingToken) return@welcomeDone
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

        // Release chassis before taking focus-follow ownership
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
    }
}
