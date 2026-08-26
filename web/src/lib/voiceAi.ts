import {
  openaiConfigured,
  parseVoiceAiJson,
  sanitizeVoiceResult,
  enforceModuleAvailability,
  voiceCatalog,
  type VoicePlace,
  type VoiceResult,
} from "./voiceIntent";
import type { AdminModules } from "./modules";
import type { VoiceMemMessage } from "./voiceMemory";
import {
  languageInstructionName,
  normalizeSpeechLanguage,
  speechLanguageMeta,
  speechPhrases,
  type SpeechLanguageCode,
} from "./speechLanguage";

export type VoiceAiOutcome = VoiceResult & {
  /** L'ospite ha cambiato argomento in modo netto → azzerare la memoria. */
  newTopic?: boolean;
};

export async function resolveVoiceWithAi(args: {
  text: string;
  places: VoicePlace[];
  modules: AdminModules;
  /** Istruzioni scritte dall'admin (sinonimi, limiti, tono). */
  instructions?: string | null;
  /** Turni precedenti della stessa persona/sessione. */
  history?: VoiceMemMessage[];
  /** Lingua parlato / risposte (UI robot resta italiana). */
  speechLanguage?: string | null;
}): Promise<VoiceAiOutcome | null> {
  if (!openaiConfigured()) return null;

  const lang = normalizeSpeechLanguage(args.speechLanguage);
  const pack = speechPhrases(lang);
  const langName = languageInstructionName(lang);
  const catalog = voiceCatalog(args);
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const key = process.env.OPENAI_API_KEY!.trim();
  const custom = (args.instructions ?? "").trim().slice(0, 4000);
  const history = (args.history ?? []).slice(-6);
  const nowLocal = formatNowForSpeech(lang);
  const enabledIds =
    catalog.modules.map((m) => m.id).join(", ") || "(nessuno)";
  const disabledList =
    catalog.modulesDisabled.length > 0
      ? catalog.modulesDisabled.map((m) => `${m.id} (${m.label})`).join(", ")
      : "(nessuno)";

  const system = `You are BOB, a robot receptionist. Help with robot modules AND small talk with the guest.

ALWAYS speak and write the "speak" field in ${langName} (${speechLanguageMeta(lang).bcp47}). Never switch language unless the guest explicitly asks.

Reply ONLY with valid JSON (no markdown):
{"speak":"text the robot should say","actions":[...],"newTopic":false}

Current date/time (Europe/Rome): ${nowLocal}
Use these values for «what time is it», «what day is it», etc. Do not invent another time.

Allowed actions (only if a robot command is needed now; otherwise actions: []):
- {"type":"open","module":"<id>"}  id ONLY among enabled modules: ${enabledIds}
- {"type":"goto","placeName":"<name>","after":"stay"}  only if goToEnabled and placeName is in places (technical name field)
- {"type":"stop"}
- {"type":"menu"}
- {"type":"speak","text":"..."}  rarely; prefer top-level "speak"

DISABLED modules (you must not open or use them): ${disabledList}
If the guest asks for a disabled module: speak exactly «${pack.moduleDisabledSpeak}» and actions []. Do not invent alternatives.

Fixed rules:
- Use history: references like «there», «that one», «can you take us» refer to prior context.
- If the guest wants to record an audio/memo and voiceMemos is enabled: speak «${pack.voiceMemosOpen}» and actions [{"type":"open","module":"voiceMemos"}]. Do not start recording yourself.
- If the guest says they have an appointment (today / check-in) and appointments is enabled: ask who they are in ${langName} and actions [{"type":"open","module":"appointmentsToday"}].
- For generic «open appointments» (if enabled): module «appointments».
- Free conversation OK: time, date, greetings, short jokes, chat → speak and actions [].
- Live weather/news: you have no data → say so briefly, actions [].
- goto ONLY if goToEnabled and an explicit request to go to a place in places.
- In chat with «go/let's go» without a clear destination: do NOT goto.
- Do not invent map points. No actions on disabled modules.
- speak MUST be in ${langName}.
- If speak is a question (even after a greeting), ALWAYS end with "?". Statements without "?".
${
  custom
    ? `
Additional client instructions (priority for synonyms and style, NOT over fixed rules). Admin may write these in Italian; still answer the guest in ${langName}:
${custom}
`
    : ""
}`;

  const catalogBlock = JSON.stringify({
    goToEnabled: catalog.goToEnabled,
    modulesEnabled: catalog.modules,
    modulesDisabled: catalog.modulesDisabled,
    places: catalog.places,
  });

  const messages: { role: "system" | "user" | "assistant"; content: string }[] =
    [
      { role: "system", content: system },
      {
        role: "system",
        content: `Robot catalog (modules and places):\n${catalogBlock}`,
      },
    ];

  for (const m of history) {
    messages.push({ role: m.role, content: m.content });
  }

  messages.push({
    role: "user",
    content: args.text,
  });

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.45,
        max_tokens: 450,
        response_format: { type: "json_object" },
        messages,
      }),
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => "");
      console.error("[voice-ai]", resp.status, err.slice(0, 300));
      return null;
    }
    const data = (await resp.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = parseVoiceAiJson(content);
    if (!parsed) return null;
    const sanitized = sanitizeVoiceResult(
      parsed,
      args.places,
      args.modules,
      args.text
    );
    const gated = enforceModuleAvailability(
      sanitized,
      args.text,
      args.modules,
      pack.moduleDisabledSpeak
    );
    return {
      ...gated,
      speak: gated.speak,
      newTopic: parsed.newTopic === true,
    };
  } catch (e) {
    console.error("[voice-ai]", e);
    return null;
  }
}

/** Data/ora corrente formattata nella lingua del parlato. */
function formatNowForSpeech(
  lang: SpeechLanguageCode,
  d = new Date()
): string {
  const locale = speechLanguageMeta(lang).bcp47;
  try {
    const weekday = new Intl.DateTimeFormat(locale, {
      timeZone: "Europe/Rome",
      weekday: "long",
    }).format(d);
    const date = new Intl.DateTimeFormat(locale, {
      timeZone: "Europe/Rome",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
    const time = new Intl.DateTimeFormat(locale, {
      timeZone: "Europe/Rome",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
    return `${weekday} ${date}, ${time}`;
  } catch {
    return d.toISOString();
  }
}
