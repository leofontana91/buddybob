import { NextResponse } from "next/server";
import { z } from "zod";
import { effectiveAdminId, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminId = effectiveAdminId(session);
  if (!adminId) {
    return NextResponse.json({ error: "Nessun cliente selezionato" }, { status: 400 });
  }

  const types = await prisma.appointmentType.findMany({
    where: { adminId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      rooms: { select: { roomId: true } },
    },
  });

  return NextResponse.json({
    types: types.map((t) => ({
      id: t.id,
      name: t.name,
      durationMinutes: t.durationMinutes,
      color: t.color,
      active: t.active,
      sortOrder: t.sortOrder,
      roomIds: t.rooms.map((r) => r.roomId),
    })),
  });
}

const upsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(80),
  durationMinutes: z.number().int().min(5).max(24 * 60),
  color: z.string().max(20).optional(),
  active: z.boolean().optional(),
  roomIds: z.array(z.string()).optional(),
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

  const roomIds = parsed.data.roomIds ?? [];
  if (roomIds.length) {
    const ok = await prisma.meetingRoom.count({
      where: { adminId, id: { in: roomIds } },
    });
    if (ok !== roomIds.length) {
      return NextResponse.json({ error: "Sale non valide" }, { status: 400 });
    }
  }

  const data = {
    name: parsed.data.name.trim(),
    durationMinutes: parsed.data.durationMinutes,
    color: parsed.data.color?.trim() || "#1a1a1a",
    active: parsed.data.active ?? true,
  };

  let typeId = parsed.data.id;
  if (typeId) {
    const existing = await prisma.appointmentType.findFirst({
      where: { id: typeId, adminId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Tipo non trovato" }, { status: 404 });
    }
    await prisma.appointmentType.update({
      where: { id: typeId },
      data,
    });
    await prisma.appointmentTypeRoom.deleteMany({ where: { typeId } });
  } else {
    const created = await prisma.appointmentType.create({
      data: { adminId, ...data },
    });
    typeId = created.id;
  }

  if (roomIds.length) {
    await prisma.appointmentTypeRoom.createMany({
      data: roomIds.map((roomId) => ({ typeId: typeId!, roomId })),
      skipDuplicates: true,
    });
  }

  const type = await prisma.appointmentType.findUniqueOrThrow({
    where: { id: typeId },
    include: { rooms: { select: { roomId: true } } },
  });

  return NextResponse.json({
    type: {
      id: type.id,
      name: type.name,
      durationMinutes: type.durationMinutes,
      color: type.color,
      active: type.active,
      roomIds: type.rooms.map((r) => r.roomId),
    },
  });
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

  const existing = await prisma.appointmentType.findFirst({
    where: { id: parsed.data.id, adminId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Tipo non trovato" }, { status: 404 });
  }

  if (parsed.data.delete) {
    await prisma.appointmentType.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  }

  const updated = await prisma.appointmentType.update({
    where: { id: existing.id },
    data: { active: parsed.data.active },
  });
  return NextResponse.json({ id: updated.id, active: updated.active });
}
