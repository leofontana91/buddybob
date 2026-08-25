package com.buddybob.robot.ui.widget

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View
import androidx.core.content.ContextCompat
import com.buddybob.robot.R

/** Icona batteria vettoriale con livello e stato di carica. */
class BatteryIconView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = dp(1.6f)
        color = ContextCompat.getColor(context, R.color.bob_white)
    }
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        color = ContextCompat.getColor(context, R.color.bob_white)
    }
    private val tip = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        color = ContextCompat.getColor(context, R.color.bob_white)
    }
    private val body = RectF()
    private val tipRect = RectF()
    private val bolt = Path()

    /** 0–100 */
    var level: Int = 100
        set(value) {
            field = value.coerceIn(0, 100)
            invalidate()
        }

    var charging: Boolean = false
        set(value) {
            field = value
            invalidate()
        }

    override fun onDraw(canvas: Canvas) {
        val pad = stroke.strokeWidth
        val tipW = dp(2.2f)
        val gap = dp(1.2f)
        val h = height - pad * 2
        val bodyW = width - pad * 2 - tipW - gap
        body.set(pad, pad, pad + bodyW, pad + h)
        tipRect.set(
            body.right + gap,
            height * 0.28f,
            body.right + gap + tipW,
            height * 0.72f
        )

        // Fill level
        val low = level <= 20 && !charging
        fill.color = if (low) {
            ContextCompat.getColor(context, R.color.bob_danger)
        } else {
            ContextCompat.getColor(context, R.color.bob_white)
        }
        stroke.color = fill.color
        tip.color = fill.color

        val inset = dp(2.2f)
        val fillMax = body.width() - inset * 2
        val fillW = fillMax * (level / 100f)
        if (fillW > 0f) {
            canvas.drawRoundRect(
                body.left + inset,
                body.top + inset,
                body.left + inset + fillW,
                body.bottom - inset,
                dp(1.2f),
                dp(1.2f),
                fill
            )
        }

        canvas.drawRoundRect(body, dp(2.5f), dp(2.5f), stroke)
        canvas.drawRoundRect(tipRect, dp(1f), dp(1f), tip)

        if (charging) {
            bolt.reset()
            val cx = body.centerX()
            val cy = body.centerY()
            bolt.moveTo(cx + dp(1.2f), cy - dp(4.5f))
            bolt.lineTo(cx - dp(2.2f), cy + dp(0.4f))
            bolt.lineTo(cx + dp(0.2f), cy + dp(0.4f))
            bolt.lineTo(cx - dp(1.2f), cy + dp(4.5f))
            bolt.lineTo(cx + dp(2.2f), cy - dp(0.4f))
            bolt.lineTo(cx - dp(0.2f), cy - dp(0.4f))
            bolt.close()
            fill.color = ContextCompat.getColor(context, R.color.bob_black)
            canvas.drawPath(bolt, fill)
        }
    }

    private fun dp(v: Float): Float = v * resources.displayMetrics.density
}
