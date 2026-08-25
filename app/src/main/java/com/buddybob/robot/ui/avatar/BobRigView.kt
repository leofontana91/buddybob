package com.buddybob.robot.ui.avatar

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.os.SystemClock
import android.util.AttributeSet
import android.view.View
import kotlin.math.abs
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

/**
 * BOB a livelli separati, interamente vettoriale: ombra, braccia, corpo, scocca
 * della testa e viso sono tutti path disegnati su Canvas, tracciati dall'artwork
 * originale. Niente bitmap: resta nitido a qualsiasi dimensione, si deforma senza
 * sgranarsi e i colori si possono cambiare a runtime.
 *
 * La vita "di base" (respiro, oscillazione, battito di palpebre, sguardo) è
 * procedurale e gira sempre. Gli stati (saluto, ascolto, pensiero…) muovono le
 * proprietà pubbliche di posa, che si sommano al movimento di base.
 */
class BobRigView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val parts = BobVector.parts(context)
    private val partHead = parts[P_HEAD]
    private val partBody = parts[P_BODY]
    private val partArm = parts[P_ARM]
    private val partShadow = parts[P_SHADOW]

    // ---------------------------------------------------------------- posa
    /** Traslazione verticale del personaggio, in frazione dell'altezza. */
    var poseDy = 0f
        set(v) { field = v; invalidate() }
    var poseScale = 1f
        set(v) { field = v; invalidate() }
    /** >0 schiaccia sui piedi, <0 allunga. Essendo vettoriale non sgrana mai. */
    var poseSquash = 0f
        set(v) { field = v; invalidate() }
    var headTilt = 0f
        set(v) { field = v; invalidate() }
    var headDx = 0f
        set(v) { field = v; invalidate() }
    var headDy = 0f
        set(v) { field = v; invalidate() }
    /** Gradi di rotazione del braccio attorno alla spalla; positivo = alza verso l'esterno. */
    var armLeft = 0f
        set(v) { field = v; invalidate() }
    var armRight = 0f
        set(v) { field = v; invalidate() }
    /** Alone azzurro sul vetro. */
    var glow = 0f
        set(v) { field = v; invalidate() }
    /** Velo scuro (schermo spento / sonno). */
    var veil = 0f
        set(v) { field = v; invalidate() }
    /** Anello pulsante attorno allo schermo (ascolto). */
    var ring = 0f
        set(v) { field = v; invalidate() }
    /** Quanto colora il vetro, 0..1. */
    var tint = 0f
        set(v) { field = v; invalidate() }
    /** Colore del vetro quando [tint] > 0. */
    var tintColor = 0xFF0E6E9C.toInt()
        set(v) { field = v; invalidate() }
    /** Riflesso che attraversa il vetro, 0..1 = posizione della sciabolata. */
    var sheen = 0f
        set(v) { field = v; invalidate() }
    /** Ampiezza del respiro di base: 0 lo spegne. */
    var breathAmp = 1f

    // ---------------------------------------------------------------- viso
    private val face = BobFace()
    private var paramsFrom = FaceParams.of(BobExpression.NEUTRAL)
    private var paramsTo = paramsFrom
    private var paramsT = 1f
    private var paramsAnim: ValueAnimator? = null

    var currentExpression: BobExpression = BobExpression.NEUTRAL
        private set

    private var lookTargetX = 0f
    private var lookTargetY = 0f
    private var lookX = 0f
    private var lookY = 0f

    /** Livello audio 0..1 per il lip-sync; se non arriva, il parlato è procedurale. */
    var audioLevel = 0f
        set(v) { field = v; lastAudioAt = SystemClock.uptimeMillis() }
    private var lastAudioAt = 0L
    var speaking = false
    private var mouth = 0f

    private var blink = 0f
    private var blinkStartedAt = 0L
    private var nextBlinkAt = 0L
    private var pendingDouble = false
    private val rnd = Random(0xB0B)

    private val t0 = SystemClock.uptimeMillis()
    private var clock: ValueAnimator? = null

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val overlay = Paint(Paint.ANTI_ALIAS_FLAG)
    private val m = Matrix()
    private val shaderMatrix = Matrix()
    private val screenBounds = RectF()
    private val fallbackScreenPath = Path()
    private var glowShader: RadialGradient? = null
    private var sheenShader: LinearGradient? = null
    private var shadersFor = 0f

    init {
        scheduleBlink(SystemClock.uptimeMillis())
    }

    // ---------------------------------------------------------------- API

    fun setExpression(e: BobExpression, animated: Boolean = true) {
        if (e == currentExpression) return
        currentExpression = e
        val target = FaceParams.of(e)
        paramsAnim?.cancel()
        if (!animated) {
            paramsFrom = target; paramsTo = target; paramsT = 1f; invalidate(); return
        }
        paramsFrom = currentParams()
        paramsTo = target
        paramsT = 0f
        paramsAnim = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 260L
            addUpdateListener { paramsT = it.animatedValue as Float; invalidate() }
            start()
        }
    }

    /** Sguardo verso un punto: (0,0) = dritto davanti, (1,1) = in basso a destra. */
    fun lookAt(x: Float, y: Float) {
        lookTargetX = x.coerceIn(-1f, 1f)
        lookTargetY = y.coerceIn(-1f, 1f)
    }

    fun lookCenter() = lookAt(0f, 0f)

    /** Fa battere le palpebre subito (utile come reazione a un tocco). */
    fun blinkNow() {
        val now = SystemClock.uptimeMillis()
        blinkStartedAt = now
        nextBlinkAt = now + BLINK_TOTAL
    }

    private fun currentParams(): FaceParams =
        if (paramsT >= 1f) paramsTo else FaceParams.lerp(paramsFrom, paramsTo, paramsT)

    // ---------------------------------------------------------------- ciclo di vita

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        startClock()
    }

    override fun onDetachedFromWindow() {
        clock?.cancel(); clock = null
        paramsAnim?.cancel()
        super.onDetachedFromWindow()
    }

    override fun onVisibilityChanged(changedView: View, visibility: Int) {
        super.onVisibilityChanged(changedView, visibility)
        if (visibility == VISIBLE && isAttachedToWindow) startClock() else { clock?.cancel(); clock = null }
    }

    private fun startClock() {
        if (clock != null) return
        clock = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 1000L
            repeatCount = ValueAnimator.INFINITE
            addUpdateListener { invalidate() }
            start()
        }
    }

    // ---------------------------------------------------------------- disegno

    override fun onDraw(canvas: Canvas) {
        val head = partHead ?: return
        val body = partBody ?: return
        val arm = partArm ?: return

        val now = SystemClock.uptimeMillis()
        val t = (now - t0) / 1000f
        tickLife(now, t)

        val s = min(width / CANVAS_W, height / CANVAS_H) * poseScale
        val ox = (width - CANVAS_W * s) / 2f
        val oy = (height - CANVAS_H * s) / 2f

        val breath = sin(t * TWO_PI / BREATH_PERIOD) * breathAmp
        val sway = sin(t * TWO_PI / SWAY_PERIOD) * breathAmp
        val dy = poseDy - breath * 0.006f
        val squash = poseSquash - breath * 0.012f
        val lift = -dy

        val pivotX = ox + NECK_X * CANVAS_W * s
        val feetY = oy + (FEET_Y + dy) * CANVAS_H * s

        // ---- ombra: si stringe quando BOB si alza
        partShadow?.let { sh ->
            val k = (1f - lift * 1.6f).coerceIn(0.55f, 1.25f)
            place(m, sh, SHADOW_X, SHADOW_Y, SHADOW_W, SHADOW_H, false, s, ox, oy)
            m.postScale(k, k, ox + (SHADOW_X + SHADOW_W / 2f) * CANVAS_W * s,
                oy + (SHADOW_Y + SHADOW_H / 2f) * CANVAS_H * s)
            paint.alpha = (255 * (1f - lift * 2.2f).coerceIn(0.35f, 1f)).toInt()
            drawPart(canvas, sh, m)
            paint.alpha = 255
        }

        // ---- braccia: ruotano attorno alla spalla
        drawArm(canvas, arm, ARM_X, dy, s, ox, oy, armLeft + sway * 1.2f, false)
        drawArm(canvas, arm, ARM_MIRROR_X, dy, s, ox, oy, armRight + sway * 1.2f, true)

        // ---- corpo: schiacciato sui piedi
        place(m, body, BODY_X, BODY_Y + dy, BODY_W, BODY_H, false, s, ox, oy)
        m.postScale(1f + squash * 0.5f, 1f - squash, ox + (BODY_X + BODY_W / 2f) * CANVAS_W * s, feetY)
        drawPart(canvas, body, m)

        // ---- testa: inclina attorno al collo, poi vetro e viso
        val neckY = oy + (NECK_Y + dy) * CANVAS_H * s
        place(m, head, HEAD_X + headDx, HEAD_Y + dy * 1.15f + headDy, HEAD_W, HEAD_H, false, s, ox, oy)
        m.postRotate(headTilt + sway * 0.6f, pivotX, neckY)
        m.postScale(1f - squash * 0.35f, 1f + squash * 0.25f, pivotX, neckY)

        canvas.save()
        canvas.concat(m)
        for (sh in head.shapes) {
            paint.color = sh.color
            canvas.drawPath(sh.path, paint)
        }
        drawScreen(canvas, head)
        canvas.restore()
    }

    /** Matrice che porta le coordinate proprie della parte sulla tela del rig. */
    private fun place(
        out: Matrix, part: VecPart,
        fx: Float, fy: Float, fw: Float, fh: Float,
        mirror: Boolean, s: Float, ox: Float, oy: Float
    ) {
        val w = fw * CANVAS_W * s
        val h = fh * CANVAS_H * s
        out.reset()
        if (mirror) {
            out.setScale(-w / part.w, h / part.h)
            out.postTranslate(ox + fx * CANVAS_W * s + w, oy + fy * CANVAS_H * s)
        } else {
            out.setScale(w / part.w, h / part.h)
            out.postTranslate(ox + fx * CANVAS_W * s, oy + fy * CANVAS_H * s)
        }
    }

    private fun drawPart(c: Canvas, part: VecPart, matrix: Matrix) {
        c.save()
        c.concat(matrix)
        for (s in part.shapes) {
            val a = paint.alpha
            paint.color = s.color
            paint.alpha = a
            c.drawPath(s.path, paint)
        }
        c.restore()
    }

    private fun drawArm(
        c: Canvas, arm: VecPart, xFrac: Float, dy: Float, s: Float,
        ox: Float, oy: Float, deg: Float, mirror: Boolean
    ) {
        val w = ARM_W * CANVAS_W * s
        val h = ARM_H * CANVAS_H * s
        val left = ox + xFrac * CANVAS_W * s
        val top = oy + (ARM_Y + dy) * CANVAS_H * s
        val px = left + (if (mirror) 1f - ARM_PIVOT_X else ARM_PIVOT_X) * w
        val py = top + ARM_PIVOT_Y * h
        place(m, arm, xFrac, ARM_Y + dy, ARM_W, ARM_H, mirror, s, ox, oy)
        m.postRotate(if (mirror) -deg else deg, px, py)
        drawPart(c, arm, m)
    }

    /**
     * Velo, tinta, alone, riflesso, anello e viso: tutto ritagliato sul path
     * esatto del vetro, quindi resta dentro la cornice a ogni inclinazione.
     */
    private fun drawScreen(c: Canvas, head: VecPart) {
        val hw = head.w
        val hh = head.h
        val screen = head.screen ?: fallbackScreen(hw, hh)
        screen.computeBounds(screenBounds, true)

        if (veil > 0.01f) {
            overlay.shader = null
            overlay.color = 0xFF11161C.toInt()
            overlay.alpha = (205 * veil).toInt()
            c.drawPath(screen, overlay)
        }

        if (tint > 0.01f) {
            overlay.shader = null
            overlay.color = tintColor
            overlay.alpha = (190 * tint).toInt()
            c.drawPath(screen, overlay)
        }

        ensureShaders(hw)

        if (glow > 0.01f) {
            overlay.shader = glowShader
            overlay.alpha = (255 * glow).toInt()
            c.drawPath(screen, overlay)
            overlay.shader = null
        }

        face.params = currentParams()
        face.lookX = lookX
        face.lookY = lookY
        face.blink = blink
        face.mouthOpen = mouth
        c.save()
        c.clipPath(screen)
        face.draw(c, hw, hh)

        if (sheen > 0.001f) {
            shaderMatrix.setTranslate((sheen * 2.2f - 0.6f) * screenBounds.width(), 0f)
            shaderMatrix.postRotate(-18f, screenBounds.centerX(), screenBounds.centerY())
            sheenShader?.setLocalMatrix(shaderMatrix)
            overlay.shader = sheenShader
            overlay.alpha = 255
            c.drawPath(screen, overlay)
            overlay.shader = null
        }
        c.restore()

        if (ring > 0.01f) {
            val grow = (1f - ring) * hw * 0.05f
            overlay.shader = null
            overlay.color = BobFace.CYAN
            overlay.alpha = (190 * ring).toInt()
            overlay.style = Paint.Style.STROKE
            overlay.strokeWidth = hw * 0.016f
            c.save()
            c.scale(1f + grow / hw, 1f + grow / hh, screenBounds.centerX(), screenBounds.centerY())
            c.drawPath(screen, overlay)
            c.restore()
            overlay.style = Paint.Style.FILL
        }
    }

    private fun ensureShaders(hw: Float) {
        if (shadersFor == hw && glowShader != null) return
        shadersFor = hw
        glowShader = RadialGradient(
            screenBounds.centerX(), screenBounds.centerY(), screenBounds.width() * 0.62f,
            intArrayOf(0x8000AFEF.toInt(), 0x3300AFEF, 0x0000AFEF),
            floatArrayOf(0f, 0.55f, 1f), Shader.TileMode.CLAMP
        )
        sheenShader = LinearGradient(
            screenBounds.left, 0f, screenBounds.left + screenBounds.width() * 0.42f, 0f,
            intArrayOf(0x00FFFFFF, 0x30FFFFFF, 0x00FFFFFF),
            floatArrayOf(0f, 0.5f, 1f), Shader.TileMode.CLAMP
        )
    }

    /** Se il path del vetro mancasse, si ripiega sul rettangolo misurato sull'artwork. */
    private fun fallbackScreen(hw: Float, hh: Float): Path {
        if (fallbackScreenPath.isEmpty) {
            val r = hw * 0.085f
            fallbackScreenPath.addRoundRect(
                BobFace.SCREEN_L * hw, BobFace.SCREEN_T * hh,
                BobFace.SCREEN_R * hw, BobFace.SCREEN_B * hh, r, r, Path.Direction.CW
            )
        }
        return fallbackScreenPath
    }

    // ---------------------------------------------------------------- vita procedurale

    private fun tickLife(now: Long, t: Float) {
        // sguardo: insegue il bersaglio con un filo di deriva, così non resta mai fermo
        val driftX = sin(t * 0.41f) * 0.10f + sin(t * 1.07f) * 0.03f
        val driftY = sin(t * 0.29f) * 0.08f
        lookX += (lookTargetX + driftX - lookX) * 0.10f
        lookY += (lookTargetY + driftY - lookY) * 0.10f

        // palpebre: intervallo casuale, mai cadenzato
        if (now >= nextBlinkAt && blinkStartedAt == 0L) {
            blinkStartedAt = now
        }
        if (blinkStartedAt != 0L) {
            val e = now - blinkStartedAt
            blink = when {
                e < BLINK_DOWN -> e / BLINK_DOWN.toFloat()
                e < BLINK_TOTAL -> 1f - (e - BLINK_DOWN) / (BLINK_TOTAL - BLINK_DOWN).toFloat()
                else -> 0f
            }
            if (e >= BLINK_TOTAL) {
                blinkStartedAt = 0L
                blink = 0f
                if (pendingDouble) {
                    pendingDouble = false
                    nextBlinkAt = now + 150L
                } else {
                    scheduleBlink(now)
                }
            }
        }

        // bocca: dal livello audio se arriva, altrimenti sillabe simulate
        val target = when {
            !speaking -> 0f
            now - lastAudioAt < 350L -> audioLevel.coerceIn(0f, 1f)
            else -> (0.34f + 0.38f * sin(t * 13.4f) * abs(sin(t * 6.7f))).coerceIn(0f, 1f)
        }
        mouth += (target - mouth) * if (target > mouth) 0.55f else 0.28f
    }

    private fun scheduleBlink(now: Long) {
        nextBlinkAt = now + 2200L + rnd.nextLong(3600L)
        pendingDouble = rnd.nextFloat() < 0.22f
    }

    companion object {
        private const val P_HEAD = "bob_head"
        private const val P_BODY = "bob_body"
        private const val P_ARM = "bob_arm"
        private const val P_SHADOW = "bob_shadow"

        private const val TWO_PI = 6.2831855f
        private const val BREATH_PERIOD = 3.6f
        private const val SWAY_PERIOD = 7.3f
        private const val BLINK_DOWN = 70L
        private const val BLINK_TOTAL = 165L

        // geometria del rig, in frazioni della tela originale 568x820
        private const val CANVAS_W = 568f
        private const val CANVAS_H = 820f
        private const val HEAD_X = 0.01408f
        private const val HEAD_Y = 0.03537f
        private const val HEAD_W = 0.95951f
        private const val HEAD_H = 0.51585f
        private const val BODY_X = 0.23768f
        private const val BODY_Y = 0.52927f
        private const val BODY_W = 0.5f
        private const val BODY_H = 0.43537f
        private const val ARM_X = 0.17782f
        private const val ARM_MIRROR_X = 0.60744f
        private const val ARM_Y = 0.55f
        private const val ARM_W = 0.19014f
        private const val ARM_H = 0.25244f
        private const val ARM_PIVOT_X = 0.7083f
        private const val ARM_PIVOT_Y = 0.0193f
        private const val SHADOW_X = 0.13732f
        private const val SHADOW_Y = 0.75488f
        private const val SHADOW_W = 0.69366f
        private const val SHADOW_H = 0.22927f
        private const val NECK_X = 0.4877f
        private const val NECK_Y = 0.55122f
        private const val FEET_Y = 0.92f
    }
}
