"use client";

import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { useRobot } from "@/components/AdminShell";

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

const STATUS_LABEL: Record<string, string> = {
  scheduled: "In attesa",
  checked_in: "Arrivato",
  in_progress: "In corso",
  completed: "Completato",
  cancelled: "Annullato",
  no_show: "Non presentato",
};

export default function GuestsOpsPage() {
  const { robotId } = useRobot();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [items, setItems] = useState<Appt[]>([]);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    if (!robotId) return;
    const res = await fetch(
      `/api/admin/appointments?robotId=${robotId}&date=${date}`
    );
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.appointments ?? []);
  }, [date, robotId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  async function patch(id: string, body: Record<string, unknown>) {
    setMsg("");
    const res = await fetch("/api/admin/appointments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error ?? "Operazione non riuscita");
      return;
    }
    setMsg(
      body.escort
        ? `Robot inviato verso ${data.placeName ?? "destinazione"}`
        : "Aggiornato"
    );
    await load();
  }

  async function callGuest(a: Appt) {
    if (!robotId) return;
    setMsg("");
    const phone = (a.guestPhone ?? "").trim();
    const speak = `${a.guestName}, presentati in reception per favore.`;
    await fetch("/api/admin/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        robotId,
        type: "speak",
        text: speak,
      }),
    });
    setMsg(
      phone
        ? `Robot avvisato · puoi anche chiamare ${phone}`
        : "Il robot ha chiamato l'ospite a voce"
    );
  }

  const arrived = items.filter((a) =>
    ["checked_in", "in_progress"].includes(a.status)
  );
  const upcoming = items.filter((a) => a.status === "scheduled");
  const done = items.filter((a) =>
    ["completed", "no_show", "cancelled"].includes(a.status)
  );

  if (!robotId) {
    return (
      <p className="text-[var(--bob-muted)]">Nessun robot assegnato.</p>
    );
  }

  function Card({ a }: { a: Appt }) {
    return (
      <li className="bob-card px-4 py-3 space-y-3">
        <div className="flex flex-wrap justify-between gap-2">
          <div>
            <p className="font-semibold text-lg">{a.guestName}</p>
            <p className="text-sm text-[var(--bob-muted)]">
              {format(parseISO(a.startsAt), "HH:mm")}–
              {format(parseISO(a.endsAt), "HH:mm")}
              {a.hostName ? ` · con ${a.hostName}` : ""}
              {a.roomName ? ` · ${a.roomName}` : ""}
            </p>
            <p className="text-sm mt-0.5">
              {STATUS_LABEL[a.status] ?? a.status}
              {a.guestPhone ? ` · ${a.guestPhone}` : ""}
              {a.typeName ? ` · ${a.typeName}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {a.status === "scheduled" ? (
            <button
              type="button"
              className="bob-btn px-3 py-1.5 text-sm"
              onClick={() => patch(a.id, { status: "checked_in" })}
            >
              Segna arrivato
            </button>
          ) : null}
          {a.status === "checked_in" ? (
            <>
              <button
                type="button"
                className="bob-btn px-3 py-1.5 text-sm"
                onClick={() => patch(a.id, { status: "in_progress" })}
              >
                Inizia visita
              </button>
              <button
                type="button"
                className="bob-btn-secondary px-3 py-1.5 text-sm"
                onClick={() => patch(a.id, { escort: true })}
              >
                Accompagna in sala
              </button>
            </>
          ) : null}
          {a.status === "in_progress" ? (
            <button
              type="button"
              className="bob-btn px-3 py-1.5 text-sm"
              onClick={() => patch(a.id, { status: "completed" })}
            >
              Termina
            </button>
          ) : null}
          {["scheduled", "checked_in"].includes(a.status) ? (
            <>
              <button
                type="button"
                className="bob-btn-secondary px-3 py-1.5 text-sm"
                onClick={() => callGuest(a)}
              >
                Chiama / avvisa
              </button>
              <button
                type="button"
                className="bob-btn-secondary px-3 py-1.5 text-sm"
                onClick={() => patch(a.id, { status: "no_show" })}
              >
                Non presentato
              </button>
            </>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="bob-page-title">Gestione clienti</h1>
          <p className="text-[var(--bob-muted)] mt-1">
            Arrivi, chiamate e accompagnamento in sala con il robot.
          </p>
        </div>
        <label className="text-sm">
          Giorno
          <input
            type="date"
            className="ml-2 bob-input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>

      {msg ? <p className="text-sm text-[var(--bob-muted)]">{msg}</p> : null}

      <section className="space-y-3">
        <h2 className="font-semibold text-lg">In struttura / arrivati</h2>
        <ul className="space-y-3">
          {arrived.length === 0 ? (
            <li className="text-[var(--bob-muted)]">Nessuno in questo momento.</li>
          ) : (
            arrived.map((a) => <Card key={a.id} a={a} />)
          )}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-lg">In arrivo oggi</h2>
        <ul className="space-y-3">
          {upcoming.length === 0 ? (
            <li className="text-[var(--bob-muted)]">Nessun appuntamento in attesa.</li>
          ) : (
            upcoming.map((a) => <Card key={a.id} a={a} />)
          )}
        </ul>
      </section>

      {done.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-semibold text-lg">Chiusi</h2>
          <ul className="space-y-2 text-sm text-[var(--bob-muted)]">
            {done.map((a) => (
              <li key={a.id}>
                {format(parseISO(a.startsAt), "HH:mm")} {a.guestName} ·{" "}
                {STATUS_LABEL[a.status] ?? a.status}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
