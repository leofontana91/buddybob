import { NextResponse } from "next/server";
import { authenticateRobotRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string; visitId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id, visitId } = await ctx.params;
  const robot = await authenticateRobotRequest(
    id,
    req.headers.get("authorization")
  );
  if (!robot) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const visit = await prisma.accessVisit.findFirst({
    where: { id: visitId, robotId: id },
  });
  if (!visit) {
    return NextResponse.json({ error: "Accesso non trovato" }, { status: 404 });
  }
  if (visit.exitedAt) {
    return NextResponse.json({
      id: visit.id,
      exitedAt: visit.exitedAt.toISOString(),
      speak: "Uscita già registrata.",
    });
  }

  const updated = await prisma.accessVisit.update({
    where: { id: visit.id },
    data: { exitedAt: new Date() },
  });

  return NextResponse.json({
    id: updated.id,
    exitedAt: updated.exitedAt?.toISOString() ?? null,
    speak: `Arrivederci ${updated.firstName}. Uscita registrata.`,
  });
}
