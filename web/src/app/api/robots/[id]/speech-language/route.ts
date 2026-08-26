import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRobotRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  normalizeSpeechLanguage,
  speechPhrases,
  speechLocale,
  SPEECH_LANGUAGES,
} from "@/lib/speechLanguage";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  language: z.enum(["it", "en", "de", "fr", "es"]),
});

/** Robot: cambia lingua parlato (UI monitor resta italiana). */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const robot = await authenticateRobotRequest(
    id,
    req.headers.get("authorization")
  );
  if (!robot) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "language richiesto" }, { status: 400 });
  }

  const lang = normalizeSpeechLanguage(parsed.data.language);
  const pack = speechPhrases(lang);

  await prisma.robotSettings.upsert({
    where: { robotId: id },
    update: { speechLanguage: lang },
    create: { robotId: id, speechLanguage: lang },
  });

  return NextResponse.json({
    ok: true,
    language: lang,
    locale: speechLocale(lang),
    languages: SPEECH_LANGUAGES.map((l) => ({
      code: l.code,
      label: l.label,
    })),
    phrases: {
      welcome: pack.welcome,
      howCanIHelp: pack.howCanIHelp,
      goingTo: pack.goingTo,
      arrived: pack.arrived,
      navigationFailed: pack.navigationFailed,
      followStarted: pack.followStarted,
      followLost: pack.followLost,
      personNotFound: pack.personNotFound,
      goodbye: pack.goodbye,
      configUpdated: pack.configUpdated,
      configUpdateFailed: pack.configUpdateFailed,
      wakeHintLabel: pack.wakeHintLabel,
      wakeHint: pack.wakeHint,
      wakeGreeting: pack.wakeGreeting,
    },
    appointments: {
      checkInSpeak: pack.checkInSpeak,
      callOperatorSpeak: pack.callOperatorSpeak,
    },
  });
}

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const robot = await authenticateRobotRequest(
    id,
    req.headers.get("authorization")
  );
  if (!robot) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const lang = normalizeSpeechLanguage(robot.settings?.speechLanguage);
  return NextResponse.json({
    language: lang,
    languages: SPEECH_LANGUAGES.map((l) => ({
      code: l.code,
      label: l.label,
    })),
  });
}
