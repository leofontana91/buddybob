package com.buddybob.robot.config

import com.google.gson.Gson
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class PairingApi {

    private val gson = Gson()
    private val client = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(12, TimeUnit.SECONDS)
        .build()
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    fun pairBySerial(endpoint: String, serialNumber: String, pairingCode: String): RobotPairing {
        val base = endpoint.trim().trimEnd('/')
        val body = gson.toJson(
            mapOf(
                "serialNumber" to serialNumber.trim(),
                "pairingCode" to pairingCode.trim()
            )
        )
        val request = Request.Builder()
            .url("$base/api/public/pair")
            .post(body.toRequestBody(jsonMedia))
            .build()
        client.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val err = runCatching {
                    gson.fromJson(text, ErrorBody::class.java)?.error
                }.getOrNull()
                throw IllegalStateException(err ?: "HTTP ${response.code}")
            }
            val pairing = gson.fromJson(text, RobotPairing::class.java)
                ?: throw IllegalStateException("Risposta vuota")
            return pairing.copy(endpoint = pairing.endpoint.ifBlank { base })
        }
    }

    private data class ErrorBody(val error: String?)
}
