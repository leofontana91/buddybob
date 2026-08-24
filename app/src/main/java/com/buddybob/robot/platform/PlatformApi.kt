package com.buddybob.robot.platform

import com.buddybob.robot.BuddybobApp
import com.google.gson.Gson
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/** HTTP verso la piattaforma BOB (comandi, moduli, accessi). */
class PlatformApi {

    private val gson = Gson()
    private val client = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    data class CommandDto(
        val id: String,
        val type: String,
        val placeName: String? = null,
        val text: String? = null,
        val after: String? = null,
        val returnAfterSec: Int? = 0,
        val steps: List<StepDto>? = null
    )

    data class StepDto(
        val type: String = "",
        val text: String? = null,
        val label: String? = null,
        val speakOnPress: String? = null,
        val placeName: String? = null,
        val seconds: Int? = null
    )

    data class CommandsResponse(val commands: List<CommandDto> = emptyList())

    data class FormFieldDto(
        val id: String,
        val label: String,
        val type: String,
        val required: Boolean = true,
        val sortOrder: Int = 0
    )

    data class FormDto(
        val id: String,
        val name: String,
        val fields: List<FormFieldDto> = emptyList()
    )

    data class FormsResponse(val forms: List<FormDto> = emptyList())

    data class SubmitResponse(val id: String? = null, val speak: String? = null)

    data class VisitDto(
        val id: String,
        val firstName: String,
        val lastName: String,
        val enteredAt: String? = null
    )

    data class InsideResponse(val inside: List<VisitDto> = emptyList())

    data class CheckInResponse(
        val id: String,
        val firstName: String? = null,
        val lastName: String? = null,
        val speak: String? = null
    )

    data class CheckOutResponse(
        val id: String? = null,
        val speak: String? = null
    )

    data class PlacesConfigResponse(val places: List<PlaceConfigDto> = emptyList())

    data class PlaceConfigDto(
        val name: String = "",
        val label: String? = null,
        val speakOnDepart: String? = null,
        val speakWhileMoving: String? = null,
        val speakOnArrive: String? = null,
        val displayOnDepart: String? = null,
        val displayWhileMoving: String? = null,
        val displayOnArrive: String? = null,
        val mediaOnDepart: MediaDto? = null,
        val mediaWhileMoving: MediaDto? = null,
        val mediaOnArrive: MediaDto? = null,
        val waitSeconds: Int = 0
    )

    data class MediaDto(
        val url: String = "",
        val contentType: String = "",
        val fileName: String = ""
    )

    data class VoiceActionDto(
        val type: String = "",
        val text: String? = null,
        val placeName: String? = null,
        val module: String? = null,
        val after: String? = null
    )

    data class VoiceResponse(
        val speak: String? = null,
        val actions: List<VoiceActionDto>? = emptyList(),
        val source: String? = null
    )

    data class PlaceSync(
        val name: String,
        val x: Double = 0.0,
        val y: Double = 0.0,
        val theta: Double = 0.0
    )

    private fun baseUrl(): String {
        val cfg = BuddybobApp.instance.config.current
        return (cfg.sync.endpoint ?: "http://10.0.2.2:3000").trimEnd('/')
    }

    private fun robotId(): String = BuddybobApp.instance.config.current.robot.id

    private fun apiKey(): String =
        BuddybobApp.instance.config.current.appointments.apiKey

    private fun auth(builder: Request.Builder): Request.Builder =
        builder.header("Authorization", "Bearer ${apiKey()}")

    fun isConfigured(): Boolean {
        val c = BuddybobApp.instance.config.current
        return c.robot.id.isNotBlank() &&
            c.appointments.apiKey.isNotBlank() &&
            !c.sync.endpoint.isNullOrBlank()
    }

    fun pollCommands(): List<CommandDto> {
        val req = auth(
            Request.Builder()
                .url("${baseUrl()}/api/robots/${robotId()}/commands")
                .get()
        ).build()
        return execute(req, CommandsResponse::class.java).commands
    }

    fun ackCommand(commandId: String, status: String, error: String? = null) {
        val body = gson.toJson(
            mapOf("status" to status, "error" to error).filterValues { it != null }
        )
        val req = auth(
            Request.Builder()
                .url("${baseUrl()}/api/robots/${robotId()}/commands/$commandId")
                .post(body.toRequestBody(jsonMedia))
        ).build()
        executeRaw(req)
    }

