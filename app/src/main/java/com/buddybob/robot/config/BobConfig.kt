package com.buddybob.robot.config

/**
 * On-device model of the remote BOB config.
 * Keep in sync with /config/bob-robot-config.schema.json (schemaVersion = 1).
 */
data class BobConfig(
    val schemaVersion: Int = 1,
    val configVersion: Int = 1,
    val updatedAt: String? = null,
    val robot: RobotInfo = RobotInfo(),
    val modules: Modules = Modules(),
    val phrases: Phrases = Phrases(),
    val assets: Assets = Assets(),
    val navigation: Navigation = Navigation(),
    val speech: Speech = Speech(),
    val follow: Follow = Follow(),
    val appointments: Appointments = Appointments(),
    val reception: Reception = Reception(),
    val ui: Ui = Ui(),
    val sync: Sync = Sync()
) {
    data class RobotInfo(
        val id: String = "local",
        val displayName: String = "BOB",
        val locale: String = "it-IT",
        val timezone: String = "Europe/Rome"
    )

    data class Modules(
        val reception: Boolean = true,
        val goTo: Boolean = true,
        val motion: Boolean = true,
        val speech: Boolean = true,
        val follow: Boolean = true,
        val charge: Boolean = false,
        val settings: Boolean = true
    )

    data class Phrases(
        val welcome: String = "Benvenuto",
        val howCanIHelp: String = "Come posso aiutarti?",
        val goingTo: String = "Vado a {place}",
        val arrived: String = "Siamo arrivati a {place}",
        val navigationFailed: String = "Non riesco ad arrivare a {place}",
        val followStarted: String = "Ok, ti seguo",
        val followLost: String = "Ti ho perso di vista",
        val personNotFound: String = "Non vedo nessuno da seguire",
        val goodbye: String = "A presto!",
        val configUpdated: String = "Configurazione aggiornata",
        val configUpdateFailed: String = "Aggiornamento configurazione non riuscito"
    ) {
        fun format(template: String, vararg pairs: Pair<String, String>): String {
            var out = template
            pairs.forEach { (key, value) ->
                out = out.replace("{$key}", value)
            }
            return out
        }
    }

    data class AssetRef(
        val url: String = "",
        val checksum: String? = null,
        val contentType: String? = null
    )

    data class Assets(
        val splash: AssetRef? = null,
        val homeLogo: AssetRef? = null,
        val homeBanner: AssetRef? = null,
        val idleScreen: AssetRef? = null
    )

    data class Navigation(
        val placeFilter: List<String> = emptyList(),
        val placeLabels: Map<String, String> = emptyMap(),
        val speakOnStart: Boolean = true,
        val speakOnArrive: Boolean = true
    )

    data class Speech(
        val enabledOnStart: Boolean = true,
        val continuousRecognition: Boolean = false
    )

    data class Follow(
        val lostTimeoutSec: Int = 8,
        val maxDistanceMeters: Double = 3.0,
        val preferSmartFollow: Boolean = true
    )

    data class Appointments(
        val bookingMode: String = "qr",
        val bookingUrl: String = "http://10.0.2.2:3000/book/bob-demo-001",
        val checkInSpeak: String = "Perfetto, ho avvisato che sei arrivato",
        val callOperatorSpeak: String = "Sto chiamando un operatore",
        val apiKey: String = "bob-demo-api-key"
    )

    data class Reception(
        val cooldownSec: Int = 45,
        val maxDistanceMeters: Double = 3.0,
        val raiseHeadVertical: Int = 35,
        val buttons: List<MenuButton> = defaultMenuButtons(),
        val settingsPin: String = "1234",
        val standbyPlace: String = ""
    )

    data class MenuButton(
        val id: String,
        val label: String,
        val enabled: Boolean = true
    )

    data class Ui(
        val theme: String = "light",
        val showEventLog: Boolean = true,
        val primaryCta: String = "goTo"
    )

    data class Sync(
        val endpoint: String? = "http://10.0.2.2:3000",
        val fetchOnLaunch: Boolean = true
    )

    companion object {
        fun defaultMenuButtons(): List<MenuButton> = listOf(
            MenuButton("goTo", "Vai a…"),
            MenuButton("appointments", "Appuntamenti"),
            MenuButton("documents", "Documenti"),
            MenuButton("talkToMe", "Parla con me"),
            MenuButton("games", "Giochi"),
            MenuButton("callOperator", "Chiama operatore"),
            MenuButton("voiceMemos", "Memo vocali"),
            MenuButton("accessControl", "Controllo accessi")
        )
    }
}
