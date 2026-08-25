import { NextResponse } from "next/server";
import { canAccessRobot, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin: elenco memo vocali di un robot. */
export async function GET(req: Request) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const robotId = new URL(req.url).searchParams.get("robotId")?.trim() || "";
  if (!robotId) {
    return NextResponse.json({ error: "robotId richiesto" }, { status: 400 });
  }
  if (!(await canAccessRobot(session, robotId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const memos = await prisma.voiceMemo.findMany({
    where: { robotId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    memos: memos.map((m) => ({
      id: m.id,
      audioUrl: m.audioUrl,
      transcript: m.transcript,
      status: m.status,
      durationMs: m.durationMs,
      errorMessage: m.errorMessage,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}
