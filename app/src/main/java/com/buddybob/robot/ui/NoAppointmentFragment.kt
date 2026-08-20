package com.buddybob.robot.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import androidx.fragment.app.Fragment
import com.buddybob.robot.MainActivity
import com.buddybob.robot.R

class NoAppointmentFragment : Fragment() {

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_no_appointment, container, false)
        root.findViewById<Button>(R.id.btn_book).setOnClickListener {
            (activity as? MainActivity)?.switchFragment(BookAppointmentFragment.newInstance())
        }
        root.findViewById<Button>(R.id.btn_call_operator).setOnClickListener {
            (activity as? MainActivity)?.switchFragment(CallOperatorFragment.newInstance())
        }
        root.findViewById<Button>(R.id.btn_back).setOnClickListener {
            (activity as? MainActivity)?.switchFragment(AppointmentsHubFragment.newInstance())
        }
        return root
    }

    companion object {
        fun newInstance() = NoAppointmentFragment()
    }
}
