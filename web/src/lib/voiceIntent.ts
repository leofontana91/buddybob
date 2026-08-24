import type { AdminModules } from "./modules";
import { MODULE_LABELS } from "./modules";

export type VoiceModuleId =
  | "appointments"
  | "documents"
  | "goTo"
  | "talkToMe"
  | "games"
  | "callOperator"
  | "voiceMemos"
  | "accessControl";

export type VoiceAction =
  | { type: "speak"; text: string }
  | { type: "goto"; placeName: string; after?: "stay" | "return" }
  | { type: "open"; module: VoiceModuleId }
  | { type: "stop" }
  | { type: "menu" };

export type VoicePlace = { name: string; label: string | null };

export type VoiceResult = {
  speak: string;
  actions: VoiceAction[];
  source: "ai" | "rules";
};

const OPEN_MODULES: {
  id: VoiceModuleId;
  flag: keyof AdminModules;
  phrases: string[];
}[] = [
  {
    id: "appointments",
    flag: "appointments",
    phrases: [
      "appuntamenti",
      "appuntamento",
      "agenda",
      "prenota",
      "ho un appuntamento",
    ],
  },
  {
    id: "documents",
    flag: "documents",
    phrases: ["documenti", "modulo", "moduli", "formulario"],
  },
  {
    id: "goTo",
    flag: "goTo",
    phrases: ["punti mappa", "lista destinazioni", "dove posso andare"],
  },
  {
    id: "talkToMe",
    flag: "speech",
    phrases: ["parla con me", "conversazione"],
  },
  {
    id: "games",
    flag: "games",
    phrases: ["giochi", "gioco"],
  },
  {
    id: "callOperator",
    flag: "callOperator",
    phrases: [
      "chiama operatore",
      "chiama un operatore",
      "chiama qualcuno",
      "aiuto umano",
      "parlare con una persona",
    ],
  },
  {
    id: "voiceMemos",
    flag: "voiceMemos",
    phrases: ["memo vocali", "memo", "messaggio vocale"],
  },
  {
    id: "accessControl",
    flag: "accessControl",
    phrases: ["controllo accessi", "check in", "check-in", "accesso", "visita"],
  },
];

