import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRobotRequest } from "@/lib/auth";
import { modulesForRobot } from "@/lib/appointments";
import { prisma } from "@/lib/db";
import { resolveVoiceWithAi } from "@/lib/voiceAi";
import {
  openaiConfigured,
  resolveVoiceRules,
  ensureItalianQuestionMark,
  type VoicePlace,
} from "@/lib/voiceIntent";
import {
  appendVoiceTurn,
  clearVoiceHistory,
  getVoiceHistory,
} from "@/lib/voiceMemory";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  text: z.string().trim().min(1).max(400),
  /** Id persona / sessione: stessa chiave = stesso discorso in memoria. */
  sessionKey: z.string().trim().min(1).max(80).optional(),
  /** Forza azzeramento memoria (cambio persona lato robot). */
  reset: z.boolean().optional(),
});

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const robot = await authenticateRobotRequest(
    id,
    req.headers.get("authorization")
  );
  if (!robot) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Testo richiesto" }, { status: 400 });
  }

  const modules = await modulesForRobot(id);
  if (!modules.speech) {
    return NextResponse.json({
      speak: "Il modulo voce non è attivo.",
      actions: [],
      source: "rules",
    });
  }

  const mapPlaces = await prisma.mapPlace.findMany({
    where: { robotId: id },
    orderBy: { name: "asc" },
  });
  const places: VoicePlace[] = mapPlaces.map((p) => ({
    name: p.name,
    label: p.label,
  }));

  const settings = await prisma.robotSettings.findUnique({ where: { robotId: id } });
  const text = parsed.data.text;
  const sessionKey = parsed.data.sessionKey?.trim() || "default";

  if (parsed.data.reset) {
    clearVoiceHistory(id, sessionKey);
  }

  const history = getVoiceHistory(id, sessionKey);
  // Comandi chiari o orario/data: regole locali subito, senza attendere OpenAI.
  const rulesHit = resolveVoiceRules({ text, places, modules });
  const n = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/gi, " ");
  const clockOrDate =
    /\b(che ore sono|che ora|orario|che giorno|che data)\b/.test(n) ||
    n.trim() === "ora";
  const fastPath =
    rulesHit != null &&
    (rulesHit.actions.length > 0 || clockOrDate);

  const fromAi = fastPath
    ? null
    : await resolveVoiceWithAi({
        text,
        places,
        modules,
        instructions: settings?.voiceInstructions,
        history,
      });

  const result =
    (fastPath ? rulesHit : null) ??
    fromAi ??
    rulesHit ?? {
      speak:
        "Non ho capito. Puoi dire ad esempio «apri appuntamenti» o «accompagnami in reception».",
      actions: [],
      source: "rules" as const,
    };

  if (fromAi?.newTopic) {
    clearVoiceHistory(id, sessionKey);
  }
  const speak = ensureItalianQuestionMark(result.speak);
  appendVoiceTurn(id, sessionKey, text, speak);

  return NextResponse.json({
    speak,
    actions: result.actions,
    source: result.source,
    aiConfigured: openaiConfigured(),
    memoryTurns: getVoiceHistory(id, sessionKey).filter((m) => m.role === "user")
      .length,
    newTopic: fromAi?.newTopic === true,
  });
}
