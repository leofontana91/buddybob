package com.buddybob.robot.ui.avatar

import android.os.Handler
import android.os.Looper
import com.buddybob.robot.BuddybobApp
import com.buddybob.robot.robot.ReceptionController
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Segnali "vivi" che arrivano all'avatar fuori dal ciclo degli stati.
 */
sealed class BobSignal {
    data class Voice(val level: Float) : BobSignal()
    data class Look(val x: Float, val y: Float) : BobSignal()
    object LookCenter : BobSignal()
    object Poke : BobSignal()
}

/**
 * Stato globale dell'avatar.
 *
 * In attesa (IDLE): dopo [STANDBY_SLEEP_MS] senza interazione passa alla
 * scena standby (Bob che dorme) e ci resta finché non c'è attività.
 */
class BobAvatarController {

    private val main = Handler(Looper.getMainLooper())
    private val listeners = CopyOnWriteArrayList<(BobAvatarMode) -> Unit>()
    private val signalListeners = CopyOnWriteArrayList<(BobSignal) -> Unit>()

    @Volatile
    var mode: BobAvatarMode = BobAvatarMode.IDLE_SLEEP
        private set

    private var idleWatchRunning = false

    private val standbySleepRunnable = Runnable {
        if (!idleWatchRunning) return@Runnable
        applyMode(BobAvatarMode.IDLE_SLEEP, fromIdleLoop = true)
    }

    fun addListener(listener: (BobAvatarMode) -> Unit) {
        listeners.add(listener)
        listener(mode)
    }

    fun removeListener(listener: (BobAvatarMode) -> Unit) {
        listeners.remove(listener)
    }

    fun addSignalListener(listener: (BobSignal) -> Unit) {
        signalListeners.add(listener)
    }

    fun removeSignalListener(listener: (BobSignal) -> Unit) {
        signalListeners.remove(listener)
    }

    fun onVoiceLevel(level: Float) = emit(BobSignal.Voice(level.coerceIn(0f, 1f)))

    fun onPersonAt(angleDeg: Float, distanceM: Float = 1.5f) {
        val x = (LOOK_ANGLE_SIGN * angleDeg / 45f).coerceIn(-1f, 1f)
        val y = ((1.6f - distanceM) * 0.5f).coerceIn(-0.35f, 0.55f)
        emit(BobSignal.Look(x, y))
        if (idleWatchRunning) noteActivity()
    }

    fun onPersonLost() = emit(BobSignal.LookCenter)

    fun onPoke() {
        emit(BobSignal.Poke)
        noteActivity()
    }

    private fun emit(signal: BobSignal) {
        main.post { signalListeners.forEach { it(signal) } }
    }

    fun onReceptionPhase(phase: ReceptionController.Phase) {
        when (phase) {
            ReceptionController.Phase.IDLE -> startIdleWatch()
            ReceptionController.Phase.GREETING -> {
                stopIdleWatch()
                setMode(BobAvatarMode.GREETING)
            }
            ReceptionController.Phase.MENU -> {
                stopIdleWatch()
                setMode(BobAvatarMode.MENU)
            }
        }
    }

    fun onListening() = setMode(BobAvatarMode.LISTENING)

    fun onThinking() = setMode(BobAvatarMode.THINKING)

    fun onSpeaking() = setMode(BobAvatarMode.SPEAKING)

    fun onMoving() = setMode(BobAvatarMode.MOVING)

    fun onBlocked() = setMode(BobAvatarMode.BLOCKED)

    fun onSuccess() {
        setMode(BobAvatarMode.SUCCESS)
        main.postDelayed({
            if (mode == BobAvatarMode.SUCCESS) {
                val talkOpen =
                    (BuddybobApp.instance.currentActivity as? com.buddybob.robot.MainActivity)
                        ?.isTalkScreenOpen() == true
                if (talkOpen) onListening()
                else onVoiceIdle(BuddybobApp.instance.robot.reception.phase)
            }
        }, 2_500L)
    }

    fun onVoiceIdle(receptionPhase: ReceptionController.Phase) {
        when (receptionPhase) {
            ReceptionController.Phase.IDLE -> startIdleWatch()
            ReceptionController.Phase.MENU -> setMode(BobAvatarMode.MENU)
            ReceptionController.Phase.GREETING -> setMode(BobAvatarMode.GREETING)
        }
    }

    fun setMode(next: BobAvatarMode) {
        stopIdleWatch()
        applyMode(next, fromIdleLoop = false)
    }

    /** Tocco / microfono / presenza: sveglia dallo standby e riavvia i 15s. */
    fun noteActivity() {
        if (!idleWatchRunning) return
        if (mode == BobAvatarMode.IDLE_SLEEP) {
            applyMode(BobAvatarMode.IDLE_PEEK, fromIdleLoop = true)
        }
        scheduleStandbySleep()
    }

    private fun applyMode(next: BobAvatarMode, fromIdleLoop: Boolean) {
        if (!fromIdleLoop && next in IDLE_MODES) {
            if (mode !in IDLE_MODES) {
                mode = next
                notifyListeners()
            }
            startIdleWatch()
            return
        }
        if (mode == next) return
        mode = next
        notifyListeners()
    }

    private fun startIdleWatch() {
        val wasRunning = idleWatchRunning
        idleWatchRunning = true
        if (!wasRunning && mode !in IDLE_MODES) {
            // Torna dall'uso attivo: un attimo sveglio, poi dorme
            applyMode(BobAvatarMode.IDLE_PEEK, fromIdleLoop = true)
        }
        scheduleStandbySleep()
    }

    private fun scheduleStandbySleep() {
        main.removeCallbacks(standbySleepRunnable)
        main.postDelayed(standbySleepRunnable, STANDBY_SLEEP_MS)
    }

    private fun stopIdleWatch() {
        idleWatchRunning = false
        main.removeCallbacks(standbySleepRunnable)
    }

    private fun notifyListeners() {
        main.post { listeners.forEach { it(mode) } }
    }

    companion object {
        private const val LOOK_ANGLE_SIGN = -1f
        private const val STANDBY_SLEEP_MS = 15_000L

        private val IDLE_MODES = setOf(
            BobAvatarMode.IDLE_SLEEP,
            BobAvatarMode.IDLE_KNOCK,
            BobAvatarMode.IDLE_PEEK,
        )
    }
}
