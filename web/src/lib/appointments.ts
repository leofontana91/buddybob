import {
  addDays,
  addMinutes,
  endOfDay,
  format,
  parse,
  setHours,
  setMinutes,
  startOfDay,
} from "date-fns";
import { prisma } from "./db";
import { parseModules, AdminModules, DEFAULT_ADMIN_MODULES } from "./modules";
import { rewriteStaleAppUrl, publicAppUrl } from "./appUrl";
import {
  detectLevelToAngleDeg,
  detectLevelToMeters,
} from "./receptionSettings";

export function parseHm(hm: string, day: Date): Date {
  const [h, m] = hm.split(":").map(Number);
  return setMinutes(setHours(startOfDay(day), h || 0), m || 0);
}

export async function listAppointmentsForDate(robotId: string, dateIso: string) {
  const day = startOfDay(parse(dateIso, "yyyy-MM-dd", new Date()));
  const next = endOfDay(day);
  return prisma.appointment.findMany({
    where: {
      robotId,
      startsAt: { gte: day, lte: next },
      status: { not: "cancelled" },
    },
    orderBy: { startsAt: "asc" },
  });
}

export async function getFreeSlots(
  robotId: string,
  fromIso: string,
  toIso: string
) {
  const settings = await prisma.robotSettings.findUnique({ where: { robotId } });
  const dayStart = settings?.dayStart ?? "09:00";
  const dayEnd = settings?.dayEnd ?? "18:00";
  const slotMinutes = settings?.slotMinutes ?? 30;

  const from = startOfDay(parse(fromIso, "yyyy-MM-dd", new Date()));
  const to = endOfDay(parse(toIso, "yyyy-MM-dd", new Date()));

  const existing = await prisma.appointment.findMany({
    where: {
      robotId,
      startsAt: { gte: from, lte: to },
      status: { in: ["scheduled", "checked_in"] },
    },
    select: { startsAt: true },
  });
  const taken = new Set(existing.map((a) => a.startsAt.toISOString()));

  const slots: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    let slot = parseHm(dayStart, cursor);
    const end = parseHm(dayEnd, cursor);
    while (slot < end) {
      const iso = slot.toISOString();
      if (!taken.has(iso) && slot.getTime() > Date.now()) {
        slots.push(iso);
      }
      slot = addMinutes(slot, slotMinutes);
    }
    cursor = addDays(startOfDay(cursor), 1);
  }
  return slots;
}

export function formatAppt(startsAt: Date) {
  return format(startsAt, "HH:mm");
}

