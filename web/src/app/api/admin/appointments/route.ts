import { NextResponse } from "next/server";
import { addMinutes } from "date-fns";
import { format } from "date-fns";
import { z } from "zod";
import { canAccessRobot, requireSession, effectiveAdminId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listAppointmentsForDate, listAppointmentsInRange } from "@/lib/appointments";
import {
  checkAvailability,
  formatConflictHint,
  resolveEndsAt,
  suggestSlots,
} from "@/lib/appointmentScheduling";

function serializeAppt(a: {
  id: string;
  guestName: string;
  guestPhone: string | null;
  userId: string | null;
  hostUserId: string | null;
  typeId: string | null;
  roomId: string | null;
  startsAt: Date;
  endsAt: Date | null;
  status: string;
  notes: string | null;
  host?: { id: string; name: string } | null;
  type?: { id: string; name: string; durationMinutes: number; color: string } | null;
  room?: { id: string; name: string; mapPlaceName: string | null } | null;
}) {
  const duration = a.type?.durationMinutes ?? 30;
  const ends = resolveEndsAt(a.startsAt, a.endsAt, duration);
  return {
    id: a.id,
    guestName: a.guestName,
    guestPhone: a.guestPhone,
    userId: a.userId,
    hostUserId: a.hostUserId,
    hostName: a.host?.name ?? null,
    typeId: a.typeId,
    typeName: a.type?.name ?? null,
    typeColor: a.type?.color ?? null,
    durationMinutes: duration,
    roomId: a.roomId,
    roomName: a.room?.name ?? null,
    mapPlaceName: a.room?.mapPlaceName ?? null,
    startsAt: a.startsAt.toISOString(),
    endsAt: ends.toISOString(),
    status: a.status,
    notes: a.notes,
  };
}

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
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (url.searchParams.get("suggest") === "1") {
    const durationMinutes = Number(url.searchParams.get("duration") || "30");
    const suggestions = await suggestSlots({
      robotId,
      dateIso: date,
      durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : 30,
      hostUserId: url.searchParams.get("hostUserId"),
      roomId: url.searchParams.get("roomId"),
    });
    return NextResponse.json({ date, suggestions });
  }

  const include = {
    host: { select: { id: true, name: true } },
    type: {
      select: {
        id: true,
        name: true,
        durationMinutes: true,
        color: true,
      },
    },
    room: { select: { id: true, name: true, mapPlaceName: true } },
  } as const;

  if (from && to) {
    const rows = await listAppointmentsInRange(robotId, from, to);
    const rich = rows.length
      ? await prisma.appointment.findMany({
          where: { id: { in: rows.map((l) => l.id) } },
          include,
          orderBy: { startsAt: "asc" },
        })
      : [];
    return NextResponse.json({
      from,
      to,
      appointments: rich.map(serializeAppt),
    });
  }

  const legacy = await listAppointmentsForDate(robotId, date);
  const rich = legacy.length
    ? await prisma.appointment.findMany({
        where: { id: { in: legacy.map((l) => l.id) } },
        include,
        orderBy: { startsAt: "asc" },
      })
    : [];

  return NextResponse.json({
    date,
    appointments: rich.map(serializeAppt),
  });
}

