import {
  openaiConfigured,
  parseVoiceAiJson,
  sanitizeVoiceResult,
  voiceCatalog,
  type VoicePlace,
  type VoiceResult,
} from "./voiceIntent";
import type { AdminModules } from "./modules";

export async function resolveVoiceWithAi(args: {
  text: string;
  places: VoicePlace[];
  modules: AdminModules;
}): Promise<VoiceResult | null> {
  if (!openaiConfigured()) return null;

  const catalog = voiceCatalog(args);
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const key = process.env.OPENAI_API_KEY!.trim();

  const system = `Sei il parser di intenti del robot receptionist BOB (italiano).
Dato ciò che ha detto l'ospite, rispondi SOLO con JSON valido (niente markdown):
{"speak":"frase breve da far dire al robot","actions":[...]}

Azioni ammesse:
- {"type":"open","module":"<id>"}  id tra: ${catalog.modules.map((m) => m.id).join(", ") || "(nessuno)"}
- {"type":"goto","placeName":"<name>","after":"stay"}  solo se goToEnabled e placeName è nella lista places (usa il campo name tecnico)
- {"type":"stop"}
- {"type":"menu"}
- {"type":"speak","text":"..."}  raramente, preferisci "speak" top-level

Regole:
- Comandi tipo "apri appuntamenti", "accompagnami a sala riunioni", "chiama un operatore", "fermati", "torna al menu".
- Non inventare punti mappa: solo quelli in places.
- Se non capisci: speak di scusa e actions [].
- speak in italiano, max 12 parole, tono cordiale.`;

  const user = JSON.stringify({
    utterance: args.text,
    goToEnabled: catalog.goToEnabled,
    modules: catalog.modules,
    places: catalog.places,
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
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
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
    return sanitizeVoiceResult(parsed, args.places, args.modules);
  } catch (e) {
    console.error("[voice-ai]", e);
    return null;
  }
}
