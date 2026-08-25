package com.buddybob.robot.platform

import com.buddybob.robot.BuddybobApp
import com.google.gson.Gson
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.util.concurrent.TimeUnit

/** Upload memo vocali verso la piattaforma (+ trascrizione server). */
class VoiceMemosApi {

    private val gson = Gson()
    private val client = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .writeTimeout(90, TimeUnit.SECONDS)
        .build()
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    data class StartResponse(
        val ok: Boolean = false,
        val objectPath: String? = null,
        val uploadUrl: String? = null,
        val token: String? = null,
        val contentType: String? = null,
        val error: String? = null
    )

    data class CompleteResponse(
        val ok: Boolean = false,
        val id: String? = null,
        val audioUrl: String? = null,
        val transcript: String? = null,
        val status: String? = null,
        val speak: String? = null,
        val error: String? = null
    )

    data class MemoDto(
        val id: String = "",
        val audioUrl: String? = null,
        val transcript: String? = null,
        val status: String? = null,
        val durationMs: Long? = null,
        val createdAt: String? = null
    )

    data class ListResponse(
        val memos: List<MemoDto> = emptyList()
    )

    private fun baseUrl(): String {
        val cfg = BuddybobApp.instance.config.current
        return (cfg.sync.endpoint ?: "http://10.0.2.2:3000").trimEnd('/')
    }

    private fun robotId(): String = BuddybobApp.instance.config.current.robot.id

    private fun apiKey(): String =
        BuddybobApp.instance.config.current.appointments.apiKey

    fun listRecent(limit: Int = 15): ListResponse {
        val req = Request.Builder()
            .url("${baseUrl()}/api/robots/${robotId()}/voice-memos?limit=$limit")
            .header("Authorization", "Bearer ${apiKey()}")
            .get()
            .build()
        return client.newCall(req).execute().use { resp ->
            val raw = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) {
                throw IllegalStateException("list ${resp.code}: ${raw.take(200)}")
            }
            gson.fromJson(raw, ListResponse::class.java)
        }
    }

    fun uploadAndTranscribe(file: File, contentType: String, durationMs: Long): CompleteResponse {
        val startBody = gson.toJson(
            mapOf(
                "fileName" to file.name,
                "contentType" to contentType,
                "size" to file.length(),
                "durationMs" to durationMs
            )
        ).toRequestBody(jsonMedia)

        val startReq = Request.Builder()
            .url("${baseUrl()}/api/robots/${robotId()}/voice-memos/start")
            .header("Authorization", "Bearer ${apiKey()}")
            .post(startBody)
            .build()

        val start = client.newCall(startReq).execute().use { resp ->
            val raw = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) {
                throw IllegalStateException("start ${resp.code}: ${raw.take(200)}")
            }
            gson.fromJson(raw, StartResponse::class.java)
        }

        val uploadUrl = start.uploadUrl?.trim().orEmpty()
        val objectPath = start.objectPath?.trim().orEmpty()
        if (uploadUrl.isEmpty() || objectPath.isEmpty()) {
            throw IllegalStateException(start.error ?: "Upload URL mancante")
        }

        var putUrl = uploadUrl
        val token = start.token?.trim().orEmpty()
        if (token.isNotEmpty() && !putUrl.contains("token=")) {
            putUrl += if (putUrl.contains("?")) "&" else "?"
            putUrl += "token=${java.net.URLEncoder.encode(token, "UTF-8")}"
        }

        val putReq = Request.Builder()
            .url(putUrl)
            .header("Content-Type", contentType)
            .put(file.asRequestBody(contentType.toMediaType()))
            .build()
        client.newCall(putReq).execute().use { resp ->
            if (!resp.isSuccessful) {
                val raw = resp.body?.string().orEmpty()
                throw IllegalStateException("upload ${resp.code}: ${raw.take(200)}")
            }
        }

        val completeBody = gson.toJson(
            mapOf(
                "objectPath" to objectPath,
                "contentType" to contentType,
                "durationMs" to durationMs,
                "fileName" to file.name
            )
        ).toRequestBody(jsonMedia)

        val completeReq = Request.Builder()
            .url("${baseUrl()}/api/robots/${robotId()}/voice-memos/complete")
            .header("Authorization", "Bearer ${apiKey()}")
            .post(completeBody)
            .build()

        return client.newCall(completeReq).execute().use { resp ->
            val raw = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) {
                throw IllegalStateException("complete ${resp.code}: ${raw.take(200)}")
            }
            gson.fromJson(raw, CompleteResponse::class.java)
        }
    }
}
