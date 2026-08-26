/** Parse ICS / iCal feed into simple events. */

export type IcalEvent = {
  uid: string;
  summary: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
};

function unfoldIcal(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function parseIcalDate(value: string): Date | null {
  const v = value.trim();
  // DATE only: 20260826
  if (/^\d{8}$/.test(v)) {
    const y = Number(v.slice(0, 4));
    const m = Number(v.slice(4, 6)) - 1;
    const d = Number(v.slice(6, 8));
    return new Date(Date.UTC(y, m, d, 9, 0, 0));
  }
  // 20260826T090000Z or 20260826T090000
  const m = v.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/
  );
  if (!m) return null;
  const [, ys, ms, ds, hs, mins, ss, z] = m;
  if (z) {
    return new Date(
      Date.UTC(+ys, +ms - 1, +ds, +hs, +mins, +ss)
    );
  }
  return new Date(+ys, +ms - 1, +ds, +hs, +mins, +ss);
}

function unescapeText(s: string): string {
  return s
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

export function parseIcal(raw: string): IcalEvent[] {
  const text = unfoldIcal(raw);
  const blocks = text.split("BEGIN:VEVENT");
  const out: IcalEvent[] = [];

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split("END:VEVENT")[0] ?? "";
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    let uid = "";
    let summary = "Appuntamento";
    let description = "";
    let dtStart = "";
    let dtEnd = "";

    for (const line of lines) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const keyPart = line.slice(0, idx);
      const value = line.slice(idx + 1);
      const key = keyPart.split(";")[0].toUpperCase();
      if (key === "UID") uid = value;
      else if (key === "SUMMARY") summary = unescapeText(value);
      else if (key === "DESCRIPTION") description = unescapeText(value);
      else if (key === "DTSTART") dtStart = value;
      else if (key === "DTEND") dtEnd = value;
    }

    const startsAt = parseIcalDate(dtStart);
    if (!startsAt || Number.isNaN(startsAt.getTime())) continue;
    let endsAt = parseIcalDate(dtEnd);
    if (!endsAt || Number.isNaN(endsAt.getTime())) {
      endsAt = new Date(startsAt.getTime() + 30 * 60_000);
    }
    if (!uid) uid = `${startsAt.toISOString()}-${summary}`;

    out.push({
      uid,
      summary: summary.slice(0, 200) || "Appuntamento",
      description: description.slice(0, 2000) || undefined,
      startsAt,
      endsAt,
    });
  }

  return out;
}

export async function fetchIcalEvents(
  url: string
): Promise<{ events: IcalEvent[]; error?: string }> {
  const trimmed = url.trim();
  if (!trimmed) return { events: [], error: "URL iCal mancante" };
  try {
    const res = await fetch(trimmed, {
      headers: { Accept: "text/calendar, text/plain, */*" },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      return {
        events: [],
        error: `Feed non raggiungibile (${res.status})`,
      };
    }
    const text = await res.text();
    if (!/BEGIN:VCALENDAR/i.test(text) && !/BEGIN:VEVENT/i.test(text)) {
      return { events: [], error: "Il feed non sembra un calendario iCal" };
    }
    return { events: parseIcal(text) };
  } catch (e) {
    return {
      events: [],
      error: e instanceof Error ? e.message : "Download feed fallito",
    };
  }
}