export function normalizeUtterance(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function enabledOpenModules(modules: AdminModules) {
  return OPEN_MODULES.filter((m) => modules[m.flag]);
}

export function matchPlaceName(
  utterance: string,
  places: VoicePlace[]
): string | null {
  const n = normalizeUtterance(utterance);
  if (!n || places.length === 0) return null;

  let best: { name: string; score: number } | null = null;
  for (const p of places) {
    const candidates = [p.name, p.label ?? ""]
      .map(normalizeUtterance)
      .filter(Boolean);
    for (const c of candidates) {
      if (!c) continue;
      let score = 0;
      if (n === c) score = 100;
      else if (n.includes(c)) score = 80 + Math.min(c.length, 19);
      else if (c.includes(n) && n.length >= 3) score = 50 + n.length;
      else {
        const words = n.split(" ");
        if (words.some((w) => w.length >= 3 && (c.includes(w) || w.includes(c)))) {
          score = 40 + Math.min(c.length, 10);
        }
      }
      if (score > 0 && (!best || score > best.score)) {
        best = { name: p.name, score };
      }
    }
  }
  return best && best.score >= 40 ? best.name : null;
}

function extractGotoTarget(normalized: string): string | null {
  const patterns = [
    /(?:accompagnami|portami|accompagnare|portare)\s+(?:a|al|alla|in|nel|nella|lo|la)?\s*(.+)$/,
    /(?:vai|andiamo|voglio andare|vorrei andare|dimmi di andare)\s+(?:a|al|alla|in|nel|nella)?\s*(.+)$/,
    /(?:porta|accompagna)\s+(?:mi\s+)?(?:a|al|alla|in|nel|nella)?\s*(.+)$/,
  ];
  for (const re of patterns) {
    const m = normalized.match(re);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return null;
}

/** Deterministic Italian intents when AI is off or fails. */
export function resolveVoiceRules(args: {
  text: string;
  places: VoicePlace[];
  modules: AdminModules;
}): VoiceResult | null {
  const n = normalizeUtterance(args.text);
  if (n.length < 2) return null;

  if (
    /\b(ferma|stop|basta|fermati|arresta)\b/.test(n) ||
    n === "stop" ||
    n === "ferma"
  ) {
    return {
      speak: "Ok, mi fermo.",
      actions: [{ type: "stop" }],
      source: "rules",
    };
  }

  if (
    /\b(menu|accoglienza|torna indietro|indietro|home|inizio)\b/.test(n)
  ) {
    return {
      speak: "Torno al menu.",
      actions: [{ type: "menu" }],
      source: "rules",
    };
  }

  // Apri moduli / chiama operatore
  for (const mod of enabledOpenModules(args.modules)) {
    const hit = mod.phrases.some((p) => n.includes(normalizeUtterance(p)));
    if (!hit) continue;
    const isCall = mod.id === "callOperator";
    const explicitOpen =
      /\b(apri|aprire|mostra|apriamo|voglio|vorrei|fammi)\b/.test(n) ||
      n === normalizeUtterance(mod.phrases[0] ?? "");
    if (!isCall && !explicitOpen && !/\b(appuntament|document|gioch|memo|access|parla con me)\b/.test(n)) {
      continue;
    }
    if (isCall && !/\b(chiama|chiamare|operat|aiuto|qualcuno|persona)\b/.test(n)) {
      continue;
    }
    const label = MODULE_LABELS[mod.flag] ?? mod.id;
    return {
      speak: isCall ? "Chiamo un operatore." : `Apro ${label}.`,
      actions: [{ type: "open", module: mod.id }],
      source: "rules",
    };
  }

  if (args.modules.goTo) {
    const target = extractGotoTarget(n);
    if (target) {
      const place =
        matchPlaceName(target, args.places) ||
        matchPlaceName(n, args.places);
      if (place) {
        const label =
          args.places.find((p) => p.name === place)?.label || place;
        return {
          speak: `Ok, ti accompagno a ${label}.`,
          actions: [{ type: "goto", placeName: place, after: "stay" }],
          source: "rules",
        };
      }
      return {
        speak: `Non trovo il punto «${target}» sulla mappa.`,
        actions: [],
        source: "rules",
      };
    }
    // "sala riunioni" alone when goTo is on and matches a place
    if (
      !/\b(apri|appuntament|document|gioch|memo|access)\b/.test(n) &&
      n.split(" ").length <= 5
    ) {
      const place = matchPlaceName(n, args.places);
      if (place && n.length >= 4) {
        const label =
          args.places.find((p) => p.name === place)?.label || place;
        return {
          speak: `Ok, vado a ${label}.`,
          actions: [{ type: "goto", placeName: place, after: "stay" }],
          source: "rules",
        };
      }
    }
  }

  return null;
}

export function voiceCatalog(args: {
  places: VoicePlace[];
  modules: AdminModules;
}) {
  const modules = enabledOpenModules(args.modules).map((m) => ({
    id: m.id,
    label: MODULE_LABELS[m.flag],
  }));
  const places = args.places.map((p) => ({
    name: p.name,
    label: p.label || p.name,
  }));
  return { modules, places, goToEnabled: !!args.modules.goTo };
}

export function parseVoiceAiJson(
  raw: string
): (VoiceResult & { newTopic?: boolean }) | null {
  try {
    const cleaned = raw
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "");
    const o = JSON.parse(cleaned) as {
      speak?: string;
      actions?: VoiceAction[];
      newTopic?: boolean;
    };
    if (!o || typeof o.speak !== "string") return null;
    const actions = Array.isArray(o.actions) ? o.actions : [];
    return {
      speak: o.speak.trim() || "Ok.",
      actions: actions.filter(isVoiceAction),
      source: "ai",
      newTopic: o.newTopic === true,
    };
  } catch {
    return null;
  }
}

function isVoiceAction(a: unknown): a is VoiceAction {
  if (!a || typeof a !== "object") return false;
  const t = (a as { type?: string }).type;
  if (t === "speak") {
    return typeof (a as { text?: string }).text === "string";
  }
  if (t === "goto") {
    return typeof (a as { placeName?: string }).placeName === "string";
  }
  if (t === "open") {
    const m = (a as { module?: string }).module;
    return (
      typeof m === "string" &&
      OPEN_MODULES.some((x) => x.id === m)
    );
  }
  if (t === "stop" || t === "menu") return true;
  return false;
}

export function sanitizeVoiceResult(
  result: VoiceResult,
  places: VoicePlace[],
  modules: AdminModules
): VoiceResult {
  const placeNames = new Set(places.map((p) => p.name));
  const allowed = new Set(enabledOpenModules(modules).map((m) => m.id));
  const actions: VoiceAction[] = [];
  for (const a of result.actions) {
    if (a.type === "goto") {
      if (!modules.goTo) continue;
      const matched =
        placeNames.has(a.placeName)
          ? a.placeName
          : matchPlaceName(a.placeName, places);
      if (!matched) continue;
      actions.push({ ...a, placeName: matched });
    } else if (a.type === "open") {
      if (!allowed.has(a.module)) continue;
      actions.push(a);
    } else {
      actions.push(a);
    }
  }
  return { ...result, actions };
}

export function openaiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}
