package com.buddybob.robot.config

/**
 * Payload encoded in the Super Admin pairing QR (and paste field).
 * Saved on-device so the APK does not need a rebuild per robot.
 */
data class RobotPairing(
    val v: Int = 1,
    val endpoint: String,
    val robotId: String,
    val apiKey: String,
    val bookingUrl: String? = null
)
