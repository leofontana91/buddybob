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

  const rooms = await prisma.meetingRoom.findMany({
    where: { adminId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      types: { select: { typeId: true } },
    },
  });

  return NextResponse.json({
    rooms: rooms.map((r) => ({
      id: r.id,
      name: r.name,
      mapPlaceName: r.mapPlaceName,
      active: r.active,
      sortOrder: r.sortOrder,
      typeIds: r.types.map((t) => t.typeId),
    })),
  });
}

const upsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(80),
  mapPlaceName: z.string().max(120).optional().nullable(),
  active: z.boolean().optional(),
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

  const data = {
    name: parsed.data.name.trim(),
    mapPlaceName: (parsed.data.mapPlaceName ?? "").trim() || null,
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
        });
      })()
    : await prisma.meetingRoom.create({
        data: { adminId, ...data },
      });

  if (!room) {
    return NextResponse.json({ error: "Sala non trovata" }, { status: 404 });
  }

  return NextResponse.json({
    room: {
      id: room.id,
      name: room.name,
      mapPlaceName: room.mapPlaceName,
      active: room.active,
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
