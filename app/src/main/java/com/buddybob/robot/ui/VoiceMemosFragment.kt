package com.buddybob.robot.ui

import android.media.MediaRecorder
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.buddybob.robot.BuddybobApp
import com.buddybob.robot.MainActivity
import com.buddybob.robot.R
import com.buddybob.robot.platform.VoiceMemosApi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/**
 * Memo vocali: Inizia / Fine → upload + trascrizione; elenco ultimi memo a destra.
 * Se aperto da voce («registra questo audio»), aspetta il tap su Inizia.
 */
class VoiceMemosFragment : Fragment() {

    private val api = VoiceMemosApi()
    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.Main + job)
    private val main = Handler(Looper.getMainLooper())

    private lateinit var status: TextView
    private lateinit var hint: TextView
    private lateinit var timer: TextView
    private lateinit var transcript: TextView
    private lateinit var empty: TextView
    private lateinit var btnStart: Button
    private lateinit var btnStop: Button
    private lateinit var recycler: RecyclerView

    private var recorder: MediaRecorder? = null
    private var outputFile: File? = null
    private var recording = false
    private var startedAtElapsed = 0L
    private var speechWasOn = false
    private var awaitStart = false

    private val adapter = VoiceMemoListAdapter()

    private val timerTick = object : Runnable {
        override fun run() {
            if (!recording || !isAdded) return
            val sec = ((SystemClock.elapsedRealtime() - startedAtElapsed) / 1000L).toInt()
            timer.text = String.format("%02d:%02d", sec / 60, sec % 60)
            main.postDelayed(this, 500L)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        awaitStart = arguments?.getBoolean(ARG_AWAIT_START) == true
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_voice_memos, container, false)
        status = root.findViewById(R.id.text_memo_status)
        hint = root.findViewById(R.id.text_memo_hint)
        timer = root.findViewById(R.id.text_memo_timer)
        transcript = root.findViewById(R.id.text_memo_transcript)
        empty = root.findViewById(R.id.text_memos_empty)
        btnStart = root.findViewById(R.id.btn_memo_start)
        btnStop = root.findViewById(R.id.btn_memo_stop)
        recycler = root.findViewById(R.id.recycler_memos)
        recycler.layoutManager = LinearLayoutManager(requireContext())
        recycler.adapter = adapter

        if (awaitStart) {
            status.setText(R.string.voice_memos_await_start)
            hint.setText(R.string.voice_memos_await_hint)
        }

        btnStart.setOnClickListener { startRecording() }
        btnStop.setOnClickListener { stopAndUpload() }
        root.findViewById<Button>(R.id.btn_memo_back).setOnClickListener {
            if (recording) stopRecorderOnly()
            (activity as? MainActivity)?.openReceptionOrHome()
        }
        loadRecent()
        return root
    }

    private fun loadRecent() {
        if (!BuddybobApp.instance.config.isPaired()) {
            empty.visibility = View.VISIBLE
            empty.setText(R.string.voice_memos_not_paired)
            return
        }
        scope.launch {
            try {
                val res = withContext(Dispatchers.IO) { api.listRecent(20) }
                val items = res.memos
                adapter.submit(items)
                empty.visibility = if (items.isEmpty()) View.VISIBLE else View.GONE
                empty.setText(R.string.voice_memos_empty)
            } catch (e: Exception) {
                BuddybobApp.instance.robot.log("Memo list: ${e.message}")
                empty.visibility = View.VISIBLE
                empty.text = getString(R.string.voice_memos_list_error)
            }
        }
    }

    private fun startRecording() {
        if (recording) return
        if (!BuddybobApp.instance.config.isPaired()) {
            status.setText(R.string.voice_memos_not_paired)
            return
        }
        try {
            val dir = requireContext().cacheDir
            val file = File(dir, "voice_memo_${System.currentTimeMillis()}.m4a")
            outputFile = file

            speechWasOn = BuddybobApp.instance.robot.speech.listeningDesired
            BuddybobApp.instance.robot.speech.setListeningDesired(false)

            @Suppress("DEPRECATION")
            val rec = MediaRecorder().apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioEncodingBitRate(96_000)
                setAudioSamplingRate(44_100)
                setOutputFile(file.absolutePath)
                prepare()
                start()
            }
            recorder = rec
            recording = true
            awaitStart = false
            startedAtElapsed = SystemClock.elapsedRealtime()
            btnStart.isEnabled = false
            btnStop.isEnabled = true
            status.setText(R.string.voice_memos_recording)
            timer.visibility = View.VISIBLE
            timer.text = "00:00"
            transcript.text = ""
            main.post(timerTick)
        } catch (e: Exception) {
            BuddybobApp.instance.robot.log("Memo record failed: ${e.message}")
            status.setText(R.string.voice_memos_record_error)
            restoreSpeech()
            cleanupRecorder()
        }
    }

    private fun stopAndUpload() {
        if (!recording) return
        main.removeCallbacks(timerTick)
        val file = outputFile
        val durationMs = SystemClock.elapsedRealtime() - startedAtElapsed
        try {
            recorder?.apply {
                stop()
                release()
            }
        } catch (e: Exception) {
            BuddybobApp.instance.robot.log("Memo stop: ${e.message}")
        }
        recorder = null
        recording = false
        btnStop.isEnabled = false
        btnStart.isEnabled = false
        status.setText(R.string.voice_memos_uploading)
        timer.visibility = View.GONE

        if (file == null || !file.exists() || file.length() < 200) {
            status.setText(R.string.voice_memos_record_error)
            btnStart.isEnabled = true
            restoreSpeech()
            return
        }

        scope.launch {
            try {
                val result = withContext(Dispatchers.IO) {
                    api.uploadAndTranscribe(file, "audio/mp4", durationMs)
                }
                val text = result.transcript?.trim().orEmpty()
                if (text.isNotEmpty()) {
                    transcript.text = text
                    status.setText(R.string.voice_memos_done)
                    BuddybobApp.instance.robot.speech.speak(
                        result.speak ?: getString(R.string.voice_memos_done_speak)
                    )
                } else {
                    transcript.text = result.error
                        ?: getString(R.string.voice_memos_no_transcript)
                    status.setText(R.string.voice_memos_saved_no_transcript)
                    result.speak?.let { BuddybobApp.instance.robot.speech.speak(it) }
                }
                loadRecent()
            } catch (e: Exception) {
                BuddybobApp.instance.robot.log("Memo upload: ${e.message}")
                status.setText(R.string.voice_memos_upload_error)
                transcript.text = e.message ?: ""
            } finally {
                runCatching { file.delete() }
                btnStart.isEnabled = true
                restoreSpeech()
            }
        }
    }

    private fun stopRecorderOnly() {
        main.removeCallbacks(timerTick)
        try {
            recorder?.apply {
                stop()
                release()
            }
        } catch (_: Exception) {
        }
        recorder = null
        recording = false
        outputFile?.delete()
        outputFile = null
        restoreSpeech()
    }

    private fun cleanupRecorder() {
        try {
            recorder?.release()
        } catch (_: Exception) {
        }
        recorder = null
        recording = false
        outputFile?.delete()
        outputFile = null
        btnStart.isEnabled = true
        btnStop.isEnabled = false
    }

    private fun restoreSpeech() {
        if (speechWasOn && BuddybobApp.instance.config.current.modules.speech) {
            BuddybobApp.instance.robot.speech.setListeningDesired(true)
        }
    }

    override fun onPause() {
        if (recording) stopRecorderOnly()
        super.onPause()
    }

    override fun onDestroyView() {
        main.removeCallbacks(timerTick)
        job.cancel()
        if (recording) stopRecorderOnly()
        super.onDestroyView()
    }

    companion object {
        private const val ARG_AWAIT_START = "await_start"

        fun newInstance(awaitStart: Boolean = false) = VoiceMemosFragment().apply {
            arguments = Bundle().apply {
                putBoolean(ARG_AWAIT_START, awaitStart)
            }
        }
    }
}

