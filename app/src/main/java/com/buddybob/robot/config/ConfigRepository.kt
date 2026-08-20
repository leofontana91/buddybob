package com.buddybob.robot.config

import android.content.Context
import android.util.Log
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import java.io.File

/**
 * Loads / caches BOB config.
 * Priority: pairing overlay on cache/assets → local cache → assets → defaults.
 */
class ConfigRepository(private val context: Context) {

    private val gson: Gson = GsonBuilder().setPrettyPrinting().create()
    private val cacheFile: File
        get() = File(context.filesDir, CACHE_FILE)
    private val pairingFile: File
        get() = File(context.filesDir, PAIRING_FILE)

    @Volatile
    var current: BobConfig = BobConfig()
        private set

    @Volatile
    var pairing: RobotPairing? = null
        private set

    fun load(): BobConfig {
        pairing = readPairing()
        val base = readCache() ?: readAssets() ?: BobConfig()
        current = applyPairing(base, pairing)
        Log.i(
            TAG,
            "Loaded config v${current.configVersion} robot=${current.robot.id} paired=${pairing != null}"
        )
        return current
    }

    fun phraseGoingTo(place: String): String {
        val p = current.phrases
        return p.format(p.goingTo, "place" to place)
    }

    fun placeLabel(mapName: String): String {
        return current.navigation.placeLabels[mapName] ?: mapName
    }

    fun filterPlaces(mapNames: List<String>): List<String> {
        val filter = current.navigation.placeFilter
        return if (filter.isEmpty()) mapNames else mapNames.filter { it in filter }
    }

    fun saveLocal(config: BobConfig) {
        cacheFile.writeText(gson.toJson(config))
        current = applyPairing(config, pairing)
        Log.i(TAG, "Saved config v${config.configVersion}")
    }

    /** Persist robot association from Super Admin QR / manual form. */
    fun savePairing(p: RobotPairing): BobConfig {
        require(p.endpoint.isNotBlank() && p.robotId.isNotBlank() && p.apiKey.isNotBlank()) {
            "endpoint, robotId e apiKey sono obbligatori"
        }
        val normalized = p.copy(
            endpoint = p.endpoint.trim().trimEnd('/'),
            robotId = p.robotId.trim(),
            apiKey = p.apiKey.trim(),
            bookingUrl = p.bookingUrl?.trim()?.ifBlank { null }
        )
        pairingFile.writeText(gson.toJson(normalized))
        pairing = normalized
        val base = readCache() ?: readAssets() ?: BobConfig()
        current = applyPairing(base, normalized)
        // Persist merged config so APIs keep working after restart
        cacheFile.writeText(gson.toJson(current))
        Log.i(TAG, "Pairing saved robot=${normalized.robotId}")
        return current
    }

    fun clearPairing() {
        if (pairingFile.exists()) pairingFile.delete()
        pairing = null
        current = readCache() ?: readAssets() ?: BobConfig()
        Log.i(TAG, "Pairing cleared")
    }

    fun isPaired(): Boolean = pairing != null

    fun parsePairingJson(raw: String): RobotPairing {
        val trimmed = raw.trim()
        val p = gson.fromJson(trimmed, RobotPairing::class.java)
            ?: throw IllegalArgumentException("JSON non valido")
        if (p.endpoint.isBlank() || p.robotId.isBlank() || p.apiKey.isBlank()) {
            throw IllegalArgumentException("Mancano endpoint, robotId o apiKey")
        }
        return p
    }

    fun refreshFromNetwork(): RefreshResult {
        return RefreshResult.NotImplemented(
            "Usa Impostazioni → Aggiorna, oppure pairing QR."
        )
    }

    private fun applyPairing(base: BobConfig, p: RobotPairing?): BobConfig {
        if (p == null) return base
        val booking =
            p.bookingUrl?.takeIf { it.isNotBlank() }
                ?: "${p.endpoint.trimEnd('/')}/book/${p.robotId}"
        return base.copy(
            robot = base.robot.copy(id = p.robotId),
            sync = base.sync.copy(endpoint = p.endpoint),
            appointments = base.appointments.copy(
                apiKey = p.apiKey,
                bookingUrl = booking
            )
        )
    }

    private fun readPairing(): RobotPairing? {
        return try {
            if (!pairingFile.exists()) return null
            gson.fromJson(pairingFile.readText(), RobotPairing::class.java)
        } catch (e: Exception) {
            Log.w(TAG, "pairing parse failed", e)
            null
        }
    }

    private fun readCache(): BobConfig? {
        return try {
            if (!cacheFile.exists()) return null
            gson.fromJson(cacheFile.readText(), BobConfig::class.java)
        } catch (e: Exception) {
            Log.w(TAG, "cache parse failed", e)
            null
        }
    }

    private fun readAssets(): BobConfig? {
        return try {
            context.assets.open(ASSET_FILE).bufferedReader().use { reader ->
                gson.fromJson(reader, BobConfig::class.java)
            }
        } catch (e: Exception) {
            Log.w(TAG, "assets parse failed", e)
            null
        }
    }

    sealed class RefreshResult {
        data class Updated(val config: BobConfig) : RefreshResult()
        data class Unchanged(val configVersion: Int) : RefreshResult()
        data class Failed(val message: String) : RefreshResult()
        data class NotImplemented(val message: String) : RefreshResult()
    }

    companion object {
        private const val TAG = "ConfigRepository"
        private const val CACHE_FILE = "bob-config.json"
        private const val PAIRING_FILE = "robot-pairing.json"
        private const val ASSET_FILE = "bob-config.json"
    }
}
