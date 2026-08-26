import type { AdminModules } from "./modules";
import { MODULE_LABELS } from "./modules";

export type VoiceModuleId =
  | "appointments"
  | "appointmentsToday"
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
    phrases: [
      "memo vocali",
      "memo",
      "messaggio vocale",
      "registra questo audio",
      "registra un audio",
      "registra un memo",
      "registra memo",
      "inizia a registrare",
    ],
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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Match del punto come parola/frase intera, non come sottostringa («a» in «stai»). */
function hasWholePhrase(haystack: string, phrase: string): boolean {
  if (!phrase) return false;
  return new RegExp(`(?:^|\\s)${escapeRegExp(phrase)}(?:\\s|$)`).test(haystack);
}

function placeCandidates(p: VoicePlace): string[] {
  return [p.name, p.label ?? ""]
    .map(normalizeUtterance)
    .filter(Boolean);
}

/** Punti usabili dalla voce: esclude nomi/etichette troppo corti (es. «a»). */
export function placesForVoiceAi(places: VoicePlace[]): VoicePlace[] {
  return places.filter((p) =>
    placeCandidates(p).some((c) => c.length >= 3)
  );
}

/**
 * Trova un punto mappa citato nell'utterance.
 * Nomi corti (es. «a») matchano SOLO come parola intera, mai come lettera dentro altre parole.
 */
export function matchPlaceName(
  utterance: string,
  places: VoicePlace[]
): string | null {
  const n = normalizeUtterance(utterance);
  if (!n || places.length === 0) return null;
  const words = n.split(" ").filter(Boolean);

  let best: { name: string; score: number } | null = null;
  for (const p of places) {
    for (const c of placeCandidates(p)) {
      let score = 0;
      if (n === c) {
        score = 100;
      } else if (c.length >= 3 && hasWholePhrase(n, c)) {
        score = 80 + Math.min(c.length, 19);
      } else if (c.length >= 5 && n.includes(c)) {
        score = 55 + Math.min(c.length, 10);
      } else if (c.length >= 3 && c.includes(n) && n.length >= 4) {
        score = 50 + Math.min(n.length, 20);
      } else if (c.length >= 3) {
        if (
          words.some(
            (w) => w.length >= 4 && (c === w || c.includes(w))
          )
        ) {
          score = 42 + Math.min(c.length, 10);
        }
      } else if (words.includes(c) && words.length <= 2) {
        // Nome 1–2 caratteri: solo frase brevissima tipo «a» / «vai a»
        score = 90;
      }
      if (score > 0 && (!best || score > best.score)) {
        best = { name: p.name, score };
      }
    }
  }
  return best && best.score >= 42 ? best.name : null;
}

/** True se l'utente ha davvero citato quel punto (parola intera). */
export function utteranceMentionsPlace(
  utterance: string,
  placeName: string,
  places: VoicePlace[]
): boolean {
  const n = normalizeUtterance(utterance);
  const p = places.find((x) => x.name === placeName);
  if (!p || !n) return false;
  return placeCandidates(p).some((c) => {
    if (c.length < 3) return hasWholePhrase(n, c);
    return hasWholePhrase(n, c) || (c.length >= 5 && n.includes(c));
  });
}

/** @deprecated Le API voce usano solo l’AI. */
export function resolveVoiceRules(args: {
  text: string;
  places: VoicePlace[];
  modules: AdminModules;
}): VoiceResult | null {
  void args;
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
  if (args.modules.appointments) {
    modules.push({
      id: "appointmentsToday",
      label: "Check-in appuntamento di oggi (lista nomi)",
    });
  }
  const places = placesForVoiceAi(args.places).map((p) => ({
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
      (OPEN_MODULES.some((x) => x.id === m) || m === "appointmentsToday")
    );
  }
  if (t === "stop" || t === "menu") return true;
  return false;
}

export function sanitizeVoiceResult(
  result: VoiceResult,
  places: VoicePlace[],
  modules: AdminModules,
  utterance?: string
): VoiceResult {
  const usable = placesForVoiceAi(places);
  const placeNames = new Set(usable.map((p) => p.name));
  const allowed = new Set(enabledOpenModules(modules).map((m) => m.id));
  const actions: VoiceAction[] = [];
  const n = utterance ? normalizeUtterance(utterance) : "";
  const explicitGoto = n
    ? /\b(accompagnami|portami|voglio andare|vorrei andare)\b/.test(n) ||
      (/\b(vai|andiamo)\b/.test(n) &&
        /\b(a|al|alla|in|nel|nella)\b/.test(n) &&
        n.split(/\s+/).length <= 8)
    : false;

  for (const a of result.actions) {
    if (a.type === "goto") {
      if (!modules.goTo) continue;
      // Mai punti ambigui tipo «a»
      if (!placeNames.has(a.placeName)) {
        const matched = matchPlaceName(a.placeName, usable);
        if (!matched) continue;
        if (utterance && !utteranceMentionsPlace(utterance, matched, usable)) {
          continue;
        }
        if (utterance && !explicitGoto) continue;
        actions.push({ ...a, placeName: matched });
        continue;
      }
      if (utterance) {
        if (!utteranceMentionsPlace(utterance, a.placeName, usable)) continue;
        if (!explicitGoto) continue;
      }
      actions.push(a);
    } else if (a.type === "open") {
      if (a.module === "appointmentsToday") {
        if (!modules.appointments) continue;
        actions.push(a);
        continue;
      }
      if (!allowed.has(a.module)) continue;
      actions.push(a);
    } else {
      actions.push(a);
    }
  }
  return {
    ...result,
    speak: ensureItalianQuestionMark(result.speak),
    actions,
  };
}

/** Aggiunge «?» se la frase è chiaramente una domanda senza punto. */
export function ensureItalianQuestionMark(speak: string): string {
  const t = speak.trim();
  if (!t || /[?!…]$/.test(t)) return t;
  const lower = t.toLowerCase();
  const starts =
    /^(chi|che|cosa|come|dove|quando|perché|perche|quanto|quale|quali|puoi|potresti|vuoi|vorresti|sai|mi (puoi|sai|dici)|hai |c'?è |ci sono|posso|possiamo)\b/.test(
      lower
    );
  return starts ? `${t}?` : t;
}

export function openaiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}
