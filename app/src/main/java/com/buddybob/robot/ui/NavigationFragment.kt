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

class NavigationFragment : Fragment() {

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_navigation, container, false)
        val nav = BuddybobApp.instance.robot.navigation
        val dest = root.findViewById<EditText>(R.id.edit_destination)
        val feedback = root.findViewById<TextView>(R.id.text_feedback)
        nav.onStatus = { feedback.text = it }

        root.findViewById<Button>(R.id.btn_estimate).setOnClickListener {
            nav.isEstimate { ok ->
                feedback.text = if (ok) "Localized: YES" else "Localized: NO"
            }
        }
        root.findViewById<Button>(R.id.btn_places).setOnClickListener {
            nav.getPlaceList { places ->
                feedback.text = if (places.isEmpty()) {
                    "No places"
                } else {
                    places.joinToString("\n") { "${it.name} (${it.x}, ${it.y})" }
                }
            }
        }
        root.findViewById<Button>(R.id.btn_go).setOnClickListener {
            val name = dest.text?.toString().orEmpty().ifBlank { "reception" }
            BuddybobApp.instance.robot.goTo.go(
                placeName = name,
                after = com.buddybob.robot.platform.GoToController.After.STAY
            )
        }
        root.findViewById<Button>(R.id.btn_stop_nav).setOnClickListener {
            nav.stopNavigation()
        }
        root.findViewById<Button>(R.id.btn_charge).setOnClickListener {
            nav.goCharge()
        }
        root.findViewById<Button>(R.id.btn_back).setOnClickListener {
            (activity as? MainActivity)?.openReceptionOrHome()
        }
        return root
    }

    companion object {
        fun newInstance() = NavigationFragment()
    }
}
