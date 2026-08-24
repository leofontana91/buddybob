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
      <p className="text-[var(--bob-muted)]">
        Nessun robot assegnato. Chiedi al super admin di associarne uno.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-[var(--bob-muted)] mt-1">
          Stato in tempo reale di {status?.displayName || "BOB"}
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white border border-[var(--bob-line)] p-5">
          <p className="text-xs uppercase tracking-wide text-[var(--bob-muted)]">
            Connessione
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {status?.online ? "Online" : "Offline"}
          </p>
          <p className="text-sm text-[var(--bob-muted)] mt-1">
            {status?.lastSeenAt
              ? `visto ${format(new Date(status.lastSeenAt), "HH:mm:ss")}`
              : "nessun segnale dal robot"}
          </p>
        </div>
        <div className="rounded-2xl bg-white border border-[var(--bob-line)] p-5">
          <p className="text-xs uppercase tracking-wide text-[var(--bob-muted)]">
            Dove si trova
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {status?.lastPlace || "—"}
          </p>
        </div>
        <div className="rounded-2xl bg-white border border-[var(--bob-line)] p-5">
          <p className="text-xs uppercase tracking-wide text-[var(--bob-muted)]">
            Cosa sta facendo
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {status?.lastActivity || "—"}
          </p>
        </div>
      </div>

      <form
        onSubmit={speak}
        className="rounded-2xl bg-white border border-[var(--bob-line)] p-6 space-y-3"
      >
        <h2 className="font-semibold text-lg">Fai parlare BOB</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            className="flex-1 rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-[var(--bob-cream)]"
            placeholder="Ciao, benvenuto."
            value={speakText}
            onChange={(e) => setSpeakText(e.target.value)}
          />
          <button type="submit" className="bob-btn rounded-full px-5 py-2.5 font-medium">
            Invia
          </button>
        </div>
        {msg ? <p className="text-sm text-[var(--bob-teal)]">{msg}</p> : null}
      </form>

      {modules.appointments ? (
        <section className="rounded-2xl bg-white border border-[var(--bob-line)] p-6">
          <h2 className="font-semibold text-lg">Persone in sala d&apos;attesa</h2>
          <p className="text-sm text-[var(--bob-muted)] mt-1">
            Ospiti con check-in oggi, in attesa.
          </p>
          <ul className="mt-4 space-y-2">
            {!status?.waiting?.length ? (
              <li className="text-[var(--bob-muted)]">Nessuno in attesa.</li>
            ) : (
              status.waiting.map((p) => (
                <li
                  key={p.id}
                  className="rounded-xl border border-[var(--bob-line)] px-4 py-3 flex justify-between"
                >
                  <span className="font-medium">{p.guestName}</span>
                  <span className="text-sm text-[var(--bob-muted)]">
                    appuntamento {format(new Date(p.startsAt), "HH:mm")}
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