    fun syncPlaces(places: List<PlaceSync>) {
        val body = gson.toJson(mapOf("places" to places))
        val req = auth(
            Request.Builder()
                .url("${baseUrl()}/api/robots/${robotId()}/places")
                .post(body.toRequestBody(jsonMedia))
        ).build()
        executeRaw(req)
    }

    fun fetchPlaceConfigs(): List<PlaceContentStore.Place> {
        val req = auth(
            Request.Builder()
                .url("${baseUrl()}/api/robots/${robotId()}/places")
                .get()
        ).build()
        return execute(req, PlacesConfigResponse::class.java).places.map { it.toStore() }
    }

    private fun PlaceConfigDto.toStore(): PlaceContentStore.Place {
        fun media(d: MediaDto?) =
            d?.url?.trim()?.takeIf { it.isNotBlank() }?.let {
                PlaceContentStore.Media(it, d.contentType)
            }
        return PlaceContentStore.Place(
            name = name,
            label = label,
            speakOnDepart = speakOnDepart,
            speakWhileMoving = speakWhileMoving,
            speakOnArrive = speakOnArrive,
            displayOnDepart = displayOnDepart,
            displayWhileMoving = displayWhileMoving,
            displayOnArrive = displayOnArrive,
            mediaOnDepart = media(mediaOnDepart),
            mediaWhileMoving = media(mediaWhileMoving),
            mediaOnArrive = media(mediaOnArrive),
            waitSeconds = waitSeconds
        )
    }

    fun postHeartbeat(place: String?, activity: String?) {
        val body = gson.toJson(
            mapOf("place" to place, "activity" to activity).filterValues { it != null }
        )
        val req = auth(
            Request.Builder()
                .url("${baseUrl()}/api/robots/${robotId()}/heartbeat")
                .post(body.toRequestBody(jsonMedia))
        ).build()
        executeRaw(req)
    }

    fun postVoice(
        text: String,
        sessionKey: String? = null,
        reset: Boolean = false
    ): VoiceResponse {
        val payload = mutableMapOf<String, Any>("text" to text)
        if (!sessionKey.isNullOrBlank()) payload["sessionKey"] = sessionKey
        if (reset) payload["reset"] = true
        val body = gson.toJson(payload)
        val req = auth(
            Request.Builder()
                .url("${baseUrl()}/api/robots/${robotId()}/voice")
                .post(body.toRequestBody(jsonMedia))
        ).build()
        return execute(req, VoiceResponse::class.java)
    }

    fun listForms(): List<FormDto> {
        val req = auth(
            Request.Builder()
                .url("${baseUrl()}/api/robots/${robotId()}/forms")
                .get()
        ).build()
        return execute(req, FormsResponse::class.java).forms
    }

    fun submitForm(
        formId: String,
        answers: Map<String, String>,
        guestName: String?
    ): SubmitResponse {
        val payload = mutableMapOf<String, Any>("answers" to answers)
        if (!guestName.isNullOrBlank()) payload["guestName"] = guestName
        val req = auth(
            Request.Builder()
                .url("${baseUrl()}/api/robots/${robotId()}/forms/$formId/submissions")
                .post(gson.toJson(payload).toRequestBody(jsonMedia))
        ).build()
        return execute(req, SubmitResponse::class.java)
    }

    fun listInside(): List<VisitDto> {
        val req = auth(
            Request.Builder()
                .url("${baseUrl()}/api/robots/${robotId()}/access")
                .get()
        ).build()
        return execute(req, InsideResponse::class.java).inside
    }

    fun checkIn(firstName: String, lastName: String): CheckInResponse {
        val body = gson.toJson(
            mapOf("firstName" to firstName.trim(), "lastName" to lastName.trim())
        )
        val req = auth(
            Request.Builder()
                .url("${baseUrl()}/api/robots/${robotId()}/access")
                .post(body.toRequestBody(jsonMedia))
        ).build()
        return execute(req, CheckInResponse::class.java)
    }

    fun checkOut(visitId: String): CheckOutResponse {
        val req = auth(
            Request.Builder()
                .url("${baseUrl()}/api/robots/${robotId()}/access/$visitId")
                .patch("{}".toRequestBody(jsonMedia))
        ).build()
        return execute(req, CheckOutResponse::class.java)
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

    private fun executeRaw(request: Request) {
        client.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw ApiException(response.code, text.ifBlank { response.message })
            }
        }
    }

    class ApiException(val code: Int, message: String) : Exception("HTTP $code: $message")
}
