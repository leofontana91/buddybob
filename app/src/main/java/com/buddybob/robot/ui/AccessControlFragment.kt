package com.buddybob.robot.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
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

class AccessControlFragment : Fragment() {

    private val api = PlatformApi()
    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.Main + job)
    private lateinit var adapter: AccessAdapter
    private lateinit var status: TextView

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_access, container, false)
        val first = root.findViewById<EditText>(R.id.input_first_name)
        val last = root.findViewById<EditText>(R.id.input_last_name)
        status = root.findViewById(R.id.text_access_status)
        val list = root.findViewById<RecyclerView>(R.id.list_inside)

        adapter = AccessAdapter { visit -> checkOut(visit) }
        list.layoutManager = LinearLayoutManager(requireContext())
        list.adapter = adapter

        root.findViewById<Button>(R.id.btn_check_in).setOnClickListener {
            val fn = first.text.toString().trim()
            val ln = last.text.toString().trim()
            if (fn.isEmpty() || ln.isEmpty()) {
                Toast.makeText(requireContext(), R.string.access_need_name, Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            scope.launch {
                try {
                    val result = withContext(Dispatchers.IO) { api.checkIn(fn, ln) }
                    val speak = result.speak ?: getString(R.string.access_in_ok)
                    status.text = speak
                    BuddybobApp.instance.robot.speech.speak(speak)
                    first.text.clear()
                    last.text.clear()
                    refreshInside()
                } catch (e: Exception) {
                    status.setText(R.string.appointments_error)
                }
            }
        }
        root.findViewById<Button>(R.id.btn_back).setOnClickListener {
            (activity as? MainActivity)?.openReceptionOrHome()
        }
        if (!BuddybobApp.instance.config.isPaired()) {
            status.text = "Robot non abbinato. Effettua prima il pairing."
            return root
        }
        refreshInside()
        return root
    }

    private fun refreshInside() {
        scope.launch {
            try {
                val rows = withContext(Dispatchers.IO) { api.listInside() }
                adapter.submit(rows)
                if (rows.isEmpty()) {
                    status.setText(R.string.access_empty_inside)
                }
            } catch (e: Exception) {
                status.setText(R.string.appointments_error)
            }
        }
    }

    private fun checkOut(visit: PlatformApi.VisitDto) {
        scope.launch {
            try {
                val result = withContext(Dispatchers.IO) { api.checkOut(visit.id) }
                val speak = result.speak ?: getString(R.string.access_out_ok)
                status.text = speak
                BuddybobApp.instance.robot.speech.speak(speak)
                refreshInside()
            } catch (e: Exception) {
                status.setText(R.string.appointments_error)
            }
        }
    }

    override fun onDestroyView() {
        job.cancel()
        super.onDestroyView()
    }

    companion object {
        fun newInstance() = AccessControlFragment()
    }
}

class AccessAdapter(
    private val onExit: (PlatformApi.VisitDto) -> Unit
) : RecyclerView.Adapter<AccessAdapter.VH>() {

    private val items = mutableListOf<PlatformApi.VisitDto>()

    fun submit(rows: List<PlatformApi.VisitDto>) {
        items.clear()
        items.addAll(rows)
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_access, parent, false)
        return VH(view)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val v = items[position]
        holder.name.text = "${v.firstName} ${v.lastName}"
        holder.exit.setOnClickListener { onExit(v) }
    }

    override fun getItemCount(): Int = items.size

    class VH(view: View) : RecyclerView.ViewHolder(view) {
        val name: TextView = view.findViewById(R.id.text_access_name)
        val exit: Button = view.findViewById(R.id.btn_access_exit)
    }
}
