import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRobotRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  loadPlaceContentBundle,
  ownContentFromRow,
  resolvedFieldsForPlace,
} from "@/lib/placeContentServer";
import type { PlaceMedia } from "@/lib/placeContent";
import { placeMediaProxyUrl } from "@/lib/placeMediaProxy";
import { objectPathFromPlaceMediaUrl } from "@/lib/supabaseStorageAdmin";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  places: z.array(
    z.object({
      name: z.string().min(1),
      x: z.number().optional(),
      y: z.number().optional(),
      theta: z.number().optional(),
    })
  ),
});

function mediaForRobot(
  media: PlaceMedia | null | undefined,
  req: Request
): PlaceMedia | null {
  if (!media?.url?.trim()) return null;
  const path =
    media.path?.trim() || objectPathFromPlaceMediaUrl(media.url) || "";
  if (!path) return media;
  return {
    ...media,
    path,
    url: placeMediaProxyUrl(path, req),
  };
}

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const robot = await authenticateRobotRequest(
    id,
    req.headers.get("authorization")
  );
  if (!robot) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { places, mode, shared, groupById } = await loadPlaceContentBundle(id);
  const out = places.map((p) => {
    const label = (p.label || p.name).trim();
    const resolved = resolvedFieldsForPlace({
      mode,
      shared,
      group: p.groupId ? groupById.get(p.groupId) ?? null : null,
      own: ownContentFromRow(p),
      label,
    });
    return {
      name: p.name,
      label: p.label,
      x: p.x,
      y: p.y,
      theta: p.theta,
      waitSeconds: p.waitSeconds,
      ...resolved,
      mediaOnDepart: mediaForRobot(resolved.mediaOnDepart, req),
      mediaWhileMoving: mediaForRobot(resolved.mediaWhileMoving, req),
      mediaOnArrive: mediaForRobot(resolved.mediaOnArrive, req),
    };
  });
  return NextResponse.json({ places: out });
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const robot = await authenticateRobotRequest(
    id,
    req.headers.get("authorization")
  );
  if (!robot) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Elenco punti non valido" }, { status: 400 });
  }

  const names = new Set(
    parsed.data.places.map((p) => p.name.trim()).filter(Boolean)
  );

  await prisma.$transaction(async (tx) => {
    const existing = await tx.mapPlace.findMany({ where: { robotId: id } });
    const toDelete = existing.filter((p) => !names.has(p.name));
    if (toDelete.length) {
      await tx.mapPlace.deleteMany({
        where: { id: { in: toDelete.map((p) => p.id) } },
      });
    }
    for (const p of parsed.data.places) {
      const name = p.name.trim();
      if (!name) continue;
      await tx.mapPlace.upsert({
        where: { robotId_name: { robotId: id, name } },
        create: {
          robotId: id,
          name,
          x: p.x ?? 0,
          y: p.y ?? 0,
          theta: p.theta ?? 0,
        },
        update: {
          x: p.x ?? 0,
          y: p.y ?? 0,
          theta: p.theta ?? 0,
        },
      });
    }
  });

  return NextResponse.json({ ok: true, count: names.size });
}
