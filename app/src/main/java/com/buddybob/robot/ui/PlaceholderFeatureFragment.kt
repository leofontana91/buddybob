package com.buddybob.robot.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import androidx.fragment.app.Fragment
import com.buddybob.robot.MainActivity
import com.buddybob.robot.R

/** Stub screen for reception menu entries not yet implemented. */
class PlaceholderFeatureFragment : Fragment() {

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_placeholder_feature, container, false)
        val title = arguments?.getString(ARG_LABEL).orEmpty()
        root.findViewById<TextView>(R.id.text_feature_title).text = title
        root.findViewById<Button>(R.id.btn_feature_back).setOnClickListener {
            (activity as? MainActivity)?.openReceptionOrHome()
        }
        return root
    }

    companion object {
        private const val ARG_ID = "feature_id"
        private const val ARG_LABEL = "feature_label"

        fun newInstance(id: String, label: String) = PlaceholderFeatureFragment().apply {
            arguments = Bundle().apply {
                putString(ARG_ID, id)
                putString(ARG_LABEL, label)
            }
        }
    }
}
