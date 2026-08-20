package com.buddybob.robot.platform

import android.util.Log
import com.buddybob.robot.BuddybobApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Polls web commands (vai a / fai dire / ferma) and syncs map places.
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
        if (ticks % 8 == 1) {
            runCatching { syncPlaces() }
        }
        val commands = api.pollCommands()
        for (cmd in commands) {
            val error = withContext(Dispatchers.Main) { executeOnRobot(cmd) }
            runCatching {
                api.ackCommand(
                    cmd.id,
                    if (error == null) "done" else "failed",
                    error
                )
            }
        }
    }

    private fun executeOnRobot(cmd: PlatformApi.CommandDto): String? {
        val robot = BuddybobApp.instance.robot
        return try {
            when (cmd.type) {
                "stop" -> {
                    robot.haltAllMotion()
                    null
                }
                "speak" -> {
                    val text = cmd.text?.trim().orEmpty()
                    if (text.isBlank()) return "Testo vuoto"
                    robot.speech.speak(text)
                    null
                }
                "goto" -> {
                    val place = cmd.placeName?.trim().orEmpty()
                    if (place.isBlank()) return "Punto mancante"
                    robot.speech.speak(
                        BuddybobApp.instance.config.phraseGoingTo(place)
                    )
                    if (robot.canUseApi()) {
                        robot.navigation.startNavigation(place)
                    }
                    null
                }
                else -> "Tipo sconosciuto: ${cmd.type}"
            }
        } catch (e: Exception) {
            e.message ?: "errore"
        }
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
