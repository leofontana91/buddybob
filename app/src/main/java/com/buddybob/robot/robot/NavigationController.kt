package com.buddybob.robot.robot

import android.os.RemoteException
import android.util.Log
import com.ainirobot.coreservice.client.Definition
import com.ainirobot.coreservice.client.RobotApi
import com.ainirobot.coreservice.client.listener.ActionListener
import com.ainirobot.coreservice.client.listener.CommandListener
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

    fun isEstimate(callback: (Boolean) -> Unit) {
        RobotApi.getInstance().isRobotEstimate(ReqId.next(), object : CommandListener() {
            override fun onResult(result: Int, message: String?) {
                callback("true".equals(message, ignoreCase = true))
            }
        })
    }

    fun getPlaceList(callback: (List<Place>) -> Unit) {
        val main = android.os.Handler(android.os.Looper.getMainLooper())
        try {
            RobotApi.getInstance().getPlaceList(ReqId.next(), object : CommandListener() {
                override fun onResult(result: Int, message: String?) {
                    val places = mutableListOf<Place>()
                    try {
                        // Some firmwares return a JSON array; others expose Pose via sync API
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
                    main.post { callback(places) }
                }
            })
        } catch (e: Exception) {
            Log.e(TAG, "getPlaceList", e)
            main.post { callback(syncPlaceList()) }
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

    fun startNavigation(
        destName: String,
        coordinateDeviation: Double = 0.5,
        avoidTimeoutMs: Long = 20_000L
    ) {
        lastDestination = destName
        lastStatusText = ""
        try {
            RobotApi.getInstance().startNavigation(
                ReqId.next(),
                destName,
                coordinateDeviation,
                avoidTimeoutMs,
                navigationListener()
            )
        } catch (e: Exception) {
            Log.e(TAG, "startNavigation failed: ${e.message}")
            onStatus?.invoke("Navigation error: ${e.message}")
        }
    }

    fun stopNavigation() {
        try {
            RobotApi.getInstance().stopNavigation(ReqId.next())
            onStatus?.invoke("Navigation stop requested")
        } catch (e: Exception) {
            Log.w(TAG, "stopNavigation failed: ${e.message}")
        }
    }

    fun goCharge(timeoutMs: Long = 60_000L) {
        try {
            RobotApi.getInstance().startNaviToAutoChargeAction(
                ReqId.next(),
                timeoutMs,
                navigationListener()
            )
        } catch (e: Exception) {
            Log.e(TAG, "goCharge failed: ${e.message}")
        }
    }

    fun stopChargeNav() {
        try {
            RobotApi.getInstance().stopAutoChargeAction(ReqId.next(), true)
        } catch (e: Exception) {
            Log.w(TAG, "stopChargeNav failed: ${e.message}")
        }
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
            onStatus?.invoke("$label: $message")
            lastStatusText = "$label: $message"
        }
    }

    private fun navigationListener() = object : ActionListener() {
        @Throws(RemoteException::class)
        override fun onResult(status: Int, response: String?) {
            lastStatusText = "nav result status=$status response=$response"
            onStatus?.invoke(lastStatusText)
        }

        @Throws(RemoteException::class)
        override fun onError(errorCode: Int, errorString: String?) {
            val msg = when (errorCode) {
                Definition.ERROR_NOT_ESTIMATE -> "Not localized"
                Definition.ERROR_IN_DESTINATION -> "Already at destination"
                Definition.ERROR_DESTINATION_NOT_EXIST -> "Destination missing"
                Definition.ERROR_DESTINATION_CAN_NOT_ARRAIVE -> "Cannot reach destination"
                Definition.ACTION_RESPONSE_ALREADY_RUN -> "Navigation already running"
                Definition.ACTION_RESPONSE_REQUEST_RES_ERROR -> "Chassis busy"
                else -> "Nav error $errorCode: $errorString"
            }
            lastStatusText = msg
            onStatus?.invoke(msg)
        }

        override fun onStatusUpdate(status: Int, data: String?, extraData: String?) {
            lastStatusText = "nav status=$status data=$data"
            onStatus?.invoke(lastStatusText)
        }
    }

    data class Place(val name: String, val x: Double, val y: Double, val theta: Double)

    companion object {
        private const val TAG = "NavigationController"
    }
}
