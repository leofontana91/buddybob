import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRobotRequest } from "@/lib/auth";
import { listAppointmentsForDate } from "@/lib/appointments";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const robot = await authenticateRobotRequest(
    id,
    req.headers.get("authorization")
  );
  if (!robot) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const date =
    url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  const items = await listAppointmentsForDate(id, date);
  return NextResponse.json({
    date,
    appointments: items.map((a) => ({
      id: a.id,
      guestName: a.guestName,
      startsAt: a.startsAt.toISOString(),
      status: a.status,
    })),
  });
}

const bodySchema = z.object({
  guestName: z.string().min(1),
  startsAt: z.string().datetime(),
  guestPhone: z.string().optional(),
  notes: z.string().optional(),
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

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const startsAt = new Date(parsed.data.startsAt);
  const clash = await prisma.appointment.findFirst({
    where: {
      robotId: id,
      startsAt,
      status: { in: ["scheduled", "checked_in"] },
    },
  });
  if (clash) {
    return NextResponse.json({ error: "Slot non disponibile" }, { status: 409 });
  }

  const appt = await prisma.appointment.create({
    data: {
      robotId: id,
      guestName: parsed.data.guestName,
      guestPhone: parsed.data.guestPhone,
      notes: parsed.data.notes,
      startsAt,
      status: "scheduled",
    },
  });

  return NextResponse.json({
    id: appt.id,
    guestName: appt.guestName,
    startsAt: appt.startsAt.toISOString(),
    status: appt.status,
  });
}
