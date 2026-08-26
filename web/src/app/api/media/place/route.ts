import { NextResponse } from "next/server";
import {
  guessPlaceMediaContentType,
  verifyPlaceMediaAccess,
} from "@/lib/placeMediaProxy";
import { downloadPlaceMediaObject } from "@/lib/supabaseStorageAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proxy pubblico (firmato HMAC) per foto/video dei punti mappa.
 * Il robot e il browser possono caricare l'URL senza header Authorization.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const path = (url.searchParams.get("path") || "").trim();
  const exp = Number(url.searchParams.get("exp") || 0);
  const sig = (url.searchParams.get("sig") || "").trim();

  if (!path.startsWith("place-media/") || path.includes("..")) {
    return NextResponse.json({ error: "Percorso non valido" }, { status: 400 });
  }
  if (!verifyPlaceMediaAccess(path, exp, sig)) {
    return NextResponse.json({ error: "Link scaduto o non valido" }, { status: 403 });
  }

  try {
    const bytes = await downloadPlaceMediaObject(path);
    const contentType = guessPlaceMediaContentType(path);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Media non disponibile", details: msg },
      { status: 404 }
    );
  }
}
