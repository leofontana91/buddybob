import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRobotRequest } from "@/lib/auth";
import { modulesForRobot } from "@/lib/appointments";
import { prisma } from "@/lib/db";
import { resolveVoiceWithAi } from "@/lib/voiceAi";
import {
  openaiConfigured,
  resolveVoiceRules,
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
  const fromAi = await resolveVoiceWithAi({
    text,
    places,
    modules,
    instructions: settings?.voiceInstructions,
    history,
  });

  const result =
    fromAi ??
    resolveVoiceRules({ text, places, modules }) ?? {
      speak:
        "Non ho capito. Puoi dire ad esempio «apri appuntamenti» o «accompagnami in reception».",
      actions: [],
      source: "rules" as const,
    };

  if (fromAi?.newTopic) {
    clearVoiceHistory(id, sessionKey);
  }
  appendVoiceTurn(id, sessionKey, text, result.speak);

  return NextResponse.json({
    speak: result.speak,
    actions: result.actions,
    source: result.source,
    aiConfigured: openaiConfigured(),
    memoryTurns: getVoiceHistory(id, sessionKey).filter((m) => m.role === "user")
      .length,
    newTopic: fromAi?.newTopic === true,
  });
}
