"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { useRobot } from "@/components/AdminShell";

type Place = { name: string };
type Command = {
  id: string;
  type: string;
  status: string;
  placeName?: string | null;
  text?: string | null;
  error?: string | null;
  createdAt: string;
};

export default function ActionsPage() {
  const { robotId } = useRobot();
  const [places, setPlaces] = useState<Place[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [placeName, setPlaceName] = useState("");
  const [customPlace, setCustomPlace] = useState("");
  const [speakText, setSpeakText] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    if (!robotId) return;
    const [pRes, cRes] = await Promise.all([
      fetch(`/api/admin/places?robotId=${robotId}`),
      fetch(`/api/admin/commands?robotId=${robotId}`),
    ]);
    if (pRes.ok) {
      const data = await pRes.json();
      setPlaces(data.places ?? []);
    }
    if (cRes.ok) {
      const data = await cRes.json();
      setCommands(data.commands ?? []);
    }
  }, [robotId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  async function send(body: Record<string, unknown>) {
    setMsg("");
    const res = await fetch("/api/admin/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ robotId, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error ?? "Invio non riuscito");
      return;
    }
    setMsg("Comando inviato. Il robot lo esegue in pochi secondi.");
    await load();
  }

  async function goTo(e: FormEvent) {
    e.preventDefault();
    const dest = (customPlace || placeName).trim();
    await send({ type: "goto", placeName: dest });
  }

  async function speak(e: FormEvent) {
    e.preventDefault();
    await send({ type: "speak", text: speakText.trim() });
    setSpeakText("");
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Azioni robot</h1>
        <p className="text-[var(--bob-muted)] mt-1">
          Fai andare BOB in un punto della mappa o fagli dire una frase. Il
          robot deve essere acceso e associato.
        </p>
      </div>

      {msg ? <p className="text-sm text-[var(--bob-teal)]">{msg}</p> : null}

      <form
        onSubmit={goTo}
        className="rounded-2xl bg-white border border-[var(--bob-line)] p-6 space-y-3"
      >
        <h2 className="font-semibold text-lg">Vai a…</h2>
        <p className="text-sm text-[var(--bob-muted)]">
          I punti arrivano dal robot (schermata Vai a… o in automatico). Se la
          lista è vuota, scrivi il nome esatto del punto sulla mappa.
        </p>
        <label className="text-sm block">
          Punto dalla mappa
          <select
            className="mt-1 w-full rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-[var(--bob-cream)]"
            value={placeName}
            onChange={(e) => {
              setPlaceName(e.target.value);
              setCustomPlace("");
            }}
          >
            <option value="">— scegli —</option>
            {places.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm block">
          Oppure nome libero
          <input
            className="mt-1 w-full rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-[var(--bob-cream)]"
            placeholder="es. reception"
            value={customPlace}
            onChange={(e) => setCustomPlace(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="bob-btn rounded-full px-5 py-2.5 font-medium">
            Invia vai a
          </button>
          <button
            type="button"
            className="rounded-full border border-[var(--bob-line)] px-5 py-2.5"
            onClick={() => send({ type: "stop" })}
          >
            Ferma
          </button>
        </div>
      </form>

      <form
        onSubmit={speak}
        className="rounded-2xl bg-white border border-[var(--bob-line)] p-6 space-y-3"
      >
        <h2 className="font-semibold text-lg">Fai dire</h2>
        <textarea
          required
          rows={3}
          className="w-full rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-[var(--bob-cream)]"
          placeholder="Ciao, benvenuto in ufficio."
          value={speakText}
          onChange={(e) => setSpeakText(e.target.value)}
        />
        <button type="submit" className="bob-btn rounded-full px-5 py-2.5 font-medium">
          Fai parlare BOB
        </button>
      </form>

      <section>
        <h2 className="font-semibold text-lg mb-3">Ultimi comandi</h2>
        <ul className="space-y-2">
          {commands.length === 0 ? (
            <li className="text-[var(--bob-muted)]">Nessun comando ancora.</li>
          ) : (
            commands.map((c) => (
              <li
                key={c.id}
                className="rounded-2xl bg-white border border-[var(--bob-line)] px-4 py-3 text-sm flex justify-between gap-3"
              >
                <span>
                  <strong>{labelType(c.type)}</strong>
                  {c.placeName ? ` · ${c.placeName}` : ""}
                  {c.text ? ` · “${c.text}”` : ""}
                  {c.error ? ` · ${c.error}` : ""}
                </span>
                <span className="text-[var(--bob-muted)] whitespace-nowrap">
                  {c.status} · {format(new Date(c.createdAt), "HH:mm:ss")}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

function labelType(type: string) {
  if (type === "goto") return "Vai a";
  if (type === "speak") return "Parla";
  if (type === "stop") return "Ferma";
  return type;
}
