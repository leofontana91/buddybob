package com.buddybob.robot.robot

import android.os.RemoteException
import android.util.Log
import com.ainirobot.coreservice.client.speech.SkillCallback

/** ASR / speech recognition stream from SkillApi. */
class BuddySpeechCallback : SkillCallback() {

    var listener: Listener? = null

    interface Listener {
        fun onPartial(text: String)
        fun onFinal(text: String)
        fun onVolume(volume: Int)
    }

    @Throws(RemoteException::class)
    override fun onSpeechParResult(s: String) {
        listener?.onPartial(s)
    }

    @Throws(RemoteException::class)
    override fun onStart() {
        Log.d(TAG, "ASR start")
    }

    @Throws(RemoteException::class)
    override fun onStop() {
        Log.d(TAG, "ASR stop")
    }

    @Throws(RemoteException::class)
    override fun onVolumeChange(volume: Int) {
        listener?.onVolume(volume)
    }

    @Throws(RemoteException::class)
    override fun onQueryEnded(status: Int) {
        Log.d(TAG, "query ended status=$status")
    }

    @Throws(RemoteException::class)
    override fun onQueryAsrResult(asrResult: String) {
        listener?.onFinal(asrResult)
    }

    companion object {
        private const val TAG = "BuddySpeechCallback"
    }
}
