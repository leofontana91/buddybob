package com.buddybob.robot.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import com.buddybob.robot.BuddybobApp
import com.buddybob.robot.MainActivity
import com.buddybob.robot.R
import com.buddybob.robot.platform.PlatformApi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class FormFillFragment : Fragment() {

    private val api = PlatformApi()
    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.Main + job)
    private val answers = mutableMapOf<String, String>()
    private var fields: List<PlatformApi.FormFieldDto> = emptyList()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_form_fill, container, false)
        val title = root.findViewById<TextView>(R.id.text_form_title)
        val status = root.findViewById<TextView>(R.id.text_form_status)
        val questions = root.findViewById<LinearLayout>(R.id.container_questions)
        val submit = root.findViewById<Button>(R.id.btn_submit_form)
        title.text = arguments?.getString(ARG_NAME).orEmpty()

        root.findViewById<Button>(R.id.btn_back).setOnClickListener {
            (activity as? MainActivity)?.switchFragment(DocumentsFragment.newInstance())
        }

        val formId = arguments?.getString(ARG_ID).orEmpty()
        status.setText(R.string.docs_loading)
        scope.launch {
            try {
                val forms = withContext(Dispatchers.IO) { api.listForms() }
                val form = forms.find { it.id == formId }
                if (form == null) {
                    status.setText(R.string.docs_empty)
                    return@launch
                }
                fields = form.fields
                status.text = getString(R.string.docs_fill_hint)
                renderFields(questions)
            } catch (e: Exception) {
                status.setText(R.string.appointments_error)
            }
        }

        submit.setOnClickListener {
            for (field in fields) {
                val value = answers[field.id]?.trim().orEmpty()
                if (field.required && value.isEmpty()) {
                    Toast.makeText(
                        requireContext(),
                        getString(R.string.docs_required, field.label),
                        Toast.LENGTH_SHORT
                    ).show()
                    return@setOnClickListener
                }
            }
            submit.isEnabled = false
            scope.launch {
                try {
                    val result = withContext(Dispatchers.IO) {
                        api.submitForm(formId, answers, null)
                    }
                    val speak = result.speak ?: getString(R.string.docs_thanks)
                    status.text = speak
                    BuddybobApp.instance.robot.speech.speak(speak)
                    questions.removeAllViews()
                    submit.visibility = View.GONE
                } catch (e: Exception) {
                    submit.isEnabled = true
                    status.text = e.message ?: getString(R.string.appointments_error)
                }
            }
        }

        return root
    }

    private fun renderFields(container: LinearLayout) {
        container.removeAllViews()
        val ctx = requireContext()
        val pad = (16 * resources.displayMetrics.density).toInt()
        for (field in fields) {
            val label = TextView(ctx).apply {
                text = field.label + if (field.required) " *" else ""
                textSize = 18f
                setTextColor(ContextCompat.getColor(ctx, R.color.bob_black))
                setPadding(0, pad, 0, 8)
            }
            container.addView(label)
            when (field.type) {
                "yesno" -> {
                    val row = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL }
                    val yes = yesNoButton(ctx, getString(R.string.docs_yes))
                    val no = yesNoButton(ctx, getString(R.string.docs_no))
                    yes.setOnClickListener {
                        answers[field.id] = "Sì"
                        styleSelected(yes, no)
                    }
                    no.setOnClickListener {
                        answers[field.id] = "No"
                        styleSelected(no, yes)
                    }
                    row.addView(yes, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
                    row.addView(no, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
                    container.addView(row)
                }
                else -> {
                    val input = EditText(ctx).apply {
                        hint = field.label
                        minHeight = 56
                        setPadding(pad, pad, pad, pad)
                        setBackgroundResource(R.drawable.bg_panel_round)
                        setTextColor(ContextCompat.getColor(ctx, R.color.bob_black))
                        inputType = when (field.type) {
                            "number" -> android.text.InputType.TYPE_CLASS_NUMBER
                            "textarea" -> android.text.InputType.TYPE_CLASS_TEXT or
                                android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE
                            else -> android.text.InputType.TYPE_CLASS_TEXT
                        }
                        if (field.type == "textarea") minLines = 3
                        addTextChangedListener(SimpleWatcher { answers[field.id] = it })
                    }
                    container.addView(input)
                }
            }
        }
    }

    private fun yesNoButton(ctx: android.content.Context, text: String): Button {
        return Button(ctx, null, 0).apply {
            this.text = text
            minHeight = 56
            setBackgroundResource(R.drawable.bg_button_secondary)
            setTextColor(ContextCompat.getColor(ctx, R.color.bob_black))
        }
    }

    private fun styleSelected(selected: Button, other: Button) {
        selected.setBackgroundResource(R.drawable.bg_button_primary)
        selected.setTextColor(ContextCompat.getColor(requireContext(), R.color.bob_white))
        other.setBackgroundResource(R.drawable.bg_button_secondary)
        other.setTextColor(ContextCompat.getColor(requireContext(), R.color.bob_black))
    }

    override fun onDestroyView() {
        job.cancel()
        super.onDestroyView()
    }

    private class SimpleWatcher(val onChange: (String) -> Unit) : android.text.TextWatcher {
        override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
        override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
        override fun afterTextChanged(s: android.text.Editable?) {
            onChange(s?.toString().orEmpty())
        }
    }

    companion object {
        private const val ARG_ID = "form_id"
        private const val ARG_NAME = "form_name"

        fun newInstance(id: String, name: String) = FormFillFragment().apply {
            arguments = Bundle().apply {
                putString(ARG_ID, id)
                putString(ARG_NAME, name)
            }
        }
    }
}
