import { NextResponse } from "next/server";
import { z } from "zod";
import { effectiveAdminId, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

function serializeRoom(r: {
  id: string;
  name: string;
  mapPlaceName: string | null;
  dayStart: string | null;
  dayEnd: string | null;
  weekdays: string | null;
  active: boolean;
  sortOrder: number;
  types: { typeId: string }[];
}) {
  return {
    id: r.id,
    name: r.name,
    mapPlaceName: r.mapPlaceName,
    dayStart: r.dayStart,
    dayEnd: r.dayEnd,
    weekdays: r.weekdays,
    active: r.active,
    sortOrder: r.sortOrder,
    typeIds: r.types.map((t) => t.typeId),
  };
}

export async function GET() {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminId = effectiveAdminId(session);
  if (!adminId) {
    return NextResponse.json({ error: "Nessun cliente selezionato" }, { status: 400 });
  }

  const rooms = await prisma.meetingRoom.findMany({
    where: { adminId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      types: { select: { typeId: true } },
    },
  });

  return NextResponse.json({
    rooms: rooms.map(serializeRoom),
  });
}

const hm = z
  .string()
  .regex(/^\d{2}:\d{2}$/)
  .optional()
  .nullable();

const upsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(80),
  mapPlaceName: z.string().max(120).optional().nullable(),
  dayStart: hm,
  dayEnd: hm,
  weekdays: z.string().max(40).optional().nullable(),
  active: z.boolean().optional(),
  customHours: z.boolean().optional(),
});

export async function POST(req: Request) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminId = effectiveAdminId(session);
  if (!adminId) {
    return NextResponse.json({ error: "Nessun cliente selezionato" }, { status: 400 });
  }

  const parsed = upsertSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const useCustom = parsed.data.customHours === true;
  const data = {
    name: parsed.data.name.trim(),
    mapPlaceName: (parsed.data.mapPlaceName ?? "").trim() || null,
    dayStart: useCustom ? parsed.data.dayStart || "09:00" : null,
    dayEnd: useCustom ? parsed.data.dayEnd || "18:00" : null,
    weekdays: useCustom
      ? (parsed.data.weekdays ?? "").trim() || "1,2,3,4,5"
      : null,
    active: parsed.data.active ?? true,
  };

  const room = parsed.data.id
    ? await (async () => {
        const existing = await prisma.meetingRoom.findFirst({
          where: { id: parsed.data.id, adminId },
        });
        if (!existing) return null;
        return prisma.meetingRoom.update({
          where: { id: existing.id },
          data,
          include: { types: { select: { typeId: true } } },
        });
      })()
    : await prisma.meetingRoom.create({
        data: { adminId, ...data },
        include: { types: { select: { typeId: true } } },
      });

  if (!room) {
    return NextResponse.json({ error: "Sala non trovata" }, { status: 404 });
  }

  return NextResponse.json({ room: serializeRoom(room) });
}

const patchSchema = z.object({
  id: z.string(),
  active: z.boolean().optional(),
  delete: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminId = effectiveAdminId(session);
  if (!adminId) {
    return NextResponse.json({ error: "Nessun cliente selezionato" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const existing = await prisma.meetingRoom.findFirst({
    where: { id: parsed.data.id, adminId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Sala non trovata" }, { status: 404 });
  }

  if (parsed.data.delete) {
    await prisma.meetingRoom.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  }

  const updated = await prisma.meetingRoom.update({
    where: { id: existing.id },
    data: { active: parsed.data.active },
  });
  return NextResponse.json({ id: updated.id, active: updated.active });
}
