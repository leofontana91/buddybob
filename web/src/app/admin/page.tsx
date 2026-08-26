"use client";

import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRobot } from "@/components/AdminShell";
import { Button, ButtonLink } from "@/components/bob/Button";
import {
  DayRowAppointment,
  DayRowFocus,
  DayRowRobotEvent,
} from "@/components/bob/DayRow";
import { DarkPanel, FilterPills } from "@/components/bob/FilterPills";
import {
  RobotPresence,
  type RobotPresenceState,
} from "@/components/bob/RobotPresence";

type Appt = {
  id: string;
  guestName: string;
  guestPhone?: string | null;
  hostName?: string | null;
  typeName?: string | null;
  roomName?: string | null;
  mapPlaceName?: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
};

type Alert = {
  id: string;
  type: string;
  message: string;
  createdAt: string;
  readAt: string | null;
};

type Status = {
  displayName: string;
  online: boolean;
  lastSeenAt: string | null;
  lastPlace: string | null;
  lastActivity: string | null;
};

type FilterId = "all" | "onsite" | "upcoming" | "closed";

type TimelineItem =
  | { kind: "appt"; at: number; appt: Appt }
  | { kind: "alert"; at: number; alert: Alert };

function minutesWaiting(startsAt: string, now = Date.now()) {
  const t = parseISO(startsAt).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 60000));
}

