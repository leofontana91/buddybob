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
import com.buddybob.robot.ui.avatar.BobAvatarMode
import com.buddybob.robot.ui.avatar.BobAvatarView

class ReceptionFragment : Fragment() {

    private lateinit var panelIdle: View
    private lateinit var panelGreeting: LinearLayout
    private lateinit var panelMenu: LinearLayout
    private lateinit var textGreeting: TextView
    private lateinit var recyclerMenu: RecyclerView
    private lateinit var avatarIdle: BobAvatarView
    private lateinit var avatarGreeting: BobAvatarView
    private lateinit var avatarMenu: BobAvatarView
    private lateinit var btnMic: ImageButton
    private lateinit var btnSettings: ImageButton

    private val reception: ReceptionController
        get() = BuddybobApp.instance.robot.reception

    private val avatar
        get() = BuddybobApp.instance.robot.avatar

    private val phaseListener: (ReceptionController.Phase) -> Unit = { phase ->
        renderPhase(phase)
    }

    private val avatarListener: (BobAvatarMode) -> Unit = { mode ->
        if (isAdded) {
            avatarIdle.setMode(mode)
            avatarGreeting.setMode(mode)
            avatarMenu.setMode(mode)
            updateSettingsVisibility(mode)
        }
    }

    private val listeningListener: (Boolean) -> Unit = { listening ->
        if (isAdded) applyMicListening(listening)
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
        avatarIdle = root.findViewById(R.id.bob_avatar_idle)
        avatarGreeting = root.findViewById(R.id.bob_avatar_greeting)
        avatarMenu = root.findViewById(R.id.bob_avatar_menu)
        btnMic = root.findViewById(R.id.btn_voice_mic)
        btnSettings = root.findViewById(R.id.btn_settings)

        textGreeting.text = BuddybobApp.instance.config.current.phrases.welcome
        recyclerMenu.layoutManager = GridLayoutManager(requireContext(), 2)
        bindMenu()

        panelIdle.setOnClickListener {
            reception.simulateGuest()
        }
        btnSettings.setOnClickListener { SettingsGate.prompt(this) }
        btnMic.setOnClickListener {
            avatar.noteActivity()
            BuddybobApp.instance.startVoiceListeningFromUi()
        }
        panelGreeting.setOnClickListener {
            reception.skipGreetingToMenu()
        }
        // Qualsiasi tocco sullo schermo in idle ritarda lo standby
        root.setOnTouchListener { _, _ ->
            if (reception.phase == ReceptionController.Phase.IDLE) {
                avatar.noteActivity()
            }
            false
        }
        applyMicListening(false)
        return root
    }

    override fun onResume() {
        super.onResume()
        reception.onPhaseChanged = phaseListener
        reception.onStatus = { BuddybobApp.instance.robot.log("Reception: $it") }
        avatar.addListener(avatarListener)
        BuddybobApp.instance.addVoiceListeningListener(listeningListener)
        avatarIdle.bindSignals(avatar)
        avatarGreeting.bindSignals(avatar)
        avatarMenu.bindSignals(avatar)
        if (BuddybobApp.instance.config.current.modules.reception) {
            reception.startListening()
        }
        val speechOn = BuddybobApp.instance.config.current.modules.speech
        btnMic.visibility = if (speechOn) View.VISIBLE else View.GONE
        if (speechOn) {
            BuddybobApp.instance.robot.speech.setListeningDesired(true)
        }
        renderPhase(reception.phase)
        avatar.onReceptionPhase(reception.phase)
    }

    override fun onPause() {
        avatarIdle.unbindSignals()
        avatarGreeting.unbindSignals()
        avatarMenu.unbindSignals()
        avatar.removeListener(avatarListener)
        BuddybobApp.instance.removeVoiceListeningListener(listeningListener)
        reception.onPhaseChanged = null
        super.onPause()
    }

    fun reloadFromConfig() {
        if (!isAdded) return
        textGreeting.text = BuddybobApp.instance.config.current.phrases.welcome
        bindMenu()
        btnMic.visibility =
            if (BuddybobApp.instance.config.current.modules.speech) View.VISIBLE else View.GONE
        if (!BuddybobApp.instance.config.current.modules.reception) {
            (activity as? MainActivity)?.openReceptionOrHome()
        }
    }

    private fun applyMicListening(listening: Boolean) {
        btnMic.setBackgroundResource(
            if (listening) R.drawable.bg_mic_listening else R.drawable.bg_mic_idle
        )
    }

    private fun bindMenu() {
        val buttons = reception.enabledButtons()
        recyclerMenu.adapter = ReceptionMenuAdapter(buttons) { button ->
            openFeature(button)
        }
    }

    private fun openFeature(button: BobConfig.MenuButton) {
        (activity as? MainActivity)?.hidePlaceDisplay()
        val fragment: Fragment = when (button.id) {
            "goTo" -> PlacesFragment.newInstance()
            "talkToMe" -> SpeechFragment.newInstance()
            "appointments" -> AppointmentsHubFragment.newInstance()
            "callOperator" -> CallOperatorFragment.newInstance()
            "documents" -> DocumentsFragment.newInstance()
            "accessControl" -> AccessControlFragment.newInstance()
            "voiceMemos" -> VoiceMemosFragment.newInstance(awaitStart = false)
            else -> PlaceholderFeatureFragment.newInstance(button.id, button.label)
        }
        open(fragment)
    }

    private fun renderPhase(phase: ReceptionController.Phase) {
        panelIdle.visibility = if (phase == ReceptionController.Phase.IDLE) View.VISIBLE else View.GONE
        panelGreeting.visibility =
            if (phase == ReceptionController.Phase.GREETING) View.VISIBLE else View.GONE
        panelMenu.visibility = if (phase == ReceptionController.Phase.MENU) View.VISIBLE else View.GONE
        updateSettingsVisibility(avatar.mode)
        avatar.onReceptionPhase(phase)
        if (phase == ReceptionController.Phase.MENU) {
            bindMenu()
        }
        if (phase == ReceptionController.Phase.GREETING) {
            textGreeting.text = BuddybobApp.instance.config.current.phrases.welcome
        }
    }

    private fun updateSettingsVisibility(mode: BobAvatarMode = avatar.mode) {
        // Nascoste in saluto e in standby (Bob che dorme)
        btnSettings.visibility = when {
            reception.phase == ReceptionController.Phase.GREETING -> View.GONE
            mode == BobAvatarMode.IDLE_SLEEP -> View.GONE
            else -> View.VISIBLE
        }
    }

    private fun open(fragment: Fragment) {
        (activity as? MainActivity)?.switchFragment(fragment)
    }

    companion object {
        fun newInstance() = ReceptionFragment()
    }
}
