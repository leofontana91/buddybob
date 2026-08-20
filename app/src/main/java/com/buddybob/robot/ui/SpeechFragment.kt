package com.buddybob.robot.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.fragment.app.Fragment
import com.buddybob.robot.BuddybobApp
import com.buddybob.robot.MainActivity
import com.buddybob.robot.R

class SpeechFragment : Fragment() {

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_speech, container, false)
        val speech = BuddybobApp.instance.robot.speech
        val input = root.findViewById<EditText>(R.id.edit_tts)
        val feedback = root.findViewById<TextView>(R.id.text_feedback)
        speech.onTtsState = { feedback.text = it }

        root.findViewById<Button>(R.id.btn_speak).setOnClickListener {
            val text = input.text?.toString().orEmpty().ifBlank {
                getString(R.string.default_tts)
            }
            speech.speak(text)
        }
        root.findViewById<Button>(R.id.btn_stop_tts).setOnClickListener {
            speech.stop()
        }
        root.findViewById<Button>(R.id.btn_asr_on).setOnClickListener {
            speech.setRecognizable(true)
            speech.setContinuousRecognition(true)
            feedback.text = "Recognition ON (continuous)"
        }
        root.findViewById<Button>(R.id.btn_asr_off).setOnClickListener {
            speech.setRecognizable(false)
            feedback.text = "Recognition OFF"
        }
        root.findViewById<Button>(R.id.btn_back).setOnClickListener {
            (activity as? MainActivity)?.openReceptionOrHome()
        }
        return root
    }

    companion object {
        fun newInstance() = SpeechFragment()
    }
}
