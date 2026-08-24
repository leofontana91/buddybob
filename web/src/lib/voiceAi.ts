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
  const history = args.history ?? [];

  const system = `Sei BOB, receptionist robot (italiano). Conversi con l'ospite e puoi anche eseguire comandi.

Rispondi SOLO con JSON valido (niente markdown):
{"speak":"risposta da far dire al robot","actions":[...],"newTopic":false}

Azioni ammesse (solo se serve ora):
- {"type":"open","module":"<id>"}  id tra: ${catalog.modules.map((m) => m.id).join(", ") || "(nessuno)"}
- {"type":"goto","placeName":"<name>","after":"stay"}  solo se goToEnabled e placeName è nella lista places (campo name tecnico)
- {"type":"stop"}
- {"type":"menu"}
- {"type":"speak","text":"..."}  raramente; preferisci "speak" top-level

Regole fisse:
- Usa la cronologia: riferimenti tipo «là», «quello», «ci puoi accompagnare» riguardano il contesto precedente.
- Puoi fare un discorso breve (domande di chiarimento, conferma), non solo comandi secchi.
- newTopic=true SOLO se l'ospite cambia argomento in modo netto (es. da appuntamenti al meteo, o «parliamo d'altro»). Altrimenti false.
- Non inventare punti mappa: solo quelli in places.
- Non inventare fatti (meteo, notizie, orari non in istruzioni): se non puoi, dillo in speak e actions [].
- Non azioni fuori dai moduli elencati.
- speak in italiano, cordiale, max 35 parole.
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
        temperature: 0.35,
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
    const sanitized = sanitizeVoiceResult(parsed, args.places, args.modules);
    return { ...sanitized, newTopic: parsed.newTopic === true };
  } catch (e) {
    console.error("[voice-ai]", e);
    return null;
  }
}
