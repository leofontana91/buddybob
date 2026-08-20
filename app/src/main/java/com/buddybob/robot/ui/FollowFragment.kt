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

class FollowFragment : Fragment() {

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_follow, container, false)
        val follow = BuddybobApp.instance.robot.follow
        val feedback = root.findViewById<TextView>(R.id.text_feedback)
        val people = root.findViewById<TextView>(R.id.text_people)

        follow.onStatus = { feedback.text = it }
        follow.onPersons = { list ->
            people.text = if (list.isEmpty()) {
                getString(R.string.no_persons)
            } else {
                list.joinToString("\n") { p ->
                    "id=${p.id} dist=${"%.2f".format(p.distance)}m angle=${p.angle}"
                }
            }
        }

        root.findViewById<Button>(R.id.btn_detect).setOnClickListener {
            follow.startDetectingPersons()
        }
        root.findViewById<Button>(R.id.btn_follow_best).setOnClickListener {
            // Head (monitor) + chassis rotation toward the best visible face
            follow.startFocusFollow()
        }
        root.findViewById<Button>(R.id.btn_follow_smart).setOnClickListener {
            follow.startSmartFocusFollow()
        }
        root.findViewById<Button>(R.id.btn_follow_stop).setOnClickListener {
            follow.stopFocusFollow()
            follow.stopDetectingPersons()
            people.text = ""
        }
        root.findViewById<Button>(R.id.btn_back).setOnClickListener {
            follow.release()
            (activity as? MainActivity)?.openReceptionOrHome()
        }
        return root
    }

    override fun onDestroyView() {
        BuddybobApp.instance.robot.follow.release()
        super.onDestroyView()
    }

    companion object {
        fun newInstance() = FollowFragment()
    }
}
