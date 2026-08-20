package com.buddybob.robot.ui

import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.buddybob.robot.R
import com.buddybob.robot.robot.NavigationController

class PlacesAdapter(
    private val onSelectionChanged: () -> Unit
) : RecyclerView.Adapter<PlacesAdapter.PlaceVH>() {

    private val items = mutableListOf<NavigationController.Place>()
    private val selected = mutableListOf<NavigationController.Place>()

    fun submit(places: List<NavigationController.Place>) {
        items.clear()
        items.addAll(places)
        selected.clear()
        notifyDataSetChanged()
        onSelectionChanged()
    }

    fun getSelectedRoute(): List<NavigationController.Place> = selected.toList()

    fun removeFromRoute(place: NavigationController.Place) {
        selected.remove(place)
        notifyDataSetChanged()
        onSelectionChanged()
    }

    fun clearSelection() {
        selected.clear()
        notifyDataSetChanged()
        onSelectionChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): PlaceVH {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_place, parent, false)
        return PlaceVH(view)
    }

    override fun onBindViewHolder(holder: PlaceVH, position: Int) {
        val place = items[position]
        val idx = selected.indexOf(place)
        val isSelected = idx >= 0

        val label = try {
            com.buddybob.robot.BuddybobApp.instance.config.placeLabel(place.name)
        } catch (_: Exception) {
            place.name
        }
        holder.name.text = label
        holder.coords.text = if (label != place.name) {
            place.name
        } else {
            "x=${"%.1f".format(place.x)}  y=${"%.1f".format(place.y)}"
        }

        val orderBadge = holder.itemView.findViewById<TextView>(R.id.text_place_order)
        if (isSelected) {
            orderBadge.visibility = View.VISIBLE
            orderBadge.text = "${idx + 1}"
            holder.itemView.findViewById<View>(R.id.place_root)
                .setBackgroundColor(Color.parseColor("#E8F5E9"))
        } else {
            orderBadge.visibility = View.GONE
            holder.itemView.findViewById<View>(R.id.place_root)
                .setBackgroundResource(R.drawable.bg_button_secondary)
        }

        holder.itemView.setOnClickListener {
            if (isSelected) {
                selected.remove(place)
            } else {
                selected.add(place)
            }
            notifyDataSetChanged()
            onSelectionChanged()
        }
    }

    override fun getItemCount(): Int = items.size

    class PlaceVH(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val name: TextView = itemView.findViewById(R.id.text_place_name)
        val coords: TextView = itemView.findViewById(R.id.text_place_coords)
    }
}
