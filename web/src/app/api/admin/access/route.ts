import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessRobot, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { endOfDay, parse, startOfDay } from "date-fns";

export async function GET(req: Request) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const robotId = url.searchParams.get("robotId");
  if (!robotId) {
    return NextResponse.json({ error: "robotId richiesto" }, { status: 400 });
  }
  if (!(await canAccessRobot(session, robotId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const date = url.searchParams.get("date");
  const openOnly = url.searchParams.get("open") === "1";
  const where: {
    robotId: string;
    exitedAt?: null;
    enteredAt?: { gte: Date; lte: Date };
  } = { robotId };
  if (openOnly) where.exitedAt = null;
  if (date) {
    const day = startOfDay(parse(date, "yyyy-MM-dd", new Date()));
    where.enteredAt = { gte: day, lte: endOfDay(day) };
  }

  const visits = await prisma.accessVisit.findMany({
    where,
    orderBy: { enteredAt: "desc" },
    take: 200,
  });

  return NextResponse.json({
    visits: visits.map((v) => ({
      id: v.id,
      firstName: v.firstName,
      lastName: v.lastName,
      hostUserId: v.hostUserId,
      hostName: v.hostName || "",
      enteredAt: v.enteredAt.toISOString(),
      exitedAt: v.exitedAt?.toISOString() ?? null,
    })),
  });
}

const patchSchema = z.object({
  id: z.string(),
  action: z.enum(["checkout"]),
});

export async function PATCH(req: Request) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
  const visit = await prisma.accessVisit.findUnique({
    where: { id: parsed.data.id },
  });
  if (!visit) {
    return NextResponse.json({ error: "Accesso non trovato" }, { status: 404 });
  }
  if (!(await canAccessRobot(session, visit.robotId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const updated = await prisma.accessVisit.update({
    where: { id: visit.id },
    data: { exitedAt: new Date() },
  });
  return NextResponse.json({
    id: updated.id,
    exitedAt: updated.exitedAt?.toISOString() ?? null,
  });
}
