import { NextResponse } from "next/server";
import { canAccessRobot, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listAppointmentsForDate } from "@/lib/appointments";
import { format } from "date-fns";
import { z } from "zod";

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

  const date =
    url.searchParams.get("date") ?? format(new Date(), "yyyy-MM-dd");

  const items = await listAppointmentsForDate(robotId, date);
  return NextResponse.json({
    date,
    appointments: items.map((a) => ({
      id: a.id,
      guestName: a.guestName,
      guestPhone: a.guestPhone,
      userId: a.userId,
      startsAt: a.startsAt.toISOString(),
      status: a.status,
      notes: a.notes,
    })),
  });
}

const createSchema = z.object({
  robotId: z.string().min(1),
  userId: z.string().optional(),
  guestName: z.string().min(1).optional(),
  startsAt: z.string().datetime(),
  guestPhone: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (!(await canAccessRobot(session, parsed.data.robotId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let guestName = parsed.data.guestName ?? "";
  let userId = parsed.data.userId ?? null;

  if (userId) {
    const user = await prisma.account.findFirst({
      where: {
        id: userId,
        role: "USER",
        ...(session.role === "ADMIN"
          ? { adminId: session.accountId }
          : {}),
      },
    });
    if (!user) {
      return NextResponse.json({ error: "Utente non valido" }, { status: 400 });
    }
    guestName = user.name;
  }

  if (!guestName) {
    return NextResponse.json({ error: "Nome o utente richiesto" }, { status: 400 });
  }

  const appt = await prisma.appointment.create({
    data: {
      robotId: parsed.data.robotId,
      userId,
      guestName,
      guestPhone: parsed.data.guestPhone,
      notes: parsed.data.notes,
      startsAt: new Date(parsed.data.startsAt),
      status: "scheduled",
    },
  });

  return NextResponse.json({
    id: appt.id,
    guestName: appt.guestName,
    userId: appt.userId,
    startsAt: appt.startsAt.toISOString(),
    status: appt.status,
  });
}

const patchSchema = z.object({
  id: z.string(),
  status: z.enum(["scheduled", "checked_in", "cancelled", "no_show"]).optional(),
  startsAt: z.string().datetime().optional(),
  guestName: z.string().min(1).optional(),
});

export async function PATCH(req: Request) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.appointment.findUnique({
    where: { id: parsed.data.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }
  if (!(await canAccessRobot(session, existing.robotId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const appt = await prisma.appointment.update({
    where: { id: parsed.data.id },
    data: {
      status: parsed.data.status,
      startsAt: parsed.data.startsAt
        ? new Date(parsed.data.startsAt)
        : undefined,
      guestName: parsed.data.guestName,
    },
  });

  return NextResponse.json({
    id: appt.id,
    guestName: appt.guestName,
    startsAt: appt.startsAt.toISOString(),
    status: appt.status,
  });
}
