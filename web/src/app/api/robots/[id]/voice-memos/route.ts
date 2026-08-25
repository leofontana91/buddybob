import { NextResponse } from "next/server";
import { authenticateRobotRequest } from "@/lib/auth";
import { modulesForRobot } from "@/lib/appointments";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Robot: ultimi memo vocali (per UI on-device). */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const robot = await authenticateRobotRequest(
    id,
    req.headers.get("authorization")
  );
  if (!robot) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const modules = await modulesForRobot(id);
  if (!modules.voiceMemos) {
    return NextResponse.json(
      { error: "Modulo memo vocali non attivo" },
      { status: 403 }
    );
  }

  const limit = Math.min(
    30,
    Math.max(1, Number(new URL(req.url).searchParams.get("limit") || 15) || 15)
  );

  const memos = await prisma.voiceMemo.findMany({
    where: { robotId: id },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({
    memos: memos.map((m) => ({
      id: m.id,
      audioUrl: m.audioUrl,
      transcript: m.transcript,
      status: m.status,
      durationMs: m.durationMs,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}
