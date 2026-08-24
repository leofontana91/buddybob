import { NextResponse } from "next/server";
import { canAccessRobot, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  contentToPlaceFields,
  parsePlaceContent,
} from "@/lib/placeContent";
import {
  loadPlaceContentBundle,
  ownContentFromRow,
} from "@/lib/placeContentServer";
import { z } from "zod";

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

export async function GET(req: Request) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const robotId = new URL(req.url).searchParams.get("robotId");
  if (!robotId) {
    return NextResponse.json({ error: "robotId richiesto" }, { status: 400 });
  }
  if (!(await canAccessRobot(session, robotId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { groups, places, mode, shared } = await loadPlaceContentBundle(robotId);

  return NextResponse.json({
    mode,
    shared,
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      content: parsePlaceContent(g.contentJson),
      placeIds: places.filter((p) => p.groupId === g.id).map((p) => p.id),
      sortOrder: g.sortOrder,
    })),
    places: places.map((p) => ({
      id: p.id,
      name: p.name,
      label: p.label,
      x: p.x,
      y: p.y,
      waitSeconds: p.waitSeconds,
      groupId: p.groupId,
      content: ownContentFromRow(p),
      updatedAt: p.updatedAt.toISOString(),
    })),
  });
}

export async function PATCH(req: Request) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const { id, ...data } = body as Record<string, unknown> & { id?: string };
  if (!id) {
    return NextResponse.json({ error: "id richiesto" }, { status: 400 });
  }
  const place = await prisma.mapPlace.findUnique({ where: { id } });
  if (!place) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await canAccessRobot(session, place.robotId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const allowed: Record<string, unknown> = {};
  if (typeof data.label === "string") allowed.label = data.label.trim() || null;
  if (typeof data.waitSeconds === "number") {
    allowed.waitSeconds = Math.max(0, Math.min(600, Math.floor(data.waitSeconds)));
  }
  if ("groupId" in data) {
    const groupId = data.groupId;
    if (groupId === null || groupId === "") {
      allowed.groupId = null;
    } else if (typeof groupId === "string") {
      const group = await prisma.placeContentGroup.findFirst({
        where: { id: groupId, robotId: place.robotId },
      });
      if (!group) {
        return NextResponse.json({ error: "Gruppo non trovato" }, { status: 404 });
      }
      allowed.groupId = groupId;
    }
  }
  if (data.content) {
    const parsed = contentSchema.safeParse(data.content);
    if (!parsed.success) {
      return NextResponse.json({ error: "Contenuto non valido" }, { status: 400 });
    }
    Object.assign(allowed, contentToPlaceFields(parsed.data));
  }

  const updated = await prisma.mapPlace.update({
    where: { id },
    data: allowed,
  });
  return NextResponse.json({
    place: {
      id: updated.id,
      name: updated.name,
      label: updated.label,
      waitSeconds: updated.waitSeconds,
      groupId: updated.groupId,
      content: ownContentFromRow(updated),
    },
  });
}
