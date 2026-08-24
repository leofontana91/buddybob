import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessRobot, requireSession } from "@/lib/auth";
import { createSignedPlaceMediaUploadUrl } from "@/lib/supabaseStorageAdmin";
import {
  PLACE_MEDIA_MAX_BYTES,
  PLACE_MEDIA_TYPES,
} from "@/lib/placeContent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeForPath(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

const schema = z.object({
  robotId: z.string().min(1),
  fileName: z.string().trim().min(1).max(180),
  contentType: z.string().trim().min(1),
  size: z.number().int().positive().max(PLACE_MEDIA_MAX_BYTES),
});

export async function POST(req: Request) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
  if (!(await canAccessRobot(session, parsed.data.robotId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!PLACE_MEDIA_TYPES.has(parsed.data.contentType)) {
    return NextResponse.json(
      { error: "Formato non supportato. Usa foto, video o audio." },
      { status: 400 }
    );
  }

  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const safeName = sanitizeForPath(parsed.data.fileName) || "file";
  const objectPath = `place-media/${parsed.data.robotId}/${stamp}-${rand}-${safeName}`;

  try {
    const signed = await createSignedPlaceMediaUploadUrl({ objectPath });
    return NextResponse.json({
      ok: true,
      objectPath,
      uploadUrl: signed.uploadUrl,
      token: signed.token,
      contentType: parsed.data.contentType,
      fileName: parsed.data.fileName,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        error:
          "Impossibile preparare il caricamento. Controlla il bucket Storage bob-place-media.",
        details: message,
      },
      { status: 500 }
    );
  }
}
