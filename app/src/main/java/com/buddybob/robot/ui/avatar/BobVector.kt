package com.buddybob.robot.ui.avatar

import android.content.Context
import android.graphics.Color
import android.graphics.Path
import com.buddybob.robot.R
import org.json.JSONObject

/** Una forma piatta dell'artwork: un colore e il suo contorno. */
class VecShape(val color: Int, val path: Path)

/**
 * Una parte del personaggio (testa, corpo, braccio, ombra) in coordinate proprie.
 * [w] e [h] sono la dimensione di riferimento: tutto il resto del rig ragiona
 * in frazioni di queste, quindi le pose restano identiche a prima.
 */
class VecPart(
    val w: Float,
    val h: Float,
    val shapes: List<VecShape>,
    /** Solo per la testa: il vetro dello schermo, usato come maschera esatta. */
    val screen: Path?,
)

/**
 * Carica BOB vettoriale da res/raw/bob_vector.json.
 *
 * Le forme sono tracciate dall'artwork originale e ordinate dal fondo in avanti,
 * ognuna sull'unione di sé e di quelle che le finiscono sopra: disegnandole in
 * ordine non restano fessure fra un colore e l'altro.
 */
object BobVector {

    @Volatile
    private var cache: Map<String, VecPart>? = null

    fun parts(context: Context): Map<String, VecPart> {
        cache?.let { return it }
        synchronized(this) {
            cache?.let { return it }
            val text = context.applicationContext.resources
                .openRawResource(R.raw.bob_vector)
                .bufferedReader()
                .use { it.readText() }
            val root = JSONObject(text).getJSONObject("parts")
            val out = HashMap<String, VecPart>(root.length())
            val names = root.keys()
            while (names.hasNext()) {
                val name = names.next()
                val p = root.getJSONObject(name)
                val arr = p.getJSONArray("shapes")
                val shapes = ArrayList<VecShape>(arr.length())
                for (i in 0 until arr.length()) {
                    val s = arr.getJSONObject(i)
                    shapes.add(VecShape(Color.parseColor(s.getString("c")), parse(s.getString("d"))))
                }
                out[name] = VecPart(
                    p.getDouble("w").toFloat(),
                    p.getDouble("h").toFloat(),
                    shapes,
                    if (p.has("screen")) parse(p.getString("screen")) else null,
                )
            }
            cache = out
            return out
        }
    }

    /**
     * Parser minimo per i path generati dal tracciamento: solo M, L, C e Z,
     * tutti assoluti. Niente dipendenze e nessuna sorpresa di formato.
     */
    fun parse(d: String): Path {
        val path = Path()
        path.fillType = Path.FillType.EVEN_ODD
        val n = d.length
        var i = 0
        val v = FloatArray(6)
        while (i < n) {
            val c = d[i]
            if (c == ' ') { i++; continue }
            i++
            when (c) {
                'M', 'L', 'C' -> {
                    val count = if (c == 'C') 6 else 2
                    var k = 0
                    while (k < count) {
                        while (i < n && d[i] == ' ') i++
                        val start = i
                        while (i < n && d[i] != ' ') i++
                        v[k] = java.lang.Float.parseFloat(d.substring(start, i))
                        k++
                    }
                    when (c) {
                        'M' -> path.moveTo(v[0], v[1])
                        'L' -> path.lineTo(v[0], v[1])
                        else -> path.cubicTo(v[0], v[1], v[2], v[3], v[4], v[5])
                    }
                }
                'Z' -> path.close()
            }
        }
        return path
    }
}
