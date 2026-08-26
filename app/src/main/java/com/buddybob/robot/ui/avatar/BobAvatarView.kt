package com.buddybob.robot.ui.avatar

import android.animation.ValueAnimator
import android.content.Context
import android.os.SystemClock
import android.util.AttributeSet
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.buddybob.robot.R
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * Avatar BOB: pupazzo articolato ([BobRigView]) piu' fumetti e scintille.
 *
 * Ogni stato e' una funzione del tempo che scrive le proprieta' di posa del rig,
 * fotogramma per fotogramma. Sotto continuano a girare respiro, palpebre e
 * sguardo, quindi BOB non e' mai completamente fermo.
 */
class BobAvatarView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : FrameLayout(context, attrs, defStyleAttr) {

    private val halo: View
    private val rig: BobRigView
    private val zzz1: TextView
    private val zzz2: TextView
    private val zzz3: TextView
    private val knock: TextView
    private val thinkWrap: LinearLayout
    private val think: TextView
    private val sparkles: List<ImageView>
    private val zzzViews: List<TextView>

    private var currentMode: BobAvatarMode = BobAvatarMode.IDLE_SLEEP
    private var modeStartAt = SystemClock.uptimeMillis()
    private var driver: ValueAnimator? = null

    private var pokeCount = 0
    private var lastPokeAt = -9_999f
    private var pokeStart = -9_999f
    /** Se true un tocco sull'avatar fa reagire BOB (senza consumare l'evento). */
    var pokeEnabled = true

    private var boundController: BobAvatarController? = null

    init {
        LayoutInflater.from(context).inflate(R.layout.view_bob_avatar, this, true)
        halo = findViewById(R.id.bob_halo)
        rig = findViewById(R.id.bob_rig)
        zzz1 = findViewById(R.id.bob_overlay_zzz1)
        zzz2 = findViewById(R.id.bob_overlay_zzz2)
        zzz3 = findViewById(R.id.bob_overlay_zzz3)
        knock = findViewById(R.id.bob_overlay_knock)
        thinkWrap = findViewById(R.id.bob_overlay_think_wrap)
        think = findViewById(R.id.bob_overlay_think)
        sparkles = listOf(
            findViewById(R.id.bob_sparkle1),
            findViewById(R.id.bob_sparkle2),
            findViewById(R.id.bob_sparkle3),
        )
        zzzViews = listOf(zzz1, zzz2, zzz3)
        clipChildren = false
        clipToPadding = false
        rig.setExpression(BobExpression.SLEEPY, animated = false)
    }

    private val signalListener: (BobSignal) -> Unit = { s ->
        when (s) {
            is BobSignal.Voice -> rig.audioLevel = s.level
            is BobSignal.Look -> rig.lookAt(s.x, s.y)
            BobSignal.LookCenter -> rig.lookCenter()
            BobSignal.Poke -> poke()
        }
    }

    // ------------------------------------------------------------------ API

    fun setMode(mode: BobAvatarMode) {
        if (currentMode == mode) return
        currentMode = mode
        modeStartAt = SystemClock.uptimeMillis()
    }

    /** Livello audio 0..1 durante il TTS: muove la bocca a tempo con la voce. */
    fun setVoiceLevel(level: Float) {
        rig.audioLevel = level
    }

    fun lookAt(x: Float, y: Float) = rig.lookAt(x, y)

    fun lookCenter() = rig.lookCenter()

    fun setExpression(e: BobExpression) = rig.setExpression(e)

    /** Collega l'avatar ai segnali vivi del controller. */
    fun bindSignals(controller: BobAvatarController) {
        if (boundController === controller) return
        unbindSignals()
        boundController = controller
        controller.addSignalListener(signalListener)
    }

    fun unbindSignals() {
        boundController?.removeSignalListener(signalListener)
        boundController = null
    }

