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

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  text: z.string().trim().min(1).max(400),
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

  const text = parsed.data.text;
  const fromAi = await resolveVoiceWithAi({ text, places, modules });
  const result =
    fromAi ??
    resolveVoiceRules({ text, places, modules }) ?? {
      speak: "Non ho capito. Puoi dire ad esempio «apri appuntamenti» o «accompagnami in reception».",
      actions: [],
      source: "rules" as const,
    };

  return NextResponse.json({
    ...result,
    aiConfigured: openaiConfigured(),
  });
}
