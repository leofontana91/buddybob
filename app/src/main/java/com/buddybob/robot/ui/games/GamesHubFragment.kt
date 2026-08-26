package com.buddybob.robot.ui.games

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import androidx.fragment.app.Fragment
import com.buddybob.robot.BuddybobApp
import com.buddybob.robot.MainActivity
import com.buddybob.robot.R

/**
 * Hub giochi: WebView a schermo intero sull’URL da config (`games.url`).
 * Default: RoboPlay / Base44.
 */
class GamesHubFragment : Fragment() {

    private var webView: WebView? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_games_hub, container, false)
        val progress = root.findViewById<ProgressBar>(R.id.progress_games)
        val error = root.findViewById<TextView>(R.id.text_games_error)
        val web = root.findViewById<WebView>(R.id.webview_games)
        webView = web

        root.findViewById<Button>(R.id.btn_games_close).setOnClickListener {
            (activity as? MainActivity)?.openReceptionOrHome()
        }

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            loadWithOverviewMode = true
            useWideViewPort = true
            builtInZoomControls = false
            displayZoomControls = false
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = "$userAgentString BuddybobRobot/1"
        }
        web.setBackgroundColor(0xFF17181B.toInt())
        web.webChromeClient = WebChromeClient()
        web.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                progress.visibility = View.VISIBLE
                error.visibility = View.GONE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                progress.visibility = View.GONE
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                resourceError: WebResourceError?
            ) {
                if (request?.isForMainFrame == true) {
                    progress.visibility = View.GONE
                    error.visibility = View.VISIBLE
                    error.text = getString(R.string.games_load_failed)
                }
            }
        }

        val url = BuddybobApp.instance.config.current.games.url.trim()
            .ifBlank { DEFAULT_URL }
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            error.visibility = View.VISIBLE
            error.text = getString(R.string.games_bad_url)
        } else {
            web.loadUrl(url)
        }
        return root
    }

    override fun onResume() {
        super.onResume()
        BuddybobApp.instance.suspendVoiceForUiFeature()
        (activity as? MainActivity)?.hideVoiceTranscript()
        webView?.onResume()
    }

    override fun onPause() {
        webView?.onPause()
        BuddybobApp.instance.resumeVoiceAfterUiFeature()
        super.onPause()
    }

    override fun onDestroyView() {
        webView?.apply {
            stopLoading()
            loadUrl("about:blank")
            destroy()
        }
        webView = null
        super.onDestroyView()
    }

    companion object {
        private const val DEFAULT_URL = "https://robo-play-land.base44.app"
        fun newInstance() = GamesHubFragment()
    }
}
