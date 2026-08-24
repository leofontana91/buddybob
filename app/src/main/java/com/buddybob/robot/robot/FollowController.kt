package com.buddybob.robot.robot

import android.os.RemoteException
import android.util.Log
import com.ainirobot.coreservice.client.Definition
import com.ainirobot.coreservice.client.RobotApi
import com.ainirobot.coreservice.client.listener.ActionListener
import com.ainirobot.coreservice.client.listener.Person
import com.ainirobot.coreservice.client.person.PersonApi
import com.ainirobot.coreservice.client.person.PersonListener
import com.ainirobot.coreservice.client.person.PersonUtils

/**
 * Focus follow: robot tracks a person with head (monitor) and chassis rotation.
 * Occupies chassis resources — stop navigation/motion before starting.
 */
class FollowController {

    var onStatus: ((String) -> Unit)? = null
    var onPersons: ((List<Person>) -> Unit)? = null

    @Volatile
    var isFollowing: Boolean = false
        private set

    private var personListener: PersonListener? = null

    fun startDetectingPersons() {
        stopDetectingPersons()
        val listener = object : PersonListener() {
            override fun personChanged() {
                try {
                    val people = PersonApi.getInstance().getAllPersons()
                    onPersons?.invoke(people)
                } catch (e: Exception) {
                    Log.w(TAG, "personChanged error: ${e.message}")
                }
            }
        }
        personListener = listener
        try {
            PersonApi.getInstance().registerPersonListener(listener)
            onStatus?.invoke("Person detection ON")
        } catch (e: Exception) {
            Log.e(TAG, "startDetectingPersons failed: ${e.message}")
        }
    }

    fun stopDetectingPersons() {
        try {
            personListener?.let { PersonApi.getInstance().unregisterPersonListener(it) }
        } catch (e: Exception) {
            Log.w(TAG, "stopDetectingPersons failed: ${e.message}")
        }
        personListener = null
    }

    fun getVisiblePersons(maxDistanceMeters: Double = 3.0): List<Person> {
        return try {
            PersonApi.getInstance().getAllPersons(maxDistanceMeters) ?: emptyList()
        } catch (e: Exception) {
            Log.w(TAG, "getVisiblePersons failed: ${e.message}")
            emptyList()
        }
    }

    fun getBestFace(maxDistanceMeters: Double = 3.0): Person? {
        return try {
            val faces = PersonApi.getInstance().getCompleteFaceList() ?: emptyList()
            PersonUtils.getBestFace(faces, maxDistanceMeters, 60.0)
        } catch (e: Exception) {
            Log.w(TAG, "getBestFace failed: ${e.message}")
            null
        }
    }

    fun getFocusPerson(): Person? {
        return try {
            PersonApi.getInstance().focusPerson
        } catch (e: Exception) {
            Log.w(TAG, "getFocusPerson failed: ${e.message}")
            null
        }
    }

    /** Persone nel cono frontale entro [maxDistanceMeters]. */
    fun getPersonsInFront(
        maxDistanceMeters: Double = 3.0,
        maxAbsAngleDeg: Double = 45.0
    ): List<Person> {
        return getVisiblePersons(maxDistanceMeters).filter { p ->
            val d = p.distance
            d > 0.2 && d <= maxDistanceMeters &&
                kotlin.math.abs(p.angle.toDouble()) <= maxAbsAngleDeg
        }.sortedBy { kotlin.math.abs(it.angle) }
    }

    /**
     * Start focus follow on [faceId].
     * If faceId is null, picks the best complete face currently visible.
     */
    fun startFocusFollow(
        faceId: Int? = null,
        lostTimeoutSec: Long = 8L,
        maxDistanceMeters: Float = 3f
    ) {
        val targetId = faceId ?: getBestFace()?.id
        if (targetId == null) {
            onStatus?.invoke("No face to follow")
            return
        }

        if (isFollowing) {
            stopFocusFollow()
        }

        RobotApi.getInstance().startFocusFollow(
            ReqId.next(),
            targetId,
            lostTimeoutSec,
            maxDistanceMeters,
            object : ActionListener() {
                override fun onStatusUpdate(status: Int, data: String?) {
                    val msg = when (status) {
                        Definition.STATUS_TRACK_TARGET_SUCCEED -> "Tracking target"
                        Definition.STATUS_GUEST_LOST -> "Target lost"
                        Definition.STATUS_GUEST_FARAWAY -> "Target too far"
                        Definition.STATUS_GUEST_APPEAR -> "Target back in range"
                        else -> "follow status=$status data=$data"
                    }
                    onStatus?.invoke(msg)
                    Log.d(TAG, msg)
                }

                override fun onError(errorCode: Int, errorString: String?) {
                    isFollowing = false
                    val msg = when (errorCode) {
                        Definition.ERROR_SET_TRACK_FAILED,
                        Definition.ERROR_TARGET_NOT_FOUND -> "Target not found"
                        Definition.ACTION_RESPONSE_ALREADY_RUN -> "Follow already running — stop first"
                        Definition.ACTION_RESPONSE_REQUEST_RES_ERROR ->
                            "Chassis busy (nav/motion). Stop other actions first"
                        else -> "Follow error $errorCode: $errorString"
                    }
                    onStatus?.invoke(msg)
                    Log.e(TAG, msg)
                }

                @Throws(RemoteException::class)
                override fun onResult(status: Int, responseString: String?) {
                    if (status == Definition.ACTION_RESPONSE_STOP_SUCCESS) {
                        isFollowing = false
                        onStatus?.invoke("Focus follow stopped")
                    }
                }
            }
        )
        isFollowing = true
        onStatus?.invoke("Focus follow started on faceId=$targetId")
    }

    /**
     * Auto-picks a suitable face and tracks with head + chassis.
     * Prefer this when you do not care which person is followed.
     */
    fun startSmartFocusFollow(
        lostTimeoutSec: Long = 8L,
        maxDistanceMeters: Float = 3f
    ) {
        if (isFollowing) {
            stopFocusFollow()
        }
        RobotApi.getInstance().startSmartFocusFollow(
            ReqId.next(),
            lostTimeoutSec,
            maxDistanceMeters,
            object : ActionListener() {
                override fun onStatusUpdate(status: Int, data: String?) {
                    onStatus?.invoke("smart-follow status=$status data=$data")
                }

                override fun onError(errorCode: Int, errorString: String?) {
                    isFollowing = false
                    onStatus?.invoke("smart-follow error $errorCode: $errorString")
                }

                @Throws(RemoteException::class)
                override fun onResult(status: Int, responseString: String?) {
                    if (status == Definition.ACTION_RESPONSE_STOP_SUCCESS) {
                        isFollowing = false
                        onStatus?.invoke("Smart focus follow stopped")
                    }
                }
            }
        )
        isFollowing = true
        onStatus?.invoke("Smart focus follow started")
    }

    fun stopFocusFollow() {
        try {
            RobotApi.getInstance().stopFocusFollow(ReqId.next())
            RobotApi.getInstance().stopSmartFocusFollow(ReqId.next())
        } catch (e: Exception) {
            Log.w(TAG, "stopFocusFollow failed: ${e.message}")
        }
        isFollowing = false
        onStatus?.invoke("Focus follow stop requested")
    }

    fun release() {
        stopFocusFollow()
        stopDetectingPersons()
    }

    companion object {
        private const val TAG = "FollowController"
    }
}
