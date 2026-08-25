package com.buddybob.robot.ui.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.ImageView
import android.widget.TextView
import com.buddybob.robot.BuddybobApp
import com.buddybob.robot.R
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Aggiorna la barra di stato custom (ora, Wi‑Fi, batteria).
 */
class SystemStatusBinder(private val root: View) {

    private val timeView: TextView = root.findViewById(R.id.text_status_time)
    private val wifiView: ImageView = root.findViewById(R.id.img_status_wifi)
    private val batteryIcon: BatteryIconView = root.findViewById(R.id.img_status_battery)
    private val batteryText: TextView = root.findViewById(R.id.text_status_battery)

    private val main = Handler(Looper.getMainLooper())
    private val timeFmt = SimpleDateFormat("HH:mm", Locale.ITALY)

    private var batteryPct: Int = -1
    private var charging: Boolean = false

    private val tick = object : Runnable {
        override fun run() {
            refreshTime()
            refreshWifi()
            refreshAndroidBatteryFallback()
            main.postDelayed(this, 15_000L)
        }
    }

    private val clockTick = object : Runnable {
        override fun run() {
            refreshTime()
            main.postDelayed(this, 30_000L)
        }
    }

    private val batteryReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent == null) return
            val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100).coerceAtLeast(1)
            if (level >= 0) batteryPct = ((level * 100f) / scale).toInt().coerceIn(0, 100)
            val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
            charging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                status == BatteryManager.BATTERY_STATUS_FULL
            applyBattery()
        }
    }

    fun start() {
        refreshTime()
        refreshWifi()
        refreshAndroidBatteryFallback()
        applyBattery()

        // Preferisci aggiornamenti OrionStar se disponibili
        BuddybobApp.instance.robot.status.onBattery = { raw ->
            parseRobotBattery(raw)?.let { (pct, ch) ->
                batteryPct = pct
                charging = ch
                main.post { applyBattery() }
            }
        }
        // Seed da RobotSetting se già connesso
        parseRobotBattery(BuddybobApp.instance.robot.status.getBatteryInfo())?.let { (pct, ch) ->
            batteryPct = pct
            charging = ch
            applyBattery()
        }

        try {
            root.context.registerReceiver(
                batteryReceiver,
                IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            )
        } catch (_: Exception) {
        }

        main.post(tick)
        main.post(clockTick)
    }

    fun stop() {
        main.removeCallbacks(tick)
        main.removeCallbacks(clockTick)
        BuddybobApp.instance.robot.status.onBattery = null
        try {
            root.context.unregisterReceiver(batteryReceiver)
        } catch (_: Exception) {
        }
    }

    private fun refreshTime() {
        timeView.text = timeFmt.format(Date())
    }

    private fun refreshWifi() {
        val ctx = root.context.applicationContext
        val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        val wifi = ctx.getSystemService(Context.WIFI_SERVICE) as? WifiManager

        val online = if (Build.VERSION.SDK_INT >= 23) {
            val caps = cm?.getNetworkCapabilities(cm.activeNetwork)
            caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true ||
                caps?.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) == true
        } else {
            @Suppress("DEPRECATION")
            cm?.activeNetworkInfo?.isConnected == true
        }

        val level = if (online && wifi != null) {
            @Suppress("DEPRECATION")
            val rssi = wifi.connectionInfo?.rssi ?: -100
            WifiManager.calculateSignalLevel(rssi, 4).coerceIn(0, 3)
        } else {
            0
        }

        wifiView.setImageResource(
            when (level) {
                0 -> R.drawable.ic_status_wifi_0
                1 -> R.drawable.ic_status_wifi_1
                2 -> R.drawable.ic_status_wifi_2
                else -> R.drawable.ic_status_wifi_3
            }
        )
        wifiView.alpha = if (online) 1f else 0.45f
    }

    private fun refreshAndroidBatteryFallback() {
        if (batteryPct in 0..100) return
        val bm = root.context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
        val pct = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        if (pct in 0..100) {
            batteryPct = pct
            applyBattery()
        }
    }

    private fun applyBattery() {
        val pct = batteryPct.coerceIn(0, 100).takeIf { batteryPct >= 0 } ?: 100
        batteryIcon.level = pct
        batteryIcon.charging = charging
        batteryText.text = "$pct%"
    }

    companion object {
        fun parseRobotBattery(raw: String?): Pair<Int, Boolean>? {
            if (raw.isNullOrBlank()) return null
            val t = raw.trim()
            // JSON tipico OrionStar / setting
            if (t.startsWith("{")) {
                return try {
                    val o = JSONObject(t)
                    val pct = when {
                        o.has("level") -> o.optInt("level", -1)
                        o.has("battery") -> o.optInt("battery", -1)
                        o.has("percent") -> o.optInt("percent", -1)
                        o.has("capacity") -> o.optInt("capacity", -1)
                        else -> -1
                    }
                    if (pct !in 0..100) return null
                    val ch = o.optBoolean("charging", false) ||
                        o.optBoolean("isCharging", false) ||
                        o.optInt("charge", 0) == 1 ||
                        o.optString("status").contains("charg", ignoreCase = true)
                    pct to ch
                } catch (_: Exception) {
                    null
                }
            }
            // Solo numero
            val n = t.filter { it.isDigit() }.take(3).toIntOrNull() ?: return null
            return if (n in 0..100) n to false else null
        }
    }
}
