package com.buddybob.robot.ui

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageButton
import android.widget.TextView
import androidx.fragment.app.Fragment
import com.buddybob.robot.BuddybobApp
import com.buddybob.robot.MainActivity
import com.buddybob.robot.R
import com.buddybob.robot.ui.avatar.BobAvatarMode
import com.buddybob.robot.ui.avatar.BobAvatarView
import kotlin.math.abs

/**
 * «Parla con me»: Bob a tutto schermo che ascolta, guarda e reagisce.
 */
class SpeechFragment : Fragment() {

    private lateinit var avatar: BobAvatarView
    private lateinit var hint: TextView
    private lateinit var btnMic: ImageButton
    private val main = Handler(Looper.getMainLooper())

    private val avatarListener: (BobAvatarMode) -> Unit = { mode ->
        if (isAdded) {
            avatar.setMode(mode)
            updateHintForMode(mode)
        }
    }

    private val listeningListener: (Boolean) -> Unit = { listening ->
        if (isAdded) {
            btnMic.setBackgroundResource(
                if (listening) R.drawable.bg_mic_listening else R.drawable.bg_mic_idle
            )
        }
    }

    private val lookPoll = object : Runnable {
        override fun run() {
            if (!isAdded) return
            val people = BuddybobApp.instance.robot.follow
                .getPersonsInFront(maxDistanceMeters = 4.0, maxAbsAngleDeg = 70.0)
            val best = people.minByOrNull { abs(it.angle.toDouble()) }
            if (best != null) {
                BuddybobApp.instance.robot.avatar.onPersonAt(
                    best.angle.toFloat(),
                    best.distance.toFloat()
                )
            } else {
                BuddybobApp.instance.robot.avatar.onPersonLost()
            }
            main.postDelayed(this, 400L)
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_speech, container, false)
        avatar = root.findViewById(R.id.bob_avatar_speech)
        hint = root.findViewById(R.id.text_speech_hint)
        btnMic = root.findViewById(R.id.btn_voice_mic)

        root.findViewById<Button>(R.id.btn_speech_back).setOnClickListener {
            (activity as? MainActivity)?.openReceptionOrHome()
        }
        btnMic.setOnClickListener {
            BuddybobApp.instance.robot.avatar.noteActivity()
            BuddybobApp.instance.robot.avatar.onPoke()
            BuddybobApp.instance.startVoiceListeningFromUi()
        }
        root.setOnClickListener {
            BuddybobApp.instance.robot.avatar.onPoke()
            BuddybobApp.instance.robot.avatar.noteActivity()
        }
        return root
    }

    override fun onResume() {
        super.onResume()
        val robot = BuddybobApp.instance.robot
        robot.avatar.addListener(avatarListener)
        BuddybobApp.instance.addVoiceListeningListener(listeningListener)
        avatar.bindSignals(robot.avatar)
        robot.speech.setListeningDesired(true)
        robot.avatar.onListening()
        BuddybobApp.instance.startVoiceListeningFromUi()
        main.post(lookPoll)
    }

    override fun onPause() {
        main.removeCallbacks(lookPoll)
        avatar.unbindSignals()
        BuddybobApp.instance.robot.avatar.removeListener(avatarListener)
        BuddybobApp.instance.removeVoiceListeningListener(listeningListener)
        super.onPause()
    }

    private fun updateHintForMode(mode: BobAvatarMode) {
        hint.setText(
            when (mode) {
                BobAvatarMode.LISTENING -> R.string.speech_hint_listening
                BobAvatarMode.THINKING -> R.string.speech_hint_thinking
                BobAvatarMode.SPEAKING -> R.string.speech_hint_speaking
                else -> R.string.speech_talk_hint
            }
        )
    }

    companion object {
        fun newInstance() = SpeechFragment()
    }
}
