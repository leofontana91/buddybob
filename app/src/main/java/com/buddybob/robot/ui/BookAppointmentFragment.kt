package com.buddybob.robot.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.buddybob.robot.BuddybobApp
import com.buddybob.robot.MainActivity
import com.buddybob.robot.R
import com.buddybob.robot.appointments.AppointmentsApi
import com.buddybob.robot.appointments.QrBitmap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

class BookAppointmentFragment : Fragment() {

    private val api = AppointmentsApi()
    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.Main + job)

    private var selectedSlot: String? = null

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_book_appointment, container, false)
        val status = root.findViewById<TextView>(R.id.text_book_status)
        val panelQr = root.findViewById<LinearLayout>(R.id.panel_qr)
        val panelInApp = root.findViewById<LinearLayout>(R.id.panel_in_app)
        val cfg = BuddybobApp.instance.config.current.appointments

        root.findViewById<Button>(R.id.btn_back).setOnClickListener {
            (activity as? MainActivity)?.switchFragment(NoAppointmentFragment.newInstance())
        }

        if (cfg.bookingMode == "in_app") {
            panelInApp.visibility = View.VISIBLE
            panelQr.visibility = View.GONE
            status.text = "Scegli giorno e ora"
            setupInApp(root, status)
        } else {
            panelQr.visibility = View.VISIBLE
            panelInApp.visibility = View.GONE
            val url = cfg.bookingUrl.ifBlank {
                "http://10.0.2.2:3000/book/${BuddybobApp.instance.config.current.robot.id}"
            }
            status.text = "Inquadra il QR per fissare l'appuntamento"
            root.findViewById<ImageView>(R.id.image_qr).setImageBitmap(QrBitmap.encode(url))
            root.findViewById<TextView>(R.id.text_qr_url).text = url
        }

        return root
    }

    private fun setupInApp(root: View, status: TextView) {
        val nameInput = root.findViewById<EditText>(R.id.input_guest_name)
        val recycler = root.findViewById<RecyclerView>(R.id.recycler_slots)
        val confirm = root.findViewById<Button>(R.id.btn_confirm_booking)
        recycler.layoutManager = GridLayoutManager(requireContext(), 3)

        confirm.setOnClickListener {
            val name = nameInput.text?.toString()?.trim().orEmpty()
            val slot = selectedSlot
            if (name.isEmpty() || slot == null) return@setOnClickListener
            confirm.isEnabled = false
            scope.launch {
                try {
                    withContext(Dispatchers.IO) { api.createAppointment(name, slot) }
                    BuddybobApp.instance.robot.speech.speak("Appuntamento fissato, grazie $name")
                    Toast.makeText(requireContext(), "Prenotato", Toast.LENGTH_LONG).show()
                    (activity as? MainActivity)?.switchFragment(AppointmentsHubFragment.newInstance())
                } catch (e: Exception) {
                    status.text = getString(R.string.appointments_error)
                    confirm.isEnabled = true
                    BuddybobApp.instance.robot.log("Book failed: ${e.message}")
                }
            }
        }

        scope.launch {
            try {
                val cal = Calendar.getInstance()
                val fmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
                val from = fmt.format(cal.time)
                cal.add(Calendar.DAY_OF_YEAR, 7)
                val to = fmt.format(cal.time)
                val response = withContext(Dispatchers.IO) { api.freeSlots(from, to) }
                if (response.slots.isEmpty()) {
                    status.text = "Nessuno slot disponibile"
                    return@launch
                }
                recycler.adapter = SlotAdapter(response.slots) { iso ->
                    selectedSlot = iso
                    confirm.isEnabled = nameInput.text?.isNotBlank() == true
                    status.text = "Selezionato: ${formatSlot(iso)}"
                }
                nameInput.addTextChangedListener(SimpleTextWatcher {
                    confirm.isEnabled = selectedSlot != null && it.isNotBlank()
                })
            } catch (e: Exception) {
                status.setText(R.string.appointments_error)
                BuddybobApp.instance.robot.log("Slots failed: ${e.message}")
            }
        }
    }

    override fun onDestroyView() {
        job.cancel()
        super.onDestroyView()
    }

    companion object {
        fun newInstance() = BookAppointmentFragment()

        fun formatSlot(iso: String): String {
            return try {
                val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                    timeZone = TimeZone.getTimeZone("UTC")
                }
                val alt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
                    timeZone = TimeZone.getTimeZone("UTC")
                }
                val date = runCatching { parser.parse(iso) }.getOrNull() ?: alt.parse(iso)
                SimpleDateFormat("dd/MM HH:mm", Locale.ITALY).format(date!!)
            } catch (_: Exception) {
                iso
            }
        }
    }
}

private class SlotAdapter(
    private val slots: List<String>,
    private val onClick: (String) -> Unit
) : RecyclerView.Adapter<SlotAdapter.Holder>() {
    private var selected: String? = null

    class Holder(view: View) : RecyclerView.ViewHolder(view) {
        val button: Button = view.findViewById(R.id.btn_appointment_item)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_appointment, parent, false)
        return Holder(view)
    }

    override fun onBindViewHolder(holder: Holder, position: Int) {
        val iso = slots[position]
        holder.button.text = BookAppointmentFragment.formatSlot(iso)
        holder.button.alpha = if (selected == iso) 1f else 0.85f
        holder.button.setOnClickListener {
            selected = iso
            notifyDataSetChanged()
            onClick(iso)
        }
    }

    override fun getItemCount(): Int = slots.size
}

private class SimpleTextWatcher(
    private val onChanged: (String) -> Unit
) : android.text.TextWatcher {
    override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
    override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
    override fun afterTextChanged(s: android.text.Editable?) {
        onChanged(s?.toString().orEmpty())
    }
}
