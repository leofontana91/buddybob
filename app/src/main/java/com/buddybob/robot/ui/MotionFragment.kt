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

class MotionFragment : Fragment() {

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_motion, container, false)
        val motion = BuddybobApp.instance.robot.motion
        val feedback = root.findViewById<TextView>(R.id.text_feedback)
        motion.onResult = { feedback.text = it }

        root.findViewById<Button>(R.id.btn_forward).setOnClickListener {
            motion.goForward(0.4f)
        }
        root.findViewById<Button>(R.id.btn_backward).setOnClickListener {
            motion.goBackward(0.3f)
        }
        root.findViewById<Button>(R.id.btn_left).setOnClickListener {
            motion.turnLeft(25f, 30f)
        }
        root.findViewById<Button>(R.id.btn_right).setOnClickListener {
            motion.turnRight(25f, 30f)
        }
        root.findViewById<Button>(R.id.btn_stop).setOnClickListener {
            motion.stopMove()
        }
        root.findViewById<Button>(R.id.btn_head_up).setOnClickListener {
            motion.moveHead(hAngle = 0, vAngle = -10)
        }
        root.findViewById<Button>(R.id.btn_head_down).setOnClickListener {
            motion.moveHead(hAngle = 0, vAngle = 10)
        }
        root.findViewById<Button>(R.id.btn_head_left).setOnClickListener {
            motion.moveHead(hAngle = -10, vAngle = 0)
        }
        root.findViewById<Button>(R.id.btn_head_right).setOnClickListener {
            motion.moveHead(hAngle = 10, vAngle = 0)
        }
        root.findViewById<Button>(R.id.btn_head_reset).setOnClickListener {
            motion.resetHead()
        }
        root.findViewById<Button>(R.id.btn_back).setOnClickListener {
            (activity as? MainActivity)?.openReceptionOrHome()
        }
        return root
    }

    companion object {
        fun newInstance() = MotionFragment()
    }
}
