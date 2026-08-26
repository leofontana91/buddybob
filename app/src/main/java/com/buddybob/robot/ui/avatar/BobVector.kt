package com.buddybob.robot.ui.avatar

import android.content.Context
import android.graphics.Color
import android.graphics.Path
import com.buddybob.robot.R
import org.json.JSONObject

/**
 * Una forma piatta dell'artwork: un colore, il suo path pronto da disegnare e i
 * comandi grezzi, che servono a ricostruirlo deformato quando il braccio si piega.
 */
class VecShape(val color: Int, val path: Path, val cmds: ByteArray, val pts: FloatArray) {

    /** Ricostruisce il path applicando a ogni punto la trasformazione [warp]. */
    fun rebuild(out: Path, warp: (Float, Float, FloatArray) -> Unit, tmp: FloatArray) {
        out.reset()
        out.fillType = Path.FillType.EVEN_ODD
        var i = 0
        for (c in cmds) {
            when (c.toInt()) {
                M -> { warp(pts[i], pts[i + 1], tmp); out.moveTo(tmp[0], tmp[1]); i += 2 }
                L -> { warp(pts[i], pts[i + 1], tmp); out.lineTo(tmp[0], tmp[1]); i += 2 }
                C -> {
                    warp(pts[i], pts[i + 1], tmp); val x1 = tmp[0]; val y1 = tmp[1]
                    warp(pts[i + 2], pts[i + 3], tmp); val x2 = tmp[0]; val y2 = tmp[1]
                    warp(pts[i + 4], pts[i + 5], tmp)
                    out.cubicTo(x1, y1, x2, y2, tmp[0], tmp[1]); i += 6
                }
                else -> out.close()
            }
        }
    }

    companion object {
        const val M = 0
        const val L = 1
        const val C = 2
        const val Z = 3
    }
}

/** Una parte del pupazzo, in coordinate proprie. */
class VecPart(
    val w: Float,
    val h: Float,
    val shapes: List<VecShape>,
    /** Solo per la testa: il vetro dello schermo, usato come maschera esatta. */
    val screen: Path?,
)

/**
 * Dove sta una parte sulla tela del rig, in frazioni, con il suo perno.
 * [socketR] e' il raggio del disco d'innesto: un cerchio centrato sul perno,
 * che ruotando non si sposta e resta quindi sempre coperto dal pezzo vicino.
 */
class PartRect(
    val x: Float, val y: Float, val w: Float, val h: Float,
    val pivotX: Float, val pivotY: Float,
    val wristX: Float, val wristY: Float,
    val socketR: Float, val mirrorX: Float,
)

class RigLayout(val canvasW: Float, val canvasH: Float, private val rects: Map<String, PartRect>) {
    operator fun get(part: String): PartRect = rects.getValue(part)
    fun has(part: String) = rects.containsKey(part)
}

/**
 * Carica BOB vettoriale da res/raw/bob_vector.json.
 *
 * Ogni pezzo e' una forma chiusa col proprio contorno: si sovrappone al vicino
 * invece di accostarglisi, quindi nessuna posa puo' aprire una fessura.
 */
object BobVector {

    @Volatile private var cache: Map<String, VecPart>? = null
    @Volatile private var layoutCache: RigLayout? = null

    fun layout(context: Context): RigLayout {
        parts(context)
        return layoutCache!!
    }

    fun parts(context: Context): Map<String, VecPart> {
        cache?.let { return it }
        synchronized(this) {
            cache?.let { return it }
            val text = context.applicationContext.resources
                .openRawResource(R.raw.bob_vector)
                .bufferedReader()
                .use { it.readText() }
            val json = JSONObject(text)
            layoutCache = readLayout(json)
            val root = json.getJSONObject("parts")
            val out = HashMap<String, VecPart>(root.length())
            val names = root.keys()
            while (names.hasNext()) {
                val name = names.next()
                val p = root.getJSONObject(name)
                val arr = p.getJSONArray("shapes")
                val shapes = ArrayList<VecShape>(arr.length())
                for (i in 0 until arr.length()) {
                    val s = arr.getJSONObject(i)
                    shapes.add(build(Color.parseColor(s.getString("c")), s.getString("d")))
                }
                out[name] = VecPart(
                    p.getDouble("w").toFloat(),
                    p.getDouble("h").toFloat(),
                    shapes,
                    if (p.has("screen")) build(0, p.getString("screen")).path else null,
                )
            }
            cache = out
            return out
        }
    }

    private fun readLayout(json: JSONObject): RigLayout {
        val canvas = json.getJSONArray("canvas")
        val arr = json.getJSONArray("layers")
        val rects = HashMap<String, PartRect>(arr.length())
        for (i in 0 until arr.length()) {
            val l = arr.getJSONObject(i)
            fun f(k: String, d: Double = 0.0) = (if (l.has(k)) l.getDouble(k) else d).toFloat()
            fun pair(k: String, i0: Int, d: Double) =
                if (l.has(k)) l.getJSONArray(k).getDouble(i0).toFloat() else d.toFloat()
            rects[l.getString("name")] = PartRect(
                f("x"), f("y"), f("w"), f("h"),
                pair("pivot", 0, 0.5), pair("pivot", 1, 0.1),
                pair("wrist", 0, 0.5), pair("wrist", 1, 0.9),
                f("socket_r"), f("mirror_x"),
            )
        }
        return RigLayout(canvas.getDouble(0).toFloat(), canvas.getDouble(1).toFloat(), rects)
    }

    /**
     * Parser minimo per i path generati dal tracciamento: solo M, L, C e Z,
     * tutti assoluti. Niente dipendenze e nessuna sorpresa di formato.
     */
    private fun build(color: Int, d: String): VecShape {
        val path = Path()
        path.fillType = Path.FillType.EVEN_ODD
        val cmds = ByteArray(d.length / 4 + 4)
        val pts = FloatArray(d.length / 2 + 8)
        var nc = 0
        var np = 0
        val v = FloatArray(6)
        val n = d.length
        var i = 0
        while (i < n) {
            val c = d[i]
            if (c == ' ') { i++; continue }
            i++
            if (c == 'Z') { path.close(); cmds[nc++] = VecShape.Z.toByte(); continue }
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
                'M' -> { path.moveTo(v[0], v[1]); cmds[nc++] = VecShape.M.toByte() }
                'L' -> { path.lineTo(v[0], v[1]); cmds[nc++] = VecShape.L.toByte() }
                else -> { path.cubicTo(v[0], v[1], v[2], v[3], v[4], v[5]); cmds[nc++] = VecShape.C.toByte() }
            }
            for (j in 0 until count) pts[np++] = v[j]
        }
        return VecShape(color, path, cmds.copyOf(nc), pts.copyOf(np))
    }
}
