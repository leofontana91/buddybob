package com.buddybob.robot.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import androidx.fragment.app.Fragment
import com.buddybob.robot.BuddybobApp
import com.buddybob.robot.MainActivity
import com.buddybob.robot.R
import com.buddybob.robot.robot.RobotFacade

class HomeFragment : Fragment() {

    private lateinit var statusText: TextView
    private lateinit var logText: TextView
    private val logs = StringBuilder()

    private val connectionListener: (RobotFacade.ConnectionState) -> Unit = { state ->
        statusText.text = when {
            state.active -> getString(R.string.status_ready)
            state.connected -> "RobotOS connesso, in attesa di autorizzazione…"
            else -> getString(R.string.status_waiting_robot)
        }
    }

    private val logListener: (String) -> Unit = { msg ->
        logs.append(msg).append('\n')
        if (logs.length > 3000) logs.delete(0, logs.length - 2000)
        logText.text = logs.toString()
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_home, container, false)
        statusText = root.findViewById(R.id.text_status)
        logText = root.findViewById(R.id.text_log)

        val backReception = root.findViewById<Button>(R.id.btn_back_reception)
        if (BuddybobApp.instance.config.current.modules.reception) {
            backReception.visibility = View.VISIBLE
            backReception.setOnClickListener {
                (activity as? MainActivity)?.openReceptionOrHome()
            }
        }

        root.findViewById<Button>(R.id.btn_pairing).setOnClickListener {
            open(PairingFragment.newInstance())
        }
        root.findViewById<Button>(R.id.btn_go_to).setOnClickListener {
            open(PlacesFragment.newInstance())
        }
        root.findViewById<Button>(R.id.btn_motion).setOnClickListener {
            open(MotionFragment.newInstance())
        }
        root.findViewById<Button>(R.id.btn_speech).setOnClickListener {
            open(SpeechFragment.newInstance())
        }
        root.findViewById<Button>(R.id.btn_follow).setOnClickListener {
            open(FollowFragment.newInstance())
        }
        root.findViewById<Button>(R.id.btn_halt).setOnClickListener {
            runCatching { BuddybobApp.instance.robot.haltAllMotion() }
        }

        return root
    }

    override fun onResume() {
        super.onResume()
        val robot = BuddybobApp.instance.robot
        robot.addConnectionListener(connectionListener)
        robot.addLogListener(logListener)
        robot.navigation.onStatus = { robot.log("Nav: $it") }
    }

    override fun onPause() {
        val robot = BuddybobApp.instance.robot
        robot.removeConnectionListener(connectionListener)
        robot.removeLogListener(logListener)
        super.onPause()
    }

    private fun open(fragment: Fragment) {
        (activity as? MainActivity)?.switchFragment(fragment)
    }

    companion object {
        fun newInstance() = HomeFragment()
    }
}
