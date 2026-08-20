package com.buddybob.robot.robot

import android.os.RemoteException
import android.util.Log
import com.ainirobot.coreservice.client.RobotApi
import com.ainirobot.coreservice.client.module.ModuleCallbackApi

/**
 * Receives voice NLP requests and system suspend/recovery events from RobotOS.
 */
class BuddyModuleCallback : ModuleCallbackApi() {

    var listener: Listener? = null

    interface Listener {
        fun onVoiceRequest(reqId: Int, reqType: String, reqText: String, reqParam: String)
        fun onSuspend()
        fun onRecovery()
    }

    @Throws(RemoteException::class)
    override fun onSendRequest(
        reqId: Int,
        reqType: String,
        reqText: String,
        reqParam: String
    ): Boolean {
        Log.d(TAG, "voice reqId=$reqId type=$reqType text=$reqText param=$reqParam")
        listener?.onVoiceRequest(reqId, reqType, reqText, reqParam)
        // Always finish the parser so RobotOS does not hang on the command.
        RobotApi.getInstance().finishModuleParser(reqId, true)
        return true
    }

    @Throws(RemoteException::class)
    override fun onHWReport(function: Int, type: String, message: String) {
        Log.w(TAG, "HW report function=$function type=$type message=$message")
    }

    @Throws(RemoteException::class)
    override fun onSuspend() {
        Log.w(TAG, "RobotOS suspended this app — API calls are invalid until recovery")
        listener?.onSuspend()
    }

    @Throws(RemoteException::class)
    override fun onRecovery() {
        Log.i(TAG, "RobotOS recovered — API calls allowed again")
        listener?.onRecovery()
    }

    companion object {
        private const val TAG = "BuddyModuleCallback"
    }
}