export function buildRobotConfig(
  robot: {
    id: string;
    displayName: string;
    locale: string;
    timezone: string;
    apiKey: string;
    settings: {
      bookingMode: string;
      bookingUrl: string;
      checkInSpeak: string;
      callOperatorSpeak: string;
      settingsPin?: string;
      welcomeSpeak?: string;
      howCanIHelpSpeak?: string;
      receptionCooldownSec?: number;
      receptionDetectLevel?: number;
      standbyPlace?: string;
      idleDisplayText?: string;
      idleMediaUrl?: string;
      idleMediaContentType?: string;
      idleMediaIntervalSec?: number;
      idleMediaStopMode?: string;
    } | null;
  },
  adminModules?: AdminModules
) {
  const s = robot.settings;
  const bookingUrl = rewriteStaleAppUrl(
    s?.bookingUrl,
    `/book/${robot.id}`
  );
  const m = adminModules ?? DEFAULT_ADMIN_MODULES;

  const receptionButtons = [
    { id: "goTo", label: "Vai a…", enabled: m.goTo },
    { id: "appointments", label: "Appuntamenti", enabled: m.appointments },
    { id: "documents", label: "Documenti", enabled: m.documents },
    { id: "talkToMe", label: "Parla con me", enabled: m.speech },
    { id: "games", label: "Giochi", enabled: m.games },
    { id: "callOperator", label: "Chiama operatore", enabled: m.callOperator },
    { id: "voiceMemos", label: "Memo vocali", enabled: m.voiceMemos },
    { id: "accessControl", label: "Controllo accessi", enabled: m.accessControl },
  ];

  const modules = {
    reception: m.reception,
    goTo: m.goTo,
    motion: m.motion,
    speech: m.speech,
    follow: m.follow,
    charge: m.charge,
    settings: m.settings,
  };

  const detectLevel = Math.min(
    5,
    Math.max(1, s?.receptionDetectLevel ?? 3)
  );
  const idleUrl = (s?.idleMediaUrl ?? "").trim();
  const idleCt = (s?.idleMediaContentType ?? "").trim();
  const idleMedia =
    idleUrl.length > 0
      ? { url: idleUrl, contentType: idleCt || "image/jpeg" }
      : null;

  return {
    schemaVersion: 1,
    configVersion: configVersionOf({
      modules,
      receptionButtons,
      bookingUrl,
      settingsPin: s?.settingsPin ?? "1234",
      welcomeSpeak: s?.welcomeSpeak,
      howCanIHelpSpeak: s?.howCanIHelpSpeak,
      receptionCooldownSec: s?.receptionCooldownSec,
      receptionDetectLevel: detectLevel,
      standbyPlace: s?.standbyPlace,
      idleDisplayText: s?.idleDisplayText,
      idleMediaUrl: idleUrl,
      idleMediaIntervalSec: s?.idleMediaIntervalSec,
      idleMediaStopMode: s?.idleMediaStopMode,
    }),
    updatedAt: new Date().toISOString(),
    robot: {
      id: robot.id,
      displayName: robot.displayName,
      locale: robot.locale,
      timezone: robot.timezone,
    },
    modules,
    phrases: {
      welcome: (s?.welcomeSpeak ?? "").trim() || "Benvenuto",
      howCanIHelp: (s?.howCanIHelpSpeak ?? "").trim() || "Come posso aiutarti?",
      goingTo: "Vado a {place}",
      arrived: "Siamo arrivati a {place}",
      navigationFailed: "Non riesco ad arrivare a {place}",
      followStarted: "Ok, ti seguo",
      followLost: "Ti ho perso di vista",
      personNotFound: "Non vedo nessuno da seguire",
      goodbye: "A presto!",
      configUpdated: "Configurazione aggiornata",
      configUpdateFailed: "Aggiornamento configurazione non riuscito",
    },
    assets: {
      idleScreen: idleMedia,
    },
    appointments: {
      bookingMode: (s?.bookingMode === "in_app" ? "in_app" : "qr") as
        | "qr"
        | "in_app",
      bookingUrl,
      checkInSpeak:
        s?.checkInSpeak ?? "Perfetto, ho avvisato che sei arrivato",
      callOperatorSpeak:
        s?.callOperatorSpeak ?? "Sto chiamando un operatore",
      apiKey: robot.apiKey,
    },
    reception: {
      cooldownSec: Math.min(600, Math.max(10, s?.receptionCooldownSec ?? 45)),
      maxDistanceMeters: detectLevelToMeters(detectLevel),
      detectAngleDeg: detectLevelToAngleDeg(detectLevel),
      detectLevel,
      raiseHeadVertical: 35,
      settingsPin: s?.settingsPin?.trim() || "1234",
      standbyPlace: (s?.standbyPlace ?? "").trim(),
      idleDisplayText: (s?.idleDisplayText ?? "").trim(),
      idleMedia,
      idleMediaIntervalSec: Math.min(
        600,
        Math.max(0, s?.idleMediaIntervalSec ?? 20)
      ),
      idleMediaStopMode:
        s?.idleMediaStopMode === "tap" ? "tap" : "person",
      buttons: receptionButtons,
    },
    sync: {
      fetchOnLaunch: true,
      endpoint: publicAppUrl(),
    },
  };
}

export async function modulesForRobot(robotId: string): Promise<AdminModules> {
  const link = await prisma.adminRobot.findFirst({
    where: { robotId },
    include: { admin: true },
  });
  if (!link?.admin) return DEFAULT_ADMIN_MODULES;
  return parseModules(link.admin.modulesJson);
}

/** Stable int so the robot only downloads when Super Admin modules/settings change. */
function configVersionOf(payload: unknown): number {
  const s = JSON.stringify(payload);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) || 1;
}
