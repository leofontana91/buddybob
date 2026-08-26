"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRobot } from "@/components/AdminShell";
import { Button } from "@/components/bob/Button";

const DEFAULT_GAMES_URL = "https://robo-play-land.base44.app";

export default function GamesModulePage() {
  const { robotId } = useRobot();
  const [url, setUrl] = useState(DEFAULT_GAMES_URL);
  const [msg, setMsg] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!robotId) return;
    const res = await fetch(`/api/admin/settings?robotId=${robotId}`);
    if (!res.ok) return;
    const data = await res.json();
    const s = data.settings ?? {};
    setUrl((s.gamesUrl as string | undefined)?.trim() || DEFAULT_GAMES_URL);
  }, [robotId]);

  useEffect(() => {
    load();
  }, [load]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!robotId) return;
    setMsg("");
    setSaved(false);
    const trimmed = url.trim();
    if (!trimmed) {
      setMsg("Inserisci un URL.");
      return;
    }
    try {
      const u = new URL(trimmed);
      if (u.protocol !== "https:" && u.protocol !== "http:") {
        setMsg("Usa un link http o https.");
        return;
      }
    } catch {
      setMsg("URL non valido.");
      return;
    }

    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ robotId, gamesUrl: trimmed }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMsg(
        typeof data.error === "string"
          ? data.error
          : "Salvataggio non riuscito"
      );
      return;
    }
    setSaved(true);
  }

  if (!robotId) {
    return <p className="text-[var(--bob-muted)]">Nessun robot assegnato.</p>;
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <p className="bob-eyebrow">Modulo</p>
        <h1 className="bob-page-title mt-2">Giochi</h1>
        <p className="bob-page-sub">
          Link dell’hub giochi che il robot apre a schermo intero quando l’ospite
          tocca «Giochi».
        </p>
      </div>

      <form onSubmit={onSave} className="bob-card space-y-5 p-5">
        <label className="block">
          <span className="bob-label">URL hub giochi</span>
          <input
            className="bob-input mt-2 font-mono text-[14px]"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setSaved(false);
            }}
            placeholder={DEFAULT_GAMES_URL}
            inputMode="url"
            autoComplete="url"
          />
          <span className="mt-2 block text-[13px] text-[var(--bob-muted)]">
            Es. RoboPlay su Base44. Serve connessione internet sul robot.
          </span>
        </label>

        {msg ? (
          <p className="text-sm text-[var(--bob-alert)]">{msg}</p>
        ) : null}
        {saved ? (
          <p className="text-sm text-[var(--bob-listen)]">Salvato. Il robot lo
            riceve al prossimo sync config.</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit">Salva</Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setUrl(DEFAULT_GAMES_URL);
              setSaved(false);
            }}
          >
            Usa RoboPlay default
          </Button>
        </div>
      </form>
    </div>
  );
}
