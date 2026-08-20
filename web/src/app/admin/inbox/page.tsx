"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { useRobot } from "@/components/AdminShell";

type Alert = {
  id: string;
  type: string;
  message: string;
  createdAt: string;
  readAt: string | null;
};

export default function InboxPage() {
  const { robotId } = useRobot();
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const load = useCallback(async () => {
    if (!robotId) return;
    const res = await fetch(`/api/admin/alerts?robotId=${robotId}`);
    if (!res.ok) return;
    const data = await res.json();
    setAlerts(data.alerts ?? []);
  }, [robotId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  async function markAll() {
    if (!robotId) return;
    await fetch("/api/admin/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true, robotId }),
    });
    await load();
  }

  async function markOne(id: string) {
    await fetch("/api/admin/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    await load();
  }

  if (!robotId) {
    return <p className="text-[var(--bob-muted)]">Nessun robot assegnato.</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inbox</h1>
          <p className="text-[var(--bob-muted)] mt-1">
            Arrivi ospiti e richieste operatore
          </p>
        </div>
        <button
          onClick={markAll}
          className="rounded-full border border-[var(--bob-line)] px-4 py-2 text-sm"
        >
          Segna tutto letto
        </button>
      </div>

      <ul className="mt-8 space-y-3">
        {alerts.length === 0 ? (
          <li className="text-[var(--bob-muted)]">Nessuna notifica.</li>
        ) : (
          alerts.map((a) => (
            <li
              key={a.id}
              className={`rounded-2xl border px-4 py-3 flex justify-between gap-3 ${
                a.readAt
                  ? "bg-white border-[var(--bob-line)] opacity-70"
                  : "bg-white border-[var(--bob-navy)]"
              }`}
            >
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--bob-navy)] font-semibold">
                  {a.type === "call_operator"
                    ? "Chiama operatore"
                    : "Ospite arrivato"}
                </p>
                <p className="font-medium mt-1">{a.message}</p>
                <p className="text-sm text-[var(--bob-muted)] mt-1">
                  {format(new Date(a.createdAt), "dd/MM HH:mm:ss")}
                </p>
              </div>
              {!a.readAt ? (
                <button
                  className="self-start rounded-full bg-[var(--bob-black)] text-white px-3 py-1.5 text-sm"
                  onClick={() => markOne(a.id)}
                >
                  Letto
                </button>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
