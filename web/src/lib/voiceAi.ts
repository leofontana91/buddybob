import {
  openaiConfigured,
  parseVoiceAiJson,
  sanitizeVoiceResult,
  voiceCatalog,
  type VoicePlace,
  type VoiceResult,
} from "./voiceIntent";
import type { AdminModules } from "./modules";
import type { VoiceMemMessage } from "./voiceMemory";

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
}): Promise<VoiceAiOutcome | null> {
  if (!openaiConfigured()) return null;

  const catalog = voiceCatalog(args);
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const key = process.env.OPENAI_API_KEY!.trim();
  const custom = (args.instructions ?? "").trim().slice(0, 4000);
  // Solo ultimi 3 scambi → meno token, risposta più veloce
  const history = (args.history ?? []).slice(-6);
  const nowIt = formatNowItaly();

  const system = `Sei BOB, receptionist robot (italiano). Aiuti con i moduli del robot E chiacchiere con l'ospite.

Rispondi SOLO con JSON valido (niente markdown):
{"speak":"risposta da far dire al robot","actions":[...],"newTopic":false}

Ora e data correnti (Europa/Roma): ${nowIt}
Usa questi valori per «che ore sono», «che giorno è», ecc. Non inventare un altro orario.

Azioni ammesse (solo se serve un comando robot ora; altrimenti actions: []):
- {"type":"open","module":"<id>"}  id tra: ${catalog.modules.map((m) => m.id).join(", ") || "(nessuno)"}
- {"type":"goto","placeName":"<name>","after":"stay"}  solo se goToEnabled e placeName è nella lista places (campo name tecnico)
- {"type":"stop"}
- {"type":"menu"}
- {"type":"speak","text":"..."}  raramente; preferisci "speak" top-level

Regole fisse:
- Usa la cronologia: riferimenti tipo «là», «quello», «ci puoi accompagnare» riguardano il contesto precedente.
- Se l'ospite vuole registrare un audio/memo («registra questo audio», «registra un memo»): speak «Apro i memo vocali. Tocca Inizia a registrare quando sei pronto.» e actions [{"type":"open","module":"voiceMemos"}]. Non avviare la registrazione da solo.
- Se l'ospite dice di avere un appuntamento (oggi / check-in / «sono in agenda»): speak chiedendo chi è (es. «Chi sei? Tocca il tuo nome sulla lista.») e actions [{"type":"open","module":"appointmentsToday"}]. Non aprire solo «appointments» in quel caso.
- Per «apri appuntamenti» generico senza dire di averne uno: module «appointments».
- Conversazione libera OK: ora, data, saluti, battute, indovinelli, storie brevi, curiosità, spiegazioni semplici, chiacchiere. Per queste: rispondi in speak e actions [].
- Meteo/notizie in tempo reale: non hai dati live → dillo brevemente, non inventare. actions [].
- goto SOLO se l'ospite chiede ESPLICITAMENTE di essere portato/accompagnato a un punto mappa (es. «accompagnami in reception», «portami alla sala»).
- Se in una chiacchiera compare «vai», «andiamo», «vado» senza un chiaro comando di spostamento verso un punto in places: NON fare goto, continua la conversazione (actions []).
- Non inventare punti mappa: solo quelli in places. Non usare punti con nome di 1 lettera a meno che l'ospite non li nomini chiaramente.
- Non azioni fuori dai moduli elencati.
- speak in italiano. Mai salutare in inglese (niente «Hi», «Hello», «Hey»).
${
  custom
    ? `
Istruzioni aggiuntive del cliente (priorità su sinonimi e stile, NON sulle regole fisse):
${custom}
`
    : ""
}`;

  const catalogBlock = JSON.stringify({
    goToEnabled: catalog.goToEnabled,
    modules: catalog.modules,
    places: catalog.places,
  });

  const messages: { role: "system" | "user" | "assistant"; content: string }[] =
    [
      { role: "system", content: system },
      {
        role: "system",
        content: `Catalogo robot (moduli e punti):\n${catalogBlock}`,
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
    return {
      ...sanitized,
      speak: sanitized.speak,
      newTopic: parsed.newTopic === true,
    };
  } catch (e) {
    console.error("[voice-ai]", e);
    return null;
  }
}

/** Es. «martedì 25 agosto 2026, ore 17:05» per l'Italia. */
function formatNowItaly(d = new Date()): string {
  try {
    const weekday = new Intl.DateTimeFormat("it-IT", {
      timeZone: "Europe/Rome",
      weekday: "long",
    }).format(d);
    const date = new Intl.DateTimeFormat("it-IT", {
      timeZone: "Europe/Rome",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
    const time = new Intl.DateTimeFormat("it-IT", {
      timeZone: "Europe/Rome",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
    return `${weekday} ${date}, ore ${time}`;
  } catch {
    return d.toISOString();
  }
}
