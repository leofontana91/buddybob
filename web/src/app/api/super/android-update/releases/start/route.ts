import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { createSignedUploadUrl } from "@/lib/supabaseStorageAdmin";

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

const schema = z.object({
  robotId: z.string().trim().min(1).optional(),
  versionName: z.string().trim().min(1),
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

  const { robotId, versionName } = parsed.data;
  if (robotId) {
    const robot = await prisma.robot.findUnique({ where: { id: robotId } });
    if (!robot) {
      return NextResponse.json({ error: "Robot non trovato" }, { status: 404 });
    }
  }

  const versionSlug = sanitizeForPath(versionName);
  const scopePrefix = robotId ? `robot-${sanitizeForPath(robotId)}` : "global";
  const objectPath = `android-releases/${scopePrefix}/${versionSlug}/app-release.apk`;

  try {
    const signed = await createSignedUploadUrl({ objectPath });
    return NextResponse.json({
      ok: true,
      objectPath,
      uploadUrl: signed.uploadUrl,
      token: signed.token,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const tooLarge =
      /EntityTooLarge|Payload too large|maximum allowed size|Global file size|troppo grande|413/i.test(
        message
      );
    return NextResponse.json(
      {
        error: tooLarge
          ? "Errore limite Storage in preparazione bucket (non l'APK). Riprova dopo il deploy; se persiste, in Supabase crea a mano il bucket privato bob-android-apks senza file size limit custom."
          : "Impossibile preparare l'upload Storage. Controlla SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SECRET_KEY) e il bucket bob-android-apks.",
        details: message,
      },
      { status: tooLarge ? 413 : 500 }
    );
  }
}
