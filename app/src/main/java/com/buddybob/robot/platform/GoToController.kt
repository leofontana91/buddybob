package com.buddybob.robot.platform

import android.util.Log
import com.buddybob.robot.BuddybobApp
import com.buddybob.robot.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Unico percorso “Vai a…” per voce, tap UI, web e ritorno standby.
 * Qui vivono overlay movimento, frasi e comportamento all’arrivo.
 */
class GoToController {

    enum class After {
        /** Resta a destinazione → menu accoglienza (default). */
        STAY,
        /** Come STAY ma senza aprire il menu (tappa intermedia di un percorso). */
        LEG,
        /** Dopo l’arrivo torna al punto di accoglienza. */
        RETURN,
        /** Solo spostamento, niente menu (es. ritorno standby automatico). */
        QUIET
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var job: Job? = null
    private val cancelled = AtomicBoolean(false)

    @Volatile
    var isRunning: Boolean = false
        private set

    fun cancel() {
        cancelled.set(true)
        job?.cancel()
        job = null
        isRunning = false
        BuddybobApp.instance.notifyNavigationBusy(false)
        (BuddybobApp.instance.currentActivity as? MainActivity)?.hidePlaceDisplay()
    }

    /**
     * Avvia un “vai a” (cancella eventuali precedenti).
     * @return true se partito
     */
    fun go(
        placeName: String,
        after: After = After.STAY,
        returnAfterSec: Int = 0,
        onFinished: ((ok: Boolean) -> Unit)? = null
    ): Boolean {
        val place = placeName.trim()
        if (place.isBlank()) {
            onFinished?.invoke(false)
            return false
        }
        if (!BuddybobApp.instance.robot.canUseApi()) {
            onFinished?.invoke(false)
            return false
        }
        cancelled.set(false)
        job?.cancel()
        isRunning = true
        BuddybobApp.instance.notifyNavigationBusy(true)
        job = scope.launch {
            val ok = runCatching {
                execute(place, after, returnAfterSec)
            }.onFailure {
                Log.e(TAG, "go failed: ${it.message}", it)
            }.getOrDefault(false)
            isRunning = false
            BuddybobApp.instance.notifyNavigationBusy(false)
            onFinished?.invoke(ok && !cancelled.get())
        }
        return true
    }

    /** Bloccante per CommandPoller (thread IO). */
    fun goBlocking(
        placeName: String,
        after: After = After.STAY,
        returnAfterSec: Int = 0
    ): String? {
        val place = placeName.trim()
        if (place.isBlank()) return "Punto mancante"
        if (!BuddybobApp.instance.robot.canUseApi()) return "Robot non pronto"
        cancelled.set(false)
        return try {
            isRunning = true
            BuddybobApp.instance.notifyNavigationBusy(true)
            val ok = runBlocking { execute(place, after, returnAfterSec) }
            if (ok) null else "Navigazione interrotta"
        } catch (e: Exception) {
            e.message ?: "errore"
        } finally {
            isRunning = false
            BuddybobApp.instance.notifyNavigationBusy(false)
        }
    }

