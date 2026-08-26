import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessRobot, requireSession } from "@/lib/auth";
import { modulesForRobot } from "@/lib/appointments";
import { prisma } from "@/lib/db";
import { resolveVoiceWithAi } from "@/lib/voiceAi";
import {
  ensureSpeechQuestionMark,
  openaiConfigured,
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
} from "@/lib/speechLanguage";

const schema = z.object({
  robotId: z.string().min(1),
  text: z.string().trim().max(400).optional(),
  sessionKey: z.string().trim().min(1).max(80).optional(),
  reset: z.boolean().optional(),
  clearOnly: z.boolean().optional(),
});

export async function GET() {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    aiConfigured: openaiConfigured(),
    model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
  });
}

export async function POST(req: Request) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
  if (!(await canAccessRobot(session, parsed.data.robotId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessionKey = parsed.data.sessionKey?.trim() || "admin-preview";

  if (parsed.data.clearOnly || (parsed.data.reset && !parsed.data.text?.trim())) {
    clearVoiceHistory(parsed.data.robotId, sessionKey);
    return NextResponse.json({
      ok: true,
      cleared: true,
      memoryTurns: 0,
      aiConfigured: openaiConfigured(),
    });
  }

  const text = parsed.data.text?.trim() ?? "";
  if (text.length < 1) {
    return NextResponse.json({ error: "Testo richiesto" }, { status: 400 });
  }

  const modules = await modulesForRobot(parsed.data.robotId);
  const mapPlaces = await prisma.mapPlace.findMany({
    where: { robotId: parsed.data.robotId },
    orderBy: { name: "asc" },
  });
  const places: VoicePlace[] = placesForVoiceAi(
    mapPlaces.map((p) => ({
      name: p.name,
      label: p.label,
    }))
  );
  const settings = await prisma.robotSettings.findUnique({
    where: { robotId: parsed.data.robotId },
  });
  const lang = normalizeSpeechLanguage(settings?.speechLanguage);

  if (parsed.data.reset) {
    clearVoiceHistory(parsed.data.robotId, sessionKey);
  }
  const history = getVoiceHistory(parsed.data.robotId, sessionKey);

  if (!openaiConfigured()) {
    return NextResponse.json({
      speak: "OPENAI_API_KEY non configurata.",
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
    clearVoiceHistory(parsed.data.robotId, sessionKey);
  }
  const speak = ensureSpeechQuestionMark(result.speak);
  appendVoiceTurn(parsed.data.robotId, sessionKey, text, speak);

  return NextResponse.json({
    ...result,
    speak,
    aiConfigured: true,
    memoryTurns: getVoiceHistory(parsed.data.robotId, sessionKey).filter(
      (m) => m.role === "user"
    ).length,
    newTopic: fromAi?.newTopic === true,
  });
}
