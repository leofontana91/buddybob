package com.buddybob.robot.ui

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.buddybob.robot.BuddybobApp
import com.buddybob.robot.MainActivity
import com.buddybob.robot.R
import com.buddybob.robot.config.BobConfig
import com.buddybob.robot.platform.PlaceContentStore
import com.buddybob.robot.robot.ReceptionController
import com.buddybob.robot.ui.avatar.BobAvatarMode
import com.buddybob.robot.ui.avatar.BobAvatarView
import com.buddybob.robot.ui.games.GamesHubFragment

class ReceptionFragment : Fragment() {

    private lateinit var panelIdle: View
    private lateinit var panelGreeting: LinearLayout
    private lateinit var panelMenu: LinearLayout
    private lateinit var textGreeting: TextView
    private lateinit var recyclerMenu: RecyclerView
    private lateinit var avatarIdle: BobAvatarView
    private lateinit var avatarGreeting: BobAvatarView
    private lateinit var avatarMenu: BobAvatarView
    private lateinit var btnSettings: ImageButton

    private val main = Handler(Looper.getMainLooper())
    private var idleMediaVisible = false

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

    private val idleMediaTick = object : Runnable {
        override fun run() {
            if (!isAdded) return
            if (reception.phase != ReceptionController.Phase.IDLE) return
            showIdleAttract()
            val intervalSec = BuddybobApp.instance.config.current.reception
                .idleMediaIntervalSec.coerceAtLeast(0)
            if (intervalSec > 0 && hasIdleAttract()) {
                main.postDelayed(this, intervalSec * 1000L)
            }
        }
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
        btnSettings = root.findViewById(R.id.btn_settings)

        textGreeting.text = BuddybobApp.instance.config.current.phrases.welcome
        recyclerMenu.layoutManager = LinearLayoutManager(requireContext())
        bindMenu()

        panelIdle.setOnClickListener {
            onIdleScreenTapped()
        }
        btnSettings.setOnClickListener { SettingsGate.prompt(this) }
        panelGreeting.setOnClickListener {
            reception.skipGreetingToMenu()
        }
        root.setOnTouchListener { _, _ ->
            if (reception.phase == ReceptionController.Phase.IDLE) {
                avatar.noteActivity()
            }
            false
        }
        return root
    }

    override fun onResume() {
        super.onResume()
        reception.onPhaseChanged = phaseListener
        reception.onStatus = { BuddybobApp.instance.robot.log("Reception: $it") }
        avatar.addListener(avatarListener)
        avatarIdle.bindSignals(avatar)
        avatarGreeting.bindSignals(avatar)
        avatarMenu.bindSignals(avatar)
        if (BuddybobApp.instance.config.current.modules.reception) {
            reception.startListening()
        }
        val speechOn = BuddybobApp.instance.config.current.modules.speech
        if (speechOn) {
            BuddybobApp.instance.robot.speech.setListeningDesired(true)
        }
        (activity as? MainActivity)?.refreshVoiceControlsVisibility()
        renderPhase(reception.phase)
        avatar.onReceptionPhase(reception.phase)
    }

    override fun onPause() {
        main.removeCallbacks(idleMediaTick)
        hideIdleAttract(clearBlock = false)
        avatarIdle.unbindSignals()
        avatarGreeting.unbindSignals()
        avatarMenu.unbindSignals()
        avatar.removeListener(avatarListener)
        reception.onPhaseChanged = null
        super.onPause()
    }

    fun reloadFromConfig() {
        if (!isAdded) return
        textGreeting.text = BuddybobApp.instance.config.current.phrases.welcome
        bindMenu()
        (activity as? MainActivity)?.refreshVoiceControlsVisibility()
        if (!BuddybobApp.instance.config.current.modules.reception) {
            (activity as? MainActivity)?.openReceptionOrHome()
        }
        if (reception.phase == ReceptionController.Phase.IDLE) {
            scheduleIdleAttract()
        }
    }

    private fun bindMenu() {
        val buttons = reception.enabledButtons()
        recyclerMenu.adapter = ReceptionMenuAdapter(buttons) { button ->
            openFeature(button)
        }
    }

    private fun openFeature(button: BobConfig.MenuButton) {
        hideIdleAttract(clearBlock = true)
        (activity as? MainActivity)?.hidePlaceDisplay()
        val fragment: Fragment = when (button.id) {
            "goTo" -> PlacesFragment.newInstance()
            "talkToMe" -> SpeechFragment.newInstance()
            "appointments" -> AppointmentsHubFragment.newInstance()
            "callOperator" -> CallOperatorFragment.newInstance()
            "documents" -> DocumentsFragment.newInstance()
            "accessControl" -> AccessControlFragment.newInstance()
            "voiceMemos" -> VoiceMemosFragment.newInstance(awaitStart = false)
            "games" -> GamesHubFragment.newInstance()
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
            hideIdleAttract(clearBlock = true)
        }
        if (phase == ReceptionController.Phase.IDLE) {
            scheduleIdleAttract()
        } else {
            main.removeCallbacks(idleMediaTick)
            hideIdleAttract(clearBlock = false)
        }
    }

    private fun onIdleScreenTapped() {
        if (reception.phase != ReceptionController.Phase.IDLE) return
        if (idleMediaVisible &&
            BuddybobApp.instance.config.current.reception.idleMediaStopMode
                .equals("tap", ignoreCase = true)
        ) {
            hideIdleAttract(clearBlock = true)
            reception.simulateGuest()
            return
        }
        reception.clearIdleMediaBlock()
        hideIdleAttract(clearBlock = true)
        reception.simulateGuest()
    }

    private fun hasIdleAttract(): Boolean {
        val r = BuddybobApp.instance.config.current.reception
        val media = r.idleMedia ?: BuddybobApp.instance.config.current.assets.idleScreen
        return r.idleDisplayText.isNotBlank() || !media?.url.isNullOrBlank()
    }

    private fun scheduleIdleAttract() {
        main.removeCallbacks(idleMediaTick)
        if (!hasIdleAttract()) {
            reception.idleMediaBlockingDetection = false
            return
        }
        val stopTap = BuddybobApp.instance.config.current.reception.idleMediaStopMode
            .equals("tap", ignoreCase = true)
        reception.idleMediaBlockingDetection = stopTap
        main.postDelayed(idleMediaTick, 600L)
    }

    private fun showIdleAttract() {
        val r = BuddybobApp.instance.config.current.reception
        val asset = r.idleMedia ?: BuddybobApp.instance.config.current.assets.idleScreen
        val media = asset?.url?.trim()?.takeIf { it.isNotEmpty() }?.let {
            PlaceContentStore.Media(it, asset.contentType ?: "")
        }
        val text = r.idleDisplayText.trim().ifBlank { null }
        if (media == null && text == null) return
        idleMediaVisible = true
        (activity as? MainActivity)?.showPlaceDisplay(
            text,
            media,
            showBobIfNoMedia = false,
            showStopButton = false,
            onOverlayClick = { onIdleScreenTapped() }
        )
    }

    private fun hideIdleAttract(clearBlock: Boolean) {
        main.removeCallbacks(idleMediaTick)
        if (idleMediaVisible) {
            (activity as? MainActivity)?.hidePlaceDisplay()
        }
        idleMediaVisible = false
        if (clearBlock) reception.clearIdleMediaBlock()
    }

    private fun updateSettingsVisibility(mode: BobAvatarMode = avatar.mode) {
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
