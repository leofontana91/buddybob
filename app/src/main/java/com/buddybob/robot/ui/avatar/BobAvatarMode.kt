package com.buddybob.robot.ui.avatar

/**
 * Stati dell'avatar BOB sincronizzati con accoglienza, voce e navigazione.
 */
enum class BobAvatarMode {
    /** Nessuno davanti: ciclo dorme / bussa / sbircia. */
    IDLE_SLEEP,
    IDLE_KNOCK,
    IDLE_PEEK,
    /** Ospite rilevato o tap simulato. */
    GREETING,
    /** Menu accoglienza visibile. */
    MENU,
    /** Wake word / sessione vocale attiva. */
    LISTENING,
    /** Richiesta al cloud in corso. */
    THINKING,
    /** TTS in riproduzione. */
    SPEAKING,
    /** Robot in navigazione. */
    MOVING,
    /** Ostacolo: non riesce a passare. */
    BLOCKED,
    /** Azione completata con successo. */
    SUCCESS,
}