const createSchema = z.object({
  robotId: z.string().min(1),
  guestName: z.string().min(1).max(120),
  guestPhone: z.string().max(40).optional().nullable(),
  hostUserId: z.string().optional().nullable(),
  typeId: z.string().optional().nullable(),
  roomId: z.string().optional().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  force: z.boolean().optional(),
  /// legacy alias
  userId: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  if (!(await canAccessRobot(session, parsed.data.robotId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminId = effectiveAdminId(session);
  const hostUserId = parsed.data.hostUserId || parsed.data.userId || null;
  if (hostUserId && adminId) {
    const host = await prisma.account.findFirst({
      where: { id: hostUserId, role: "USER", adminId },
    });
    if (!host) {
      return NextResponse.json({ error: "Referente non valido" }, { status: 400 });
    }
  }

  let durationMinutes = 30;
  const typeId = parsed.data.typeId || null;
  if (typeId && adminId) {
    const type = await prisma.appointmentType.findFirst({
      where: { id: typeId, adminId, active: true },
      include: { rooms: true },
    });
    if (!type) {
      return NextResponse.json({ error: "Tipo visita non valido" }, { status: 400 });
    }
    durationMinutes = type.durationMinutes;
    if (parsed.data.roomId) {
      const allowed = type.rooms.map((r) => r.roomId);
      if (allowed.length && !allowed.includes(parsed.data.roomId)) {
        return NextResponse.json(
          { error: "Questa sala non è consentita per il tipo di visita" },
          { status: 400 }
        );
      }
    }
  } else {
    const settings = await prisma.robotSettings.findUnique({
      where: { robotId: parsed.data.robotId },
    });
    durationMinutes = settings?.slotMinutes ?? 30;
  }

  const roomId = parsed.data.roomId || null;
  if (roomId && adminId) {
    const room = await prisma.meetingRoom.findFirst({
      where: { id: roomId, adminId, active: true },
    });
    if (!room) {
      return NextResponse.json({ error: "Sala non valida" }, { status: 400 });
    }
  }

  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = parsed.data.endsAt
    ? new Date(parsed.data.endsAt)
    : addMinutes(startsAt, durationMinutes);

  const availability = await checkAvailability({
    robotId: parsed.data.robotId,
    startsAt,
    endsAt,
    hostUserId,
    roomId,
    defaultDurationMinutes: durationMinutes,
  });

  if (availability.roomBusy && !parsed.data.force) {
    const suggestions = await suggestSlots({
      robotId: parsed.data.robotId,
      dateIso: format(startsAt, "yyyy-MM-dd"),
      durationMinutes,
      hostUserId,
      roomId,
    });
    return NextResponse.json(
      {
        error: formatConflictHint(availability),
        conflicts: availability.conflicts,
        suggestions,
      },
      { status: 409 }
    );
  }

  const appt = await prisma.appointment.create({
    data: {
      robotId: parsed.data.robotId,
      guestName: parsed.data.guestName.trim(),
      guestPhone: parsed.data.guestPhone?.trim() || null,
      hostUserId,
      userId: hostUserId,
      typeId,
      roomId,
      startsAt,
      endsAt,
      notes: parsed.data.notes?.trim() || null,
      status: "scheduled",
    },
    include: {
      host: { select: { id: true, name: true } },
      type: {
        select: { id: true, name: true, durationMinutes: true, color: true },
      },
      room: { select: { id: true, name: true, mapPlaceName: true } },
    },
  });

  return NextResponse.json({
    appointment: serializeAppt(appt),
    warning: availability.hostBusy
      ? formatConflictHint(availability)
      : null,
    conflicts: availability.conflicts,
  });
}

const patchSchema = z.object({
  id: z.string(),
  status: z
    .enum([
      "scheduled",
      "checked_in",
      "in_progress",
      "completed",
      "cancelled",
      "no_show",
    ])
    .optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional().nullable(),
  guestName: z.string().min(1).optional(),
  guestPhone: z.string().optional().nullable(),
  hostUserId: z.string().optional().nullable(),
  typeId: z.string().optional().nullable(),
  roomId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  force: z.boolean().optional(),
  escort: z.boolean().optional(),
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

  const existing = await prisma.appointment.findUnique({
    where: { id: parsed.data.id },
    include: {
      type: { select: { durationMinutes: true } },
      room: { select: { mapPlaceName: true, name: true } },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }
  if (!(await canAccessRobot(session, existing.robotId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (parsed.data.escort) {
    const place =
      existing.room?.mapPlaceName?.trim() ||
      existing.room?.name?.trim() ||
      "";
    if (!place) {
      return NextResponse.json(
        { error: "Nessun punto mappa collegato alla sala" },
        { status: 400 }
      );
    }
    const cmd = await prisma.robotCommand.create({
      data: {
        robotId: existing.robotId,
        type: "goto",
        payload: JSON.stringify({ placeName: place }),
        status: "pending",
      },
    });
    await prisma.operatorAlert.create({
      data: {
        robotId: existing.robotId,
        type: "escort_guest",
        message: `Accompagna ${existing.guestName} verso ${place}`,
        appointmentId: existing.id,
      },
    });
    return NextResponse.json({ ok: true, commandId: cmd.id, placeName: place });
  }

  const adminId = effectiveAdminId(session);
  const startsAt = parsed.data.startsAt
    ? new Date(parsed.data.startsAt)
    : existing.startsAt;
  let duration =
    existing.type?.durationMinutes ??
    (existing.endsAt
      ? Math.max(
          5,
          Math.round(
            (existing.endsAt.getTime() - existing.startsAt.getTime()) / 60000
          )
        )
      : 30);

  if (parsed.data.typeId && adminId) {
    const type = await prisma.appointmentType.findFirst({
      where: { id: parsed.data.typeId, adminId },
    });
    if (type) duration = type.durationMinutes;
  }

  const endsAt = parsed.data.endsAt
    ? new Date(parsed.data.endsAt)
    : parsed.data.startsAt
      ? addMinutes(startsAt, duration)
      : existing.endsAt ?? addMinutes(startsAt, duration);

  const hostUserId =
    parsed.data.hostUserId !== undefined
      ? parsed.data.hostUserId
      : existing.hostUserId;
  const roomId =
    parsed.data.roomId !== undefined ? parsed.data.roomId : existing.roomId;

  if (parsed.data.startsAt || parsed.data.roomId !== undefined || parsed.data.hostUserId !== undefined) {
    const availability = await checkAvailability({
      robotId: existing.robotId,
      startsAt,
      endsAt,
      hostUserId,
      roomId,
      excludeId: existing.id,
      defaultDurationMinutes: duration,
    });
    if (availability.roomBusy && !parsed.data.force) {
      const suggestions = await suggestSlots({
        robotId: existing.robotId,
        dateIso: format(startsAt, "yyyy-MM-dd"),
        durationMinutes: duration,
        hostUserId,
        roomId,
      });
      return NextResponse.json(
        {
          error: formatConflictHint(availability),
          conflicts: availability.conflicts,
          suggestions,
        },
        { status: 409 }
      );
    }
  }

  const appt = await prisma.appointment.update({
    where: { id: existing.id },
    data: {
      status: parsed.data.status,
      startsAt: parsed.data.startsAt ? startsAt : undefined,
      endsAt:
        parsed.data.startsAt || parsed.data.endsAt !== undefined
          ? endsAt
          : undefined,
      guestName: parsed.data.guestName,
      guestPhone: parsed.data.guestPhone,
      hostUserId: parsed.data.hostUserId,
      typeId: parsed.data.typeId,
      roomId: parsed.data.roomId,
      notes: parsed.data.notes,
    },
    include: {
      host: { select: { id: true, name: true } },
      type: {
        select: { id: true, name: true, durationMinutes: true, color: true },
      },
      room: { select: { id: true, name: true, mapPlaceName: true } },
    },
  });

  return NextResponse.json({ appointment: serializeAppt(appt) });
}
