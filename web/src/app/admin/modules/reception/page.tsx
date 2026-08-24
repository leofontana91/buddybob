"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRobot } from "@/components/AdminShell";

type Place = { name: string };

export default function ReceptionModulePage() {
  const { robotId } = useRobot();
  const [displayName, setDisplayName] = useState("");
  const [settingsPin, setSettingsPin] = useState("1234");
  const [callOperatorSpeak, setCallOperatorSpeak] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!robotId) return;
    (async () => {
      const [sRes, pRes] = await Promise.all([
        fetch(`/api/admin/settings?robotId=${robotId}`),
        fetch(`/api/admin/places?robotId=${robotId}`),
      ]);
      if (sRes.ok) {
        const data = await sRes.json();
        setDisplayName(data.displayName ?? "");
        setSettingsPin(data.settings?.settingsPin ?? "1234");
        setCallOperatorSpeak(data.settings?.callOperatorSpeak ?? "");
      }
      if (pRes.ok) {
        setPlaces((await pRes.json()).places ?? []);
      }
    })();
  }, [robotId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!robotId) return;
    setSaved(false);
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        robotId,
        displayName,
        settingsPin,
        callOperatorSpeak,
      }),
    });
    if (res.ok) setSaved(true);
  }

  if (!robotId) {
    return <p className="text-[var(--bob-muted)]">Nessun robot assegnato.</p>;
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Accoglienza</h1>
        <p className="text-[var(--bob-muted)] mt-1">
          Password delle impostazioni sul robot e frasi di accoglienza.
        </p>
      </div>
      <form
        onSubmit={onSubmit}
        className="rounded-2xl bg-white border border-[var(--bob-line)] p-6 space-y-4"
      >
        <label className="block text-sm font-medium">
          Nome robot
          <input
            className="mt-1 w-full rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-[var(--bob-cream)]"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium">
          Password impostazioni APK
          <input
            className="mt-1 w-full rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-[var(--bob-cream)]"
            value={settingsPin}
            onChange={(e) => setSettingsPin(e.target.value)}
            minLength={4}
            required
          />
        </label>
        <label className="block text-sm font-medium">
          Frase chiama operatore
          <input
            className="mt-1 w-full rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-[var(--bob-cream)]"
            value={callOperatorSpeak}
            onChange={(e) => setCallOperatorSpeak(e.target.value)}
          />
        </label>
        <p className="text-sm text-[var(--bob-muted)]">
          Il punto di accoglienza si sceglie sul robot (Impostazioni). Punti
          noti: {places.map((p) => p.name).join(", ") || "nessuno ancora"}.
        </p>
        <button type="submit" className="bob-btn rounded-full px-6 py-2.5 font-medium">
          Salva
        </button>
        {saved ? <p className="text-sm text-[var(--bob-teal)]">Salvato.</p> : null}
      </form>
    </div>
  );
}
