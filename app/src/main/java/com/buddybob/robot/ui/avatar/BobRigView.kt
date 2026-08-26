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
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

/**
 * BOB come pupazzo articolato, tutto vettoriale.
 *
 * Sette pezzi — testa, collo, torso, due braccia, due gambe — piu' l'ombra.
 * Ogni pezzo e' una forma chiusa col proprio contorno e si SOVRAPPONE al vicino
 * invece di accostarglisi: nessuna posa puo' aprire una fessura. Ogni giunto e'
 * un disco centrato sul perno, e un disco ruotato attorno al proprio centro non
 * si muove: per questo la spalla resta sepolta sotto il torso a qualunque angolo.
 *
 * Il braccio non ruota soltanto: si piega lungo una curva, e la mano segue la
 * tangente. E' cosi' che saluta e bussa davvero.
 */
class BobRigView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val parts = BobVector.parts(context)
    private val lay = BobVector.layout(context)
    private val pHead = parts[P_HEAD]
    private val pNeck = parts[P_NECK]
    private val pBody = parts[P_BODY]
    private val pArm = parts[P_ARM]
    private val pHand = parts[P_HAND]
    private val pLeg = parts[P_LEG]
    private val pShadow = parts[P_SHADOW]

    // ---------------------------------------------------------------- posa
    /** Traslazione verticale del personaggio, in frazione dell'altezza. */
    var poseDy = 0f
        set(v) { field = v; invalidate() }
    var poseScale = 1f
        set(v) { field = v; invalidate() }
    /** >0 schiaccia sui piedi, <0 allunga. Essendo vettoriale non sgrana mai. */
    var poseSquash = 0f
        set(v) { field = v; invalidate() }
    /** Inclinazione di tutto il personaggio attorno ai piedi. */
    var lean = 0f
        set(v) { field = v; invalidate() }
    var headTilt = 0f
        set(v) { field = v; invalidate() }
    var headDx = 0f
        set(v) { field = v; invalidate() }
    var headDy = 0f
        set(v) { field = v; invalidate() }

    /** Gradi alla spalla; positivo = alza verso l'esterno. */
    var armLeft = 0f
        set(v) { field = v; invalidate() }
    var armRight = 0f
        set(v) { field = v; invalidate() }
    /** Piega del braccio: >0 curva la mano verso l'esterno. */
    var curlLeft = 0f
        set(v) { field = v; invalidate() }
    var curlRight = 0f
        set(v) { field = v; invalidate() }
    /** Allunga il braccio lungo il proprio asse. */
    var reachLeft = 0f
        set(v) { field = v; invalidate() }
    var reachRight = 0f
        set(v) { field = v; invalidate() }
    var liftLeft = 0f
        set(v) { field = v; invalidate() }
    var liftRight = 0f
        set(v) { field = v; invalidate() }
    /**
     * Avvicinamento a chi guarda: il braccio si allarga verso la mano invece di
     * essere ingrandito in blocco. Cosi' la radice resta esattamente sulla
     * spalla e il braccio non puo' staccarsi dal corpo.
     */
    var spreadLeft = 0f
        set(v) { field = v; invalidate() }
    var spreadRight = 0f
        set(v) { field = v; invalidate() }
    /** Rotazione della mano attorno al polso, in gradi. */
    var wristLeft = 0f
        set(v) { field = v; invalidate() }
    var wristRight = 0f
        set(v) { field = v; invalidate() }
    /** Se true il braccio destro passa davanti alla testa (serve per bussare). */
    var armFront = false
        set(v) { field = v; invalidate() }

    /** Gradi all'anca; positivo = apre verso l'esterno. */
    var legLeft = 0f
        set(v) { field = v; invalidate() }
    var legRight = 0f
        set(v) { field = v; invalidate() }
    /** Quanto le gambe si raccolgono sotto il corpo, in frazione dell'altezza. */
    var legTuck = 0f
        set(v) { field = v; invalidate() }

    var glow = 0f
        set(v) { field = v; invalidate() }
    var veil = 0f
        set(v) { field = v; invalidate() }
    var ring = 0f
        set(v) { field = v; invalidate() }
    var tint = 0f
        set(v) { field = v; invalidate() }
    var tintColor = TINT_COOL
        set(v) { field = v; invalidate() }
    var sheen = 0f
        set(v) { field = v; invalidate() }
    var breathAmp = 1f

    /** Eta' in secondi delle tre increspature sul vetro; negativo = spenta. */
    private val ripple = floatArrayOf(-1f, -1f, -1f)

    fun setRipple(i: Int, age: Float) {
        if (i in 0..2) { ripple[i] = age; invalidate() }
    }

    fun clearRipples() {
        ripple[0] = -1f; ripple[1] = -1f; ripple[2] = -1f
    }

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
    private var lastFrameAt = t0
    private var clock: ValueAnimator? = null

    /** La testa insegue il corpo con un filo di ritardo: e' questo che da' peso. */
    private var headLag = 0f
    private var tiltSmooth = 0f

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val overlay = Paint(Paint.ANTI_ALIAS_FLAG)
    private val m = Matrix()
    private val mHand = Matrix()
    private val mLocal = Matrix()
    private val shaderMatrix = Matrix()
    private val screenBounds = RectF()
    private val tmpPath = Path()
    private val tmp2 = FloatArray(2)
    private var glowShader: RadialGradient? = null
    private var sheenShader: LinearGradient? = null
    private var shadersFor = 0f

    // parametri di piega correnti, letti dal deformatore
    private var bCurl = 0f
    private var bReach = 0f
    private var bLift = 0f
    private var bSpread = 0f
    private var bWrist = 0f

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

    fun lookAt(x: Float, y: Float) {
        lookTargetX = x.coerceIn(-1f, 1f)
        lookTargetY = y.coerceIn(-1f, 1f)
    }

    fun lookCenter() = lookAt(0f, 0f)

    fun blinkNow() {
        val now = SystemClock.uptimeMillis()
        blinkStartedAt = now
        nextBlinkAt = now + BLINK_TOTAL
    }

    /** Dove si trova la mano destra sulla tela: serve a centrare le increspature. */
    fun handPoint(out: FloatArray) {
        val a = lay[P_ARM]
        val arm = pArm ?: return
        val s = fitScale()
        val ox = (width - lay.canvasW * s) / 2f
        val oy = (height - lay.canvasH * s) / 2f
        val dy = poseDy - breath() * 0.006f
        bCurl = curlRight; bReach = reachRight; bLift = liftRight; bSpread = spreadRight; bWrist = wristRight
        warpArm(a.wristX * arm.w, a.wristY * arm.h, tmp2)
        val sw = a.w * lay.canvasW * s / arm.w
        val sh = a.h * lay.canvasH * s / arm.h
        var x = ox + (a.mirrorX + a.w) * lay.canvasW * s - tmp2[0] * sw
        var y = oy + (a.y + dy) * lay.canvasH * s + tmp2[1] * sh
        val px = ox + (a.mirrorX + (1f - a.pivotX) * a.w) * lay.canvasW * s
        val py = oy + (a.y + dy + a.pivotY * a.h) * lay.canvasH * s
        val rad = (-(armRight)) * Math.PI.toFloat() / 180f
        val c = cos(rad); val sn = sin(rad)
        out[0] = px + (x - px) * c - (y - py) * sn
        out[1] = py + (x - px) * sn + (y - py) * c
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

    private fun fitScale() = min(width / lay.canvasW, height / lay.canvasH) * poseScale

    private fun breath(): Float =
        sin((SystemClock.uptimeMillis() - t0) / 1000f * TWO_PI / BREATH_PERIOD) * breathAmp

    // ---------------------------------------------------------------- disegno

    override fun onDraw(canvas: Canvas) {
        val head = pHead ?: return
        val body = pBody ?: return
        val arm = pArm ?: return
        val leg = pLeg ?: return

        val now = SystemClock.uptimeMillis()
        val t = (now - t0) / 1000f
        val dt = ((now - lastFrameAt) / 1000f).coerceIn(0.001f, 0.05f)
        lastFrameAt = now
        tickLife(now, t, dt)

        val s = fitScale()
        val ox = (width - lay.canvasW * s) / 2f
        val oy = (height - lay.canvasH * s) / 2f
        val cw = lay.canvasW * s
        val ch = lay.canvasH * s

        val br = sin(t * TWO_PI / BREATH_PERIOD) * breathAmp
        val sway = sin(t * TWO_PI / SWAY_PERIOD) * breathAmp
        val dy = poseDy - br * 0.006f
        val squash = poseSquash - br * 0.012f
        val aL = armLeft + sway * 1.2f
        val aR = armRight + sway * 1.2f
        val lift = -dy

        // inclinazione di tutto il pupazzo attorno ai piedi
        val leanPivotX = ox + NECK_X * cw
        val leanPivotY = oy + FEET_Y * ch
        val leaning = abs(lean) > 0.01f
        if (leaning) {
            canvas.save()
            canvas.rotate(lean, leanPivotX, leanPivotY)
        }

        // ---- ombra
        pShadow?.let { sh ->
            val r = lay[P_SHADOW]
            val k = (1f - lift * 1.5f).coerceIn(0.55f, 1.3f)
            place(m, sh, r.x, r.y, r.w, r.h, false, s, ox, oy)
            m.postScale(k, k, ox + (r.x + r.w / 2f) * cw, oy + (r.y + r.h / 2f) * ch)
            paint.alpha = (255 * (1f - lift * 2.4f).coerceIn(0.3f, 1f)).toInt()
            drawPart(canvas, sh, m)
            paint.alpha = 255
        }

        // ---- gambe: ruotano all'anca e si raccolgono in volo
        drawLimb(canvas, leg, lay[P_LEG], dy - legTuck, s, ox, oy, legLeft, false)
        drawLimb(canvas, leg, lay[P_LEG], dy - legTuck, s, ox, oy, legRight, true)

        // ---- braccio sinistro
        bCurl = curlLeft; bReach = reachLeft; bLift = liftLeft; bSpread = spreadLeft; bWrist = wristLeft
        drawArm(canvas, arm, dy, s, ox, oy, aL, false)

        // ---- braccio destro (davanti alla testa solo quando bussa)
        if (!armFront) {
            bCurl = curlRight; bReach = reachRight; bLift = liftRight; bSpread = spreadRight; bWrist = wristRight
            drawArm(canvas, arm, dy, s, ox, oy, aR, true)
        }

        // ---- collo: fermo sul torso, si allunga se la testa si stacca
        pNeck?.let { neck ->
            val r = lay[P_NECK]
            val hdy = headLag * 1.15f
            val bx = ox + (r.x + r.w / 2f) * cw
            val by = oy + (r.y + r.h + dy) * ch
            val stretch = 1f + (dy - hdy).coerceAtLeast(0f) * ch / (r.h * ch)
            place(m, neck, r.x, r.y + dy, r.w, r.h, false, s, ox, oy)
            m.postScale(1f, stretch, bx, by)
            m.postRotate(tiltSmooth * 0.45f, bx, by)
            drawPart(canvas, neck, m)
        }

        // ---- torso
        val b = lay[P_BODY]
        val bcx = ox + (b.x + b.w / 2f) * cw
        val bfy = oy + (FEET_Y + dy) * ch
        place(m, body, b.x, b.y + dy, b.w, b.h, false, s, ox, oy)
        m.postScale(1f + squash * 0.5f, 1f - squash, bcx, bfy)
        drawPart(canvas, body, m)

        // ---- testa + vetro + viso
        val h = lay[P_HEAD]
        val hdy = headLag * 1.15f
        val nx = ox + NECK_X * cw
        val ny = oy + (NECK_Y + hdy) * ch
        place(m, head, h.x + headDx, h.y + hdy + headDy, h.w, h.h, false, s, ox, oy)
        m.postRotate(tiltSmooth, nx, ny)
        m.postScale(1f - squash * 0.35f, 1f + squash * 0.3f, nx, ny)
        canvas.save()
        canvas.concat(m)
        for (sh in head.shapes) {
            paint.color = sh.color
            canvas.drawPath(sh.path, paint)
        }
        drawScreen(canvas, head)
        canvas.restore()

        if (armFront) {
            bCurl = curlRight; bReach = reachRight; bLift = liftRight; bSpread = spreadRight; bWrist = wristRight
            drawArm(canvas, arm, dy, s, ox, oy, aR, true)
        }

        if (leaning) canvas.restore()

        drawRipples(canvas)
    }

    /** Matrice che porta le coordinate proprie della parte sulla tela del rig. */
    private fun place(
        out: Matrix, part: VecPart,
        fx: Float, fy: Float, fw: Float, fh: Float,
        mirror: Boolean, s: Float, ox: Float, oy: Float
    ) {
        val w = fw * lay.canvasW * s
        val hh = fh * lay.canvasH * s
        out.reset()
        if (mirror) {
            out.setScale(-w / part.w, hh / part.h)
            out.postTranslate(ox + fx * lay.canvasW * s + w, oy + fy * lay.canvasH * s)
        } else {
            out.setScale(w / part.w, hh / part.h)
            out.postTranslate(ox + fx * lay.canvasW * s, oy + fy * lay.canvasH * s)
        }
    }

    private fun drawPart(c: Canvas, part: VecPart, matrix: Matrix) {
        c.save()
        c.concat(matrix)
        val a = paint.alpha
        for (s in part.shapes) {
            paint.color = s.color
            paint.alpha = a
            c.drawPath(s.path, paint)
        }
        paint.alpha = a
        c.restore()
    }

    /** Gamba o altro arto rigido che ruota attorno al proprio perno. */
    private fun drawLimb(
        c: Canvas, part: VecPart, r: PartRect, dy: Float, s: Float,
        ox: Float, oy: Float, deg: Float, mirror: Boolean
    ) {
        val x = if (mirror) r.mirrorX else r.x
        val px = ox + (x + (if (mirror) 1f - r.pivotX else r.pivotX) * r.w) * lay.canvasW * s
        val py = oy + (r.y + dy + r.pivotY * r.h) * lay.canvasH * s
        place(m, part, x, r.y + dy, r.w, r.h, mirror, s, ox, oy)
        m.postRotate(if (mirror) -deg else deg, px, py)
        drawPart(c, part, m)
    }

    /**
     * Il braccio: rotazione alla spalla, piega lungo la curva, e — quando la mano
     * viene avanti verso chi guarda — scostamento e ingrandimento. Il foro alla
     * spalla toglie il disco d'innesto, cosi' non si vede nemmeno passando davanti.
     */
    private fun drawArm(
        c: Canvas, arm: VecPart, dy: Float, s: Float,
        ox: Float, oy: Float, deg: Float, mirror: Boolean
    ) {
        val r = lay[P_ARM]
        val x = if (mirror) r.mirrorX else r.x
        val px = ox + (x + (if (mirror) 1f - r.pivotX else r.pivotX) * r.w) * lay.canvasW * s
        val py = oy + (r.y + dy + r.pivotY * r.h) * lay.canvasH * s
        place(m, arm, x, r.y + dy, r.w, r.h, mirror, s, ox, oy)
        m.postRotate(if (mirror) -deg else deg, px, py)
        val bent = abs(bCurl) > 1e-4f || abs(bReach) > 1e-4f ||
            abs(bLift) > 1e-4f || abs(bSpread) > 1e-4f

        // prima la mano, poi l'avambraccio: il polsino copre il giunto del polso
        pHand?.let { hand ->
            handMatrix(arm, mLocal)
            mHand.set(m)
            mHand.preConcat(mLocal)
            drawPart(c, hand, mHand)
        }

        c.save()
        c.concat(m)
        for (sh in arm.shapes) {
            paint.color = sh.color
            if (bent) {
                sh.rebuild(tmpPath, ::warpArm, tmp2)
                c.drawPath(tmpPath, paint)
            } else {
                c.drawPath(sh.path, paint)
            }
        }
        c.restore()
    }

    /**
     * La mano e' rigida ma segue il polso deformato: si sposta dove finisce la
     * curva, eredita l'inclinazione con cui il braccio termina e ci aggiunge la
     * rotazione del polso. E' cosi' che gira per salutare e per bussare.
     */
    private fun handMatrix(arm: VecPart, out: Matrix) {
        val r = lay[P_ARM]
        val wx = r.wristX * arm.w
        val wy = r.wristY * arm.h
        warpArm(wx, wy, tmp2)
        val sx = r.pivotX * arm.w
        val sy = r.pivotY * arm.h
        val ax = wx - sx
        val ay = wy - sy
        val len = hypot(ax, ay).coerceAtLeast(1e-3f)
        val nx = -ay / len
        val ny = ax / len
        val p2x = sx + ax * 2f / 3f + nx * bCurl * len
        val p2y = sy + ay * 2f / 3f + ny * bCurl * len
        val p3x = sx + ax * (1f + bReach) + nx * bLift * len
        val p3y = sy + ay * (1f + bReach) + ny * bLift * len
        val deg = (atan2(p3y - p2y, p3x - p2x) - atan2(ay, ax)) * 57.29578f + bWrist
        val k = 1f + bSpread
        out.reset()
        out.setScale(k, k, wx, wy)
        out.postRotate(deg, wx, wy)
        out.postTranslate(tmp2[0] - wx, tmp2[1] - wy)
    }

    /**
     * Deformatore: ogni punto del disegno viene letto come "quanto lungo il
     * braccio" e "quanto di lato", poi riposizionato lungo una curva che parte
     * dalla spalla e finisce al polso. Muovendo la curva il braccio si piega e la
     * mano ruota da sola seguendo la tangente.
     */
    private fun warpArm(x: Float, y: Float, out: FloatArray) {
        val arm = pArm ?: run { out[0] = x; out[1] = y; return }
        val r = lay[P_ARM]
        val sx = r.pivotX * arm.w
        val sy = r.pivotY * arm.h
        val ax = r.wristX * arm.w - sx
        val ay = r.wristY * arm.h - sy
        val len = hypot(ax, ay)
        if (len < 1e-3f) { out[0] = x; out[1] = y; return }
        val ex = ax / len; val ey = ay / len
        val nx = -ey; val ny = ex
        val dx = x - sx; val dy = y - sy
        val t = (dx * ex + dy * ey) / len
        // la prospettiva si fa allargando il braccio verso la mano, non
        // ingrandendolo tutto: la radice resta sulla spalla e non si stacca
        val v = (dx * nx + dy * ny) * (1f + bSpread * t.coerceIn(0f, 1.15f))

        val p1x = sx + ax / 3f; val p1y = sy + ay / 3f
        val p2x = sx + ax * 2f / 3f + nx * bCurl * len
        val p2y = sy + ay * 2f / 3f + ny * bCurl * len
        val p3x = sx + ax * (1f + bReach) + nx * bLift * len
        val p3y = sy + ay * (1f + bReach) + ny * bLift * len

        val u = t.coerceIn(0f, 1f)
        val mu = 1f - u
        val bx = mu * mu * mu * sx + 3f * mu * mu * u * p1x + 3f * mu * u * u * p2x + u * u * u * p3x
        val by = mu * mu * mu * sy + 3f * mu * mu * u * p1y + 3f * mu * u * u * p2y + u * u * u * p3y
        var tx = 3f * mu * mu * (p1x - sx) + 6f * mu * u * (p2x - p1x) + 3f * u * u * (p3x - p2x)
        var ty = 3f * mu * mu * (p1y - sy) + 6f * mu * u * (p2y - p1y) + 3f * u * u * (p3y - p2y)
        val tl = hypot(tx, ty).coerceAtLeast(1e-4f)
        tx /= tl; ty /= tl
        val over = (t - u) * len
        out[0] = bx + tx * over - ty * v
        out[1] = by + ty * over + tx * v
    }

    /** Velo, tinta, alone, riflesso, anello e viso, ritagliati sul vetro. */
    private fun drawScreen(c: Canvas, head: VecPart) {
        val hw = head.w
        val hh = head.h
        val screen = head.screen ?: return
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

    /** I cerchi sul vetro davanti a chi guarda, uno per ogni colpo. */
    private fun drawRipples(c: Canvas) {
        var any = false
        for (age in ripple) if (age >= 0f) { any = true; break }
        if (!any) return
        val s = fitScale()
        handPoint(tmp2)
        val cx = tmp2[0]
        val cy = tmp2[1]
        overlay.shader = null
        overlay.style = Paint.Style.STROKE
        overlay.color = BobFace.CYAN
        for (age in ripple) {
            if (age < 0f) continue
            val u = age / RIPPLE_LIFE
            if (u > 1f) continue
            overlay.strokeWidth = 9f * s * (1f - u * 0.7f)
            overlay.alpha = (140 * (1f - u)).toInt()
            c.drawCircle(cx, cy, lay.canvasW * s * (0.02f + u * 0.34f), overlay)
        }
        overlay.style = Paint.Style.FILL
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

    // ---------------------------------------------------------------- vita procedurale

    private fun tickLife(now: Long, t: Float, dt: Float) {
        val dyNow = poseDy - sin(t * TWO_PI / BREATH_PERIOD) * breathAmp * 0.006f
        // la testa arriva dopo il corpo: senza questo ritardo il salto sembra un ascensore
        headLag += (dyNow - headLag) * (1f - Math.pow(0.0009, dt.toDouble()).toFloat()) * 0.55f
        val tiltTarget = headTilt + sin(t * TWO_PI / SWAY_PERIOD) * breathAmp * 0.6f -
            (dyNow - headLag) * 210f
        tiltSmooth += (tiltTarget - tiltSmooth) * (1f - Math.pow(0.0004, dt.toDouble()).toFloat())

        val driftX = sin(t * 0.41f) * 0.10f + sin(t * 1.07f) * 0.03f
        val driftY = sin(t * 0.29f) * 0.08f
        lookX += (lookTargetX + driftX - lookX) * 0.10f
        lookY += (lookTargetY + driftY - lookY) * 0.10f

        if (now >= nextBlinkAt && blinkStartedAt == 0L) blinkStartedAt = now
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
                if (pendingDouble) { pendingDouble = false; nextBlinkAt = now + 150L }
                else scheduleBlink(now)
            }
        }

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
        private const val P_HEAD = "head"
        private const val P_NECK = "neck"
        private const val P_BODY = "body"
        private const val P_ARM = "arm"
        private const val P_HAND = "hand"
        private const val P_LEG = "leg"
        private const val P_SHADOW = "shadow"

        const val TINT_COOL = 0xFF0E6E9C.toInt()
        const val TINT_DEEP = 0xFF10314F.toInt()
        const val TINT_WARM = 0xFF7A2B1E.toInt()

        /** Durata di una increspatura sul vetro, in secondi. */
        const val RIPPLE_LIFE = 0.7f

        private const val TWO_PI = 6.2831855f
        private const val BREATH_PERIOD = 3.6f
        private const val SWAY_PERIOD = 7.3f
        private const val BLINK_DOWN = 70L
        private const val BLINK_TOTAL = 165L

        private const val NECK_X = 0.4877f
        private const val NECK_Y = 0.55122f
        private const val FEET_Y = 0.92f
    }
}
