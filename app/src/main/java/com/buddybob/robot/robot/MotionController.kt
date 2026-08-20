package com.buddybob.robot.robot

import android.util.Log
import com.ainirobot.coreservice.client.RobotApi
import com.ainirobot.coreservice.client.listener.CommandListener

/**
 * Chassis + gimbal motion (forward/back/turn/head).
 * Do not call while navigation or focus-follow owns the chassis.
 */
class MotionController {

    var onResult: ((String) -> Unit)? = null

    private val listener = object : CommandListener() {
        override fun onResult(result: Int, message: String?) {
            Log.d(TAG, "motion result=$result message=$message")
            onResult?.invoke("result=$result message=$message")
        }
    }

    fun goForward(speed: Float = DEFAULT_LINEAR_SPEED, distanceMeters: Float? = null) {
        try {
            if (distanceMeters != null) {
                RobotApi.getInstance().goForward(ReqId.next(), speed, distanceMeters, listener)
            } else {
                RobotApi.getInstance().goForward(ReqId.next(), speed, listener)
            }
        } catch (e: Exception) { Log.w(TAG, "goForward: ${e.message}") }
    }

    fun goBackward(speed: Float = DEFAULT_LINEAR_SPEED, distanceMeters: Float? = null) {
        try {
            if (distanceMeters != null) {
                RobotApi.getInstance().goBackward(ReqId.next(), speed, distanceMeters, listener)
            } else {
                RobotApi.getInstance().goBackward(ReqId.next(), speed, listener)
            }
        } catch (e: Exception) { Log.w(TAG, "goBackward: ${e.message}") }
    }

    fun turnLeft(speedDegPerSec: Float = DEFAULT_TURN_SPEED, angleDeg: Float? = null) {
        try {
            if (angleDeg != null) {
                RobotApi.getInstance().turnLeft(ReqId.next(), speedDegPerSec, angleDeg, listener)
            } else {
                RobotApi.getInstance().turnLeft(ReqId.next(), speedDegPerSec, listener)
            }
        } catch (e: Exception) { Log.w(TAG, "turnLeft: ${e.message}") }
    }

    fun turnRight(speedDegPerSec: Float = DEFAULT_TURN_SPEED, angleDeg: Float? = null) {
        try {
            if (angleDeg != null) {
                RobotApi.getInstance().turnRight(ReqId.next(), speedDegPerSec, angleDeg, listener)
            } else {
                RobotApi.getInstance().turnRight(ReqId.next(), speedDegPerSec, listener)
            }
        } catch (e: Exception) { Log.w(TAG, "turnRight: ${e.message}") }
    }

    fun stopMove() {
        try {
            RobotApi.getInstance().stopMove(ReqId.next(), listener)
        } catch (e: Exception) { Log.w(TAG, "stopMove: ${e.message}") }
    }

    fun moveHead(
        hMode: String = "relative",
        vMode: String = "relative",
        hAngle: Int,
        vAngle: Int
    ) {
        try {
            RobotApi.getInstance().moveHead(ReqId.next(), hMode, vMode, hAngle, vAngle, listener)
        } catch (e: Exception) { Log.w(TAG, "moveHead: ${e.message}") }
    }

    fun resetHead() {
        try {
            RobotApi.getInstance().resetHead(ReqId.next(), listener)
        } catch (e: Exception) { Log.w(TAG, "resetHead: ${e.message}") }
    }

    companion object {
        private const val TAG = "MotionController"
        const val DEFAULT_LINEAR_SPEED = 0.4f
        const val DEFAULT_TURN_SPEED = 25f
    }
}
