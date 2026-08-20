package com.buddybob.robot.ui

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import androidx.recyclerview.widget.RecyclerView
import com.buddybob.robot.R
import com.buddybob.robot.config.BobConfig

class ReceptionMenuAdapter(
    private val items: List<BobConfig.MenuButton>,
    private val onClick: (BobConfig.MenuButton) -> Unit
) : RecyclerView.Adapter<ReceptionMenuAdapter.Holder>() {

    class Holder(view: View) : RecyclerView.ViewHolder(view) {
        val button: Button = view.findViewById(R.id.btn_menu_item)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_reception_menu, parent, false)
        return Holder(view)
    }

    override fun onBindViewHolder(holder: Holder, position: Int) {
        val item = items[position]
        holder.button.text = item.label
        holder.button.setOnClickListener { onClick(item) }
    }

    override fun getItemCount(): Int = items.size
}
