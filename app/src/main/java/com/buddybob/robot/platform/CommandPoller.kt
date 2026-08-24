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
                    goToPlace(cmd.placeName, cmd.after, cmd.returnAfterSec)
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

    private fun goToPlace(
        placeName: String?,
        after: String?,
        returnAfterSec: Int?
    ): String? {
        val robot = BuddybobApp.instance.robot
        val place = placeName?.trim().orEmpty()
        if (place.isBlank()) return "Punto mancante"
        val cfg = robot.placeContent.get(place)
        val label = cfg?.labelOrName() ?: place
        val going = cfg?.speakDepart(
            BuddybobApp.instance.config.phraseGoingTo(label)
        ) ?: BuddybobApp.instance.config.phraseGoingTo(label)
        robot.speech.speak(going)
        showMoment(cfg, "depart")
        if (robot.canUseApi()) {
            robot.navigation.startNavigation(place)
        }
        val moving = cfg?.speakWhileMoving?.trim().orEmpty()
        if (moving.isNotBlank()) robot.speech.speak(moving)
        showMoment(cfg, "moving")
        if (after == "return") {
            waitForNavigation()
            showMoment(cfg, "arrive")
            val arrived = cfg?.speakArrive(
                BuddybobApp.instance.config.current.phrases.format(
                    BuddybobApp.instance.config.current.phrases.arrived,
                    "place" to label
                )
            )
            if (!arrived.isNullOrBlank()) robot.speech.speak(arrived)
            val wait = (returnAfterSec ?: 0).coerceIn(0, 600)
            if (wait > 0) Thread.sleep(wait * 1000L)
            hideDisplay()
            val home = BuddybobApp.instance.config.current.reception.standbyPlace.trim()
            if (home.isNotBlank() && robot.canUseApi()) {
                val homeCfg = robot.placeContent.get(home)
                val homeLabel = homeCfg?.labelOrName() ?: home
                robot.speech.speak(
                    homeCfg?.speakDepart(
                        BuddybobApp.instance.config.phraseGoingTo(homeLabel)
                    ) ?: BuddybobApp.instance.config.phraseGoingTo(homeLabel)
                )
                showMoment(homeCfg, "depart")
                robot.navigation.startNavigation(home)
                showMoment(homeCfg, "moving")
                waitForNavigation()
                showMoment(homeCfg, "arrive")
            }
        } else {
            waitForNavigation()
            showMoment(cfg, "arrive")
            val arrived = cfg?.speakOnArrive?.trim().orEmpty()
            if (arrived.isNotBlank()) robot.speech.speak(arrived)
        }
        return null
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
                    val err = goToPlace(step.placeName, "stay", 0)
                    if (err != null) return err
                    waitForNavigation()
                }
                "wait" -> {
                    Thread.sleep(((step.seconds ?: 1).coerceIn(1, 300)) * 1000L)
                }
                "return" -> {
                    val home = BuddybobApp.instance.config.current.reception.standbyPlace.trim()
                    if (home.isNotBlank() && robot.canUseApi()) {
                        robot.navigation.startNavigation(home)
                        waitForNavigation()
                    }
                }
            }
        }
        return null
    }

    private fun String?.ifNullOrBlank(fallback: String) =
        this?.trim()?.ifBlank { fallback } ?: fallback

    private fun waitForNavigation() {
        val nav = BuddybobApp.instance.robot.navigation
        var elapsed = 0
        while (elapsed < 90) {
            Thread.sleep(2000)
            elapsed += 2
            val s = nav.lastStatusText
            if (s.contains("result status=") ||
                s.contains("Already at") ||
                s.contains("Cannot reach") ||
                s.contains("Destination missing") ||
                s.contains("Not localized") ||
                s.contains("error", ignoreCase = true)
            ) break
        }
    }

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

    private fun showMoment(cfg: PlaceContentStore.Place?, phase: String) {
        val act = BuddybobApp.instance.currentActivity as? MainActivity ?: return
        when (phase) {
            "depart" -> act.showPlaceDisplay(cfg?.displayOnDepart, cfg?.mediaOnDepart)
            "moving" -> {
                if (!cfg?.displayWhileMoving.isNullOrBlank() || cfg?.mediaWhileMoving != null) {
                    act.showPlaceDisplay(cfg?.displayWhileMoving, cfg?.mediaWhileMoving)
                }
            }
            "arrive" -> act.showPlaceDisplay(cfg?.displayOnArrive, cfg?.mediaOnArrive)
        }
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
