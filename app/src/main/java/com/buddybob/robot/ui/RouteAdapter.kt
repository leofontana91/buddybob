package com.buddybob.robot.ui

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.buddybob.robot.R
import com.buddybob.robot.robot.NavigationController

class RouteAdapter(
    private val onRemove: (NavigationController.Place) -> Unit
) : RecyclerView.Adapter<RouteAdapter.VH>() {

    private val items = mutableListOf<NavigationController.Place>()

    fun submit(route: List<NavigationController.Place>) {
        items.clear()
        items.addAll(route)
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_route_stop, parent, false)
        return VH(view)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val place = items[position]
        holder.order.text = "${position + 1}"
        val label = try {
            com.buddybob.robot.BuddybobApp.instance.config.placeLabel(place.name)
        } catch (_: Exception) {
            place.name
        }
        holder.name.text = label
        holder.remove.setOnClickListener { onRemove(place) }
    }

    override fun getItemCount(): Int = items.size

    class VH(view: View) : RecyclerView.ViewHolder(view) {
        val order: TextView = view.findViewById(R.id.text_route_order)
        val name: TextView = view.findViewById(R.id.text_route_name)
        val remove: Button = view.findViewById(R.id.btn_route_remove)
    }
}
