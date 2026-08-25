package com.buddybob.robot.robot

import android.os.Handler
import android.os.Looper
import android.os.RemoteException
import android.util.Log
import com.ainirobot.coreservice.client.Definition
import com.ainirobot.coreservice.client.RobotApi
import com.ainirobot.coreservice.client.listener.ActionListener
import com.ainirobot.coreservice.client.listener.CommandListener
import com.buddybob.robot.BuddybobApp
import org.json.JSONArray
import org.json.JSONObject

/** Map navigation to named places / poses. Requires localization. */
class NavigationController {

    var onStatus: ((String) -> Unit)? = null
    @Volatile
    var lastDestination: String? = null
        private set
    @Volatile
    var lastStatusText: String = ""
        private set
    @Volatile
    var isNavigating: Boolean = false
        private set

    private val main = Handler(Looper.getMainLooper())
    private var pendingStart: Runnable? = null
    private var activeListener: ActionListener? = null

    /** Reset prima di una nuova tratta (PlacesFragment wait). */
    fun lastStatusTextForWaitClear() {
        lastStatusText = ""
    }

    fun isEstimate(callback: (Boolean) -> Unit) {
        RobotApi.getInstance().isRobotEstimate(ReqId.next(), object : CommandListener() {
            override fun onResult(result: Int, message: String?) {
                callback("true".equals(message, ignoreCase = true))
            }
        })
    }

    fun getPlaceList(callback: (List<Place>) -> Unit) {
        val mainH = android.os.Handler(android.os.Looper.getMainLooper())
        try {
            RobotApi.getInstance().getPlaceList(ReqId.next(), object : CommandListener() {
                override fun onResult(result: Int, message: String?) {
                    val places = mutableListOf<Place>()
                    try {
                        if (!message.isNullOrBlank() && message.trim().startsWith("[")) {
                            val arr = JSONArray(message)
                            for (i in 0 until arr.length()) {
                                val o = arr.getJSONObject(i)
                                places.add(
                                    Place(
                                        name = o.optString("name"),
                                        x = o.optDouble("x"),
                                        y = o.optDouble("y"),
                                        theta = o.optDouble("theta")
                                    )
                                )
                            }
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "parse place list", e)
                    }
                    if (places.isEmpty()) {
                        places.addAll(syncPlaceList())
                    }
                    mainH.post { callback(places) }
                }
            })
        } catch (e: Exception) {
            Log.e(TAG, "getPlaceList", e)
            mainH.post { callback(syncPlaceList()) }
        }
    }

    private fun syncPlaceList(): List<Place> {
        return try {
            RobotApi.getInstance().placeList?.mapNotNull { pose ->
                val name = pose.name ?: return@mapNotNull null
                if (name.isBlank()) return@mapNotNull null
                Place(name, pose.x.toDouble(), pose.y.toDouble(), pose.theta.toDouble())
            } ?: emptyList()
        } catch (e: Exception) {
            Log.e(TAG, "syncPlaceList", e)
            emptyList()
        }
    }

    fun setLocation(placeName: String) {
        try {
            RobotApi.getInstance().setLocation(ReqId.next(), placeName, statusListener("setLocation"))
        } catch (e: Exception) {
            Log.w(TAG, "setLocation failed: ${e.message}")
        }
    }

    /**
     * Avvia navigazione liberando prima il telaio (follow / nav precedente).
     * OrionStar rifiuta startNavigation se un'altra API tiene il chassis
     * (ACTION_RESPONSE_ALREADY_RUN / REQUEST_RES_ERROR) — tipico dopo un accompagnamento.
     */
    fun startNavigation(
        destName: String,
        coordinateDeviation: Double = 0.5,
        avoidTimeoutMs: Long = 20_000L
    ) {
        lastDestination = destName
        lastStatusText = ""
        pendingStart?.let { main.removeCallbacks(it) }

        releaseChassis()
        report("Preparing nav → $destName")

        val attempt = object : Runnable {
            var tryCount = 0
            override fun run() {
                tryCount++
                val listener = navigationListener(
                    destName = destName,
                    coordinateDeviation = coordinateDeviation,
                    avoidTimeoutMs = avoidTimeoutMs,
                    attempt = tryCount
                )
                activeListener = listener
                try {
                    Log.i(TAG, "startNavigation dest=$destName attempt=$tryCount")
                    isNavigating = true
                    RobotApi.getInstance().startNavigation(
                        ReqId.next(),
                        destName,
                        coordinateDeviation,
                        avoidTimeoutMs,
                        listener
                    )
                } catch (e: Exception) {
                    Log.e(TAG, "startNavigation failed: ${e.message}")
                    isNavigating = false
                    report("Navigation error: ${e.message}")
                }
            }
        }
        pendingStart = attempt
        // Tempo perché stopFocusFollow / stopNavigation rilasciano il chassis
        main.postDelayed(attempt, CHASSIS_RELEASE_MS)
    }

    fun stopNavigation() {
        pendingStart?.let { main.removeCallbacks(it) }
        pendingStart = null
        isNavigating = false
        try {
            RobotApi.getInstance().stopNavigation(ReqId.next())
            report("Navigation stop requested")
        } catch (e: Exception) {
            Log.w(TAG, "stopNavigation failed: ${e.message}")
        }
    }

    /** Ferma follow + motion + nav così il chassis è libero. */
    fun releaseChassis() {
        runCatching {
            BuddybobApp.instance.robot.follow.stopFocusFollow()
        }
        runCatching {
            BuddybobApp.instance.robot.motion.stopMove()
        }
        runCatching {
            RobotApi.getInstance().stopNavigation(ReqId.next())
        }
    }

