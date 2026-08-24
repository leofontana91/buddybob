package com.buddybob.robot.ui

import android.app.AlertDialog
import android.text.InputType
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.Toast
import androidx.fragment.app.Fragment
import com.buddybob.robot.BuddybobApp
import com.buddybob.robot.MainActivity
import com.buddybob.robot.R

object SettingsGate {

    fun prompt(fragment: Fragment) {
        val ctx = fragment.requireContext()
        val expected = BuddybobApp.instance.config.current.reception.settingsPin
            .trim()
            .ifBlank { "1234" }
        val pad = (16 * ctx.resources.displayMetrics.density).toInt()
        val input = EditText(ctx).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            hint = ctx.getString(R.string.robot_settings_pin_hint)
        }
        val wrap = FrameLayout(ctx).apply {
            setPadding(pad, pad / 2, pad, 0)
            addView(input)
        }
        AlertDialog.Builder(ctx)
            .setTitle(R.string.robot_settings)
            .setMessage(R.string.robot_settings_pin_msg)
            .setView(wrap)
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton(R.string.robot_settings_open) { _, _ ->
                if (input.text.toString().trim() == expected) {
                    (fragment.activity as? MainActivity)?.switchFragment(
                        RobotSettingsFragment.newInstance()
                    )
                } else {
                    Toast.makeText(ctx, R.string.robot_settings_pin_wrong, Toast.LENGTH_SHORT).show()
                }
            }
            .show()
    }
}
