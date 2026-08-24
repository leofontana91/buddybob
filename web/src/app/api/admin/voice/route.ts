import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessRobot, requireSession } from "@/lib/auth";
import { modulesForRobot } from "@/lib/appointments";
import { prisma } from "@/lib/db";
import { resolveVoiceWithAi } from "@/lib/voiceAi";
import {
  openaiConfigured,
  resolveVoiceRules,
  type VoicePlace,
} from "@/lib/voiceIntent";

const schema = z.object({
  robotId: z.string().min(1),
  text: z.string().trim().min(1).max(400),
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

  const modules = await modulesForRobot(parsed.data.robotId);
  const mapPlaces = await prisma.mapPlace.findMany({
    where: { robotId: parsed.data.robotId },
    orderBy: { name: "asc" },
  });
  const places: VoicePlace[] = mapPlaces.map((p) => ({
    name: p.name,
    label: p.label,
  }));

  const fromAi = await resolveVoiceWithAi({
    text: parsed.data.text,
    places,
    modules,
  });
  const result =
    fromAi ??
    resolveVoiceRules({
      text: parsed.data.text,
      places,
      modules,
    }) ?? {
      speak:
        "Non ho capito. Prova «apri appuntamenti» o «accompagnami in reception».",
      actions: [],
      source: "rules" as const,
    };

  return NextResponse.json({
    ...result,
    aiConfigured: openaiConfigured(),
  });
}
