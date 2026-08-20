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
import com.buddybob.robot.appointments.AppointmentsApi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class CallOperatorFragment : Fragment() {

    private val api = AppointmentsApi()
    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.Main + job)

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_call_operator, container, false)
        val status = root.findViewById<TextView>(R.id.text_call_status)
        root.findViewById<Button>(R.id.btn_back).setOnClickListener {
            (activity as? MainActivity)?.openReceptionOrHome()
        }

        val fallbackSpeak = BuddybobApp.instance.config.current.appointments.callOperatorSpeak
        status.text = fallbackSpeak
        BuddybobApp.instance.robot.speech.speak(fallbackSpeak)

        scope.launch {
            try {
                val result = withContext(Dispatchers.IO) { api.callOperator() }
                val speak = result.speak ?: fallbackSpeak
                status.text = getString(R.string.appointments_called)
                if (speak != fallbackSpeak) {
                    BuddybobApp.instance.robot.speech.speak(speak)
                }
            } catch (e: Exception) {
                status.setText(R.string.appointments_error)
                BuddybobApp.instance.robot.log("Call operator failed: ${e.message}")
            }
        }

        return root
    }

    override fun onDestroyView() {
        job.cancel()
        super.onDestroyView()
    }

    companion object {
        fun newInstance() = CallOperatorFragment()
    }
}
