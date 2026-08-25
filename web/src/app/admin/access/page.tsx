"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { useRobot } from "@/components/AdminShell";

type Visit = {
  id: string;
  firstName: string;
  lastName: string;
  enteredAt: string;
  exitedAt: string | null;
};

export default function AccessPage() {
  const { robotId } = useRobot();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [visits, setVisits] = useState<Visit[]>([]);
  const [inside, setInside] = useState<Visit[]>([]);

  const load = useCallback(async () => {
    if (!robotId) return;
    const [dayRes, openRes] = await Promise.all([
      fetch(`/api/admin/access?robotId=${robotId}&date=${date}`),
      fetch(`/api/admin/access?robotId=${robotId}&open=1`),
    ]);
    if (dayRes.ok) {
      const data = await dayRes.json();
      setVisits(data.visits ?? []);
    }
    if (openRes.ok) {
      const data = await openRes.json();
      setInside(data.visits ?? []);
    }
  }, [date, robotId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function checkout(id: string) {
    await fetch("/api/admin/access", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "checkout" }),
    });
    await load();
  }

  if (!robotId) {
    return (
      <p className="text-[var(--bob-muted)]">
        Nessun robot assegnato. Chiedi al super admin di associarne uno.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="bob-page-title">Controllo accessi</h1>
          <p className="text-[var(--bob-muted)] mt-1">
            Ingressi e uscite registrati dal robot (nome, cognome, orario).
          </p>
        </div>
        <label className="text-sm">
          Giorno
          <input
            type="date"
            className="ml-2 rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-white"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>

      <section>
        <h2 className="font-semibold text-lg mb-3">Dentro ora</h2>
        <ul className="space-y-2">
          {inside.length === 0 ? (
            <li className="text-[var(--bob-muted)]">Nessuno in struttura.</li>
          ) : (
            inside.map((v) => (
              <li
                key={v.id}
                className="bob-card px-4 py-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <p className="font-semibold">
                    {v.firstName} {v.lastName}
                  </p>
                  <p className="text-sm text-[var(--bob-muted)]">
                    Entrato {format(new Date(v.enteredAt), "HH:mm")}
                  </p>
                </div>
                <button
                  type="button"
                  className="bob-btn px-4 py-1.5 text-sm"
                  onClick={() => checkout(v.id)}
                >
                  Segna uscita
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      <section>
        <h2 className="font-semibold text-lg mb-3">Registro del giorno</h2>
        <ul className="space-y-2">
          {visits.length === 0 ? (
            <li className="text-[var(--bob-muted)]">Nessun accesso in questa data.</li>
          ) : (
            visits.map((v) => (
              <li
                key={v.id}
                className="bob-card px-4 py-3 flex flex-wrap justify-between gap-3"
              >
                <p className="font-semibold">
                  {v.firstName} {v.lastName}
                </p>
                <p className="text-sm text-[var(--bob-muted)]">
                  In {format(new Date(v.enteredAt), "HH:mm")}
                  {v.exitedAt
                    ? ` · Out ${format(new Date(v.exitedAt), "HH:mm")}`
                    : " · ancora dentro"}
                </p>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
