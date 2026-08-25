"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRobot } from "@/components/AdminShell";

type Memo = {
  id: string;
  audioUrl: string;
  transcript: string;
  status: string;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: string;
};

export default function VoiceMemosAdminPage() {
  const { robotId } = useRobot();
  const [memos, setMemos] = useState<Memo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!robotId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/voice-memos?robotId=${encodeURIComponent(robotId)}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Errore caricamento");
        setMemos([]);
        return;
      }
      setMemos(data.memos ?? []);
    } catch {
      setError("Rete non disponibile");
    } finally {
      setLoading(false);
    }
  }, [robotId]);

  useEffect(() => {
    void load();
  }, [load]);

  function onRefresh(e: FormEvent) {
    e.preventDefault();
    void load();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="bob-page-title">Memo vocali</h1>
          <p className="mt-1 text-[var(--bob-muted)]">
            Registrazioni dal robot, con trascrizione automatica.
          </p>
        </div>
        <form onSubmit={onRefresh}>
          <button type="submit" className="bob-btn-secondary" disabled={loading}>
            {loading ? "Aggiorno…" : "Aggiorna"}
          </button>
        </form>
      </div>

      {error ? (
        <p className="text-[var(--bob-danger)]">{error}</p>
      ) : null}

      {!robotId ? (
        <p className="text-[var(--bob-muted)]">Seleziona un robot.</p>
      ) : memos.length === 0 && !loading ? (
        <p className="text-[var(--bob-muted)]">
          Nessun memo ancora. Sul robot: Memo vocali → Inizia a registrare.
        </p>
      ) : (
        <ul className="space-y-4">
          {memos.map((m) => (
            <li
              key={m.id}
              className="rounded-2xl border border-[var(--bob-line)] bg-white p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--bob-muted)]">
                <span>
                  {new Date(m.createdAt).toLocaleString("it-IT")}
                  {m.durationMs != null
                    ? ` · ${Math.round(m.durationMs / 1000)}s`
                    : ""}
                </span>
                <span
                  className={
                    m.status === "ready"
                      ? "text-emerald-700"
                      : m.status === "failed"
                        ? "text-[var(--bob-danger)]"
                        : ""
                  }
                >
                  {m.status === "ready"
                    ? "Trascritto"
                    : m.status === "failed"
                      ? "Trascrizione fallita"
                      : "In corso"}
                </span>
              </div>
              {m.audioUrl ? (
                <audio
                  className="mt-3 w-full"
                  controls
                  preload="none"
                  src={m.audioUrl}
                />
              ) : null}
              <p className="mt-3 whitespace-pre-wrap text-[var(--bob-black)]">
                {m.transcript || m.errorMessage || "—"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
