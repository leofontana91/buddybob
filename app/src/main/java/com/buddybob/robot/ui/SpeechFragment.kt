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

/** Ascolto comandi vocali (apri moduli, vai a, ferma…). */
class SpeechFragment : Fragment() {

    private lateinit var feedback: TextView

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_speech, container, false)
        val speech = BuddybobApp.instance.robot.speech
        feedback = root.findViewById(R.id.text_feedback)
        speech.onTtsState = { feedback.append("\n$it") }

        feedback.text =
            "Stai di fronte, di' «Bob» e parla: BOB ricorda il discorso finché resti tu.\nCambio persona o argomento = nuova conversazione.\nEsempi:\n«Bob, vorrei un appuntamento» → poi «alle undici»\n«Bob, accompagnami in reception»"

        root.findViewById<Button>(R.id.btn_speak).visibility = View.GONE
        root.findViewById<View>(R.id.edit_tts).visibility = View.GONE
        root.findViewById<Button>(R.id.btn_stop_tts).setOnClickListener {
            speech.stop()
        }
        root.findViewById<Button>(R.id.btn_asr_on).setOnClickListener {
            speech.setListeningDesired(true)
            feedback.append("\nAscolto attivo")
        }
        root.findViewById<Button>(R.id.btn_asr_off).setOnClickListener {
            speech.setListeningDesired(false)
            feedback.append("\nAscolto spento")
        }
        root.findViewById<Button>(R.id.btn_back).setOnClickListener {
            (activity as? MainActivity)?.openReceptionOrHome()
        }
        return root
    }

    override fun onResume() {
        super.onResume()
        BuddybobApp.instance.robot.speech.setListeningDesired(true)
    }

    companion object {
        fun newInstance() = SpeechFragment()
    }
}
