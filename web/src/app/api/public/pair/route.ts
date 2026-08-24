import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { publicAppUrl, publicPathUrl } from "@/lib/appUrl";

const bodySchema = z.object({
  serialNumber: z.string().min(1),
  pairingCode: z.string().min(4).max(12),
});

/**
 * Pair an APK to a robot by serial + short-lived Super Admin code.
 * No prior robot credentials required.
 */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Inserisci numero di serie e codice di associazione" },
      { status: 400 }
    );
  }

  const serial = parsed.data.serialNumber.trim();
  const code = parsed.data.pairingCode.trim();

  const all = await prisma.robot.findMany({ include: { settings: true } });
  const robot = all.find(
    (r) => r.serialNumber.toLowerCase() === serial.toLowerCase()
  );

  if (!robot) {
    return NextResponse.json(
      { error: "Nessun robot con questo numero di serie" },
      { status: 404 }
    );
  }
  if (!robot.enabled) {
    return NextResponse.json(
      { error: "Robot disabilitato. Contatta il Super Admin." },
      { status: 403 }
    );
  }
  if (!robot.pairingCode || !robot.pairingOpenUntil) {
    return NextResponse.json(
      {
        error:
          "Associazione non aperta. Sul Super Admin premi «Prepara associazione».",
      },
      { status: 403 }
    );
  }
  if (robot.pairingOpenUntil.getTime() < Date.now()) {
    return NextResponse.json(
      { error: "Codice scaduto. Generane uno nuovo dal Super Admin." },
      { status: 403 }
    );
  }
  if (robot.pairingCode !== code) {
    return NextResponse.json({ error: "Codice non valido" }, { status: 403 });
  }

  const origin = publicAppUrl(req);
  const bookingUrl = publicPathUrl(`/book/${robot.id}`, req);

  // One-time: consume the code after success
  await prisma.robot.update({
    where: { id: robot.id },
    data: { pairingCode: null, pairingOpenUntil: null },
  });

  return NextResponse.json({
    v: 1,
    endpoint: origin,
    robotId: robot.id,
    apiKey: robot.apiKey,
    bookingUrl,
    displayName: robot.displayName,
    serialNumber: robot.serialNumber,
  });
}
