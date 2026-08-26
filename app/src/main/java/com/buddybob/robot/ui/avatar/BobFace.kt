package com.buddybob.robot.ui.avatar

import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Shader
import kotlin.math.max
import kotlin.math.min

/** Espressioni disponibili sullo schermo di BOB. */
enum class BobExpression { NEUTRAL, HAPPY, SAD, ANGRY, SLEEPY, SURPRISED, FOCUSED }

/**
 * Parametri continui del viso. Essendo numeri, due espressioni si fondono
 * interpolandoli: niente stacchi fra uno stato e l'altro.
 *
 * Le misure sono relative all'occhio/bocca di riferimento presi dall'artwork.
 */
data class FaceParams(
    val eyeW: Float = 1f,
    val eyeH: Float = 1f,
    /** Altezza della calotta superiore, in frazione della larghezza occhio. 0.5 = capsula. */
    val capTop: Float = 0.5f,
    val capBot: Float = 0.5f,
    /** > 0 = angolo esterno alto, angolo interno basso (sguardo arrabbiato). */
    val slant: Float = 0f,
    /** Riflesso chiaro sulla parte alta dell'occhio. */
    val gloss: Float = 1f,
    val eyeDy: Float = 0f,
    val mouthW: Float = 1f,
    val mouthH: Float = 1f,
    val mouthCapTop: Float = 0f,
    val mouthCapBot: Float = 1f,
    val mouthDy: Float = 0f,
    val mouthAlpha: Float = 1f,
) {
    companion object {
        fun of(e: BobExpression): FaceParams = when (e) {
            BobExpression.NEUTRAL -> FaceParams()
            BobExpression.HAPPY -> FaceParams(
                eyeH = 0.94f, mouthW = 1.25f, mouthH = 1.5f, eyeDy = 0.02f
            )
            BobExpression.SAD -> FaceParams(
                eyeH = 0.80f, capTop = 0f, gloss = 0f, eyeDy = 0.06f,
                mouthW = 0.55f, mouthH = 0.38f, mouthCapTop = 0.5f, mouthCapBot = 0.5f,
                mouthDy = 0.022f
            )
            BobExpression.ANGRY -> FaceParams(
                eyeH = 0.84f, capTop = 0f, slant = 0.30f, gloss = 0f, eyeDy = 0.04f,
                mouthW = 0.22f, mouthH = 0.9f, mouthCapTop = 0.5f, mouthCapBot = 0.5f,
                mouthDy = 0.016f
            )
            BobExpression.SLEEPY -> FaceParams(
                eyeH = 0.082f, capTop = 0.05f, capBot = 0.05f, gloss = 0f, eyeDy = 0.30f,
                mouthAlpha = 0f
            )
            BobExpression.SURPRISED -> FaceParams(
                eyeW = 1.12f, eyeH = 1.04f, eyeDy = -0.02f,
                mouthW = 0.5f, mouthH = 2.4f, mouthCapTop = 0.5f, mouthCapBot = 0.5f
            )
            BobExpression.FOCUSED -> FaceParams(
                eyeW = 0.94f, eyeH = 0.88f, capTop = 0.5f,
                mouthW = 0.6f, mouthH = 0.4f, mouthCapTop = 0.5f, mouthCapBot = 0.5f
            )
        }

        fun lerp(a: FaceParams, b: FaceParams, t: Float): FaceParams {
            fun f(x: Float, y: Float) = x + (y - x) * t
            return FaceParams(
                f(a.eyeW, b.eyeW), f(a.eyeH, b.eyeH), f(a.capTop, b.capTop), f(a.capBot, b.capBot),
                f(a.slant, b.slant), f(a.gloss, b.gloss), f(a.eyeDy, b.eyeDy),
                f(a.mouthW, b.mouthW), f(a.mouthH, b.mouthH),
                f(a.mouthCapTop, b.mouthCapTop), f(a.mouthCapBot, b.mouthCapBot),
                f(a.mouthDy, b.mouthDy), f(a.mouthAlpha, b.mouthAlpha),
            )
        }
    }
}

/**
 * Disegna occhi e bocca di BOB sullo schermo della testa.
 *
 * Il canvas arriva già trasformato come la testa (rotazione, scala, offset):
 * qui si lavora in pixel del bitmap `bob_head`, così il viso segue sempre la scocca.
 */
class BobFace {

