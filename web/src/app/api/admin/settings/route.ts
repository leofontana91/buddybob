import { NextResponse } from "next/server";
import { requireSession, canAccessRobot } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { publicPathUrl } from "@/lib/appUrl";

export async function GET(req: Request) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const robotId = url.searchParams.get("robotId");
  if (!robotId) {
    return NextResponse.json({ error: "robotId richiesto" }, { status: 400 });
  }
  if (!(await canAccessRobot(session, robotId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const robot = await prisma.robot.findUnique({
    where: { id: robotId },
    include: { settings: true },
  });
  if (!robot) {
    return NextResponse.json({ error: "Robot non trovato" }, { status: 404 });
  }

  return NextResponse.json({
    id: robot.id,
    displayName: robot.displayName,
    apiKey: robot.apiKey,
    timezone: robot.timezone,
    settings: robot.settings,
  });
}

const patchSchema = z.object({
  robotId: z.string(),
  bookingMode: z.enum(["qr", "in_app"]).optional(),
  bookingUrl: z.string().optional(),
  checkInSpeak: z.string().optional(),
  callOperatorSpeak: z.string().optional(),
  dayStart: z.string().optional(),
  dayEnd: z.string().optional(),
  slotMinutes: z.number().int().min(5).max(120).optional(),
  bookableWeekdays: z.string().max(40).optional(),
  displayName: z.string().optional(),
  settingsPin: z.string().trim().min(4).max(20).optional(),
  voiceInstructions: z.string().max(4000).optional(),
  welcomeSpeak: z.string().max(400).optional(),
  howCanIHelpSpeak: z.string().max(400).optional(),
  receptionCooldownSec: z.number().int().min(10).max(600).optional(),
  receptionDetectLevel: z.number().int().min(1).max(5).optional(),
  standbyPlace: z.string().max(120).optional(),
  idleDisplayText: z.string().max(500).optional(),
  idleMediaUrl: z.string().max(800).optional(),
  idleMediaContentType: z.string().max(120).optional(),
  idleMediaIntervalSec: z.number().int().min(0).max(600).optional(),
  idleMediaStopMode: z.enum(["person", "tap"]).optional(),
});

export async function PATCH(req: Request) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (!(await canAccessRobot(session, parsed.data.robotId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { robotId, displayName, ...settings } = parsed.data;

  if (displayName) {
    await prisma.robot.update({
      where: { id: robotId },
      data: { displayName },
    });
  }

  const updated = await prisma.robotSettings.upsert({
    where: { robotId },
    update: settings,
    create: {
      robotId,
      bookingMode: settings.bookingMode ?? "qr",
      bookingUrl:
        settings.bookingUrl ?? publicPathUrl(`/book/${robotId}`, req),
      checkInSpeak: settings.checkInSpeak,
      callOperatorSpeak: settings.callOperatorSpeak,
      dayStart: settings.dayStart,
      dayEnd: settings.dayEnd,
      slotMinutes: settings.slotMinutes,
      bookableWeekdays: settings.bookableWeekdays ?? "1,2,3,4,5",
      settingsPin: settings.settingsPin,
      voiceInstructions: settings.voiceInstructions ?? "",
      welcomeSpeak: settings.welcomeSpeak ?? "Benvenuto",
      howCanIHelpSpeak: settings.howCanIHelpSpeak ?? "Come posso aiutarti?",
      receptionCooldownSec: settings.receptionCooldownSec ?? 45,
      receptionDetectLevel: settings.receptionDetectLevel ?? 2,
      standbyPlace: settings.standbyPlace ?? "",
      idleDisplayText: settings.idleDisplayText ?? "",
      idleMediaUrl: settings.idleMediaUrl ?? "",
      idleMediaContentType: settings.idleMediaContentType ?? "",
      idleMediaIntervalSec: settings.idleMediaIntervalSec ?? 20,
      idleMediaStopMode: settings.idleMediaStopMode ?? "person",
    },
  });

  return NextResponse.json({ settings: updated });
}
