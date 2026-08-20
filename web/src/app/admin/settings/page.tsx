"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRobot } from "@/components/AdminShell";

type Settings = {
  bookingMode: string;
  bookingUrl: string;
  checkInSpeak: string;
  callOperatorSpeak: string;
  dayStart: string;
  dayEnd: string;
  slotMinutes: number;
};

export default function SettingsPage() {
  const { robotId } = useRobot();
  const [displayName, setDisplayName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!robotId) return;
    (async () => {
      const res = await fetch(`/api/admin/settings?robotId=${robotId}`);
      if (!res.ok) return;
      const data = await res.json();
      setDisplayName(data.displayName ?? "");
      setApiKey(data.apiKey ?? "");
      setSettings(data.settings);
      setSaved(false);
    })();
  }, [robotId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!settings || !robotId) return;
    setSaved(false);
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        robotId,
        displayName,
        ...settings,
      }),
    });
    if (res.ok) setSaved(true);
  }

  if (!robotId) {
    return <p className="text-[var(--bob-muted)]">Nessun robot assegnato.</p>;
  }

  if (!settings) {
    return <p className="text-[var(--bob-muted)]">Caricamento…</p>;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Impostazioni</h1>
      <p className="text-[var(--bob-muted)] mt-1">
        Modalità prenotazione e frasi robot
      </p>

      <form
        onSubmit={onSubmit}
        className="mt-8 max-w-xl space-y-5 rounded-2xl bg-white border border-[var(--bob-line)] p-6"
      >
        <label className="block text-sm font-medium">
          Nome robot
          <input
            className="mt-1 w-full rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-[var(--bob-cream)]"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>

        <div className="text-sm">
          <p className="font-medium">API key robot (da mettere nell&apos;APK)</p>
          <code className="mt-1 block rounded-xl bg-[var(--bob-cream)] px-3 py-2 text-xs break-all">
            {apiKey}
          </code>
          <p className="mt-1 text-xs text-[var(--bob-muted)]">
            robot.id = <code>{robotId}</code>
          </p>
        </div>

        <fieldset>
          <legend className="text-sm font-medium">
            Fissa appuntamento (bookingMode)
          </legend>
          <div className="mt-2 flex flex-wrap gap-3">
            <label className="flex items-center gap-2 rounded-full border border-[var(--bob-line)] px-4 py-2">
              <input
                type="radio"
                name="bookingMode"
                checked={settings.bookingMode === "qr"}
                onChange={() =>
                  setSettings({ ...settings, bookingMode: "qr" })
                }
              />
              QR verso pagina web
            </label>
            <label className="flex items-center gap-2 rounded-full border border-[var(--bob-line)] px-4 py-2">
              <input
                type="radio"
                name="bookingMode"
                checked={settings.bookingMode === "in_app"}
                onChange={() =>
                  setSettings({ ...settings, bookingMode: "in_app" })
                }
              />
              Sul monitor del robot
            </label>
          </div>
        </fieldset>

        <label className="block text-sm font-medium">
          URL prenotazione (QR)
          <input
            className="mt-1 w-full rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-[var(--bob-cream)]"
            value={settings.bookingUrl}
            onChange={(e) =>
              setSettings({ ...settings, bookingUrl: e.target.value })
            }
          />
        </label>

        <label className="block text-sm font-medium">
          Frase dopo check-in
          <input
            className="mt-1 w-full rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-[var(--bob-cream)]"
            value={settings.checkInSpeak}
            onChange={(e) =>
              setSettings({ ...settings, checkInSpeak: e.target.value })
            }
          />
        </label>

        <label className="block text-sm font-medium">
          Frase chiama operatore
          <input
            className="mt-1 w-full rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-[var(--bob-cream)]"
            value={settings.callOperatorSpeak}
            onChange={(e) =>
              setSettings({ ...settings, callOperatorSpeak: e.target.value })
            }
          />
        </label>

        <div className="grid grid-cols-3 gap-3">
          <label className="block text-sm font-medium">
            Inizio
            <input
              type="time"
              className="mt-1 w-full rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-[var(--bob-cream)]"
              value={settings.dayStart}
              onChange={(e) =>
                setSettings({ ...settings, dayStart: e.target.value })
              }
            />
          </label>
          <label className="block text-sm font-medium">
            Fine
            <input
              type="time"
              className="mt-1 w-full rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-[var(--bob-cream)]"
              value={settings.dayEnd}
              onChange={(e) =>
                setSettings({ ...settings, dayEnd: e.target.value })
              }
            />
          </label>
          <label className="block text-sm font-medium">
            Slot (min)
            <input
              type="number"
              min={5}
              max={120}
              className="mt-1 w-full rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-[var(--bob-cream)]"
              value={settings.slotMinutes}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  slotMinutes: Number(e.target.value),
                })
              }
            />
          </label>
        </div>

        <button
          type="submit"
          className="rounded-full bg-[var(--bob-black)] text-white px-6 py-2.5 font-medium"
        >
          Salva
        </button>
        {saved ? (
          <p className="text-sm text-[var(--bob-teal)]">Salvato.</p>
        ) : null}
      </form>
    </div>
  );
}