export default function OggiPage() {
  const { robotId, robotPresence, modules } = useRobot();
  const [appts, setAppts] = useState<Appt[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [filter, setFilter] = useState<FilterId>("all");
  const [speakOpen, setSpeakOpen] = useState(false);
  const [speakText, setSpeakText] = useState("");
  const [msg, setMsg] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const dateIso = format(new Date(), "yyyy-MM-dd");
  const eyebrow = format(new Date(), "EEEE d MMMM", { locale: it });

  const load = useCallback(async () => {
    if (!robotId) return;
    const [aRes, alRes, sRes] = await Promise.all([
      fetch(`/api/admin/appointments?robotId=${robotId}&date=${dateIso}`),
      fetch(`/api/admin/alerts?robotId=${robotId}`),
      fetch(`/api/admin/robot-status?robotId=${robotId}`),
    ]);
    if (aRes.ok) {
      const data = await aRes.json();
      setAppts(data.appointments ?? []);
    }
    if (alRes.ok) {
      const data = await alRes.json();
      setAlerts(data.alerts ?? []);
    }
    if (sRes.ok) {
      setStatus(await sRes.json());
    }
  }, [robotId, dateIso]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    const clock = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      clearInterval(t);
      clearInterval(clock);
    };
  }, [load]);

  const counts = useMemo(() => {
    const onsite = appts.filter((a) =>
      ["checked_in", "in_progress"].includes(a.status)
    ).length;
    const upcoming = appts.filter((a) =>
      ["booked", "confirmed", "scheduled"].includes(a.status)
    ).length;
    const closed = appts.filter((a) =>
      ["completed", "cancelled", "no_show"].includes(a.status)
    ).length;
    return {
      all: appts.length + alerts.filter((a) => !a.readAt).length,
      onsite,
      upcoming,
      closed,
    };
  }, [appts, alerts]);

  const timeline = useMemo(() => {
    const items: TimelineItem[] = [];
    for (const appt of appts) {
      items.push({ kind: "appt", at: parseISO(appt.startsAt).getTime(), appt });
    }
    for (const alert of alerts) {
      if (alert.readAt) continue;
      const created = parseISO(alert.createdAt).getTime();
      const dayStart = parseISO(`${dateIso}T00:00:00`).getTime();
      const dayEnd = dayStart + 86400000;
      if (created < dayStart || created >= dayEnd) continue;
      items.push({ kind: "alert", at: created, alert });
    }
    items.sort((a, b) => a.at - b.at);

    return items.filter((item) => {
      if (filter === "all") return true;
      if (item.kind === "alert") return filter === "onsite";
      const s = item.appt.status;
      if (filter === "onsite")
        return ["checked_in", "in_progress"].includes(s);
      if (filter === "upcoming")
        return ["booked", "confirmed", "scheduled"].includes(s);
      if (filter === "closed")
        return ["completed", "cancelled", "no_show"].includes(s);
      return true;
    });
  }, [appts, alerts, filter, dateIso]);

  const focusAppt = useMemo(() => {
    return (
      appts.find((a) => ["checked_in", "in_progress"].includes(a.status)) ??
      appts.find((a) => ["booked", "confirmed", "scheduled"].includes(a.status)) ??
      null
    );
  }, [appts]);

  const expectedSoon = useMemo(() => {
    return appts.filter((a) => {
      if (!["booked", "confirmed", "scheduled", "checked_in"].includes(a.status)) return false;
      const t = parseISO(a.startsAt).getTime();
      return t <= now + 3 * 3600000;
    }).length;
  }, [appts, now]);

  const heroLine = useMemo(() => {
    const place = status?.lastPlace || "Reception";
    const online = status?.online;
    if (!online) {
      return `BOB è offline.\n${expectedSoon || appts.length} eventi in agenda oggi.`;
    }
    if (expectedSoon > 0) {
      return `BOB è in ${place}.\n${expectedSoon === 1 ? "Un ospite atteso" : `${expectedSoon} ospiti attesi`} a breve.`;
    }
    return `BOB è in ${place}.\nNessun ospite in arrivo nelle prossime ore.`;
  }, [status, expectedSoon, appts.length]);

  const presence: RobotPresenceState = robotPresence;
  const stateLabel =
    presence === "offline"
      ? "Offline"
      : presence === "charging"
        ? "In ricarica"
        : presence === "moving"
          ? "In movimento"
          : status?.lastActivity || "In attesa";
  const stateSub = status?.lastPlace
    ? status.lastPlace
    : status?.lastSeenAt
      ? `visto ${format(parseISO(status.lastSeenAt), "HH:mm")}`
      : "nessun segnale";

  async function markArrived(id: string) {
    if (!robotId) return;
    await fetch("/api/admin/appointments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ robotId, id, status: "checked_in" }),
    });
    load();
  }

  async function sendCommand(body: Record<string, unknown>) {
    if (!robotId) return;
    setMsg("");
    const res = await fetch("/api/admin/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ robotId, ...body }),
    });
    if (!res.ok) {
      setMsg("Comando non inviato");
      return;
    }
    setMsg("Inviato al robot");
    setSpeakOpen(false);
    setSpeakText("");
  }

  async function onSpeak(e: FormEvent) {
    e.preventDefault();
    if (!speakText.trim()) return;
    await sendCommand({ type: "speak", text: speakText.trim() });
  }

  async function dismissAlert(id: string) {
    await fetch("/api/admin/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    load();
  }

  const todos = useMemo(() => {
    const list: { title: string; sub: string; href?: string }[] = [];
    for (const a of appts) {
      if (["booked", "confirmed", "scheduled"].includes(a.status) && !a.hostName) {
        list.push({
          title: `Assegna un referente a ${a.guestName}`,
          sub: format(parseISO(a.startsAt), "HH:mm"),
          href: "/admin/agenda",
        });
      }
    }
    const unreadAlerts = alerts.filter((a) => !a.readAt).length;
    if (unreadAlerts > 0) {
      list.push({
        title:
          unreadAlerts === 1
            ? "1 avviso da gestire"
            : `${unreadAlerts} avvisi da gestire`,
        sub: "Inbox",
        href: "/admin/inbox",
      });
    }
    return list.slice(0, 4);
  }, [appts, alerts]);

  if (!robotId) {
    return (
      <div className="flex min-h-[calc(100vh-72px)] items-center justify-center p-8">
        <div className="bob-card max-w-md p-8 text-center">
          <p className="bob-page-title text-[28px]">Nessun robot</p>
          <p className="bob-page-sub">
            Chiedi al super admin di associarne uno al tuo account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-[calc(100vh-72px)] lg:grid-cols-[1fr_356px]">
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden px-5 pt-8 sm:px-8 lg:px-[34px] lg:pt-[34px]">
        <div className="flex shrink-0 flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <p className="bob-eyebrow capitalize">{eyebrow}</p>
            <h1 className="mt-3 font-[family-name:var(--font-poppins)] text-[clamp(28px,3.2vw,37px)] font-semibold leading-[1.14] tracking-[-0.03em] whitespace-pre-line">
              {heroLine}
            </h1>
          </div>
          {modules.appointments ? (
            <ButtonLink href="/admin/agenda" className="shrink-0">
              Nuovo appuntamento
            </ButtonLink>
          ) : null}
        </div>

        <div className="mt-[22px] shrink-0">
          <FilterPills
            value={filter}
            onChange={(id) => setFilter(id as FilterId)}
            items={[
              { id: "all", label: "Tutto", count: counts.all },
              { id: "onsite", label: "In struttura", count: counts.onsite },
              { id: "upcoming", label: "Da arrivare", count: counts.upcoming },
              { id: "closed", label: "Chiusi", count: counts.closed },
            ]}
          />
        </div>

        <div className="mt-5 flex min-h-0 flex-1 flex-col gap-[9px] overflow-y-auto pb-8">
          {timeline.length === 0 ? (
            <div className="rounded-[20px] border border-[var(--bob-line)] bg-white px-6 py-10 text-center text-[var(--bob-muted)]">
              Niente in agenda per questo filtro.
            </div>
          ) : (
            timeline.map((item) => {
              if (item.kind === "alert") {
                return (
                  <DayRowRobotEvent
                    key={`a-${item.alert.id}`}
                    time={format(parseISO(item.alert.createdAt), "HH:mm")}
                    message={item.alert.message}
                    onAction={() => dismissAlert(item.alert.id)}
                  />
                );
              }
              const a = item.appt;
              const time = format(parseISO(a.startsAt), "HH:mm");
              const sub = [
                a.typeName,
                a.hostName ? `con ${a.hostName}` : null,
                a.roomName,
                a.guestPhone,
              ]
                .filter(Boolean)
                .join(" · ");
              const closed = ["completed", "cancelled", "no_show"].includes(
                a.status
              );
              const isFocus = focusAppt?.id === a.id && !closed;

              if (isFocus) {
                const waiting = ["checked_in", "in_progress"].includes(
                  a.status
                );
                return (
                  <DayRowFocus
                    key={a.id}
                    time={time}
                    title={a.guestName}
                    subtitle={sub || undefined}
                    badge={
                      waiting
                        ? `ASPETTA DA ${minutesWaiting(a.startsAt, now)}′`
                        : undefined
                    }
                    actions={
                      <>
                        {a.mapPlaceName ? (
                          <Button
                            variant="cyan"
                            onClick={() =>
                              sendCommand({
                                type: "goto",
                                placeName: a.mapPlaceName,
                              })
                            }
                          >
                            Accompagna{a.roomName ? ` in ${a.roomName}` : ""}
                          </Button>
                        ) : null}
                        {["booked", "confirmed", "scheduled"].includes(a.status) ? (
                          <Button
                            variant="secondary"
                            onClick={() => markArrived(a.id)}
                          >
                            Segna arrivato
                          </Button>
                        ) : null}
                        <ButtonLink
                          href="/admin/waiting-room"
                          variant="secondary"
                        >
                          Sala d&apos;attesa
                        </ButtonLink>
                      </>
                    }
                  />
                );
              }

              return (
                <DayRowAppointment
                  key={a.id}
                  time={time}
                  title={a.guestName}
                  subtitle={
                    closed
                      ? `${sub || a.status} · ${a.status === "completed" ? "completato" : a.status}`
                      : sub || undefined
                  }
                  dimmed={closed}
                  action={
                    closed ? (
                      <span className="font-[family-name:var(--font-poppins)] text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--bob-muted-2)]">
                        Completato
                      </span>
                    ) : ["booked", "confirmed", "scheduled"].includes(a.status) ? (
                      <Button
                        variant="secondary"
                        className="!py-1.5 !px-3.5 !text-[12.5px] !normal-case !tracking-normal !font-medium"
                        onClick={() => markArrived(a.id)}
                      >
                        Segna arrivato
                      </Button>
                    ) : undefined
                  }
                />
              );
            })
          )}
        </div>
      </div>

      <aside className="flex flex-col gap-3.5 overflow-hidden border-t border-[var(--bob-line)] bg-[var(--bob-bg-2)] p-5 lg:border-t-0 lg:border-l lg:p-6">
        <DarkPanel className="shrink-0 p-[22px]">
          <p className="m-0 font-[family-name:var(--font-poppins)] text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--bob-cyan)]">
            Il tuo robot
          </p>
          <RobotPresence state={presence} size={156} className="mt-3.5" />
          <p className="mt-1.5 font-[family-name:var(--font-poppins)] text-[23px] font-semibold tracking-[-0.025em] text-white">
            {stateLabel}
          </p>
          <p className="mt-1 text-[13px] text-[var(--bob-muted-2)]">{stateSub}</p>
          <div className="mt-4 flex gap-2">
            <Button
              variant="cyan"
              className="flex-1 !text-[12.5px] !normal-case !tracking-normal"
              onClick={() => setSpeakOpen((v) => !v)}
            >
              Fallo parlare
            </Button>
            <ButtonLink
              href="/admin/actions"
              variant="ghost-dark"
              className="flex-1 !text-[12.5px] !normal-case !tracking-normal !font-medium"
            >
              Mandalo…
            </ButtonLink>
          </div>
          {speakOpen ? (
            <form onSubmit={onSpeak} className="mt-3 space-y-2">
              <input
                className="bob-input !bg-[var(--bob-ink-2)] !border-[var(--bob-ink-line-2)] !text-white"
                placeholder="Cosa deve dire?"
                value={speakText}
                onChange={(e) => setSpeakText(e.target.value)}
              />
              <Button type="submit" variant="cyan" className="w-full">
                Invia
              </Button>
            </form>
          ) : null}
          {msg ? (
            <p className="mt-2 text-[12px] text-[var(--bob-cyan)]">{msg}</p>
          ) : null}
          <div className="mt-3.5 flex justify-between border-t border-[var(--bob-ink-line)] pt-3.5 text-[12px] text-[#7d8b98]">
            <span>{status?.displayName || "BOB"}</span>
            <span>{status?.online ? "online" : "offline"}</span>
            <span className="truncate max-w-[100px]">
              {status?.lastPlace || "—"}
            </span>
          </div>
        </DarkPanel>

        <p className="m-0 mt-1.5 font-[family-name:var(--font-poppins)] text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--bob-muted-2)]">
          Da chiudere
        </p>
        {todos.length === 0 ? (
          <div className="rounded-[16px] border border-[var(--bob-line)] bg-white px-4 py-3.5 text-[13px] text-[var(--bob-muted)]">
            Tutto in ordine per oggi.
          </div>
        ) : (
          todos.map((t) =>
            t.href ? (
              <Link
                key={t.title}
                href={t.href}
                className="rounded-[16px] border border-[var(--bob-line)] bg-white px-4 py-3.5 hover:border-[var(--bob-cyan)]"
              >
                <p className="m-0 text-[14px] font-semibold">{t.title}</p>
                <p className="m-0 mt-1 text-[12.5px] text-[var(--bob-muted)]">
                  {t.sub}
                </p>
              </Link>
            ) : (
              <div
                key={t.title}
                className="rounded-[16px] border border-[var(--bob-line)] bg-white px-4 py-3.5"
              >
                <p className="m-0 text-[14px] font-semibold">{t.title}</p>
                <p className="m-0 mt-1 text-[12.5px] text-[var(--bob-muted)]">
                  {t.sub}
                </p>
              </div>
            )
          )
        )}

        <p className="mt-auto mb-0 text-[12px] leading-[1.55] text-[#7b8794]">
          Le impostazioni dei moduli non stanno più nel menù: si aprono dalla
          scheda del robot, dove servono.
        </p>
      </aside>
    </div>
  );
}
