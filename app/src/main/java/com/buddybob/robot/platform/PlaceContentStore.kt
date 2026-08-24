package com.buddybob.robot.platform

class PlaceContentStore {

    data class Media(
        val url: String,
        val contentType: String
    )

    data class Place(
        val name: String,
        val label: String? = null,
        val speakOnDepart: String? = null,
        val speakWhileMoving: String? = null,
        val speakOnArrive: String? = null,
        val displayOnDepart: String? = null,
        val displayWhileMoving: String? = null,
        val displayOnArrive: String? = null,
        val mediaOnDepart: Media? = null,
        val mediaWhileMoving: Media? = null,
        val mediaOnArrive: Media? = null,
        val waitSeconds: Int = 0
    ) {
        fun labelOrName(): String = label?.trim()?.ifBlank { name } ?: name

        fun speakDepart(fallback: String): String =
            speakOnDepart?.trim()?.ifBlank { fallback } ?: fallback

        fun speakArrive(fallback: String): String =
            speakOnArrive?.trim()?.ifBlank { fallback } ?: fallback
    }

    @Volatile
    var byName: Map<String, Place> = emptyMap()
        private set

    fun replaceAll(places: List<Place>) {
        byName = places.associateBy { it.name }
    }

    fun get(name: String): Place? = byName[name]
}
