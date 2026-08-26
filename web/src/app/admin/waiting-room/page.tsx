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

type PlaceOpt = { name: string; label?: string | null };

export default function WaitingRoomPage() {
  const { robotId } = useRobot();
  const [items, setItems] = useState<Appt[]>([]);
  const [places, setPlaces] = useState<PlaceOpt[]>([]);
  const [selected, setSelected] = useState<Appt | null>(null);
  const [customSpeak, setCustomSpeak] = useState("");
  const [gotoPlace, setGotoPlace] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const date = format(new Date(), "yyyy-MM-dd");

  const load = useCallback(async () => {
    if (!robotId) return;
    const res = await fetch(
      `/api/admin/appointments?robotId=${robotId}&date=${date}`
    );
    if (!res.ok) return;
    const data = await res.json();
    const list: Appt[] = data.appointments ?? [];
    setItems(list.filter((a) => ["checked_in", "in_progress"].includes(a.status)));
    setSelected((prev) => {
      if (!prev) return null;
      return list.find((a) => a.id === prev.id) ?? null;
    });
  }, [robotId, date]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!robotId) return;
    (async () => {
      const res = await fetch(`/api/admin/places?robotId=${robotId}`);
      if (!res.ok) return;
      const data = await res.json();
      setPlaces(data.places ?? []);
    })();
  }, [robotId]);

  async function command(body: Record<string, unknown>) {
    if (!robotId) return;
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/admin/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ robotId, ...body }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMsg(data.error ?? "Comando non inviato");
      return;
    }
    setMsg("Comando inviato al robot");
  }

  async function patchAppt(id: string, body: Record<string, unknown>) {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/admin/appointments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "Operazione non riuscita");
      return;
    }
    if (body.escort) {
      setMsg(`Robot inviato verso ${data.placeName ?? "la sala"}`);
    } else {
      setMsg("Aggiornato");
    }
    await load();
  }

  if (!robotId) {
    return (
      <p className="text-[var(--bob-muted)]">Nessun robot assegnato.</p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="bob-page-title">Sala d&apos;attesa</h1>
          <p className="text-[var(--bob-muted)] mt-1">
            Ospiti arrivati o in visita. Clicca una carta per far agire il robot.
          </p>
        </div>
        <button
          type="button"
          className="bob-btn-secondary px-4 py-2 text-sm"
          onClick={() => load()}
        >
          Aggiorna
        </button>
      </div>

      {msg ? (
        <p className="text-sm text-[var(--bob-muted)]">{msg}</p>
      ) : null}

      {items.length === 0 ? (
        <div className="bob-card p-8 text-center text-[var(--bob-muted)]">
          Nessuno in sala d&apos;attesa in questo momento.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((a) => {
            const active = selected?.id === a.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  setSelected(a);
                  setCustomSpeak(
                    `${a.guestName}, il tuo appuntamento è pronto. Seguimi per favore.`
                  );
                  setGotoPlace(a.mapPlaceName ?? "");
                }}
                className={`bob-card p-4 text-left transition ${
                  active
                    ? "ring-2 ring-[var(--bob-ink)]"
                    : "hover:border-[var(--bob-ink)]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-lg leading-tight">
                    {a.guestName}
                  </p>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      a.status === "in_progress"
                        ? "bg-[var(--bob-ink)] text-white"
                        : "bg-[var(--bob-cream)]"
                    }`}
                  >
                    {a.status === "in_progress" ? "In corso" : "Arrivato"}
                  </span>
                </div>
                <p className="text-sm text-[var(--bob-muted)] mt-1">
                  {format(parseISO(a.startsAt), "HH:mm")}
                  {a.hostName ? ` · con ${a.hostName}` : ""}
                </p>
                <p className="text-sm text-[var(--bob-muted)]">
                  {a.typeName ?? "Senza tipo"}
                  {a.roomName ? ` · ${a.roomName}` : ""}
                </p>
                {a.guestPhone ? (
                  <p className="text-xs mt-2 text-[var(--bob-muted)]">
                    {a.guestPhone}
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {selected ? (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg bob-card p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-xl">{selected.guestName}</h2>
                <p className="text-sm text-[var(--bob-muted)]">
                  {selected.hostName
                    ? `Appuntamento con ${selected.hostName}`
                    : "Senza referente"}
                  {selected.roomName ? ` · ${selected.roomName}` : ""}
                </p>
              </div>
              <button
                type="button"
                className="bob-btn-secondary px-3 py-1.5 text-sm"
                onClick={() => setSelected(null)}
              >
                Chiudi
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                className="bob-btn px-3 py-2.5 text-sm"
                onClick={() =>
                  command({
                    type: "speak",
                    text: `${selected.guestName}, presentati in reception per favore.`,
                  })
                }
              >
                Chiama a voce
              </button>
              <button
                type="button"
                disabled={busy || !selected.mapPlaceName}
                className="bob-btn px-3 py-2.5 text-sm disabled:opacity-40"
                onClick={() => patchAppt(selected.id, { escort: true })}
                title={
                  selected.mapPlaceName
                    ? `Vai a ${selected.mapPlaceName}`
                    : "Collega un punto mappa alla sala"
                }
              >
                Accompagna in sala
              </button>
              {selected.status === "checked_in" ? (
                <button
                  type="button"
                  disabled={busy}
                  className="bob-btn-secondary px-3 py-2.5 text-sm"
                  onClick={() =>
                    patchAppt(selected.id, { status: "in_progress" })
                  }
                >
                  Inizia visita
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  className="bob-btn-secondary px-3 py-2.5 text-sm"
                  onClick={() =>
                    patchAppt(selected.id, { status: "completed" })
                  }
                >
                  Termina visita
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                className="bob-btn-secondary px-3 py-2.5 text-sm"
                onClick={() => command({ type: "stop" })}
              >
                Ferma robot
              </button>
            </div>

            <div className="space-y-2 pt-2 border-t border-[var(--bob-line)]">
              <p className="text-sm font-medium">Fai dire al robot</p>
              <textarea
                className="w-full bob-input min-h-[72px]"
                value={customSpeak}
                onChange={(e) => setCustomSpeak(e.target.value)}
              />
              <button
                type="button"
                disabled={busy || !customSpeak.trim()}
                className="bob-btn px-4 py-2 text-sm"
                onClick={() =>
                  command({ type: "speak", text: customSpeak.trim() })
                }
              >
                Invia messaggio
              </button>
            </div>

            <div className="space-y-2 pt-2 border-t border-[var(--bob-line)]">
              <p className="text-sm font-medium">Manda il robot a…</p>
              <div className="flex flex-wrap gap-2">
                <select
                  className="bob-input flex-1 min-w-[180px]"
                  value={gotoPlace}
                  onChange={(e) => setGotoPlace(e.target.value)}
                >
                  <option value="">— scegli punto —</option>
                  {places.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.label || p.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy || !gotoPlace}
                  className="bob-btn px-4 py-2 text-sm"
                  onClick={() =>
                    command({
                      type: "goto",
                      placeName: gotoPlace,
                      after: "stay",
                    })
                  }
                >
                  Vai
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
