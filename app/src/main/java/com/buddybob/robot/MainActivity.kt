package com.buddybob.robot

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.Fragment
import com.buddybob.robot.robot.ReceptionController
import com.buddybob.robot.ui.HomeFragment
import com.buddybob.robot.ui.ReceptionFragment

class MainActivity : AppCompatActivity() {

    private val handler = Handler(Looper.getMainLooper())
    private var inactivityRunnable: Runnable? = null

    /** True when showing a sub-feature (not reception). */
    private var inSubFeature = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_splash)

        handler.postDelayed({
            setContentView(R.layout.activity_main)
            openReceptionOrHome()
        }, 700)
    }

    fun openReceptionOrHome() {
        inSubFeature = false
        cancelInactivityTimer()
        val receptionOn = BuddybobApp.instance.config.current.modules.reception
        replaceFragment(
            if (receptionOn) ReceptionFragment.newInstance()
            else HomeFragment.newInstance()
        )
    }

    fun switchFragment(fragment: Fragment) {
        val isReception = fragment is ReceptionFragment
        inSubFeature = !isReception
        replaceFragment(fragment)
        if (inSubFeature) {
            startInactivityTimer()
        } else {
            cancelInactivityTimer()
        }
    }

    private fun replaceFragment(fragment: Fragment) {
        supportFragmentManager.beginTransaction()
            .replace(R.id.container_content, fragment, fragment.javaClass.name)
            .commitAllowingStateLoss()
    }

    /** Called by ReceptionController when it detects a guest while in a sub-feature. */
    fun onGuestDetectedWhileAway() {
        if (!inSubFeature) return
        handler.post { openReceptionOrHome() }
    }

    /** Resets the inactivity countdown (e.g. on user touch). */
    fun resetInactivityTimer() {
        if (inSubFeature) {
            cancelInactivityTimer()
            startInactivityTimer()
        }
    }

    private fun startInactivityTimer() {
        cancelInactivityTimer()
        val timeoutMs = BuddybobApp.instance.config.current.reception.cooldownSec * 1000L
        val delay = timeoutMs.coerceAtLeast(10_000L)
        val r = Runnable { openReceptionOrHome() }
        inactivityRunnable = r
        handler.postDelayed(r, delay)
    }

    private fun cancelInactivityTimer() {
        inactivityRunnable?.let { handler.removeCallbacks(it) }
        inactivityRunnable = null
    }

    override fun onUserInteraction() {
        super.onUserInteraction()
        resetInactivityTimer()
    }

    override fun onDestroy() {
        cancelInactivityTimer()
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }
}
