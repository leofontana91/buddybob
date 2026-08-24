import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import {
  createSignedApkUrl,
  sha256Hex,
  uploadApkObject,
} from "@/lib/supabaseStorageAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeForPath(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const bodySchema = z.object({
  robotId: z.string().trim().min(1).optional(),
  versionName: z.string().trim().min(1),
  versionCode: z.coerce.number().int().positive().optional(),
  notes: z.string().trim().optional(),
  // Optional alternative to multipart file upload.
  // Useful when an external system can't send multipart/form-data.
  apkBase64: z.string().trim().optional(),
});

export async function POST(req: Request) {
  const session = await requireSession(["SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const robotIdRaw = formData.get("robotId");
  const versionNameRaw = formData.get("versionName");
  const versionCodeRaw = formData.get("versionCode");
  const notesRaw = formData.get("notes");
  const apkRaw = formData.get("apk");
  const apkBase64Raw = formData.get("apkBase64");

  const fileLike = apkRaw as any;
  const hasFile = fileLike && typeof fileLike.arrayBuffer === "function";

  const parsed = bodySchema.safeParse({
    robotId:
      typeof robotIdRaw === "string" && robotIdRaw.trim() ? robotIdRaw : undefined,
    versionName: typeof versionNameRaw === "string" ? versionNameRaw : "",
    versionCode:
      typeof versionCodeRaw === "string" || typeof versionCodeRaw === "number"
        ? versionCodeRaw
        : undefined,
    notes: typeof notesRaw === "string" ? notesRaw : undefined,
    apkBase64:
      typeof apkBase64Raw === "string" && apkBase64Raw.trim()
        ? apkBase64Raw
        : undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dati non validi", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { robotId, versionName, versionCode, notes, apkBase64 } = parsed.data;

  let bytes: Uint8Array;
  let contentType =
    typeof fileLike?.type === "string" && fileLike.type.trim()
      ? fileLike.type
      : "application/vnd.android.package-archive";

  if (hasFile) {
    bytes = new Uint8Array(await fileLike.arrayBuffer());
  } else if (typeof apkBase64 === "string" && apkBase64.trim()) {
    bytes = new Uint8Array(Buffer.from(apkBase64, "base64"));
  } else {
    return NextResponse.json(
      { error: "Campo 'apk' (file) richiesto o 'apkBase64' alternativo" },
      { status: 400 }
    );
  }
  const sha256 = sha256Hex(bytes);
  const versionSlug = sanitizeForPath(versionName);

  const scopePrefix = robotId ? `robot-${sanitizeForPath(robotId)}` : "global";
  const objectPath =
    `android-releases/${scopePrefix}/${versionSlug}/app-release.apk`;

  try {
    // 1) Upload to Supabase Storage (service-role).
    await uploadApkObject({
      objectPath,
      bytes,
      contentType,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        error: "Upload su Storage non riuscito",
        details: e?.message ?? String(e),
      },
      { status: 500 }
    );
  }

  // 2) DB: deactivate previous active releases, then insert row.
  const created = await prisma.$transaction(async (tx) => {
    if (robotId) {
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

  // Optional sanity: return a short-lived signed URL for immediate testing in UI/dev.
  // (Client robots still use the manifest endpoint.)
  const apkUrl = await createSignedApkUrl({
    objectPath,
    expiresInSeconds: 60 * 10,
  }).catch(() => null);

  return NextResponse.json({
    ok: true,
    release: created,
    apkUrl,
  });
}

