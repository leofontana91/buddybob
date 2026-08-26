import { addMinutes, format, parse, setHours, setMinutes, startOfDay } from "date-fns";
import { prisma } from "@/lib/db";

export const ACTIVE_APPT_STATUSES = ["scheduled", "checked_in", "in_progress"] as const;

export type Interval = { start: Date; end: Date };

export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function resolveEndsAt(
  startsAt: Date,
  endsAt: Date | null | undefined,
  durationMinutes: number
): Date {
  if (endsAt) return endsAt;
  return addMinutes(startsAt, Math.max(5, durationMinutes));
}

export type ConflictKind = "room" | "host";

export type SchedulingConflict = {
  kind: ConflictKind;
  message: string;
  appointmentId: string;
  guestName: string;
  startsAt: string;
  endsAt: string;
};

export type AvailabilityResult = {
  ok: boolean;
  conflicts: SchedulingConflict[];
  /** Host già occupato: consentito (sormontabile), ma segnalato */
  hostBusy: boolean;
  /** Sala occupata: bloccante salvo force */
  roomBusy: boolean;
};

type BusyRow = {
  id: string;
  guestName: string;
  hostUserId: string | null;
  roomId: string | null;
  startsAt: Date;
  endsAt: Date | null;
  type: { durationMinutes: number } | null;
};

function rowInterval(row: BusyRow, fallbackMinutes: number): Interval {
  return {
    start: row.startsAt,
    end: resolveEndsAt(
      row.startsAt,
      row.endsAt,
      row.type?.durationMinutes ?? fallbackMinutes
    ),
  };
}

export async function checkAvailability(args: {
  robotId: string;
  startsAt: Date;
  endsAt: Date;
  hostUserId?: string | null;
  roomId?: string | null;
  excludeId?: string | null;
  defaultDurationMinutes?: number;
}): Promise<AvailabilityResult> {
  const fallback = args.defaultDurationMinutes ?? 30;
  const rows = (await prisma.appointment.findMany({
    where: {
      robotId: args.robotId,
      status: { in: [...ACTIVE_APPT_STATUSES] },
      startsAt: { lt: args.endsAt },
      ...(args.excludeId ? { id: { not: args.excludeId } } : {}),
    },
    select: {
      id: true,
      guestName: true,
      hostUserId: true,
      roomId: true,
      startsAt: true,
      endsAt: true,
      type: { select: { durationMinutes: true } },
    },
  })) as BusyRow[];

  const target: Interval = { start: args.startsAt, end: args.endsAt };
  const conflicts: SchedulingConflict[] = [];
  let roomBusy = false;
  let hostBusy = false;

  for (const row of rows) {
    const iv = rowInterval(row, fallback);
    // Only consider rows that could still overlap (end after our start)
    if (iv.end <= args.startsAt) continue;
    if (!intervalsOverlap(target, iv)) continue;

    if (args.roomId && row.roomId === args.roomId) {
      roomBusy = true;
      conflicts.push({
        kind: "room",
        message: `Sala già riservata per ${row.guestName}`,
        appointmentId: row.id,
        guestName: row.guestName,
        startsAt: iv.start.toISOString(),
        endsAt: iv.end.toISOString(),
      });
    }

    if (args.hostUserId && row.hostUserId === args.hostUserId) {
      hostBusy = true;
      conflicts.push({
        kind: "host",
        message: `Il referente ha già un appuntamento con ${row.guestName}`,
        appointmentId: row.id,
        guestName: row.guestName,
        startsAt: iv.start.toISOString(),
        endsAt: iv.end.toISOString(),
      });
    }
  }

  return {
    ok: !roomBusy,
    conflicts,
    hostBusy,
    roomBusy,
  };
}

export async function suggestSlots(args: {
  robotId: string;
  dateIso: string;
  durationMinutes: number;
  hostUserId?: string | null;
  roomId?: string | null;
  /** Preferisci slot dove anche l'host è libero */
  preferHostFree?: boolean;
  limit?: number;
}): Promise<string[]> {
  const settings = await prisma.robotSettings.findUnique({
    where: { robotId: args.robotId },
  });
  const dayStart = settings?.dayStart ?? "09:00";
  const dayEnd = settings?.dayEnd ?? "18:00";
  const step = settings?.slotMinutes ?? 30;
  const day = startOfDay(parse(args.dateIso, "yyyy-MM-dd", new Date()));
  const [sh, sm] = dayStart.split(":").map(Number);
  const [eh, em] = dayEnd.split(":").map(Number);
  let cursor = setMinutes(setHours(day, sh || 9), sm || 0);
  const end = setMinutes(setHours(day, eh || 18), em || 0);
  const limit = args.limit ?? 12;
  const preferHostFree = args.preferHostFree ?? true;

  const freeBoth: string[] = [];
  const freeRoom: string[] = [];

  while (cursor < end && freeBoth.length + freeRoom.length < limit * 2) {
    const startsAt = cursor;
    const endsAt = addMinutes(startsAt, args.durationMinutes);
    if (endsAt <= end && startsAt.getTime() > Date.now() - 60_000) {
      const av = await checkAvailability({
        robotId: args.robotId,
        startsAt,
        endsAt,
        hostUserId: args.hostUserId,
        roomId: args.roomId,
        defaultDurationMinutes: args.durationMinutes,
      });
      if (!av.roomBusy) {
        if (!av.hostBusy) freeBoth.push(startsAt.toISOString());
        else freeRoom.push(startsAt.toISOString());
      }
    }
    cursor = addMinutes(cursor, step);
  }

  if (preferHostFree) {
    return [...freeBoth, ...freeRoom].slice(0, limit);
  }
  return [...freeRoom, ...freeBoth].slice(0, limit);
}

export function formatConflictHint(av: AvailabilityResult): string | null {
  if (!av.conflicts.length) return null;
  if (av.roomBusy) {
    return "Sala occupata in quell'orario. Scegli un altro slot o un'altra sala.";
  }
  if (av.hostBusy) {
    return "Il referente è già impegnato: puoi sormontare o cambiare orario.";
  }
  return null;
}

export function hmLabel(iso: string) {
  return format(new Date(iso), "HH:mm");
}
