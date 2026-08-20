package com.buddybob.robot.robot

import android.content.Context
import android.os.RemoteException
import android.util.Log
import com.ainirobot.coreservice.client.Definition
import com.ainirobot.coreservice.client.RobotApi
import com.ainirobot.coreservice.client.StatusListener
import com.ainirobot.coreservice.client.listener.CommandListener
import com.ainirobot.coreservice.client.robotsetting.RobotSettingApi

/**
 * Battery / pose / emergency listeners and system info.
 */
class StatusMonitor {

    var onBattery: ((String) -> Unit)? = null
    var onPose: ((String) -> Unit)? = null
    var onEmergency: ((String) -> Unit)? = null

    private var batteryListener: StatusListener? = null
    private var poseListener: StatusListener? = null
    private var emergencyListener: StatusListener? = null

    fun start() {
        batteryListener = object : StatusListener() {
            @Throws(RemoteException::class)
            override fun onStatusUpdate(type: String?, data: String?) {
                onBattery?.invoke(data ?: "")
            }
        }.also {
            RobotApi.getInstance().registerStatusListener(Definition.STATUS_BATTERY, it)
        }

        poseListener = object : StatusListener() {
            @Throws(RemoteException::class)
            override fun onStatusUpdate(type: String?, data: String?) {
                onPose?.invoke(data ?: "")
            }
        }.also {
            RobotApi.getInstance().registerStatusListener(Definition.STATUS_POSE, it)
        }

        emergencyListener = object : StatusListener() {
            @Throws(RemoteException::class)
            override fun onStatusUpdate(type: String?, data: String?) {
                onEmergency?.invoke(data ?: "")
            }
        }.also {
            RobotApi.getInstance().registerStatusListener(Definition.STATUS_EMERGENCY, it)
        }
    }

    fun stop() {
        batteryListener?.let { RobotApi.getInstance().unregisterStatusListener(it) }
        poseListener?.let { RobotApi.getInstance().unregisterStatusListener(it) }
        emergencyListener?.let { RobotApi.getInstance().unregisterStatusListener(it) }
        batteryListener = null
        poseListener = null
        emergencyListener = null
    }

    fun getBatteryInfo(): String {
        return try {
            RobotSettingApi.getInstance()
                .getRobotString(Definition.ROBOT_SETTINGS_BATTERY_INFO) ?: ""
        } catch (e: Exception) {
            Log.e(TAG, "battery info", e)
            ""
        }
    }

    fun getSdkVersion(): String {
        return try {
            RobotApi.getInstance().version ?: "unknown"
        } catch (e: Exception) {
            "unknown"
        }
    }

    fun getRobotSn(callback: (String) -> Unit) {
        try {
            RobotApi.getInstance().getRobotSn(object : CommandListener() {
                override fun onResult(result: Int, message: String?) {
                    if (result == Definition.RESULT_OK) {
                        callback(message ?: "")
                    } else {
                        callback("unavailable")
                    }
                }
            })
        } catch (e: Exception) {
            Log.w(TAG, "getRobotSn failed: ${e.message}")
            callback("unavailable")
        }
    }

    companion object {
        private const val TAG = "StatusMonitor"
    }
}
