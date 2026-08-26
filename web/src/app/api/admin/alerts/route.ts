import { NextResponse } from "next/server";
import { requireSession, canAccessRobot } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

  const unreadOnly = url.searchParams.get("unread") === "1";
  const includeAllChannels = url.searchParams.get("allChannels") === "1";

  const alerts = await prisma.operatorAlert.findMany({
    where: {
      robotId,
      ...(unreadOnly ? { readAt: null } : {}),
      ...(includeAllChannels ? {} : { inInbox: true }),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const unreadCount = await prisma.operatorAlert.count({
    where: { robotId, readAt: null, inInbox: true },
  });

  const popups = await prisma.operatorAlert.findMany({
    where: {
      robotId,
      readAt: null,
      asPopup: true,
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return NextResponse.json({
    unreadCount,
    alerts: alerts.map((a) => ({
      id: a.id,
      type: a.type,
      message: a.message,
      appointmentId: a.appointmentId,
      inInbox: a.inInbox,
      asPopup: a.asPopup,
      readAt: a.readAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    })),
    popups: popups.map((a) => ({
      id: a.id,
      type: a.type,
      message: a.message,
      createdAt: a.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    ids?: string[];
    markAll?: boolean;
    robotId?: string;
  };

  if (body.markAll && body.robotId) {
    if (!(await canAccessRobot(session, body.robotId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await prisma.operatorAlert.updateMany({
      where: { robotId: body.robotId, readAt: null },
      data: { readAt: new Date() },
    });
  } else if (body.ids?.length) {
    await prisma.operatorAlert.updateMany({
      where: { id: { in: body.ids } },
      data: { readAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}
