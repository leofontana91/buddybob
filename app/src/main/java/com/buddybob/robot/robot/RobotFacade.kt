package com.buddybob.robot.robot

import android.content.Context
import android.os.Handler
import android.os.Looper
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Single entry-point for all robot capabilities used by Buddybob.
 *
 * Usage from UI / other modules:
 * ```
 * val robot = BuddybobApp.instance.robot
 * robot.motion.goForward()
 * robot.speech.speak("Ciao")
 * robot.follow.startSmartFocusFollow()
 * ```
 */
class RobotFacade(private val context: Context) {

    val motion = MotionController()
    val speech = SpeechController()
    val follow = FollowController()
    val navigation = NavigationController()
    val status = StatusMonitor()
    val reception = ReceptionController(motion, speech, follow)

    @Volatile
    var isConnected: Boolean = false
        private set

    @Volatile
    var isActive: Boolean = false
        private set

    @Volatile
    var isSpeechReady: Boolean = false
        private set

    @Volatile
    var isSuspended: Boolean = false
        private set

    private val mainHandler = Handler(Looper.getMainLooper())
    private val connectionListeners = CopyOnWriteArrayList<(ConnectionState) -> Unit>()
    private val logListeners = CopyOnWriteArrayList<(String) -> Unit>()

    data class ConnectionState(
        val connected: Boolean,
        val active: Boolean,
        val speechReady: Boolean,
        val suspended: Boolean
    )

    fun addConnectionListener(listener: (ConnectionState) -> Unit) {
        connectionListeners.add(listener)
        listener(currentState())
    }

    fun removeConnectionListener(listener: (ConnectionState) -> Unit) {
        connectionListeners.remove(listener)
    }

    fun addLogListener(listener: (String) -> Unit) {
        logListeners.add(listener)
    }

    fun removeLogListener(listener: (String) -> Unit) {
        logListeners.remove(listener)
    }

    fun log(message: String) {
        mainHandler.post {
            logListeners.forEach { it(message) }
        }
    }

    fun onConnectionChanged(connected: Boolean, active: Boolean) {
        isConnected = connected
        isActive = active
        if (connected && active) {
            try {
                status.start()
            } catch (e: Exception) {
                log("StatusMonitor start failed: ${e.message}")
            }
        }
        notifyState()
        log("RobotApi connected=$connected active=$active")
    }

    fun onSpeechReady(ready: Boolean) {
        isSpeechReady = ready
        notifyState()
        log("SkillApi ready=$ready")
    }

    fun onSuspended(suspended: Boolean) {
        isSuspended = suspended
        notifyState()
        log(if (suspended) "SUSPENDED — API blocked" else "RECOVERED — API available")
    }

    /** Emergency stop for chassis-owning actions. */
    fun haltAllMotion() {
        runCatching {
            motion.stopMove()
            follow.stopFocusFollow()
            navigation.stopNavigation()
            speech.stop()
        }.onFailure {
            log("haltAllMotion failed: ${it.message}")
        }
        log("haltAllMotion")
    }

    fun canUseApi(): Boolean = isConnected && isActive && !isSuspended

    private fun currentState() = ConnectionState(
        connected = isConnected,
        active = isActive,
        speechReady = isSpeechReady,
        suspended = isSuspended
    )

    private fun notifyState() {
        val state = currentState()
        mainHandler.post {
            connectionListeners.forEach { it(state) }
        }
    }
}