private class VoiceMemoListAdapter : RecyclerView.Adapter<VoiceMemoListAdapter.Holder>() {

    private var items: List<VoiceMemosApi.MemoDto> = emptyList()
    private val fmt = SimpleDateFormat("d MMM · HH:mm", Locale.ITALY).apply {
        timeZone = TimeZone.getDefault()
    }
    private val iso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }
    private val isoNoMs = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    class Holder(view: View) : RecyclerView.ViewHolder(view) {
        val meta: TextView = view.findViewById(R.id.text_memo_item_meta)
        val body: TextView = view.findViewById(R.id.text_memo_item_body)
    }

    fun submit(list: List<VoiceMemosApi.MemoDto>) {
        items = list
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val v = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_voice_memo, parent, false)
        return Holder(v)
    }

    override fun onBindViewHolder(holder: Holder, position: Int) {
        val item = items[position]
        val whenStr = formatWhen(item.createdAt)
        val dur = item.durationMs?.let { "${(it / 1000).coerceAtLeast(1)}s" }
        holder.meta.text = listOfNotNull(whenStr, dur).joinToString(" · ")
        val body = item.transcript?.trim().orEmpty()
        holder.body.text = when {
            body.isNotEmpty() -> body
            item.status == "failed" -> holder.itemView.context.getString(R.string.voice_memos_no_transcript)
            item.status == "pending" -> "…"
            else -> holder.itemView.context.getString(R.string.voice_memos_no_transcript)
        }
    }

    override fun getItemCount(): Int = items.size

    private fun formatWhen(raw: String?): String {
        if (raw.isNullOrBlank()) return ""
        val cleaned = raw.replace(Regex("\\.\\d{3}\\d*"), ".SSS")
        val date = runCatching { iso.parse(raw) }.getOrNull()
            ?: runCatching { isoNoMs.parse(raw.take(20) + "Z") }.getOrNull()
            ?: runCatching {
                SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US).parse(raw)
            }.getOrNull()
        return if (date != null) fmt.format(date) else cleaned.take(16)
    }
}
