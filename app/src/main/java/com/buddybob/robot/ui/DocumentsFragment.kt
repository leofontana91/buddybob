package com.buddybob.robot.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.buddybob.robot.BuddybobApp
import com.buddybob.robot.MainActivity
import com.buddybob.robot.R
import com.buddybob.robot.platform.PlatformApi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class DocumentsFragment : Fragment() {

    private val api = PlatformApi()
    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.Main + job)
    private lateinit var list: RecyclerView
    private lateinit var empty: TextView
    private lateinit var adapter: SimpleNameAdapter

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_documents, container, false)
        empty = root.findViewById(R.id.text_docs_empty)
        list = root.findViewById(R.id.list_documents)
        adapter = SimpleNameAdapter { id, name ->
            (activity as? MainActivity)?.switchFragment(
                FormFillFragment.newInstance(id, name)
            )
        }
        list.layoutManager = LinearLayoutManager(requireContext())
        list.adapter = adapter
        root.findViewById<Button>(R.id.btn_back).setOnClickListener {
            (activity as? MainActivity)?.openReceptionOrHome()
        }
        load()
        return root
    }

    private fun load() {
        empty.visibility = View.VISIBLE
        list.visibility = View.GONE
        if (!BuddybobApp.instance.config.isPaired()) {
            empty.text = "Robot non abbinato. Effettua prima il pairing."
            return
        }
        empty.setText(R.string.docs_loading)
        scope.launch {
            try {
                val forms = withContext(Dispatchers.IO) { api.listForms() }
                if (!isAdded) return@launch
                if (forms.isEmpty()) {
                    empty.setText(R.string.docs_empty)
                    list.visibility = View.GONE
                } else {
                    empty.visibility = View.GONE
                    list.visibility = View.VISIBLE
                    adapter.submit(forms.map { it.id to it.name })
                }
            } catch (e: Exception) {
                empty.setText(R.string.appointments_error)
                BuddybobApp.instance.robot.log("Documents: ${e.message}")
            }
        }
    }

    override fun onDestroyView() {
        job.cancel()
        super.onDestroyView()
    }

    companion object {
        fun newInstance() = DocumentsFragment()
    }
}

class SimpleNameAdapter(
    private val onClick: (id: String, name: String) -> Unit
) : RecyclerView.Adapter<SimpleNameAdapter.VH>() {

    private val items = mutableListOf<Pair<String, String>>()

    fun submit(rows: List<Pair<String, String>>) {
        items.clear()
        items.addAll(rows)
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_place, parent, false)
        return VH(view)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val (id, name) = items[position]
        holder.name.text = name
        holder.coords.visibility = View.GONE
        holder.itemView.setOnClickListener { onClick(id, name) }
    }

    override fun getItemCount(): Int = items.size

    class VH(view: View) : RecyclerView.ViewHolder(view) {
        val name: TextView = view.findViewById(R.id.text_place_name)
        val coords: TextView = view.findViewById(R.id.text_place_coords)
    }
}
