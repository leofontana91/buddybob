import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessRobot, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  parsePlaceContent,
  parsePlaceContentMode,
} from "@/lib/placeContent";

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

const patchSchema = z.object({
  robotId: z.string().min(1),
  mode: z.enum(["shared", "per_place", "groups"]).optional(),
  shared: contentSchema.optional(),
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
  if (!(await canAccessRobot(session, parsed.data.robotId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data: { placeContentMode?: string; placeSharedJson?: string } = {};
  if (parsed.data.mode) data.placeContentMode = parsed.data.mode;
  if (parsed.data.shared) {
    data.placeSharedJson = JSON.stringify(parsed.data.shared);
  }

  const settings = await prisma.robotSettings.upsert({
    where: { robotId: parsed.data.robotId },
    update: data,
    create: {
      robotId: parsed.data.robotId,
      ...data,
    },
  });

  return NextResponse.json({
    mode: parsePlaceContentMode(settings.placeContentMode),
    shared: parsePlaceContent(settings.placeSharedJson),
  });
}
