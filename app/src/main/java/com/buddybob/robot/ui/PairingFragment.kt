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
import com.buddybob.robot.BuddybobApp
import com.buddybob.robot.MainActivity
import com.buddybob.robot.R
import com.buddybob.robot.config.PairingApi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class PairingFragment : Fragment() {

    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.Main + job)
    private val api = PairingApi()

    private lateinit var status: TextView
    private lateinit var inputEndpoint: EditText
    private lateinit var inputSerial: EditText
    private lateinit var inputCode: EditText
    private lateinit var btnConnect: Button

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_pairing, container, false)
        status = root.findViewById(R.id.text_pairing_status)
        inputEndpoint = root.findViewById(R.id.input_endpoint)
        inputSerial = root.findViewById(R.id.input_serial)
        inputCode = root.findViewById(R.id.input_code)
        btnConnect = root.findViewById(R.id.btn_save_pairing)

        fillFromCurrent()
        readSerialFromRobot()

        btnConnect.setOnClickListener { connect() }
        root.findViewById<Button>(R.id.btn_clear_pairing).setOnClickListener {
            BuddybobApp.instance.config.clearPairing()
            BuddybobApp.instance.config.load()
            fillFromCurrent()
            Toast.makeText(requireContext(), R.string.pairing_cleared, Toast.LENGTH_SHORT).show()
        }
        root.findViewById<Button>(R.id.btn_back).setOnClickListener {
            (activity as? MainActivity)?.openReceptionOrHome()
        }
        return root
    }

    private fun fillFromCurrent() {
        val cfg = BuddybobApp.instance.config
        val p = cfg.pairing
        if (p != null) {
            status.text = getString(R.string.pairing_status_ok, p.robotId, p.endpoint)
            inputEndpoint.setText(p.endpoint)
        } else {
            status.setText(R.string.pairing_status_none)
            inputEndpoint.setText(cfg.current.sync.endpoint.orEmpty())
        }
    }

    private fun readSerialFromRobot() {
        runCatching {
            BuddybobApp.instance.robot.status.getRobotSn { sn ->
                if (!isAdded) return@getRobotSn
                if (sn.isNotBlank() && sn != "unavailable") {
                    activity?.runOnUiThread { inputSerial.setText(sn) }
                }
            }
        }
    }

    private fun connect() {
        val endpoint = inputEndpoint.text?.toString()?.trim().orEmpty()
        val serial = inputSerial.text?.toString()?.trim().orEmpty()
        val code = inputCode.text?.toString()?.trim().orEmpty()
        if (endpoint.isEmpty() || serial.isEmpty() || code.isEmpty()) {
            Toast.makeText(requireContext(), R.string.pairing_missing, Toast.LENGTH_LONG).show()
            return
        }
        btnConnect.isEnabled = false
        status.setText(R.string.pairing_connecting)
        scope.launch {
            try {
                val pairing = withContext(Dispatchers.IO) {
                    api.pairBySerial(endpoint, serial, code)
                }
                BuddybobApp.instance.config.savePairing(pairing)
                fillFromCurrent()
                inputCode.setText("")
                Toast.makeText(requireContext(), R.string.pairing_saved, Toast.LENGTH_LONG).show()
            } catch (e: Exception) {
                status.text = e.message ?: getString(R.string.pairing_error)
                Toast.makeText(
                    requireContext(),
                    e.message ?: getString(R.string.pairing_error),
                    Toast.LENGTH_LONG
                ).show()
            } finally {
                btnConnect.isEnabled = true
            }
        }
    }

    override fun onDestroyView() {
        job.cancel()
        super.onDestroyView()
    }

    companion object {
        fun newInstance() = PairingFragment()
    }
}
