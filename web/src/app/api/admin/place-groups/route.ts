import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessRobot, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parsePlaceContent } from "@/lib/placeContent";

const mediaSchema = z
  .object({
    path: z.string(),
    url: z.string().url(),
    contentType: z.string(),
    fileName: z.string(),
  })
  .nullable();

const momentSchema = z.object({
  speak: z.string().max(500).optional().default(""),
  text: z.string().max(500).optional().default(""),
  media: mediaSchema.optional().default(null),
});

const contentSchema = z.object({
  depart: momentSchema,
  moving: momentSchema,
  arrive: momentSchema,
});

const createSchema = z.object({
  robotId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
});

const patchSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80).optional(),
  content: contentSchema.optional(),
  placeIds: z.array(z.string()).optional(),
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

  const count = await prisma.placeContentGroup.count({
    where: { robotId: parsed.data.robotId },
  });
  const group = await prisma.placeContentGroup.create({
    data: {
      robotId: parsed.data.robotId,
      name: parsed.data.name,
      sortOrder: count,
    },
  });
  return NextResponse.json({
    group: {
      id: group.id,
      name: group.name,
      content: parsePlaceContent(group.contentJson),
      placeIds: [] as string[],
    },
  });
}

export async function PATCH(req: Request) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
  const group = await prisma.placeContentGroup.findUnique({
    where: { id: parsed.data.id },
  });
  if (!group) {
    return NextResponse.json({ error: "Gruppo non trovato" }, { status: 404 });
  }
  if (!(await canAccessRobot(session, group.robotId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data: { name?: string; contentJson?: string } = {};
  if (parsed.data.name) data.name = parsed.data.name;
  if (parsed.data.content) data.contentJson = JSON.stringify(parsed.data.content);

  const updated = await prisma.placeContentGroup.update({
    where: { id: group.id },
    data,
  });

  if (parsed.data.placeIds) {
    const wanted = new Set(parsed.data.placeIds);
    const places = await prisma.mapPlace.findMany({
      where: { robotId: group.robotId },
      select: { id: true, groupId: true },
    });
    const ids = places.map((p) => p.id);
    for (const pid of wanted) {
      if (!ids.includes(pid)) {
        return NextResponse.json({ error: "Punto non valido" }, { status: 400 });
      }
    }
    await prisma.$transaction([
      prisma.mapPlace.updateMany({
        where: { groupId: group.id, id: { notIn: [...wanted] } },
        data: { groupId: null },
      }),
      prisma.mapPlace.updateMany({
        where: { robotId: group.robotId, id: { in: [...wanted] } },
        data: { groupId: group.id },
      }),
    ]);
  }

  const assigned = await prisma.mapPlace.findMany({
    where: { groupId: group.id },
    select: { id: true },
  });

  return NextResponse.json({
    group: {
      id: updated.id,
      name: updated.name,
      content: parsePlaceContent(updated.contentJson),
      placeIds: assigned.map((p) => p.id),
    },
  });
}

export async function DELETE(req: Request) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id richiesto" }, { status: 400 });
  }
  const group = await prisma.placeContentGroup.findUnique({ where: { id } });
  if (!group) {
    return NextResponse.json({ error: "Gruppo non trovato" }, { status: 404 });
  }
  if (!(await canAccessRobot(session, group.robotId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.mapPlace.updateMany({
    where: { groupId: id },
    data: { groupId: null },
  });
  await prisma.placeContentGroup.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
