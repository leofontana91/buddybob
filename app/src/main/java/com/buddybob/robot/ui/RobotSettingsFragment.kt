package com.buddybob.robot.ui

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import com.buddybob.robot.BuddybobApp
import com.buddybob.robot.MainActivity
import com.buddybob.robot.R

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class RobotSettingsFragment : Fragment() {

    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.Main + job)
    private val mainHandler = Handler(Looper.getMainLooper())
    private var placeNames: List<String> = emptyList()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_robot_settings, container, false)
        val status = root.findViewById<TextView>(R.id.text_settings_status)
        val spinner = root.findViewById<Spinner>(R.id.spinner_standby)
        val cfg = BuddybobApp.instance.config
        val paired = cfg.isPaired()
        status.text = if (paired) {
            getString(R.string.robot_settings_paired, cfg.current.robot.displayName, cfg.current.robot.id)
        } else {
            getString(R.string.robot_settings_unpaired)
        }

        bindStandbySpinner(spinner, emptyList())
        BuddybobApp.instance.robot.navigation.getPlaceList { places ->
            mainHandler.post {
                if (!isAdded) return@post
                bindStandbySpinner(spinner, places.map { it.name })
            }
        }

        root.findViewById<Button>(R.id.btn_save_standby).setOnClickListener {
            val name = selectedPlace(spinner)
            val repo = BuddybobApp.instance.config
            repo.saveLocal(
                repo.current.copy(
                    reception = repo.current.reception.copy(standbyPlace = name)
                )
            )
            Toast.makeText(requireContext(), R.string.robot_settings_saved, Toast.LENGTH_SHORT).show()
        }
        root.findViewById<Button>(R.id.btn_go_standby).setOnClickListener {
            val name = BuddybobApp.instance.config.current.reception.standbyPlace
            if (name.isBlank()) {
                Toast.makeText(requireContext(), R.string.robot_settings_no_standby, Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            BuddybobApp.instance.robot.navigation.startNavigation(name)
        }
        root.findViewById<Button>(R.id.btn_settings_refresh).setOnClickListener {
            val btn = it as Button
            btn.isEnabled = false
            scope.launch {
                val result = withContext(Dispatchers.IO) {
                    BuddybobApp.instance.config.refreshFromNetwork(force = true)
                }
                if (!isAdded) return@launch
                btn.isEnabled = true
                val msg = when (result) {
                    is com.buddybob.robot.config.ConfigRepository.RefreshResult.Updated ->
                        getString(R.string.robot_settings_refresh_ok)
                    is com.buddybob.robot.config.ConfigRepository.RefreshResult.Unchanged ->
                        getString(R.string.robot_settings_refresh_same)
                    is com.buddybob.robot.config.ConfigRepository.RefreshResult.Failed ->
                        getString(R.string.robot_settings_refresh_fail, result.message)
                }
                Toast.makeText(requireContext(), msg, Toast.LENGTH_LONG).show()
            }
        }
        root.findViewById<Button>(R.id.btn_settings_pair).setOnClickListener {
            (activity as? MainActivity)?.switchFragment(PairingFragment.newInstance())
        }
        root.findViewById<Button>(R.id.btn_settings_tech).setOnClickListener {
            (activity as? MainActivity)?.switchFragment(HomeFragment.newInstance())
        }
        root.findViewById<Button>(R.id.btn_settings_simulate).setOnClickListener {
            val rec = BuddybobApp.instance.robot.reception
            rec.resetToIdle()
            rec.simulateGuest()
            (activity as? MainActivity)?.openReceptionOrHome()
        }
        root.findViewById<Button>(R.id.btn_settings_idle).setOnClickListener {
            BuddybobApp.instance.robot.reception.resetToIdle()
            (activity as? MainActivity)?.openReceptionOrHome()
        }
        root.findViewById<Button>(R.id.btn_settings_halt).setOnClickListener {
            runCatching { BuddybobApp.instance.robot.haltAllMotion() }
        }
        root.findViewById<Button>(R.id.btn_settings_charge).setOnClickListener {
            runCatching { BuddybobApp.instance.robot.navigation.goCharge() }
        }
        root.findViewById<Button>(R.id.btn_settings_back).setOnClickListener {
            (activity as? MainActivity)?.openReceptionOrHome()
        }
        return root
    }

    private fun bindStandbySpinner(spinner: Spinner, names: List<String>) {
        val config = BuddybobApp.instance.config
        placeNames = listOf("") + names.distinct()
        val labels = placeNames.map { name ->
            if (name.isBlank()) getString(R.string.robot_settings_standby_none)
            else config.placeLabel(name)
        }
        spinner.adapter = ArrayAdapter(
            requireContext(),
            android.R.layout.simple_spinner_dropdown_item,
            labels
        )
        val current = config.current.reception.standbyPlace
        val idx = placeNames.indexOf(current).takeIf { it >= 0 } ?: 0
        spinner.setSelection(idx)
    }

    private fun selectedPlace(spinner: Spinner): String {
        val idx = spinner.selectedItemPosition
        if (idx <= 0 || idx >= placeNames.size) return ""
        return placeNames[idx]
    }

    override fun onDestroyView() {
        job.cancel()
        super.onDestroyView()
    }

    companion object {
        fun newInstance() = RobotSettingsFragment()
    }
}