    private suspend fun execute(
        place: String,
        after: After,
        returnAfterSec: Int
    ): Boolean {
        val robot = BuddybobApp.instance.robot
        val config = BuddybobApp.instance.config
        val cfg = robot.placeContent.get(place)
        val label = cfg?.labelOrName() ?: config.placeLabel(place)

        // —— Partenza ——
        val going = cfg?.speakDepart(config.phraseGoingTo(label))
            ?: config.phraseGoingTo(label)
        if (after != After.QUIET) {
            showMoment(cfg, "depart")
            robot.speech.speak(going)
            delay(400)
        }

        if (cancelled.get()) return false

        // —— In viaggio (schermo pieno) ——
        robot.navigation.lastStatusTextForWaitClear()
        withContext(Dispatchers.Main) {
            robot.navigation.startNavigation(place)
        }
        delay(900)

        cfg?.speakWhileMoving?.trim()?.takeIf { it.isNotBlank() }?.let {
            robot.speech.speak(it)
        }
        showMoving(cfg, label)

        val arrivedOk = waitForNavigation()
        if (cancelled.get()) return false

        // —— Arrivo ——
        hideDisplay()
        val arrivedPhrase = cfg?.speakArrive(
            config.current.phrases.format(
                config.current.phrases.arrived,
                "place" to label
            )
        ) ?: config.current.phrases.format(
            config.current.phrases.arrived,
            "place" to label
        )

        when (after) {
            After.QUIET -> {
                // Niente frase/menu (rientro standby silenzioso se non configurato)
                cfg?.speakOnArrive?.trim()?.takeIf { it.isNotBlank() }?.let {
                    robot.speech.speak(it)
                }
            }
            After.STAY, After.LEG -> {
                if (hasArriveVisual(cfg)) {
                    showMoment(cfg, "arrive")
                }
                if (arrivedPhrase.isNotBlank()) {
                    robot.speech.speak(arrivedPhrase)
                    delay(600)
                }
                hideDisplay()
                if (after == After.STAY) {
                    openReceptionMenu()
                }
            }
            After.RETURN -> {
                if (hasArriveVisual(cfg)) {
                    showMoment(cfg, "arrive")
                }
                if (arrivedPhrase.isNotBlank()) {
                    robot.speech.speak(arrivedPhrase)
                }
                val wait = returnAfterSec.coerceIn(0, 600)
                if (wait > 0) delay(wait * 1000L)
                hideDisplay()
                val home = config.current.reception.standbyPlace.trim()
                if (home.isNotBlank() && !cancelled.get()) {
                    return execute(home, After.QUIET, 0)
                }
            }
        }
        return arrivedOk
    }

    private fun hasArriveVisual(cfg: PlaceContentStore.Place?): Boolean {
        if (cfg == null) return false
        return !cfg.displayOnArrive.isNullOrBlank() || cfg.mediaOnArrive != null
    }

    private fun showMoving(cfg: PlaceContentStore.Place?, label: String) {
        val act = BuddybobApp.instance.currentActivity as? MainActivity ?: return
        act.runOnUiThread {
            act.showMovingPlaceholder(
                destinationLabel = label,
                text = cfg?.displayWhileMoving,
                media = cfg?.mediaWhileMoving
            )
        }
    }

    private fun showMoment(cfg: PlaceContentStore.Place?, phase: String) {
        val act = BuddybobApp.instance.currentActivity as? MainActivity ?: return
        act.runOnUiThread {
            when (phase) {
                "depart" -> act.showPlaceDisplay(cfg?.displayOnDepart, cfg?.mediaOnDepart)
                "arrive" -> act.showPlaceDisplay(cfg?.displayOnArrive, cfg?.mediaOnArrive)
            }
        }
    }

    private fun hideDisplay() {
        val act = BuddybobApp.instance.currentActivity as? MainActivity ?: return
        act.runOnUiThread { act.hidePlaceDisplay() }
    }

    private fun openReceptionMenu() {
        val act = BuddybobApp.instance.currentActivity as? MainActivity ?: return
        act.runOnUiThread {
            BuddybobApp.instance.robot.reception.openMenuAfterArrival()
            act.openReceptionOrHome()
        }
    }

    private suspend fun waitForNavigation(): Boolean {
        val nav = BuddybobApp.instance.robot.navigation
        var elapsed = 0
        while (currentCoroutineContext().isActive && !cancelled.get() && elapsed < 180) {
            delay(1000)
            elapsed += 1
            val s = nav.lastStatusText
            if (isNavFinished(s)) {
                return !s.contains("error", ignoreCase = true) &&
                    !s.contains("Cannot reach") &&
                    !s.contains("Destination missing") &&
                    !s.contains("Not localized")
            }
            if (!nav.isNavigating && elapsed > 3 && s.isNotBlank()) {
                if (isNavFinished(s)) return true
            }
        }
        return !cancelled.get()
    }

    private fun isNavFinished(statusText: String): Boolean {
        if (statusText.isBlank()) return false
        val s = statusText.lowercase()
        return s.contains("result status=") ||
            s.contains("already at") ||
            s.contains("cannot reach") ||
            s.contains("destination missing") ||
            s.contains("not localized") ||
            s.contains("nav error") ||
            (s.contains("chassis busy") && !BuddybobApp.instance.robot.navigation.isNavigating)
    }

    companion object {
        private const val TAG = "GoTo"
    }
}
