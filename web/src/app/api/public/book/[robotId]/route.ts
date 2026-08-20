import { NextResponse } from "next/server";
import { getFreeSlots } from "@/lib/appointments";
import { prisma } from "@/lib/db";
import { addDays, format } from "date-fns";
import { z } from "zod";

type Ctx = { params: Promise<{ robotId: string }> };

/** Public: list free slots for booking page (no auth). */
export async function GET(req: Request, ctx: Ctx) {
  const { robotId } = await ctx.params;
  const robot = await prisma.robot.findUnique({ where: { id: robotId } });
  if (!robot) {
    return NextResponse.json({ error: "Robot non trovato" }, { status: 404 });
  }

  const url = new URL(req.url);
  const from =
    url.searchParams.get("from") ?? format(new Date(), "yyyy-MM-dd");
  const to =
    url.searchParams.get("to") ??
    format(addDays(new Date(), 14), "yyyy-MM-dd");

  const slots = await getFreeSlots(robotId, from, to);
  return NextResponse.json({
    robot: { id: robot.id, displayName: robot.displayName },
    from,
    to,
    slots,
  });
}

const bookSchema = z.object({
  guestName: z.string().min(1),
  startsAt: z.string().datetime(),
  guestPhone: z.string().optional(),
});

/** Public: create appointment from QR booking page. */
export async function POST(req: Request, ctx: Ctx) {
  const { robotId } = await ctx.params;
  const robot = await prisma.robot.findUnique({ where: { id: robotId } });
  if (!robot) {
    return NextResponse.json({ error: "Robot non trovato" }, { status: 404 });
  }

  const parsed = bookSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const startsAt = new Date(parsed.data.startsAt);
  const clash = await prisma.appointment.findFirst({
    where: {
      robotId,
      startsAt,
      status: { in: ["scheduled", "checked_in"] },
    },
  });
  if (clash) {
    return NextResponse.json({ error: "Slot non disponibile" }, { status: 409 });
  }

  const appt = await prisma.appointment.create({
    data: {
      robotId,
      guestName: parsed.data.guestName,
      guestPhone: parsed.data.guestPhone,
      startsAt,
      status: "scheduled",
    },
  });

  return NextResponse.json({
    id: appt.id,
    guestName: appt.guestName,
    startsAt: appt.startsAt.toISOString(),
  });
}
