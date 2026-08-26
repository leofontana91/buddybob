import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRobotRequest } from "@/lib/auth";
import { modulesForRobot } from "@/lib/appointments";
import { prisma } from "@/lib/db";
import {
  downloadPlaceMediaObject,
  publicVoiceMemoUrl,
} from "@/lib/supabaseStorageAdmin";
import { transcribeAudio } from "@/lib/voiceMemoTranscribe";
import { normalizeSpeechLanguage, speechPhrases } from "@/lib/speechLanguage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  objectPath: z.string().trim().min(3).max(400),
  contentType: z.string().trim().min(1).default("audio/mp4"),
  durationMs: z.number().int().nonnegative().max(600_000).optional(),
  fileName: z.string().trim().min(1).max(180).optional(),
});

/** Robot: dopo l'upload Storage → salva memo + trascrizione Whisper. */
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

  const { objectPath, contentType, durationMs, fileName } = parsed.data;
  if (!objectPath.startsWith(`voice-memos/${id}/`)) {
    return NextResponse.json({ error: "Percorso non valido" }, { status: 400 });
  }

  const audioUrl = publicVoiceMemoUrl(objectPath);
  const memo = await prisma.voiceMemo.create({
    data: {
      robotId: id,
      audioUrl,
      storagePath: objectPath,
      contentType,
      durationMs: durationMs ?? null,
      status: "pending",
      transcript: "",
    },
  });

  try {
    const bytes = await downloadPlaceMediaObject(objectPath);
    const settings = await prisma.robotSettings.findUnique({
      where: { robotId: id },
    });
    const lang = normalizeSpeechLanguage(settings?.speechLanguage);
    const pack = speechPhrases(lang);
    const transcript = await transcribeAudio({
      bytes,
      fileName: fileName || "memo.m4a",
      contentType,
      language: lang,
    });
    const updated = await prisma.voiceMemo.update({
      where: { id: memo.id },
      data: { transcript, status: "ready", errorMessage: null },
    });
    return NextResponse.json({
      ok: true,
      id: updated.id,
      audioUrl: updated.audioUrl,
      transcript: updated.transcript,
      status: updated.status,
      speak: transcript ? pack.voiceMemoSaved : pack.voiceMemoSavedEmpty,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.voiceMemo.update({
      where: { id: memo.id },
      data: { status: "failed", errorMessage: message.slice(0, 500) },
    });
    return NextResponse.json({
      ok: true,
      id: memo.id,
      audioUrl: memo.audioUrl,
      transcript: "",
      status: "failed",
      speak: "Memo salvato, ma la trascrizione non è riuscita.",
      error: message,
    });
  }
}
