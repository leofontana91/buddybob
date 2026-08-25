import { openaiConfigured } from "./voiceIntent";

/**
 * Trascrive un file audio con OpenAI Whisper (italiano).
 */
export async function transcribeAudio(params: {
  bytes: ArrayBuffer | Buffer;
  fileName: string;
  contentType: string;
}): Promise<string> {
  if (!openaiConfigured()) {
    throw new Error("OPENAI_API_KEY non configurata");
  }
  const key = process.env.OPENAI_API_KEY!.trim();
  const blob = new Blob([new Uint8Array(params.bytes as ArrayBuffer)], {
    type: params.contentType || "audio/mp4",
  });
  const form = new FormData();
  form.append("file", blob, params.fileName || "memo.m4a");
  form.append("model", "whisper-1");
  form.append("language", "it");
  form.append("response_format", "text");

  const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error(`Whisper ${resp.status}: ${err.slice(0, 200)}`);
  }
  const text = (await resp.text()).trim();
  return text.slice(0, 8000);
}
