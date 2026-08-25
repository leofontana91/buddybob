package com.buddybob.robot.ui

import android.graphics.drawable.BitmapDrawable
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.buddybob.robot.R
import com.buddybob.robot.config.BobConfig

class ReceptionMenuAdapter(
    private val items: List<BobConfig.MenuButton>,
    private val onClick: (BobConfig.MenuButton) -> Unit
) : RecyclerView.Adapter<ReceptionMenuAdapter.Holder>() {

    class Holder(view: View) : RecyclerView.ViewHolder(view) {
        val row: View = view.findViewById(R.id.row_menu_item)
        val icon: ImageView = view.findViewById(R.id.img_menu_icon)
        val label: TextView = view.findViewById(R.id.text_menu_label)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_reception_menu, parent, false)
        return Holder(view)
    }

    override fun onBindViewHolder(holder: Holder, position: Int) {
        val item = items[position]
        holder.label.text = item.label
        holder.icon.setImageResource(iconFor(item.id))
        (holder.icon.drawable as? BitmapDrawable)?.isFilterBitmap = true
        holder.row.setOnClickListener { onClick(item) }
        holder.icon.setOnClickListener { onClick(item) }
        holder.label.setOnClickListener { onClick(item) }
    }

    override fun getItemCount(): Int = items.size

    /**
     * Placeholder: tutti usano il mascotte Bob finché non arrivano i loghi dedicati.
     * Quando li hai, metti i file in drawable e mappa qui (es. R.drawable.ic_menu_goto).
     */
    private fun iconFor(id: String): Int = when (id) {
        "goTo" -> R.drawable.ic_menu_goto
        "appointments" -> R.drawable.ic_menu_appointments
        "documents" -> R.drawable.bob_menu_icon
        "talkToMe" -> R.drawable.bob_menu_icon
        "games" -> R.drawable.bob_menu_icon
        "callOperator" -> R.drawable.bob_menu_icon
        "voiceMemos" -> R.drawable.bob_menu_icon
        "accessControl" -> R.drawable.bob_menu_icon
        else -> R.drawable.bob_menu_icon
    }
}
