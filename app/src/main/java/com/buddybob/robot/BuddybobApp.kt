package com.buddybob.robot

import android.app.Activity
import android.app.Application
import android.os.Bundle
import android.os.HandlerThread
import android.util.Log
import com.ainirobot.coreservice.client.ApiListener
import com.ainirobot.coreservice.client.RobotApi
import com.ainirobot.coreservice.client.speech.SkillApi
import com.buddybob.robot.config.ConfigRepository
import com.buddybob.robot.platform.CommandPoller
import com.buddybob.robot.platform.VoiceRouter
import com.buddybob.robot.robot.BuddyModuleCallback
import com.buddybob.robot.robot.BuddySpeechCallback
import com.buddybob.robot.robot.ObstacleAnnouncer
import com.buddybob.robot.robot.RobotFacade

/**
 * Connects to RobotOS CoreService + SkillApi on startup.
 * All robot capabilities are exposed via [RobotFacade].
 */
class BuddybobApp : Application() {

    lateinit var robot: RobotFacade
        private set

    lateinit var config: ConfigRepository
        private set

    var currentActivity: Activity? = null

    private var skillApi: SkillApi? = null
    private val moduleCallback = BuddyModuleCallback()
    private val speechCallback = BuddySpeechCallback()
    private val voiceRouter = VoiceRouter()
    private val apiThread = HandlerThread("BuddybobRobotApi").also { it.start() }

    override fun onCreate() {
        super.onCreate()
        instance = this
        config = ConfigRepository(this).also { it.load() }
        robot = RobotFacade(this)
        robot.speech.onSpeakingChanged = { speaking ->
            if (speaking) {
                // Se è bloccato e sta chiedendo spazio, resta in BLOCKED
                if (!robot.navigation.isBlockedByObstacle) {
                    robot.avatar.onSpeaking()
                }
            } else {
                when {
                    robot.navigation.isBlockedByObstacle -> robot.avatar.onBlocked()
                    robot.navigation.isNavigating -> robot.avatar.onMoving()
                    (currentActivity as? MainActivity)?.isTalkScreenOpen() == true ->
                        robot.avatar.onListening()
                    else -> robot.avatar.onVoiceIdle(robot.reception.phase)
                }
            }
        }
        robot.speech.onSpeakText = { text ->
            (currentActivity as? MainActivity)?.showVoiceSaid(text)
        }
        robot.navigation.onObstacle = { blocked ->
            if (blocked) {
                robot.avatar.onBlocked()
                ObstacleAnnouncer.onBlockedChanged(true)
            } else {
                ObstacleAnnouncer.onBlockedChanged(false)
                if (robot.navigation.isNavigating) {
                    robot.avatar.onMoving()
                }
            }
        }
        robot.reception.onGuestDetected = {
            val act = currentActivity
            if (act is MainActivity) act.onGuestDetectedWhileAway()
        }
        CommandPoller().start()
        speechCallback.listener = object : BuddySpeechCallback.Listener {
            override fun onPartial(text: String) {
                robot.log("ASR partial: $text")
                voiceRouter.onAsrPartial(text)
            }

            override fun onFinal(text: String) {
                robot.log("ASR final: $text")
                voiceRouter.onAsrFinal(text)
            }

            override fun onVolume(volume: Int) = Unit
        }
        moduleCallback.listener = object : BuddyModuleCallback.Listener {
            override fun onVoiceRequest(
                reqId: Int,
                reqType: String,
                reqText: String,
                reqParam: String
            ) {
                robot.log("Voice: type=$reqType text=$reqText param=$reqParam")
            }

            override fun onSuspend() {
                robot.onSuspended(true)
            }

            override fun onRecovery() {
                robot.onSuspended(false)
            }
        }
        registerActivityLifecycleCallbacks(object : ActivityLifecycleCallbacks {
            override fun onActivityResumed(a: Activity) { currentActivity = a }
            override fun onActivityPaused(a: Activity) { if (currentActivity == a) currentActivity = null }
            override fun onActivityCreated(a: Activity, s: Bundle?) = Unit
            override fun onActivityStarted(a: Activity) = Unit
            override fun onActivityStopped(a: Activity) = Unit
            override fun onActivitySaveInstanceState(a: Activity, s: Bundle) = Unit
            override fun onActivityDestroyed(a: Activity) = Unit
        })
        connectRobotOs()
    }

    fun getSkillApi(): SkillApi? {
        val api = skillApi ?: return null
        return if (api.isApiConnectedService) api else null
    }

    private fun connectRobotOs() {
        RobotApi.getInstance().connectServer(this, object : ApiListener {
            override fun handleApiDisabled() {
                Log.w(TAG, "RobotApi disabled")
                robot.onConnectionChanged(connected = false, active = false)
            }

            override fun handleApiConnected() {
                Log.i(TAG, "RobotApi connected")
                RobotApi.getInstance().setCallback(moduleCallback)
                RobotApi.getInstance().setResponseThread(apiThread)
                connectSkillApi()
                robot.onConnectionChanged(
                    connected = true,
                    active = RobotApi.getInstance().isActive
                )
                robot.haltAllMotion()
            }

            override fun handleApiDisconnected() {
                Log.w(TAG, "RobotApi disconnected")
                robot.onConnectionChanged(connected = false, active = false)
            }
        })
    }

    private fun connectSkillApi() {
        val api = SkillApi()
        skillApi = api
        api.addApiEventListener(object : ApiListener {
            override fun handleApiDisabled() = Unit

            override fun handleApiConnected() {
                api.registerCallBack(speechCallback)
                robot.onSpeechReady(true)
                if (config.current.modules.speech) {
                    robot.speech.setListeningDesired(true)
                    robot.speech.resetMicToFront()
                    runCatching {
                        api.setWakeupHintClosed(true)
                    }
                }
                Log.i(TAG, "SkillApi connected")
            }

            override fun handleApiDisconnected() {
                robot.onSpeechReady(false)
                Log.w(TAG, "SkillApi disconnected")
            }
        })
        api.connectApi(this)
    }

    /** Pulsante microfono UI: ascolto senza ripetere «Bob». */
    fun startVoiceListeningFromUi() = voiceRouter.armFromMic()

    /** STOP sul monitor: ferma parlato/azione e riapre il dialogo. */
    fun voiceUserStop() = voiceRouter.userStop()

    fun addVoiceListeningListener(listener: (Boolean) -> Unit) =
        voiceRouter.addListeningListener(listener)

    fun removeVoiceListeningListener(listener: (Boolean) -> Unit) =
        voiceRouter.removeListeningListener(listener)

    fun notifyNavigationBusy(busy: Boolean) = voiceRouter.onNavigationBusy(busy)

    companion object {
        private const val TAG = "BuddybobApp"
        lateinit var instance: BuddybobApp
            private set
    }
}
