"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useParams } from "next/navigation";

export default function PublicBookPage() {
  const params = useParams<{ robotId: string }>();
  const robotId = params.robotId;
  const [robotName, setRobotName] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [guestName, setGuestName] = useState("");
  const [selected, setSelected] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/public/book/${robotId}`);
      if (!res.ok) {
        setError("Robot non trovato");
        return;
      }
      const data = await res.json();
      setRobotName(data.robot?.displayName ?? robotId);
      setSlots(data.slots ?? []);
    })();
  }, [robotId]);

  const byDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const iso of slots) {
      const day = format(new Date(iso), "yyyy-MM-dd");
      const list = map.get(day) ?? [];
      list.push(iso);
      map.set(day, list);
    }
    return Array.from(map.entries());
  }, [slots]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch(`/api/public/book/${robotId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestName, startsAt: selected }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Prenotazione non riuscita");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-2xl bg-white border border-[var(--bob-line)] p-8 text-center">
          <h1 className="text-2xl font-bold">Appuntamento fissato</h1>
          <p className="mt-2 text-[var(--bob-muted)]">
            Grazie {guestName}. Ti aspettiamo!
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-lg">
        <p className="text-xs tracking-[0.18em] uppercase text-[var(--bob-navy)] font-semibold">
          BOB
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Fissa un appuntamento
        </h1>
        <p className="mt-1 text-[var(--bob-muted)]">{robotName}</p>

        <form
          onSubmit={onSubmit}
          className="mt-8 rounded-2xl bg-white border border-[var(--bob-line)] p-6 space-y-5"
        >
          <label className="block text-sm font-medium">
            Il tuo nome
            <input
              required
              className="mt-1 w-full rounded-xl border border-[var(--bob-line)] px-3 py-2.5 bg-[var(--bob-cream)]"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
            />
          </label>

          <div>
            <p className="text-sm font-medium mb-2">Scegli giorno e ora</p>
            {byDay.length === 0 ? (
              <p className="text-sm text-[var(--bob-muted)]">
                Nessuno slot disponibile.
              </p>
            ) : (
              <div className="space-y-4 max-h-80 overflow-auto">
                {byDay.map(([day, daySlots]) => (
                  <div key={day}>
                    <p className="text-xs uppercase tracking-wide text-[var(--bob-navy)] font-semibold mb-2">
                      {format(new Date(day), "dd/MM/yyyy")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {daySlots.map((iso) => (
                        <button
                          key={iso}
                          type="button"
                          onClick={() => setSelected(iso)}
                          className={`rounded-full px-3 py-1.5 text-sm border ${
                            selected === iso
                              ? "bg-[var(--bob-black)] text-white border-[var(--bob-black)]"
                              : "border-[var(--bob-line)] bg-[var(--bob-cream)]"
                          }`}
                        >
                          {format(new Date(iso), "HH:mm")}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="submit"
            disabled={!selected || !guestName}
            className="w-full rounded-full bg-[var(--bob-black)] text-white py-3 font-medium disabled:opacity-50"
          >
            Conferma
          </button>
        </form>
      </div>
    </main>
  );
}