    /** Reazione a un tocco: si stupisce, poi si diverte, poi si secca. */
    fun poke() {
        val now = clock()
        pokeCount = if (now - lastPokeAt < 2.6f) pokeCount + 1 else 1
        lastPokeAt = now
        pokeStart = now
        rig.blinkNow()
    }

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        if (pokeEnabled && ev.actionMasked == MotionEvent.ACTION_DOWN) poke()
        return super.dispatchTouchEvent(ev)
    }

    // ------------------------------------------------------------------ motore

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        if (driver == null) {
            driver = ValueAnimator.ofFloat(0f, 1f).apply {
                duration = 1000L
                repeatCount = ValueAnimator.INFINITE
                interpolator = null
                addUpdateListener { tick() }
                start()
            }
        }
    }

    override fun onDetachedFromWindow() {
        driver?.cancel(); driver = null
        unbindSignals()
        super.onDetachedFromWindow()
    }

    private fun clock() = (SystemClock.uptimeMillis() - CREATED) / 1000f

    private fun tick() {
        reset()
        val now = clock()
        val poking = now - pokeStart < 1.6f
        if (poking) poke(now - pokeStart) else apply(currentMode, (SystemClock.uptimeMillis() - modeStartAt) / 1000f)
        overlays(now)
    }

    private fun reset() {
        rig.poseDy = 0f; rig.poseScale = 1f; rig.poseSquash = 0f; rig.lean = 0f
        rig.headTilt = 0f; rig.headDx = 0f; rig.headDy = 0f
        rig.armLeft = 0f; rig.armRight = 0f
        rig.curlLeft = 0f; rig.curlRight = 0f
        rig.reachLeft = 0f; rig.reachRight = 0f
        rig.liftLeft = 0f; rig.liftRight = 0f
        rig.spreadLeft = 0f; rig.spreadRight = 0f
        rig.wristLeft = 0f; rig.wristRight = 0f; rig.armFront = false
        rig.legLeft = 0f; rig.legRight = 0f; rig.legTuck = 0f
        rig.glow = 0f; rig.veil = 0f; rig.ring = 0f; rig.tint = 0f
        rig.tintColor = BobRigView.TINT_COOL
        rig.sheen = 0f; rig.breathAmp = 1f; rig.speaking = false
        rig.clearRipples()
        showZzz = false; showKnock = false; showThink = false; showSpark = false
        haloTarget = 0.55f
    }

    private var showZzz = false
    private var showKnock = false
    private var showThink = false
    private var showSpark = false
    private var haloTarget = 0.55f

    // ------------------------------------------------------------------ stati

    private fun apply(mode: BobAvatarMode, t: Float) = when (mode) {
        BobAvatarMode.IDLE_SLEEP -> sleep(t)
        BobAvatarMode.IDLE_KNOCK -> knockOnGlass(t)
        BobAvatarMode.IDLE_PEEK -> peek(t)
        BobAvatarMode.GREETING -> greeting(t)
        BobAvatarMode.MENU -> menu(t)
        BobAvatarMode.LISTENING -> listening(t)
        BobAvatarMode.THINKING -> thinking(t)
        BobAvatarMode.SPEAKING -> speakingMode(t)
        BobAvatarMode.MOVING -> moving(t)
        BobAvatarMode.SUCCESS -> success(t)
    }

    private fun sleep(t: Float) {
        rig.setExpression(BobExpression.SLEEPY)
        rig.breathAmp = 1.6f; rig.veil = 0.7f
        rig.lookAt(0f, 0.5f)
        showZzz = true
        haloTarget = 0.24f + 0.22f * bell(cyc(t, 3.2f))
    }

    /**
     * Bussa sul vetro: la mano viene avanti verso chi guarda, batte tre volte e
     * a ogni colpo il vetro fa un cerchio.
     */
    private fun knockOnGlass(t: Float) {
        rig.setExpression(BobExpression.NEUTRAL)
        rig.lookAt(0f, 0.1f)
        showKnock = true
        val c = t % 2.9f
        val up = easeOut(c / 0.42f) * if (c < 1.78f) 1f else 1f - easeOut((c - 1.78f) / 0.55f)
        rig.armFront = up > 0.15f
        rig.armRight = 40f * up
        rig.reachRight = 0.58f * up          // il braccio si protende verso di noi
        rig.liftRight = -0.15f * up
        rig.curlRight = 0.07f * up
        rig.wristRight = -62f * up           // le nocche girate verso di noi
        rig.spreadRight = 1.9f * up          // e si allarga: e' la mano piu' vicina
        rig.poseScale = 1f - 0.04f * up
        var hit = 0f
        for (i in TAPS.indices) {
            val a = c - TAPS[i]
            val p = when {
                a < -0.10f -> 0f
                a < 0f -> (a + 0.10f) / 0.10f
                a < 0.06f -> 1f - a / 0.06f
                else -> 0f
            }
            hit = max(hit, p)
            rig.setRipple(i, if (a > 0f && a < BobRigView.RIPPLE_LIFE) a else -1f)
        }
        rig.reachRight += 0.13f * hit * up
        rig.spreadRight += 0.35f * hit * up
        rig.curlRight += -0.20f * hit * up
        rig.wristRight -= 20f * hit * up     // e la nocca scatta sul vetro
        rig.headTilt = 2.5f * hit + 1.5f * up
        rig.poseDy = -0.004f * hit
        rig.glow = 0.25f + 0.5f * hit
        rig.veil = 0.18f * (1f - up)
        haloTarget = 0.5f + 0.3f * hit
    }

    private fun peek(t: Float) {
        rig.setExpression(BobExpression.NEUTRAL)
        rig.veil = 0.12f; rig.glow = 0.3f
        val a = cyc(t, 4.2f) * TWO_PI
        rig.lookAt(sin(a) * 0.9f, -0.15f)
        rig.headTilt = 3.2f * sin(a)
        rig.poseDy = -0.006f * bell(cyc(t, 4.2f))
    }

    /** Salta e saluta: raccolta, stacco, volo, atterraggio, poi la mano sventola. */
    private fun greeting(t: Float) {
        rig.setExpression(BobExpression.HAPPY)
        rig.glow = 0.45f; rig.lookCenter(); showSpark = true
        jump(t, 0.085f)
        jumpLegs(t, 1f)
        val swing = when {
            t < 0.20f -> -14f * easeOut(t / 0.20f)
            t < 0.34f -> -14f + 46f * easeOut((t - 0.20f) / 0.14f)
            else -> 32f * exp(-2.2f * (t - 0.34f))
        }
        rig.armLeft = swing; rig.armRight = swing
        if (t > 0.62f) {
            val w = t - 0.62f
            val up = easeOut(w / 0.34f) + 0.12f * settle(max(0f, w - 0.34f), 22f, 7f)
            val on = clamp01((w - 0.22f) / 0.25f)
            val flap = sin((w - 0.22f) * 11.5f)
            rig.armRight = max(swing, 38f * up)
            // il grosso dello sventolio sta nel polso: e' la mano che gira
            rig.wristRight = 30f * flap * on * up
            rig.curlRight = (0.05f * flap * on + 0.05f) * up
            rig.liftRight = 0.05f * up
            rig.reachRight = 0.04f * up
            rig.lean = 2.4f * clamp01(w / 0.3f)
            rig.headTilt = -3.5f * clamp01(w / 0.3f)
        }
        if (t < 1.1f) rig.sheen = clamp01(t / 1.1f)
        haloTarget = 0.9f
    }

    private fun menu(t: Float) {
        rig.setExpression(BobExpression.NEUTRAL)
        rig.glow = 0.12f
        val a = cyc(t, 5.2f) * TWO_PI
        rig.headTilt = 1.4f * sin(a)
        rig.lookAt(0.35f * sin(a), 0f)
        haloTarget = 0.48f + 0.18f * bell(cyc(t, 3f))
    }

    private fun listening(t: Float) {
        rig.setExpression(BobExpression.FOCUSED)
        rig.poseScale = 1.03f
        rig.tintColor = BobRigView.TINT_COOL
        rig.lookCenter()
        val u = cyc(t, 1.1f)
        rig.tint = 0.22f + 0.16f * bell(u)
        rig.ring = bell(u)
        rig.glow = 0.35f + 0.4f * bell(u)
        rig.poseDy = -0.008f * bell(u)
        rig.headTilt = 1.8f * sin(cyc(t, 2.6f) * TWO_PI)
        haloTarget = 0.6f + 0.3f * bell(u)
    }

    private fun thinking(t: Float) {
        rig.setExpression(BobExpression.FOCUSED)
        rig.glow = 0.2f
        rig.tintColor = BobRigView.TINT_DEEP
        rig.tint = 0.28f
        showThink = true
        val a = cyc(t, 2.8f) * TWO_PI
        rig.lookAt(-0.45f + 0.25f * sin(a), -0.65f)
        rig.poseDy = -0.004f * bell(cyc(t, 2.8f))
        rig.headTilt = -6.5f * easeOut(t / 0.42f) + 1.5f * sin(a)
        rig.curlLeft = 0.05f * sin(a)
    }

    private fun speakingMode(t: Float) {
        rig.setExpression(BobExpression.HAPPY)
        rig.speaking = true
        rig.lookCenter()
        val u = cyc(t, 0.52f)
        rig.poseDy = -0.012f * bell(u)
        rig.poseSquash = 0.025f * sin(u * TWO_PI)
        rig.glow = 0.4f + 0.35f * bell(u)
        rig.sheen = cyc(t, 2.6f)
        val a = cyc(t, 4.1f) * TWO_PI
        rig.headTilt = 2.2f * sin(a)
        rig.armLeft = 8f + 7f * sin(a)
        rig.armRight = 8f - 7f * sin(a)
        rig.curlLeft = 0.07f * sin(a)
        rig.curlRight = -0.07f * sin(a)
        haloTarget = 0.7f
    }

    private fun moving(t: Float) {
        rig.setExpression(BobExpression.NEUTRAL)
        rig.glow = 0.22f
        val a = cyc(t, 0.88f) * TWO_PI
        rig.poseDy = -0.014f * abs(sin(a))
        rig.armLeft = 17f * sin(a); rig.armRight = -17f * sin(a)
        rig.curlLeft = 0.06f * sin(a); rig.curlRight = -0.06f * sin(a)
        rig.legLeft = -13f * sin(a); rig.legRight = 13f * sin(a)
        rig.legTuck = 0.006f * abs(sin(a))
        rig.headTilt = 1.8f * sin(a)
        val b = cyc(t, 2.4f) * TWO_PI
        rig.headDx = 0.01f * sin(b)
        rig.lookAt(0.5f * sin(b), -0.1f)
    }

    private fun success(t: Float) {
        rig.setExpression(BobExpression.HAPPY)
        rig.glow = 0.6f; rig.lookCenter(); showSpark = true
        jump(t, 0.11f)
        jumpLegs(t, 1.3f)
        val up = if (t < 0.20f) -16f * easeOut(t / 0.20f) else 44f * easeOut((t - 0.20f) / 0.22f)
        rig.armLeft = up; rig.armRight = up
        val c = -0.16f * clamp01((t - 0.28f) / 0.3f)
        rig.curlLeft = c; rig.curlRight = c
        rig.headTilt = 7f * settle(max(0f, t - 0.28f), 12f, 3f)
        if (t < 1.2f) rig.sheen = clamp01(t / 1.2f)
        haloTarget = 1f
    }

    private fun poke(t: Float) {
        val u = clamp01(t / 0.7f)
        when {
            pokeCount == 1 -> {
                rig.setExpression(BobExpression.SURPRISED)
                rig.poseDy = -0.045f * bell(u); rig.poseSquash = -0.06f * bell(u)
                rig.headTilt = 6f * settle(t, 26f, 6f)
                rig.glow = 0.5f * bell(u)
                rig.lookAt(0f, -0.2f)
                rig.armLeft = 22f * bell(u); rig.armRight = 22f * bell(u)
                rig.curlLeft = -0.08f * bell(u); rig.curlRight = -0.08f * bell(u)
            }
            pokeCount <= 3 -> {
                rig.setExpression(BobExpression.HAPPY)
                rig.poseDy = -0.03f * bell(u)
                rig.headTilt = -10f * settle(t, 22f, 5f)
                rig.armLeft = 34f * bell(u); rig.armRight = 34f * bell(u)
                rig.curlLeft = 0.14f * sin(t * 13f); rig.curlRight = 0.14f * sin(t * 13f)
                rig.glow = 0.5f * bell(u)
            }
            else -> {
                rig.setExpression(BobExpression.ANGRY)
                rig.tintColor = BobRigView.TINT_WARM
                rig.tint = 0.42f * bell(clamp01(t / 0.9f))
                rig.poseDy = 0.02f * bell(u); rig.poseSquash = 0.07f * bell(u)
                rig.headTilt = 14f * settle(t, 30f, 6f)
                rig.armLeft = 26f * bell(u); rig.armRight = 26f * bell(u)
                rig.curlLeft = -0.12f * bell(u); rig.curlRight = -0.12f * bell(u)
                rig.glow = 0.5f * bell(u)
            }
        }
    }

    // ------------------------------------------------------------------ salto

    /** Raccolta, stacco, volo, atterraggio, assestamento. */
    private fun jump(t: Float, height: Float) {
        val a = 0.20f; val b = 0.28f; val c = 0.70f; val d = 0.82f
        when {
            t < a -> { val u = t / a; rig.poseDy = 0.010f * easeOut(u); rig.poseSquash = 0.11f * easeOut(u) }
            t < b -> {
                val u = (t - a) / (b - a)
                rig.poseDy = 0.010f - (0.010f + height * 0.28f) * easeIn(u + 0.35f)
                rig.poseSquash = 0.11f - 0.20f * u
            }
            t < c -> {
                val u = (t - b) / (c - b); val arc = 4f * u * (1f - u)
                rig.poseDy = -height * (0.28f + 0.72f * arc)
                rig.poseSquash = -0.09f * (1f - arc)
            }
            t < d -> {
                val u = (t - c) / (d - c)
                rig.poseDy = -height * 0.28f * (1f - easeIn(u))
                rig.poseSquash = 0.16f * easeOut(u)
            }
            else -> { rig.poseDy = 0f; rig.poseSquash = 0.16f * settle(t - d, 26f, 9f) }
        }
    }

    /** Le gambe nel salto: senza queste il salto sembra un ascensore. */
    private fun jumpLegs(t: Float, k: Float) {
        val a = 0.20f; val b = 0.28f; val c = 0.70f; val d = 0.82f
        val ang: Float
        var tuck = 0f
        when {
            t < a -> { val u = t / a; ang = -7f * easeOut(u); tuck = 0.004f * easeOut(u) }
            t < b -> { val u = (t - a) / (b - a); ang = -7f + 9f * u; tuck = 0.004f - 0.004f * u }
            t < c -> {
                val u = (t - b) / (c - b); val arc = 4f * u * (1f - u)
                ang = 2f + 13f * arc; tuck = 0.030f * arc
            }
            t < d -> { val u = (t - c) / (d - c); ang = 2f * (1f - u) - 9f * easeOut(u) }
            else -> ang = -9f * settle(t - d, 22f, 8f)
        }
        rig.legLeft = ang * k; rig.legRight = ang * k; rig.legTuck = tuck * k
    }

    // ------------------------------------------------------------------ fumetti

    private fun overlays(now: Float) {
        halo.alpha = haloTarget
        val zt = cyc(now, 2.2f)
        zzzViews.forEachIndexed { i, v ->
            if (showZzz) {
                val u = cyc(now + i * 0.5f, 2.2f)
                v.alpha = 0.25f + 0.75f * bell(u)
                v.translationY = -34f * u
                val sc = 0.85f + 0.3f * u
                v.scaleX = sc; v.scaleY = sc
            } else v.alpha = 0f
        }
        knock.alpha = if (showKnock) 1f else 0f
        thinkWrap.alpha = if (showThink) 1f else 0f
        if (showThink) {
            val dots = 1 + ((now * 2.6f).toInt() % 3)
            think.text = context.getString(R.string.bob_avatar_thinking) + ".".repeat(dots)
        }
        sparkles.forEachIndexed { i, s ->
            if (showSpark) {
                s.alpha = 0.35f + 0.65f * bell(cyc(now + i * 0.12f, 0.9f))
                s.rotation = (now * 300f + i * 40f) % 360f
                s.translationY = -12f * bell(cyc(now + i * 0.1f, 1.1f))
            } else s.alpha = 0f
        }
        if (!showZzz) zzzViews.forEach { it.translationY = 0f }
        // zt resta usato per tenere allineata la fase dei fumetti
        if (zt < 0f) return
    }

    // ------------------------------------------------------------------ curve

    private fun bell(t: Float) = 0.5f - 0.5f * cos(t * TWO_PI)
    private fun cyc(t: Float, p: Float) = ((t % p) + p) % p / p
    private fun clamp01(t: Float) = min(1f, max(0f, t))
    private fun easeOut(t: Float): Float { val u = clamp01(t); return 1f - (1f - u) * (1f - u) * (1f - u) }
    private fun easeIn(t: Float): Float { val u = clamp01(t); return u * u * u }
    /** Rimbalzo smorzato: il pezzo arriva, supera un poco e si assesta. */
    private fun settle(t: Float, freq: Float, damp: Float) = exp(-damp * t) * cos(freq * t)

    companion object {
        private val CREATED = SystemClock.uptimeMillis()
        private const val TWO_PI = 6.2831855f
        private val TAPS = floatArrayOf(0.62f, 0.98f, 1.34f)
    }
}
