"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { useRobot } from "@/components/AdminShell";

type Status = {
  displayName: string;
  online: boolean;
  lastSeenAt: string | null;
  lastPlace: string | null;
  lastActivity: string | null;
  waiting: { id: string; guestName: string; startsAt: string }[];
};

export default function DashboardPage() {
  const { robotId, modules } = useRobot();
  const [status, setStatus] = useState<Status | null>(null);
  const [speakText, setSpeakText] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    if (!robotId) return;
    const res = await fetch(`/api/admin/robot-status?robotId=${robotId}`);
    if (!res.ok) return;
    setStatus(await res.json());
  }, [robotId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  async function speak(e: FormEvent) {
    e.preventDefault();
    if (!robotId || !speakText.trim()) return;
    setMsg("");
    const res = await fetch("/api/admin/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        robotId,
        type: "speak",
        text: speakText.trim(),
      }),
    });
    if (!res.ok) {
      setMsg("Invio non riuscito");
      return;
    }
    setSpeakText("");
    setMsg("Frase inviata al robot");
  }

  if (!robotId) {
    return (
      <div className="bob-card p-8 text-center">
        <p className="bob-page-title text-xl">Nessun robot</p>
        <p className="bob-page-sub max-w-sm mx-auto">
          Chiedi al super admin di associarne uno al tuo account.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="bob-page-title">Dashboard</h1>
        <p className="bob-page-sub">
          Stato in tempo reale di {status?.displayName || "BOB"}
        </p>
      </header>

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="bob-card p-5">
          <p className="bob-label">Connessione</p>
          <div className="mt-3 flex items-center gap-2.5">
            <span
              className="bob-status-dot"
              style={{
                background: status?.online ? "var(--bob-teal)" : "var(--bob-muted)",
              }}
            />
            <p className="text-[1.35rem] font-semibold tracking-tight">
              {status?.online ? "Online" : "Offline"}
            </p>
          </div>
          <p className="text-[13px] text-[var(--bob-muted)] mt-2">
            {status?.lastSeenAt
              ? `visto ${format(new Date(status.lastSeenAt), "HH:mm:ss")}`
              : "nessun segnale dal robot"}
          </p>
        </div>
        <div className="bob-card p-5">
          <p className="bob-label">Dove si trova</p>
          <p className="mt-3 text-[1.35rem] font-semibold tracking-tight">
            {status?.lastPlace || "—"}
          </p>
        </div>
        <div className="bob-card p-5">
          <p className="bob-label">Cosa sta facendo</p>
          <p className="mt-3 text-[1.35rem] font-semibold tracking-tight">
            {status?.lastActivity || "—"}
          </p>
        </div>
      </div>

      <form onSubmit={speak} className="bob-card p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Fai parlare BOB
          </h2>
          <p className="text-sm text-[var(--bob-muted)] mt-0.5">
            Invia una frase da far pronunciare al robot.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            className="bob-input flex-1"
            placeholder="Ciao, benvenuto."
            value={speakText}
            onChange={(e) => setSpeakText(e.target.value)}
          />
          <button
            type="submit"
            className="bob-btn px-5 py-2.5 text-sm shrink-0"
          >
            Invia
          </button>
        </div>
        {msg ? (
          <p className="text-sm text-[var(--bob-teal)] font-medium">{msg}</p>
        ) : null}
      </form>

      {modules.appointments ? (
        <section className="bob-card p-6">
          <h2 className="text-lg font-semibold tracking-tight">
            Persone in sala d&apos;attesa
          </h2>
          <p className="text-sm text-[var(--bob-muted)] mt-1">
            Ospiti con check-in oggi, in attesa.
          </p>
          <ul className="mt-5 space-y-2">
            {!status?.waiting?.length ? (
              <li className="rounded-[var(--bob-radius)] bg-[var(--bob-cream)] px-4 py-6 text-center text-[var(--bob-muted)] text-sm">
                Nessuno in attesa.
              </li>
            ) : (
              status.waiting.map((p) => (
                <li
                  key={p.id}
                  className="rounded-[var(--bob-radius)] bg-[var(--bob-cream)] px-4 py-3.5 flex justify-between items-center gap-3"
                >
                  <span className="font-medium tracking-tight">
                    {p.guestName}
                  </span>
                  <span className="text-sm text-[var(--bob-muted)] tabular-nums">
                    {format(new Date(p.startsAt), "HH:mm")}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
