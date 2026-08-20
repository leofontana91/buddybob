package com.buddybob.robot.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import androidx.fragment.app.Fragment
import com.buddybob.robot.MainActivity
import com.buddybob.robot.R

class AppointmentsHubFragment : Fragment() {

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_appointments_hub, container, false)
        root.findViewById<Button>(R.id.btn_has_appointment).setOnClickListener {
            open(TodayAppointmentsFragment.newInstance())
        }
        root.findViewById<Button>(R.id.btn_no_appointment).setOnClickListener {
            open(NoAppointmentFragment.newInstance())
        }
        root.findViewById<Button>(R.id.btn_call_operator).setOnClickListener {
            open(CallOperatorFragment.newInstance())
        }
        root.findViewById<Button>(R.id.btn_back).setOnClickListener {
            (activity as? MainActivity)?.openReceptionOrHome()
        }
        return root
    }

    private fun open(fragment: Fragment) {
        (activity as? MainActivity)?.switchFragment(fragment)
    }

    companion object {
        fun newInstance() = AppointmentsHubFragment()
    }
}
