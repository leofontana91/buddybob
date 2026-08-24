package com.buddybob.robot.platform

/**
 * Wake word "bob": i comandi vocali partono solo dopo averlo sentito
 * (nella stessa frase o in una finestra successiva).
 */
object WakeWord {
    private val WAKE = Regex("""\bbob\b""", RegexOption.IGNORE_CASE)

    fun contains(text: String): Boolean = WAKE.containsMatchIn(text.trim())

    /** Solo la wake word (eventuali interiezioni corte). */
    fun isOnlyWake(text: String): Boolean {
        val stripped = strip(text)
        return contains(text) && stripped.length < 2
    }

    fun strip(text: String): String =
        text
            .replace(WAKE, " ")
            .replace(Regex("""[,\.!?;:]+"""), " ")
            .replace(Regex("""\s+"""), " ")
            .trim()
}
