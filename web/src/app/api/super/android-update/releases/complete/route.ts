import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  robotId: z.string().trim().min(1).optional(),
  versionName: z.string().trim().min(1),
  versionCode: z.number().int().positive().optional(),
  notes: z.string().trim().optional(),
  objectPath: z.string().trim().min(1),
  sha256: z.string().trim().optional(),
});

export async function POST(req: Request) {
  const session = await requireSession(["SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const { robotId, versionName, versionCode, notes, objectPath, sha256 } =
    parsed.data;

  if (!objectPath.startsWith("android-releases/")) {
    return NextResponse.json({ error: "Percorso non valido" }, { status: 400 });
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      if (robotId) {
        const robot = await tx.robot.findUnique({ where: { id: robotId } });
        if (!robot) throw new Error("Robot non trovato");
        await tx.robotAndroidRelease.updateMany({
          where: { robotId, isActive: true },
          data: { isActive: false },
        });
        return tx.robotAndroidRelease.create({
          data: {
            robotId,
            versionName,
            versionCode,
            storagePath: objectPath,
            sha256,
            notes,
            isActive: true,
          },
        });
      }

      await tx.globalAndroidRelease.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
      return tx.globalAndroidRelease.create({
        data: {
          versionName,
          versionCode,
          storagePath: objectPath,
          sha256,
          notes,
          isActive: true,
        },
      });
    });

    return NextResponse.json({ ok: true, release: created });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Salvataggio rilascio non riuscito", details: message },
      { status: 500 }
    );
  }
}
