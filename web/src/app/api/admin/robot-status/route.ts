import { NextResponse } from "next/server";
import { canAccessRobot, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { format } from "date-fns";

export async function GET(req: Request) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const robotId = new URL(req.url).searchParams.get("robotId");
  if (!robotId) {
    return NextResponse.json({ error: "robotId richiesto" }, { status: 400 });
  }
  if (!(await canAccessRobot(session, robotId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const robot = await prisma.robot.findUnique({ where: { id: robotId } });
  if (!robot) {
    return NextResponse.json({ error: "Robot non trovato" }, { status: 404 });
  }

  const lastSeen = robot.lastSeenAt?.getTime() ?? 0;
  const online = lastSeen > 0 && Date.now() - lastSeen < 20_000;

  // Se lastPlace è un nome tecnico, preferisci l'etichetta mappa
  let lastPlace = robot.lastPlace;
  if (lastPlace) {
    const mapped = await prisma.mapPlace.findFirst({
      where: {
        robotId,
        OR: [{ name: lastPlace }, { label: lastPlace }],
      },
      select: { name: true, label: true },
    });
    if (mapped) {
      lastPlace = mapped.label?.trim() || mapped.name;
    }
  }

  const today = format(new Date(), "yyyy-MM-dd");
  const dayStart = new Date(`${today}T00:00:00`);
  const dayEnd = new Date(`${today}T23:59:59`);
  const waiting = await prisma.appointment.findMany({
    where: {
      robotId,
      status: "checked_in",
      startsAt: { gte: dayStart, lte: dayEnd },
    },
    orderBy: { startsAt: "asc" },
    take: 20,
  });

  return NextResponse.json({
    id: robot.id,
    displayName: robot.displayName,
    online,
    lastSeenAt: robot.lastSeenAt?.toISOString() ?? null,
    lastPlace,
    lastActivity: robot.lastActivity,
    waiting: waiting.map((a) => ({
      id: a.id,
      guestName: a.guestName,
      startsAt: a.startsAt.toISOString(),
    })),
  });
}
