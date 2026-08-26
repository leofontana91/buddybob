import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requireSession,
  canAccessRobot,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fetchIcalEvents } from "@/lib/calendarSync";

export async function POST(req: Request) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = z
    .object({
      robotId: z.string().min(1),
      /** Se true, usa l’URL inviato senza salvare. */
      icalUrl: z.string().url().optional(),
    })
    .safeParse(await req.json().catch(() => ({})));

  if (!body.success) {
    return NextResponse.json({ error: "robotId richiesto" }, { status: 400 });
  }

  const { robotId } = body.data;
  if (!(await canAccessRobot(session, robotId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const settings = await prisma.robotSettings.findUnique({
    where: { robotId },
  });
  const provider = settings?.calendarSyncProvider ?? "none";
  const url = (body.data.icalUrl ?? settings?.calendarSyncIcalUrl ?? "").trim();

  if (!settings?.calendarSyncEnabled && !body.data.icalUrl) {
    return NextResponse.json(
      { error: "Sync calendario non attivo. Abilitalo in Impostazioni." },
      { status: 400 }
    );
  }

  if (provider === "none" && !url) {
    return NextResponse.json(
      { error: "Configura un provider o un URL iCal." },
      { status: 400 }
    );
  }

  if (!url) {
    return NextResponse.json(
      {
        error:
          provider === "google" || provider === "teams"
            ? "Incolla l’URL iCal del calendario (Google: Impostazioni → Indirizzo segreto; Outlook/Teams: Pubblica calendario ICS)."
            : "URL iCal mancante",
      },
      { status: 400 }
    );
  }

  const { events, error } = await fetchIcalEvents(url);
  if (error) {
    return NextResponse.json({ error }, { status: 502 });
  }

  const source =
    provider === "google" || provider === "teams" || provider === "ical"
      ? provider
      : "ical";

  let created = 0;
  let updated = 0;
  const horizon = Date.now() + 90 * 24 * 3600_000;
  const past = Date.now() - 7 * 24 * 3600_000;

  for (const ev of events) {
    if (ev.startsAt.getTime() > horizon || ev.endsAt.getTime() < past) continue;

    const existing = await prisma.appointment.findFirst({
      where: {
        robotId,
        externalSource: source,
        externalId: ev.uid,
      },
    });

    const data = {
      guestName: ev.summary,
      notes: ev.description ?? null,
      startsAt: ev.startsAt,
      endsAt: ev.endsAt,
      status: "scheduled" as const,
      externalId: ev.uid,
      externalSource: source,
    };

    if (existing) {
      if (["checked_in", "in_progress", "completed"].includes(existing.status)) {
        continue;
      }
      await prisma.appointment.update({
        where: { id: existing.id },
        data,
      });
      updated += 1;
    } else {
      await prisma.appointment.create({
        data: { robotId, ...data },
      });
      created += 1;
    }
  }

  await prisma.robotSettings.updateMany({
    where: { robotId },
    data: { calendarLastSyncAt: new Date() },
  });

  return NextResponse.json({
    ok: true,
    imported: events.length,
    created,
    updated,
    source,
  });
}

export async function GET(req: Request) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const robotId = new URL(req.url).searchParams.get("robotId");
  if (!robotId || !(await canAccessRobot(session, robotId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const settings = await prisma.robotSettings.findUnique({
    where: { robotId },
  });
  return NextResponse.json({
    provider: settings?.calendarSyncProvider ?? "none",
    enabled: !!settings?.calendarSyncEnabled,
    icalUrl: settings?.calendarSyncIcalUrl ?? "",
    lastSyncAt: settings?.calendarLastSyncAt?.toISOString() ?? null,
  });
}
