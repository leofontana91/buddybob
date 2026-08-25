package com.buddybob.robot.ui.avatar

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.AnimatorSet
import android.animation.ValueAnimator
import android.content.Context
import android.os.SystemClock
import android.util.AttributeSet
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.animation.DecelerateInterpolator
import android.view.animation.PathInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.buddybob.robot.R

/**
 * Avatar BOB animato: rig a livelli (BobRigView) più fumetti e scintille.
 *
 * Ogni stato di [BobAvatarMode] è un piccolo "programma" che muove le proprietà
 * di posa del rig; respiro, palpebre e sguardo continuano a girare sotto,
 * quindi BOB non è mai completamente fermo.
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
    private var running: AnimatorSet? = null
    private val loops = mutableListOf<ValueAnimator>()
    private var thinkDotsStep = 0

    private var pokeCount = 0
    private var lastPokeAt = 0L
    /** Se true un tocco sull'avatar fa reagire BOB (senza consumare l'evento). */
    var pokeEnabled = true

    private var boundController: BobAvatarController? = null

    private val ease = PathInterpolator(0.34f, 1.2f, 0.64f, 1f)
    private val soft = PathInterpolator(0.45f, 0f, 0.55f, 1f)

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

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        applyMode(currentMode)
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
        val prev = currentMode
        currentMode = mode
        stopAll()
        val quick = prev in IDLE_GROUP && mode in IDLE_GROUP
        if (quick) {
            applyMode(mode)
        } else {
            // piccolo "respiro" di stacco: BOB si raccoglie e riparte nello stato nuovo
            val out = anim(130L, 0, 0f, 1f) { rig.poseSquash = it * 0.05f }
            out.addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    rig.poseSquash = 0f
                    if (currentMode == mode) applyMode(mode)
                }
            })
            out.start()
            running = AnimatorSet().apply { play(out) }
        }
    }

    /** Livello audio 0..1 durante il TTS: muove la bocca a tempo con la voce. */
    fun setVoiceLevel(level: Float) {
        rig.audioLevel = level
    }

    /**
     * Direzione dello sguardo: (0,0) davanti, x negativo a sinistra, y negativo in alto.
     * Da collegare alla posizione della persona rilevata.
     */
    fun lookAt(x: Float, y: Float) = rig.lookAt(x, y)

    fun lookCenter() = rig.lookCenter()

    fun setExpression(e: BobExpression) = rig.setExpression(e)

    /**
     * Collega l'avatar ai segnali vivi del controller: dove guardare,
     * livello della voce durante il parlato, tocchi sullo schermo.
     */
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
        val now = SystemClock.uptimeMillis()
        pokeCount = if (now - lastPokeAt < 2600L) pokeCount + 1 else 1
        lastPokeAt = now
        rig.blinkNow()
        when {
            pokeCount == 1 -> {
                rig.setExpression(BobExpression.SURPRISED)
                pokeAnim(-0.045f, 6f, 0f)
            }
            pokeCount in 2..3 -> {
                rig.setExpression(BobExpression.HAPPY)
                pokeAnim(-0.03f, -10f, 38f)
            }
            else -> {
                rig.setExpression(BobExpression.ANGRY)
                rig.tintColor = TINT_WARM
                pokeAnim(0.02f, 14f, 30f)
                anim(900L, 0, 0f, 1f) { rig.tint = 0.42f * bell(it) }.start()
            }
        }
        val modeAtPoke = currentMode
        postDelayed({
            if (currentMode == modeAtPoke && SystemClock.uptimeMillis() - lastPokeAt >= 1500L) {
                applyMode(currentMode)
            }
        }, 1600L)
    }

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        if (pokeEnabled && ev.actionMasked == MotionEvent.ACTION_DOWN) poke()
        return super.dispatchTouchEvent(ev)
    }

    // ------------------------------------------------------------------ stati

    private fun applyMode(mode: BobAvatarMode) {
        stopAll()
        resetOverlays()
        when (mode) {
            BobAvatarMode.IDLE_SLEEP -> playSleep()
            BobAvatarMode.IDLE_KNOCK -> playKnock()
            BobAvatarMode.IDLE_PEEK -> playPeek()
            BobAvatarMode.GREETING -> playGreeting()
            BobAvatarMode.MENU -> playMenu()
            BobAvatarMode.LISTENING -> playListening()
            BobAvatarMode.THINKING -> playThinking()
            BobAvatarMode.SPEAKING -> playSpeaking()
            BobAvatarMode.MOVING -> playMoving()
            BobAvatarMode.SUCCESS -> playSuccess()
        }
    }

    private fun playSleep() {
        rig.setExpression(BobExpression.SLEEPY)
        rig.breathAmp = 1.6f
        rig.veil = 0.7f
        rig.glow = 0f
        rig.lookAt(0f, 0.5f)
        halo.alpha = 0.3f
        zzzViews.forEachIndexed { i, v -> v.alpha = 0.9f; v.translationX = i * 6f }
        loop(3200L) { halo.alpha = 0.24f + 0.22f * wave(it) }
        zzzViews.forEachIndexed { i, v ->
            loop(2200L + i * 400L, delay = i * 400L) {
                v.translationY = -34f * it
                v.alpha = 0.25f + 0.75f * bell(it)
                val sc = 0.85f + 0.3f * it
                v.scaleX = sc; v.scaleY = sc
            }
        }
    }

    private fun playKnock() {
        rig.setExpression(BobExpression.NEUTRAL)
        rig.veil = 0.25f
        rig.lookAt(0f, 0f)
        knock.alpha = 1f
        knock.scaleX = 0.8f; knock.scaleY = 0.8f
        knock.animate().scaleX(1f).scaleY(1f).setDuration(200L).setInterpolator(ease).start()
        loop(520L) {
            rig.glow = 0.9f * bell(it)
            rig.headTilt = 4f * kotlin.math.sin(it * 12.566f).toFloat()
            rig.headDx = 0.012f * kotlin.math.sin(it * 12.566f).toFloat()
        }
    }

    private fun playPeek() {
        rig.setExpression(BobExpression.NEUTRAL)
        rig.veil = 0.12f
        rig.glow = 0.3f
        // si guarda intorno: due occhiate e un'inclinazione della testa
        loop(4200L) {
            val a = it * 6.2832f
            rig.lookAt(kotlin.math.sin(a).toFloat() * 0.9f, -0.15f)
            rig.headTilt = 3.2f * kotlin.math.sin(a).toFloat()
            rig.poseDy = -0.006f * bell(it)
        }
    }

    private fun playGreeting() {
        rig.setExpression(BobExpression.HAPPY)
        rig.veil = 0f
        rig.glow = 0.45f
        rig.lookCenter()
        showSparkles()
        halo.alpha = 0.9f
        val jump = anim(720L, 0, 0f, 1f) {
            rig.poseDy = -0.055f * bell(it)
            rig.poseSquash = 0.06f * kotlin.math.sin(it * 9.42f).toFloat() * (1f - it)
            rig.poseScale = 0.9f + 0.1f * curve(it)
        }
        jump.interpolator = null
        val waveAnim = anim(1500L, 1, 0f, 1f) {
            rig.armRight = 44f + 14f * kotlin.math.sin(it * 18.85f).toFloat()
            rig.headTilt = -3f * kotlin.math.sin(it * 6.28f).toFloat()
        }
        waveAnim.startDelay = 260L
        waveAnim.addListener(object : AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: Animator) {
                if (currentMode == BobAvatarMode.GREETING) {
                    anim(420L, 0, 0f, 1f) { rig.armRight = 44f * (1f - curve(it)) }.start()
                }
            }
        })
        anim(900L, 0, 0f, 1f) { rig.sheen = it }.start()
        jump.start()
        waveAnim.start()
        loop(3600L, delay = 1800L) { halo.alpha = 0.6f + 0.25f * wave(it) }
    }

    private fun playMenu() {
        rig.setExpression(BobExpression.NEUTRAL)
        rig.veil = 0f
        rig.glow = 0.12f
        rig.breathAmp = 1f
        halo.alpha = 0.55f
        loop(5200L) {
            val a = it * 6.2832f
            rig.headTilt = 1.4f * kotlin.math.sin(a).toFloat()
            rig.lookAt(0.35f * kotlin.math.sin(a).toFloat(), 0f)
        }
        loop(3000L) { halo.alpha = 0.48f + 0.18f * wave(it) }
    }

    private fun playListening() {
        rig.setExpression(BobExpression.FOCUSED)
        rig.veil = 0f
        rig.lookCenter()
        rig.poseScale = 1.03f
        rig.tintColor = TINT_COOL
        halo.alpha = 0.8f
        loop(1100L) { rig.tint = 0.22f + 0.16f * bell(it) }
        loop(1100L) {
            rig.ring = bell(it)
            rig.glow = 0.35f + 0.4f * bell(it)
            rig.poseDy = -0.008f * bell(it)
            halo.alpha = 0.6f + 0.3f * bell(it)
        }
        loop(2600L) { rig.headTilt = 1.8f * kotlin.math.sin(it * 6.2832f).toFloat() }
    }

    private fun playThinking() {
        rig.setExpression(BobExpression.FOCUSED)
        rig.veil = 0f
        rig.glow = 0.2f
        rig.tintColor = TINT_DEEP
        rig.tint = 0.28f
        thinkWrap.alpha = 1f
        thinkWrap.scaleX = 0.9f; thinkWrap.scaleY = 0.9f
        thinkWrap.animate().scaleX(1f).scaleY(1f).setDuration(250L).setInterpolator(ease).start()
        thinkDotsStep = 0
        post(thinkRunnable)
        // testa inclinata da un lato e sguardo in alto: la posa universale del "sto pensando"
        anim(420L, 0, 0f, 1f) { rig.headTilt = -6.5f * curve(it) }.start()
        loop(2800L) {
            val a = it * 6.2832f
            rig.lookAt(-0.45f + 0.25f * kotlin.math.sin(a).toFloat(), -0.65f)
            rig.poseDy = -0.004f * bell(it)
            rig.headTilt = -6.5f + 1.5f * kotlin.math.sin(a).toFloat()
        }
    }

    private fun playSpeaking() {
        rig.setExpression(BobExpression.HAPPY)
        rig.speaking = true
        rig.veil = 0f
        rig.lookCenter()
        halo.alpha = 0.7f
        loop(520L) {
            rig.poseDy = -0.012f * bell(it)
            rig.poseSquash = 0.025f * kotlin.math.sin(it * 6.2832f).toFloat()
            rig.glow = 0.4f + 0.35f * bell(it)
        }
        loop(2600L) { rig.sheen = it }
        loop(4100L) {
            val a = it * 6.2832f
            rig.headTilt = 2.2f * kotlin.math.sin(a).toFloat()
            rig.armLeft = 6f + 6f * kotlin.math.sin(a).toFloat()
            rig.armRight = 6f - 6f * kotlin.math.sin(a).toFloat()
        }
    }

    private fun playMoving() {
        rig.setExpression(BobExpression.NEUTRAL)
        rig.veil = 0f
        rig.glow = 0.22f
        // passo: corpo che ondeggia, braccia alternate, sguardo in avanti
        loop(880L) {
            val a = it * 6.2832f
            rig.poseDy = -0.014f * kotlin.math.abs(kotlin.math.sin(a)).toFloat()
            rig.armLeft = 16f * kotlin.math.sin(a).toFloat()
            rig.armRight = -16f * kotlin.math.sin(a).toFloat()
            rig.headTilt = 1.8f * kotlin.math.sin(a).toFloat()
        }
        loop(2400L) {
            val a = it * 6.2832f
            rig.headDx = 0.01f * kotlin.math.sin(a).toFloat()
            rig.lookAt(0.5f * kotlin.math.sin(a).toFloat(), -0.1f)
        }
    }

    private fun playSuccess() {
        rig.setExpression(BobExpression.HAPPY)
        rig.veil = 0f
        rig.glow = 0.6f
        rig.lookCenter()
        showSparkles()
        halo.alpha = 1f
        val jump = anim(760L, 0, 0f, 1f) {
            rig.poseDy = -0.075f * bell(it)
            rig.poseScale = 1f + 0.09f * bell(it)
            rig.armLeft = 62f * bell(it)
            rig.armRight = 62f * bell(it)
            rig.headTilt = 8f * kotlin.math.sin(it * 6.2832f).toFloat()
        }
        jump.interpolator = DecelerateInterpolator(0.9f)
        anim(1000L, 0, 0f, 1f) { rig.sheen = it }.start()
        jump.start()
        loop(1600L, delay = 700L) { halo.alpha = 0.7f + 0.25f * wave(it) }
    }

    // ------------------------------------------------------------------ utilità

    private fun pokeAnim(dy: Float, tilt: Float, arms: Float) {
        stopAll()
        val a = anim(700L, 0, 0f, 1f) {
            rig.poseDy = dy * bell(it)
            rig.headTilt = tilt * kotlin.math.sin(it * 18.85f).toFloat() * (1f - it)
            rig.armLeft = arms * bell(it)
            rig.armRight = arms * bell(it)
            rig.glow = 0.5f * bell(it)
        }
        a.interpolator = null
        a.start()
    }

    /** Animazione ciclica: `block` riceve 0..1 e viene richiamato a ogni frame. */
    private fun loop(duration: Long, delay: Long = 0L, block: (Float) -> Unit): ValueAnimator =
        ValueAnimator.ofFloat(0f, 1f).apply {
            this.duration = duration
            startDelay = delay
            repeatCount = ValueAnimator.INFINITE
            interpolator = null
            addUpdateListener { block(it.animatedValue as Float) }
            loops.add(this)
            start()
        }

    private fun anim(duration: Long, repeat: Int, from: Float, to: Float, block: (Float) -> Unit) =
        ValueAnimator.ofFloat(from, to).apply {
            this.duration = duration
            repeatCount = repeat
            interpolator = soft
            addUpdateListener { block(it.animatedValue as Float) }
            loops.add(this)
        }

    /** 0→1→0, morbida. */
    private fun bell(t: Float) = (0.5f - 0.5f * kotlin.math.cos(t * 6.2832f)).toFloat()

    /** 0→1→0 identica a bell, nome più leggibile per gli aloni. */
    private fun wave(t: Float) = bell(t)

    private fun curve(t: Float) = ease.getInterpolation(t)

    private val thinkRunnable = object : Runnable {
        override fun run() {
            if (currentMode != BobAvatarMode.THINKING) return
            thinkDotsStep = (thinkDotsStep + 1) % 4
            think.text = context.getString(R.string.bob_avatar_thinking) +
                ".".repeat(thinkDotsStep.coerceAtLeast(1))
            postDelayed(this, 380L)
        }
    }

    private fun showSparkles() {
        sparkles.forEachIndexed { i, s ->
            s.alpha = 1f
            s.rotation = 0f
            loop(1200L + i * 200L) { s.rotation = 360f * it }
            loop(900L + i * 150L, delay = i * 120L) {
                s.alpha = 0.35f + 0.65f * bell(it)
                s.translationY = -12f * bell(it)
            }
        }
    }

    private fun resetOverlays() {
        removeCallbacks(thinkRunnable)
        zzzViews.forEach { it.alpha = 0f; it.translationY = 0f; it.scaleX = 1f; it.scaleY = 1f }
        sparkles.forEach { it.alpha = 0f; it.rotation = 0f; it.translationY = 0f }
        knock.alpha = 0f
        thinkWrap.alpha = 0f
        halo.alpha = 0.55f
        rig.speaking = false
        rig.breathAmp = 1f
        rig.poseDy = 0f
        rig.poseScale = 1f
        rig.poseSquash = 0f
        rig.headTilt = 0f
        rig.headDx = 0f
        rig.headDy = 0f
        rig.armLeft = 0f
        rig.armRight = 0f
        rig.glow = 0f
        rig.veil = 0f
        rig.ring = 0f
        rig.tint = 0f
        rig.sheen = 0f
        rig.tintColor = TINT_COOL
    }

    private fun stopAll() {
        running?.cancel()
        running = null
        loops.forEach { it.cancel() }
        loops.clear()
        halo.animate().cancel()
        knock.animate().cancel()
        thinkWrap.animate().cancel()
    }

    override fun onDetachedFromWindow() {
        stopAll()
        unbindSignals()
        removeCallbacks(thinkRunnable)
        super.onDetachedFromWindow()
    }

    companion object {
        /** blu freddo dell'ascolto, blu profondo del pensiero, rosso del fastidio */
        private val TINT_COOL = 0xFF0E6E9C.toInt()
        private val TINT_DEEP = 0xFF10314F.toInt()
        private val TINT_WARM = 0xFF7A2B1E.toInt()

        private val IDLE_GROUP = setOf(
            BobAvatarMode.IDLE_SLEEP,
            BobAvatarMode.IDLE_KNOCK,
            BobAvatarMode.IDLE_PEEK,
        )
    }
}
