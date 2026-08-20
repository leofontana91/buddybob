import { NextResponse } from "next/server";
import { canAccessRobot, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

  const places = await prisma.mapPlace.findMany({
    where: { robotId },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({
    places: places.map((p) => ({
      id: p.id,
      name: p.name,
      label: p.label,
      x: p.x,
      y: p.y,
      speakOnDepart: p.speakOnDepart,
      speakWhileMoving: p.speakWhileMoving,
      speakOnArrive: p.speakOnArrive,
      displayOnDepart: p.displayOnDepart,
      displayWhileMoving: p.displayWhileMoving,
      displayOnArrive: p.displayOnArrive,
      waitSeconds: p.waitSeconds,
      updatedAt: p.updatedAt.toISOString(),
    })),
  });
}

export async function PATCH(req: Request) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const { id, ...data } = body;
  if (!id) {
    return NextResponse.json({ error: "id richiesto" }, { status: 400 });
  }
  const place = await prisma.mapPlace.findUnique({ where: { id } });
  if (!place) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await canAccessRobot(session, place.robotId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const allowed: Record<string, unknown> = {};
  for (const key of [
    "label",
    "speakOnDepart",
    "speakWhileMoving",
    "speakOnArrive",
    "displayOnDepart",
    "displayWhileMoving",
    "displayOnArrive",
    "waitSeconds",
  ] as const) {
    if (key in data) allowed[key] = data[key];
  }

  const updated = await prisma.mapPlace.update({
    where: { id },
    data: allowed,
  });
  return NextResponse.json({ place: updated });
}
