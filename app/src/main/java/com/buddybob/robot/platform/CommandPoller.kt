package com.buddybob.robot.platform

import android.app.AlertDialog
import android.util.Log
import com.buddybob.robot.BuddybobApp
import com.buddybob.robot.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Polls web commands (vai a / fai dire / ferma / task) and syncs map places.
 */
class CommandPoller {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val api = PlatformApi()
    private var ticks = 0

    fun start() {
        scope.launch {
            while (isActive) {
                runCatching { tick() }
                    .onFailure { Log.w(TAG, "poll failed: ${it.message}") }
                delay(4000)
            }
        }
    }

    private suspend fun tick() {
        if (!api.isConfigured()) return
        ticks++
        runCatching { api.postHeartbeat(currentPlace(), currentActivity()) }
        if (ticks % 8 == 1) {
            runCatching { syncPlaces() }
            runCatching { refreshPlaceContent() }
            runCatching { refreshRemoteConfig() }
        }
        val commands = api.pollCommands()
        for (cmd in commands) {
            val error = executeOnRobot(cmd)
            runCatching {
                api.ackCommand(
                    cmd.id,
                    if (error == null) "done" else "failed",
                    error
                )
            }
        }
    }

    private fun currentPlace(): String? =
        BuddybobApp.instance.robot.navigation.lastDestination

    private fun currentActivity(): String {
        val nav = BuddybobApp.instance.robot.navigation.lastStatusText
        if (nav.startsWith("nav ")) return "In navigazione"
        return when (BuddybobApp.instance.robot.reception.phase) {
            com.buddybob.robot.robot.ReceptionController.Phase.IDLE -> "In attesa"
            com.buddybob.robot.robot.ReceptionController.Phase.GREETING -> "Sta salutando"
            com.buddybob.robot.robot.ReceptionController.Phase.MENU -> "Menu accoglienza"
        }
    }

    private fun executeOnRobot(cmd: PlatformApi.CommandDto): String? {
        val robot = BuddybobApp.instance.robot
        return try {
            when (cmd.type) {
                "stop" -> {
                    robot.haltAllMotion()
                    hideDisplay()
                    null
                }
                "speak" -> {
                    val text = cmd.text?.trim().orEmpty()
                    if (text.isBlank()) return "Testo vuoto"
                    robot.speech.speak(text)
                    null
                }
                "goto" -> {
                    val after = when (cmd.after?.trim()?.lowercase()) {
                        "return" -> GoToController.After.RETURN
                        else -> GoToController.After.STAY
                    }
                    robot.goTo.goBlocking(
                        placeName = cmd.placeName.orEmpty(),
                        after = after,
                        returnAfterSec = cmd.returnAfterSec ?: 0
                    )
                }
                "task" -> {
                    runTask(cmd.steps.orEmpty())
                }
                else -> "Tipo sconosciuto: ${cmd.type}"
            }
        } catch (e: Exception) {
            e.message ?: "errore"
        }
    }

    private fun runTask(steps: List<PlatformApi.StepDto>): String? {
        val robot = BuddybobApp.instance.robot
        for (step in steps) {
            when (step.type) {
                "speak" -> {
                    val text = step.text?.trim().orEmpty()
                    if (text.isNotBlank()) {
                        robot.speech.speak(text)
                        Thread.sleep(2_500)
                    }
                }
                "button" -> {
                    val label = step.label?.trim().ifNullOrBlank("OK")
                    awaitMonitorButton(label)
                    val say = step.speakOnPress?.trim().orEmpty()
                    if (say.isNotBlank()) {
                        robot.speech.speak(say)
                        Thread.sleep(2_000)
                    }
                }
                "goto" -> {
                    val err = robot.goTo.goBlocking(
                        placeName = step.placeName.orEmpty(),
                        after = GoToController.After.STAY
                    )
                    if (err != null) return err
                }
                "wait" -> {
                    Thread.sleep(((step.seconds ?: 1).coerceIn(1, 300)) * 1000L)
                }
                "return" -> {
                    val home = BuddybobApp.instance.config.current.reception.standbyPlace.trim()
                    if (home.isNotBlank() && robot.canUseApi()) {
                        robot.goTo.goBlocking(home, GoToController.After.QUIET)
                    }
                }
            }
        }
        return null
    }

    private fun String?.ifNullOrBlank(fallback: String) =
        this?.trim()?.ifBlank { fallback } ?: fallback

    private fun awaitMonitorButton(label: String) {
        val latch = CountDownLatch(1)
        val act = BuddybobApp.instance.currentActivity as? MainActivity
        if (act == null) {
            latch.countDown()
            return
        }
        act.runOnUiThread {
            AlertDialog.Builder(act)
                .setCancelable(false)
                .setTitle("BOB")
                .setMessage("Premi per continuare")
                .setPositiveButton(label) { _, _ -> latch.countDown() }
                .show()
        }
        latch.await(5, TimeUnit.MINUTES)
    }

    private fun refreshRemoteConfig() {
        val result = BuddybobApp.instance.config.refreshFromNetwork()
        if (result is com.buddybob.robot.config.ConfigRepository.RefreshResult.Updated) {
            Log.i(TAG, "config aggiornata v${result.config.configVersion}")
            (BuddybobApp.instance.currentActivity as? MainActivity)
                ?.onRemoteConfigUpdated()
        }
    }

    private fun refreshPlaceContent() {
        if (!api.isConfigured()) return
        val places = api.fetchPlaceConfigs()
        BuddybobApp.instance.robot.placeContent.replaceAll(places)
    }

    private fun hideDisplay() {
        (BuddybobApp.instance.currentActivity as? MainActivity)?.hidePlaceDisplay()
    }

    private fun syncPlaces() {
        val robot = BuddybobApp.instance.robot
        if (!robot.canUseApi()) return
        robot.navigation.getPlaceList { places ->
            if (places.isEmpty()) return@getPlaceList
            scope.launch {
                runCatching {
                    api.syncPlaces(
                        places.map {
                            PlatformApi.PlaceSync(it.name, it.x, it.y, it.theta)
                        }
                    )
                }
            }
        }
    }

    companion object {
        private const val TAG = "CommandPoller"
    }
}
