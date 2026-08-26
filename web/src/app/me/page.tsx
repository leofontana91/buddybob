"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { DarkPanel } from "@/components/bob/FilterPills";
import { RobotPresence } from "@/components/bob/RobotPresence";

type Appt = {
  id: string;
  guestName: string;
  startsAt: string;
  status: string;
  robot: { id: string; displayName: string };
};

export default function MePage() {
  const [items, setItems] = useState<Appt[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/me/appointments");
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.appointments ?? []);
    })();
  }, []);

  const now = Date.now();
  const next = useMemo(() => {
    return (
      items
        .filter((a) => parseISO(a.startsAt).getTime() >= now - 30 * 60000)
        .sort(
          (a, b) =>
            parseISO(a.startsAt).getTime() - parseISO(b.startsAt).getTime()
        )[0] ?? null
    );
  }, [items, now]);

  const upcoming = items.filter(
    (a) => parseISO(a.startsAt).getTime() >= now && a.id !== next?.id
  );
  const past = items.filter((a) => parseISO(a.startsAt).getTime() < now && a.id !== next?.id);

  return (
    <div className="space-y-8">
      <div>
        <p className="bob-eyebrow">Il tuo spazio</p>
        <h1 className="bob-page-title mt-2">In programma</h1>
      </div>

      {next ? (
        <DarkPanel className="grid gap-6 p-6 sm:grid-cols-[1fr_200px] sm:items-center">
          <div>
            <p className="m-0 font-[family-name:var(--font-poppins)] text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--bob-cyan)]">
              Prossimo
            </p>
            <p className="mt-3 font-[family-name:var(--font-poppins)] text-[28px] font-semibold tracking-[-0.03em] text-white">
              {format(parseISO(next.startsAt), "EEEE d MMMM · HH:mm", {
                locale: it,
              })}
            </p>
            <p className="mt-2 text-[14px] text-[var(--bob-muted-2)]">
              {next.robot.displayName} · {next.guestName} · {next.status}
            </p>
            <p className="mt-4 text-[13px] leading-relaxed text-[#7d8b98]">
              All&apos;arrivo dì il tuo nome a BOB: ti riconosce e avvisa il
              referente.
            </p>
          </div>
          <RobotPresence state="idle" size={140} />
        </DarkPanel>
      ) : (
        <div className="bob-card p-8 text-center text-[var(--bob-muted)]">
          Nessun appuntamento in arrivo.
        </div>
      )}

      {upcoming.length > 0 ? (
        <section>
          <p className="bob-eyebrow !text-[var(--bob-muted-2)]">Dopo</p>
          <ul className="mt-3 space-y-2">
            {upcoming.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-4 rounded-[16px] border border-[var(--bob-line)] bg-white px-4 py-3"
              >
                <span className="w-14 shrink-0 font-[family-name:var(--font-poppins)] text-[14px] font-semibold bob-tabular">
                  {format(parseISO(a.startsAt), "HH:mm")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{a.guestName}</p>
                  <p className="text-[13px] text-[var(--bob-muted)]">
                    {format(parseISO(a.startsAt), "d MMM", { locale: it })} ·{" "}
                    {a.robot.displayName}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {past.length > 0 ? (
        <section>
          <p className="bob-eyebrow !text-[var(--bob-muted-2)]">Passati</p>
          <ul className="mt-3 space-y-2 opacity-70">
            {past.slice(0, 8).map((a) => (
              <li
                key={a.id}
                className="rounded-[16px] bg-[var(--bob-bg-2)] px-4 py-3"
              >
                <p className="font-semibold">
                  {format(parseISO(a.startsAt), "d MMM yyyy · HH:mm", {
                    locale: it,
                  })}
                </p>
                <p className="text-[13px] text-[var(--bob-muted)]">
                  {a.robot.displayName} · {a.status}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
