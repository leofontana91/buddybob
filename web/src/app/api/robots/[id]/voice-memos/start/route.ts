import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRobotRequest } from "@/lib/auth";
import { modulesForRobot } from "@/lib/appointments";
import { createSignedVoiceMemoUploadUrl } from "@/lib/supabaseStorageAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

const schema = z.object({
  fileName: z.string().trim().min(1).max(180).default("memo.m4a"),
  contentType: z.string().trim().min(1).default("audio/mp4"),
  size: z.number().int().positive().max(MAX_BYTES),
  durationMs: z.number().int().nonnegative().max(600_000).optional(),
});

function sanitizeForPath(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/** Robot: prepara upload firmato per un memo vocale. */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const robot = await authenticateRobotRequest(
    id,
    req.headers.get("authorization")
  );
  if (!robot) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const modules = await modulesForRobot(id);
  if (!modules.voiceMemos) {
    return NextResponse.json(
      { error: "Modulo memo vocali non attivo" },
      { status: 403 }
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const ct = parsed.data.contentType.toLowerCase();
  if (!ct.startsWith("audio/")) {
    return NextResponse.json(
      { error: "Solo file audio" },
      { status: 400 }
    );
  }

  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const safeName = sanitizeForPath(parsed.data.fileName) || "memo.m4a";
  const objectPath = `voice-memos/${id}/${stamp}-${rand}-${safeName}`;

  try {
    const signed = await createSignedVoiceMemoUploadUrl({ objectPath });
    return NextResponse.json({
      ok: true,
      objectPath,
      uploadUrl: signed.uploadUrl,
      token: signed.token,
      contentType: parsed.data.contentType,
      durationMs: parsed.data.durationMs ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        error: "Impossibile preparare l'upload Storage.",
        details: message,
      },
      { status: 500 }
    );
  }
}
