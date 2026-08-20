import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/appointments/{id}/check-in
 * Auth: Bearer robot.apiKey matching the appointment's robot.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const apiKey = auth.slice("Bearer ".length).trim();

  const appt = await prisma.appointment.findUnique({
    where: { id },
    include: { robot: true },
  });
  if (!appt || appt.robot.apiKey !== apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (appt.status === "cancelled") {
    return NextResponse.json({ error: "Appuntamento cancellato" }, { status: 400 });
  }

  const updated = await prisma.appointment.update({
    where: { id },
    data: { status: "checked_in" },
  });

  await prisma.operatorAlert.create({
    data: {
      robotId: appt.robotId,
      type: "guest_arrived",
      message: `${appt.guestName} è arrivato`,
      appointmentId: appt.id,
    },
  });

  const speak =
    (
      await prisma.robotSettings.findUnique({ where: { robotId: appt.robotId } })
    )?.checkInSpeak ?? "Perfetto, ho avvisato che sei arrivato";

  return NextResponse.json({
    id: updated.id,
    guestName: updated.guestName,
    status: updated.status,
    speak,
  });
}
