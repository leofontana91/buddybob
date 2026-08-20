import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Returns pairing JSON + PNG data URL for APK association QR.
 * GET /api/super/pairing?robotId=...
 */
export async function GET(req: Request) {
  const session = await requireSession(["SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const robotId = new URL(req.url).searchParams.get("robotId");
  if (!robotId) {
    return NextResponse.json({ error: "robotId richiesto" }, { status: 400 });
  }

  const robot = await prisma.robot.findUnique({
    where: { id: robotId },
    include: { settings: true },
  });
  if (!robot) {
    return NextResponse.json({ error: "Robot non trovato" }, { status: 404 });
  }

  const endpoint =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const bookingUrl =
    robot.settings?.bookingUrl || `${endpoint}/book/${robot.id}`;

  const payload = {
    v: 1,
    endpoint,
    robotId: robot.id,
    apiKey: robot.apiKey,
    bookingUrl,
  };

  const json = JSON.stringify(payload);
  const qrDataUrl = await QRCode.toDataURL(json, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 360,
  });

  return NextResponse.json({
    payload,
    json,
    qrDataUrl,
    serialNumber: robot.serialNumber,
    displayName: robot.displayName,
    hint:
      "Sull'APK: Associa robot → Scansiona QR (oppure incolla il JSON). " +
      "Se il robot non raggiunge localhost, imposta NEXT_PUBLIC_APP_URL con l'IP LAN (es. http://192.168.1.10:3000) e rigenera il QR.",
  });
}
