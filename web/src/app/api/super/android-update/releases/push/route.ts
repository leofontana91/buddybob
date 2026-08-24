import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { uploadApkObject } from "@/lib/supabaseStorageAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await requireSession(["SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "File troppo grande per il server (limite Vercel ~4.5 MB). Riprova: l'upload diretto a Storage è obbligatorio per APK più grandi." },
      { status: 413 }
    );
  }

  const objectPath = String(form.get("objectPath") ?? "").trim();
  const file = form.get("file");
  if (!objectPath.startsWith("android-releases/") || !(file instanceof File)) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  try {
    const body = await file.arrayBuffer();
    await uploadApkObject({ objectPath, body });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Upload Storage non riuscito", details: message },
      { status: 500 }
    );
  }
}