    var params: FaceParams = FaceParams.of(BobExpression.NEUTRAL)
    /** -1 = guarda a sinistra, +1 a destra. */
    var lookX = 0f
    /** -1 = guarda in alto, +1 in basso. */
    var lookY = 0f
    /** 0 = aperto, 1 = chiuso. */
    var blink = 0f
    /** 0 = bocca a riposo, 1 = massima apertura (usata per il parlato). */
    var mouthOpen = 0f

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = CYAN }
    private val glossPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val path = Path()
    private val glossMatrix = Matrix()
    private val glossShader = LinearGradient(
        0f, 0f, 0f, 1f,
        intArrayOf(HILIGHT, HILIGHT_2, HILIGHT_2 and 0x00FFFFFF),
        floatArrayOf(0f, 0.26f, 0.66f),
        Shader.TileMode.CLAMP
    ).also { glossPaint.shader = it }

    fun draw(c: Canvas, headW: Float, headH: Float) {
        val p = params
        val eyeW = EYE_W * headW * p.eyeW
        val baseH = EYE_H * headH * p.eyeH
        // la palpebra chiude sempre verso il centro dell'occhio
        val eyeH = max(baseH * (1f - blink * 0.945f), eyeW * 0.16f)
        val dx = lookX * headW * LOOK_X
        val dy = lookY * headH * LOOK_Y + p.eyeDy * baseH

        eye(c, EYE_L_CX * headW + dx, EYE_L_CY * headH + dy, eyeW, eyeH, p, outerLeft = true)
        eye(c, EYE_R_CX * headW + dx, EYE_R_CY * headH + dy, eyeW, eyeH, p, outerLeft = false)

        if (p.mouthAlpha > 0.01f) {
            val open = mouthOpen
            val mw = MOUTH_W * headW * (p.mouthW + open * 0.05f)
            val mh = MOUTH_H * headH * (p.mouthH + open * 3.2f)
            val capTop = if (open > 0.02f) mh * (p.mouthCapTop + (0.5f - p.mouthCapTop) * open) else mh * p.mouthCapTop
            val capBot = if (open > 0.02f) mh * (p.mouthCapBot + (0.5f - p.mouthCapBot) * open) else mh * p.mouthCapBot
            fill.alpha = (255 * p.mouthAlpha).toInt()
            blob(
                path, MOUTH_CX * headW + dx * 0.5f,
                MOUTH_CY * headH + p.mouthDy * headH + dy * 0.3f,
                mw, mh, capTop, capBot, 0f, 0f
            )
            c.drawPath(path, fill)
            fill.alpha = 255
        }
    }

    private fun eye(
        c: Canvas, cx: Float, cy: Float, w: Float, h: Float,
        p: FaceParams, outerLeft: Boolean
    ) {
        val slantPx = p.slant * h * (1f - blink)
        val sL = if (outerLeft) 0f else slantPx
        val sR = if (outerLeft) slantPx else 0f
        blob(path, cx, cy, w, h, w * p.capTop, w * p.capBot, sL, sR)
        c.drawPath(path, fill)
        val gloss = p.gloss * (1f - blink)
        if (gloss > 0.02f) {
            glossMatrix.setScale(1f, h)
            glossMatrix.postTranslate(0f, cy - h / 2f)
            glossShader.setLocalMatrix(glossMatrix)
            glossPaint.alpha = (255 * gloss).toInt()
            c.save()
            c.clipPath(path)
            c.drawPath(path, glossPaint)
            c.restore()
        }
    }

    /**
     * Forma base di occhi e bocca: un rettangolo con calotta superiore e inferiore
     * di altezza variabile e il bordo alto eventualmente inclinato.
     * capsula (occhio normale) → capTop = capBot = w/2
     * "U" (occhio triste)      → capTop = 0
     * sorriso                  → capTop = 0, capBot = h
     */
    private fun blob(
        out: Path, cx: Float, cy: Float, w: Float, h: Float,
        capTopIn: Float, capBotIn: Float, slantL: Float, slantR: Float
    ) {
        val hw = w / 2f
        val capTop = min(capTopIn, h / 2f)
        val capBot = min(capBotIn, h / 2f)
        val l = cx - hw
        val r = cx + hw
        val yTL = cy - h / 2f + capTop + slantL
        val yTR = cy - h / 2f + capTop + slantR
        val apexTop = (yTL + yTR) / 2f - capTop
        val yBL = cy + h / 2f - capBot
        val apexBot = cy + h / 2f
        out.reset()
        out.moveTo(l, yTL)
        out.cubicTo(l, yTL - K * capTop, cx - K * hw, apexTop, cx, apexTop)
        out.cubicTo(cx + K * hw, apexTop, r, yTR - K * capTop, r, yTR)
        out.lineTo(r, yBL)
        out.cubicTo(r, yBL + K * capBot, cx + K * hw, apexBot, cx, apexBot)
        out.cubicTo(cx - K * hw, apexBot, l, yBL + K * capBot, l, yBL)
        out.close()
    }

    companion object {
        private const val K = 0.5523f
        const val CYAN = 0xFF00AFEF.toInt()
        private val HILIGHT = 0xFFD3F1FD.toInt()
        private val HILIGHT_2 = 0xFF74D2F6.toInt()

        // posizioni misurate sull'artwork, in frazione del bitmap della testa
        const val EYE_L_CX = 0.28440f
        const val EYE_L_CY = 0.49173f
        const val EYE_R_CX = 0.63670f
        const val EYE_R_CY = 0.48582f
        const val EYE_W = 0.12110f
        const val EYE_H = 0.45626f
        const val MOUTH_CX = 0.44679f
        const val MOUTH_CY = 0.75650f
        const val MOUTH_W = 0.12294f
        const val MOUTH_H = 0.05201f

        /** escursione massima dello sguardo */
        private const val LOOK_X = 0.045f
        private const val LOOK_Y = 0.028f

        // area interna dello schermo (per alone, velo e anello)
        const val SCREEN_L = 0.05138f
        const val SCREEN_T = 0.13002f
        const val SCREEN_R = 0.88807f
        const val SCREEN_B = 0.85816f
    }
}
