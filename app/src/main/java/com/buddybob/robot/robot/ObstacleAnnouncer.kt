package com.buddybob.robot.robot

import android.os.Handler
import android.os.Looper
import com.buddybob.robot.BuddybobApp
import com.buddybob.robot.R
import kotlin.random.Random

/**
 * Mentre la nav è bloccata da un ostacolo, fa dire a BOB frasi casuali
 * (senza spam: almeno [MIN_GAP_MS] tra una e l'altra).
 */
object ObstacleAnnouncer {

    private val main = Handler(Looper.getMainLooper())
    private var lastSpeakAt = 0L
    private var pending: Runnable? = null

    fun onBlockedChanged(blocked: Boolean) {
        pending?.let { main.removeCallbacks(it) }
        pending = null
        if (!blocked) return
        scheduleNext(first = true)
    }

    private fun scheduleNext(first: Boolean) {
        val elapsed = System.currentTimeMillis() - lastSpeakAt
        val delay = when {
            first && lastSpeakAt == 0L -> 200L
            first && elapsed >= MIN_GAP_MS -> 200L
            first -> (MIN_GAP_MS - elapsed).coerceAtLeast(200L)
            else -> MIN_GAP_MS
        }
        val r = Runnable {
            pending = null
            val nav = BuddybobApp.instance.robot.navigation
            if (!nav.isBlockedByObstacle || !nav.isNavigating) return@Runnable
            val phrases = BuddybobApp.instance.resources
                .getStringArray(R.array.obstacle_phrases)
            if (phrases.isEmpty()) return@Runnable
            val line = phrases[Random.nextInt(phrases.size)]
            lastSpeakAt = System.currentTimeMillis()
            BuddybobApp.instance.robot.speech.speak(line)
            scheduleNext(first = false)
        }
        pending = r
        main.postDelayed(r, delay)
    }

    private const val MIN_GAP_MS = 9_000L
}
