package com.buddybob.robot.ui

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import androidx.recyclerview.widget.RecyclerView
import com.buddybob.robot.R
import com.buddybob.robot.appointments.AppointmentsApi
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

class AppointmentListAdapter(
    private val items: List<AppointmentsApi.AppointmentDto>,
    private val onClick: (AppointmentsApi.AppointmentDto) -> Unit
) : RecyclerView.Adapter<AppointmentListAdapter.Holder>() {

    class Holder(view: View) : RecyclerView.ViewHolder(view) {
        val button: Button = view.findViewById(R.id.btn_appointment_item)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_appointment, parent, false)
        return Holder(view)
    }

    override fun onBindViewHolder(holder: Holder, position: Int) {
        val item = items[position]
        val time = formatTime(item.startsAt)
        val suffix = if (item.status == "checked_in") " ✓" else ""
        holder.button.text = "$time  ·  ${item.guestName}$suffix"
        holder.button.isEnabled = item.status == "scheduled"
        holder.button.setOnClickListener { onClick(item) }
    }

    override fun getItemCount(): Int = items.size

    private fun formatTime(iso: String): String {
        return try {
            val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }
            val alt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }
            val date = runCatching { parser.parse(iso) }.getOrNull()
                ?: alt.parse(iso)
            SimpleDateFormat("HH:mm", Locale.ITALY).format(date!!)
        } catch (_: Exception) {
            iso.takeLast(8).take(5)
        }
    }
}
