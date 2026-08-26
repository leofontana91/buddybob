import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRobotRequest } from "@/lib/auth";
import { modulesForRobot } from "@/lib/appointments";
import { prisma } from "@/lib/db";
import { resolveVoiceWithAi } from "@/lib/voiceAi";
import {
  openaiConfigured,
  ensureSpeechQuestionMark,
  placesForVoiceAi,
  type VoicePlace,
} from "@/lib/voiceIntent";
import {
  appendVoiceTurn,
  clearVoiceHistory,
  getVoiceHistory,
} from "@/lib/voiceMemory";
import {
  normalizeSpeechLanguage,
  speechAiUnavailable,
  speechPhrases,
} from "@/lib/speechLanguage";

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

  const settings = await prisma.robotSettings.findUnique({
    where: { robotId: id },
  });
  const lang = normalizeSpeechLanguage(settings?.speechLanguage);
  const pack = speechPhrases(lang);

  const modules = await modulesForRobot(id);
  if (!modules.speech) {
    return NextResponse.json({
      speak: pack.speechModuleOff,
      actions: [],
      source: "rules",
    });
  }

  const mapPlaces = await prisma.mapPlace.findMany({
    where: { robotId: id },
    orderBy: { name: "asc" },
  });
  // Nomi corti (es. «a») esclusi: non possono innescare goto
  const places: VoicePlace[] = placesForVoiceAi(
    mapPlaces.map((p) => ({
      name: p.name,
      label: p.label,
    }))
  );

  const text = parsed.data.text;
  const sessionKey = parsed.data.sessionKey?.trim() || "default";

  if (parsed.data.reset) {
    clearVoiceHistory(id, sessionKey);
  }

  const history = getVoiceHistory(id, sessionKey);

  // Tutto dall’AI — niente regole locali goto/apri (evitano falsi «vado a a»)
  if (!openaiConfigured()) {
    return NextResponse.json({
      speak: pack.openaiMissing,
      actions: [],
      source: "rules",
      aiConfigured: false,
    });
  }

  const fromAi = await resolveVoiceWithAi({
    text,
    places,
    modules,
    instructions: settings?.voiceInstructions,
    history,
    speechLanguage: lang,
  });

  const result = fromAi ?? {
    speak: speechAiUnavailable(lang),
    actions: [] as const,
    source: "rules" as const,
  };

  if (fromAi?.newTopic) {
    clearVoiceHistory(id, sessionKey);
  }
  const speak = ensureSpeechQuestionMark(result.speak);
  appendVoiceTurn(id, sessionKey, text, speak);

  return NextResponse.json({
    speak,
    actions: result.actions,
    source: result.source,
    aiConfigured: true,
    memoryTurns: getVoiceHistory(id, sessionKey).filter((m) => m.role === "user")
      .length,
    newTopic: fromAi?.newTopic === true,
  });
}
