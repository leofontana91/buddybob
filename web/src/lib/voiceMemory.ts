/**
 * Memoria conversazione vocale in-process (per robot + sessione/persona).
 * Su Vercel serverless può resettarsi tra istanze: va bene come best-effort;
 * la chiave sessione (persona) evita di mischiare ospiti diversi.
 */

export type VoiceMemMessage = {
  role: "user" | "assistant";
  content: string;
};

type Session = {
  messages: VoiceMemMessage[];
  updatedAt: number;
};

const TTL_MS = 5 * 60_000;
const MAX_TURNS = 4; // 4 scambi → meno contesto, AI più veloce
const store = new Map<string, Session>();

function key(robotId: string, sessionKey: string) {
  return `${robotId}::${sessionKey.trim() || "anon"}`;
}

function pruneExpired() {
  const now = Date.now();
  for (const [k, s] of store) {
    if (now - s.updatedAt > TTL_MS) store.delete(k);
  }
}

export function getVoiceHistory(
  robotId: string,
  sessionKey: string
): VoiceMemMessage[] {
  pruneExpired();
  const s = store.get(key(robotId, sessionKey));
  if (!s) return [];
  if (Date.now() - s.updatedAt > TTL_MS) {
    store.delete(key(robotId, sessionKey));
    return [];
  }
  return s.messages.slice();
}

export function clearVoiceHistory(robotId: string, sessionKey: string) {
  store.delete(key(robotId, sessionKey));
}

export function appendVoiceTurn(
  robotId: string,
  sessionKey: string,
  userText: string,
  assistantSpeak: string
) {
  pruneExpired();
  const k = key(robotId, sessionKey);
  const prev = store.get(k)?.messages ?? [];
  const next: VoiceMemMessage[] = [
    ...prev,
    { role: "user", content: userText.slice(0, 400) },
    { role: "assistant", content: assistantSpeak.slice(0, 400) },
  ];
  // Mantieni solo gli ultimi MAX_TURNS scambi
  const trimmed =
    next.length > MAX_TURNS * 2 ? next.slice(-MAX_TURNS * 2) : next;
  store.set(k, { messages: trimmed, updatedAt: Date.now() });
}
