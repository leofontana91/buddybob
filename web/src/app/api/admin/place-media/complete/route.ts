import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessRobot, requireSession } from "@/lib/auth";
import { placeMediaProxyUrl } from "@/lib/placeMediaProxy";
import { downloadPlaceMediaObject } from "@/lib/supabaseStorageAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  robotId: z.string().min(1),
  objectPath: z.string().min(1),
  contentType: z.string().min(1),
  fileName: z.string().min(1),
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
  const prefix = `place-media/${parsed.data.robotId}/`;
  if (!parsed.data.objectPath.startsWith(prefix)) {
    return NextResponse.json({ error: "Percorso non valido" }, { status: 400 });
  }

  try {
    // Conferma che l'oggetto è davvero su Storage
    await downloadPlaceMediaObject(parsed.data.objectPath);
    const url = placeMediaProxyUrl(parsed.data.objectPath, req);
    return NextResponse.json({
      media: {
        path: parsed.data.objectPath,
        url,
        contentType: parsed.data.contentType,
        fileName: parsed.data.fileName,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload non verificabile";
    return NextResponse.json(
      {
        error:
          "File caricato ma non ancora leggibile. Riprova tra qualche secondo.",
        details: msg,
      },
      { status: 502 }
    );
  }
}
