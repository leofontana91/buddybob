package com.buddybob.robot.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.buddybob.robot.BuddybobApp
import com.buddybob.robot.MainActivity
import com.buddybob.robot.R
import com.buddybob.robot.appointments.AppointmentsApi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class TodayAppointmentsFragment : Fragment() {

    private val api = AppointmentsApi()
    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.Main + job)

    private lateinit var status: TextView
    private lateinit var recycler: RecyclerView

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_today_appointments, container, false)
        status = root.findViewById(R.id.text_status)
        recycler = root.findViewById(R.id.recycler_appointments)
        recycler.layoutManager = LinearLayoutManager(requireContext())
        root.findViewById<Button>(R.id.btn_back).setOnClickListener {
            (activity as? MainActivity)?.switchFragment(AppointmentsHubFragment.newInstance())
        }
        load()
        return root
    }

    private fun load() {
        if (!BuddybobApp.instance.config.isPaired()) {
            status.text = "Robot non abbinato. Effettua prima il pairing dalla schermata tecnica."
            recycler.adapter = null
            return
        }
        status.setText(R.string.appointments_loading)
        scope.launch {
            try {
                val response = withContext(Dispatchers.IO) { api.listToday() }
                val scheduled = response.appointments.filter {
                    it.status == "scheduled" || it.status == "checked_in"
                }
                if (scheduled.isEmpty()) {
                    status.setText(R.string.appointments_empty)
                    recycler.adapter = null
                } else {
                    status.text = getString(R.string.appointments_today_title)
                    recycler.adapter = AppointmentListAdapter(scheduled) { appt ->
                        checkIn(appt)
                    }
                }
            } catch (e: Exception) {
                status.setText(R.string.appointments_error)
                BuddybobApp.instance.robot.log("Appointments: ${e.message}")
            }
        }
    }

    private fun checkIn(appt: AppointmentsApi.AppointmentDto) {
        if (appt.status != "scheduled") return
        status.text = getString(R.string.appointments_checked_in)
        scope.launch {
            try {
                val result = withContext(Dispatchers.IO) { api.checkIn(appt.id) }
                val speak = result.speak
                    ?: BuddybobApp.instance.config.current.appointments.checkInSpeak
                BuddybobApp.instance.robot.speech.speak(speak)
                Toast.makeText(requireContext(), speak, Toast.LENGTH_LONG).show()
                load()
            } catch (e: Exception) {
                status.setText(R.string.appointments_error)
                BuddybobApp.instance.robot.log("Check-in failed: ${e.message}")
            }
        }
    }

    override fun onDestroyView() {
        job.cancel()
        super.onDestroyView()
    }

    companion object {
        fun newInstance() = TodayAppointmentsFragment()
    }
}
