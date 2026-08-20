package com.buddybob.robot.appointments

import com.buddybob.robot.BuddybobApp
import com.google.gson.Gson
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit

class AppointmentsApi {

    private val gson = Gson()
    private val client = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(12, TimeUnit.SECONDS)
        .build()

    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    data class AppointmentDto(
        val id: String,
        val guestName: String,
        val startsAt: String,
        val status: String
    )

    data class ListResponse(
        val date: String,
        val appointments: List<AppointmentDto>
    )

    data class CheckInResponse(
        val id: String,
        val guestName: String,
        val status: String,
        val speak: String?
    )

    data class SlotsResponse(
        val from: String,
        val to: String,
        val slots: List<String>
    )

    data class CreateResponse(
        val id: String,
        val guestName: String,
        val startsAt: String,
        val status: String?
    )

    data class AlertResponse(
        val id: String,
        val type: String,
        val message: String,
        val speak: String?
    )

    private fun baseUrl(): String {
        val cfg = BuddybobApp.instance.config.current
        return (cfg.sync.endpoint ?: "http://10.0.2.2:3000").trimEnd('/')
    }

    private fun robotId(): String = BuddybobApp.instance.config.current.robot.id

    private fun apiKey(): String =
        BuddybobApp.instance.config.current.appointments.apiKey

    private fun authRequest(builder: Request.Builder): Request.Builder {
        return builder.header("Authorization", "Bearer ${apiKey()}")
    }

    fun todayDate(): String =
        SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

    fun listToday(): ListResponse {
        val date = todayDate()
        val req = authRequest(
            Request.Builder()
                .url("${baseUrl()}/api/robots/${robotId()}/appointments?date=$date")
                .get()
        ).build()
        return execute(req, ListResponse::class.java)
    }

    fun checkIn(appointmentId: String): CheckInResponse {
        val req = authRequest(
            Request.Builder()
                .url("${baseUrl()}/api/appointments/$appointmentId/check-in")
                .post("{}".toRequestBody(jsonMedia))
        ).build()
        return execute(req, CheckInResponse::class.java)
    }

    fun freeSlots(from: String, to: String): SlotsResponse {
        val req = authRequest(
            Request.Builder()
                .url("${baseUrl()}/api/robots/${robotId()}/slots?from=$from&to=$to")
                .get()
        ).build()
        return execute(req, SlotsResponse::class.java)
    }

    fun createAppointment(guestName: String, startsAtIso: String): CreateResponse {
        val body = gson.toJson(
            mapOf(
                "guestName" to guestName,
                "startsAt" to startsAtIso
            )
        )
        val req = authRequest(
            Request.Builder()
                .url("${baseUrl()}/api/robots/${robotId()}/appointments")
                .post(body.toRequestBody(jsonMedia))
        ).build()
        return execute(req, CreateResponse::class.java)
    }

    fun callOperator(message: String = "Un ospite richiede un operatore"): AlertResponse {
        val body = gson.toJson(
            mapOf(
                "type" to "call_operator",
                "message" to message
            )
        )
        val req = authRequest(
            Request.Builder()
                .url("${baseUrl()}/api/robots/${robotId()}/operator-alerts")
                .post(body.toRequestBody(jsonMedia))
        ).build()
        return execute(req, AlertResponse::class.java)
    }

    private fun <T> execute(request: Request, clazz: Class<T>): T {
        client.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw ApiException(response.code, text.ifBlank { response.message })
            }
            return gson.fromJson(text, clazz)
                ?: throw ApiException(response.code, "Empty body")
        }
    }

    class ApiException(val code: Int, message: String) : Exception("HTTP $code: $message")
}
