import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** Logged-in USER: own appointments. */
export async function GET() {
  const session = await requireSession(["USER"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appointments = await prisma.appointment.findMany({
    where: {
      userId: session.accountId,
      status: { not: "cancelled" },
    },
    include: { robot: true },
    orderBy: { startsAt: "asc" },
  });

  return NextResponse.json({
    appointments: appointments.map((a) => ({
      id: a.id,
      guestName: a.guestName,
      startsAt: a.startsAt.toISOString(),
      status: a.status,
      robot: { id: a.robot.id, displayName: a.robot.displayName },
    })),
  });
}