    fun goCharge(timeoutMs: Long = 60_000L) {
        releaseChassis()
        main.postDelayed({
            try {
                isNavigating = true
                RobotApi.getInstance().startNaviToAutoChargeAction(
                    ReqId.next(),
                    timeoutMs,
                    navigationListener("charge", 0.5, timeoutMs, 1)
                )
            } catch (e: Exception) {
                isNavigating = false
                Log.e(TAG, "goCharge failed: ${e.message}")
            }
        }, CHASSIS_RELEASE_MS)
    }

    fun stopChargeNav() {
        try {
            RobotApi.getInstance().stopAutoChargeAction(ReqId.next(), true)
        } catch (e: Exception) {
            Log.w(TAG, "stopChargeNav failed: ${e.message}")
        }
        isNavigating = false
    }

    fun leaveChargeDock() {
        try {
            RobotApi.getInstance().disableBattery()
            RobotApi.getInstance().stopChargingByApp()
        } catch (e: Exception) {
            Log.w(TAG, "leaveChargeDock failed: ${e.message}")
        }
    }

    fun getPosition(callback: (x: Double, y: Double, theta: Double) -> Unit) {
        RobotApi.getInstance().getPosition(ReqId.next(), object : CommandListener() {
            override fun onResult(result: Int, message: String?) {
                try {
                    val json = JSONObject(message ?: "{}")
                    callback(
                        json.optDouble(Definition.JSON_NAVI_POSITION_X),
                        json.optDouble(Definition.JSON_NAVI_POSITION_Y),
                        json.optDouble(Definition.JSON_NAVI_POSITION_THETA)
                    )
                } catch (e: Exception) {
                    Log.e(TAG, "getPosition", e)
                }
            }
        })
    }

    private fun statusListener(label: String) = object : CommandListener() {
        override fun onResult(result: Int, message: String?) {
            report("$label: $message")
        }
    }

    private fun navigationListener(
        destName: String,
        coordinateDeviation: Double,
        avoidTimeoutMs: Long,
        attempt: Int
    ): ActionListener {
        return object : ActionListener() {
            @Throws(RemoteException::class)
            override fun onResult(status: Int, response: String?) {
                if (status == Definition.ACTION_RESPONSE_STOP_SUCCESS) {
                    Log.d(TAG, "nav stop success (ignored as finish)")
                    return
                }
                isNavigating = false
                report("nav result status=$status response=$response")
            }

            @Throws(RemoteException::class)
            override fun onError(errorCode: Int, errorString: String?) {
                val busy = errorCode == Definition.ACTION_RESPONSE_ALREADY_RUN ||
                    errorCode == Definition.ACTION_RESPONSE_REQUEST_RES_ERROR
                if (busy && attempt < MAX_START_ATTEMPTS) {
                    Log.w(TAG, "chassis busy ($errorCode), retry ${attempt + 1}")
                    report("Chassis busy — ritento…")
                    scheduleRetry(destName, coordinateDeviation, avoidTimeoutMs, attempt + 1)
                    return
                }
                isNavigating = false
                val msg = when (errorCode) {
                    Definition.ERROR_NOT_ESTIMATE -> "Not localized"
                    Definition.ERROR_IN_DESTINATION -> "Already at destination"
                    Definition.ERROR_DESTINATION_NOT_EXIST -> "Destination missing"
                    Definition.ERROR_DESTINATION_CAN_NOT_ARRAIVE -> "Cannot reach destination"
                    Definition.ACTION_RESPONSE_ALREADY_RUN -> "Navigation already running"
                    Definition.ACTION_RESPONSE_REQUEST_RES_ERROR -> "Chassis busy"
                    else -> "Nav error $errorCode: $errorString"
                }
                report(msg)
            }

            override fun onStatusUpdate(status: Int, data: String?, extraData: String?) {
                if (isTerminalStatus(lastStatusText)) return
                report("nav status=$status data=$data")
            }
        }
    }

    private fun scheduleRetry(
        destName: String,
        coordinateDeviation: Double,
        avoidTimeoutMs: Long,
        attempt: Int
    ) {
        releaseChassis()
        val retry = Runnable {
            val listener: ActionListener =
                navigationListener(destName, coordinateDeviation, avoidTimeoutMs, attempt)
            activeListener = listener
            try {
                isNavigating = true
                RobotApi.getInstance().startNavigation(
                    ReqId.next(),
                    destName,
                    coordinateDeviation,
                    avoidTimeoutMs,
                    listener
                )
            } catch (e: Exception) {
                isNavigating = false
                report("Navigation error: ${e.message}")
            }
        }
        pendingStart = retry
        main.postDelayed(retry, CHASSIS_RELEASE_MS + 200L * attempt)
    }

    private fun isTerminalStatus(s: String): Boolean =
        s.startsWith("nav result") ||
            s.startsWith("Already") ||
            s.startsWith("Cannot") ||
            s.startsWith("Not localized") ||
            s.startsWith("Destination") ||
            s.startsWith("Nav error") ||
            s.startsWith("Chassis busy") ||
            s.startsWith("Navigation already")

    private fun report(msg: String) {
        lastStatusText = msg
        onStatus?.invoke(msg)
        Log.d(TAG, msg)
    }

    data class Place(val name: String, val x: Double, val y: Double, val theta: Double)

    companion object {
        private const val TAG = "NavigationController"
        private const val CHASSIS_RELEASE_MS = 700L
        private const val MAX_START_ATTEMPTS = 3
    }
}
