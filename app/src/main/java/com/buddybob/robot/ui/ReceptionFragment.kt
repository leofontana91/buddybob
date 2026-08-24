package com.buddybob.robot.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.buddybob.robot.BuddybobApp
import com.buddybob.robot.MainActivity
import com.buddybob.robot.R
import com.buddybob.robot.config.BobConfig
import com.buddybob.robot.robot.ReceptionController

class ReceptionFragment : Fragment() {

    private lateinit var panelIdle: View
    private lateinit var panelGreeting: LinearLayout
    private lateinit var panelMenu: LinearLayout
    private lateinit var textGreeting: TextView
    private lateinit var recyclerMenu: RecyclerView

    private val reception: ReceptionController
        get() = BuddybobApp.instance.robot.reception

    private val phaseListener: (ReceptionController.Phase) -> Unit = { phase ->
        renderPhase(phase)
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_reception, container, false)
        panelIdle = root.findViewById(R.id.panel_idle)
        panelGreeting = root.findViewById(R.id.panel_greeting)
        panelMenu = root.findViewById(R.id.panel_menu)
        textGreeting = root.findViewById(R.id.text_greeting)
        recyclerMenu = root.findViewById(R.id.recycler_menu)

        textGreeting.text = BuddybobApp.instance.config.current.phrases.welcome
        recyclerMenu.layoutManager = GridLayoutManager(requireContext(), 2)
        bindMenu()

        panelIdle.setOnClickListener {
            reception.simulateGuest()
        }
        root.findViewById<ImageButton>(R.id.btn_idle_settings).setOnClickListener {
            SettingsGate.prompt(this)
        }
        root.findViewById<ImageButton>(R.id.btn_menu_settings).setOnClickListener {
            SettingsGate.prompt(this)
        }
        panelGreeting.setOnClickListener {
            reception.skipGreetingToMenu()
        }
        return root
    }

    override fun onResume() {
        super.onResume()
        reception.onPhaseChanged = phaseListener
        reception.onStatus = { BuddybobApp.instance.robot.log("Reception: $it") }
        if (BuddybobApp.instance.config.current.modules.reception) {
            reception.startListening()
        }
        if (BuddybobApp.instance.config.current.modules.speech) {
            BuddybobApp.instance.robot.speech.setListeningDesired(true)
        }
        renderPhase(reception.phase)
    }

    override fun onPause() {
        reception.onPhaseChanged = null
        super.onPause()
    }

    fun reloadFromConfig() {
        if (!isAdded) return
        textGreeting.text = BuddybobApp.instance.config.current.phrases.welcome
        bindMenu()
        if (!BuddybobApp.instance.config.current.modules.reception) {
            (activity as? MainActivity)?.openReceptionOrHome()
        }
    }

    private fun bindMenu() {
        val buttons = reception.enabledButtons()
        recyclerMenu.adapter = ReceptionMenuAdapter(buttons) { button ->
            openFeature(button)
        }
    }

    private fun openFeature(button: BobConfig.MenuButton) {
        val fragment: Fragment = when (button.id) {
            "goTo" -> PlacesFragment.newInstance()
            "talkToMe" -> SpeechFragment.newInstance()
            "appointments" -> AppointmentsHubFragment.newInstance()
            "callOperator" -> CallOperatorFragment.newInstance()
            "documents" -> DocumentsFragment.newInstance()
            "accessControl" -> AccessControlFragment.newInstance()
            else -> PlaceholderFeatureFragment.newInstance(button.id, button.label)
        }
        open(fragment)
    }

    private fun renderPhase(phase: ReceptionController.Phase) {
        panelIdle.visibility = if (phase == ReceptionController.Phase.IDLE) View.VISIBLE else View.GONE
        panelGreeting.visibility =
            if (phase == ReceptionController.Phase.GREETING) View.VISIBLE else View.GONE
        panelMenu.visibility = if (phase == ReceptionController.Phase.MENU) View.VISIBLE else View.GONE
        if (phase == ReceptionController.Phase.MENU) {
            bindMenu()
        }
        if (phase == ReceptionController.Phase.GREETING) {
            textGreeting.text = BuddybobApp.instance.config.current.phrases.welcome
        }
    }

    private fun open(fragment: Fragment) {
        (activity as? MainActivity)?.switchFragment(fragment)
    }

    companion object {
        fun newInstance() = ReceptionFragment()
    }
}
