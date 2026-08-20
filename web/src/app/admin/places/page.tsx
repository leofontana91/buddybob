"use client";

import { useCallback, useEffect, useState } from "react";
import { useRobot } from "@/components/AdminShell";

type Place = {
  id: string;
  name: string;
  label: string | null;
  x: number;
  y: number;
  speakOnDepart: string | null;
  speakWhileMoving: string | null;
  speakOnArrive: string | null;
  displayOnDepart: string | null;
  displayWhileMoving: string | null;
  displayOnArrive: string | null;
  waitSeconds: number;
};

export default function PlacesPage() {
  const { robotId } = useRobot();
  const [places, setPlaces] = useState<Place[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    if (!robotId) return;
    const res = await fetch(`/api/admin/places?robotId=${robotId}`);
    if (res.ok) {
      const data = await res.json();
      setPlaces(data.places ?? []);
    }
  }, [robotId]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(id: string, field: string, value: string | number) {
    setMsg("");
    const res = await fetch("/api/admin/places", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, [field]: value }),
    });
    if (res.ok) {
      setMsg("Salvato");
      await load();
      setTimeout(() => setMsg(""), 2000);
    } else {
      setMsg("Errore nel salvataggio");
    }
  }

  if (!robotId) {
    return (
      <p className="text-[var(--bob-muted)]">
        Nessun robot assegnato.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Punti mappa</h1>
        <p className="text-[var(--bob-muted)] mt-1">
          Configura cosa dice il robot e cosa mostra sul monitor per ogni punto.
          I punti vengono sincronizzati dal robot.
        </p>
      </div>

      {msg && <p className="text-sm text-[var(--bob-teal)]">{msg}</p>}

      {places.length === 0 ? (
        <p className="text-[var(--bob-muted)]">
          Nessun punto. Accendi il robot e vai nella sezione &quot;Vai a&quot; per sincronizzare i punti.
        </p>
      ) : (
        <div className="space-y-4">
          {places.map((p) => (
            <div
              key={p.id}
              className="rounded-2xl bg-white border border-[var(--bob-line)] p-5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{p.label || p.name}</h3>
                  <span className="text-sm text-[var(--bob-muted)]">
                    {p.name} · x={p.x.toFixed(1)} y={p.y.toFixed(1)}
                  </span>
                </div>
                <button
                  className="text-sm underline text-[var(--bob-navy)]"
                  onClick={() => setEditing(editing === p.id ? null : p.id)}
                >
                  {editing === p.id ? "Chiudi" : "Configura"}
                </button>
              </div>

              {editing === p.id && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field
                    label="Etichetta (visibile sul robot)"
                    value={p.label ?? ""}
                    placeholder={p.name}
                    onSave={(v) => save(p.id, "label", v)}
                  />
                  <Field
                    label="Sosta al punto (secondi)"
                    value={String(p.waitSeconds)}
                    placeholder="0"
                    type="number"
                    onSave={(v) => save(p.id, "waitSeconds", parseInt(v) || 0)}
                  />
                  <Field
                    label="Dice quando parte"
                    value={p.speakOnDepart ?? ""}
                    placeholder="Andiamo al tavolo 3"
                    onSave={(v) => save(p.id, "speakOnDepart", v)}
                  />
                  <Field
                    label="Dice mentre si muove"
                    value={p.speakWhileMoving ?? ""}
                    placeholder="Seguimi, ti accompagno"
                    onSave={(v) => save(p.id, "speakWhileMoving", v)}
                  />
                  <Field
                    label="Dice quando arriva"
                    value={p.speakOnArrive ?? ""}
                    placeholder="Siamo arrivati!"
                    onSave={(v) => save(p.id, "speakOnArrive", v)}
                  />
                  <Field
                    label="Monitor: mostra quando parte"
                    value={p.displayOnDepart ?? ""}
                    placeholder="Testo o URL immagine"
                    onSave={(v) => save(p.id, "displayOnDepart", v)}
                  />
                  <Field
                    label="Monitor: mostra mentre si muove"
                    value={p.displayWhileMoving ?? ""}
                    placeholder="Testo o URL immagine"
                    onSave={(v) => save(p.id, "displayWhileMoving", v)}
                  />
                  <Field
                    label="Monitor: mostra quando arriva"
                    value={p.displayOnArrive ?? ""}
                    placeholder="Testo o URL immagine"
                    onSave={(v) => save(p.id, "displayOnArrive", v)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  placeholder,
  type = "text",
  onSave,
}: {
  label: string;
  value: string;
  placeholder: string;
  type?: string;
  onSave: (v: string) => void;
}) {
  const [val, setVal] = useState(value);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setVal(value);
    setDirty(false);
  }, [value]);

  return (
    <label className="text-sm block">
      {label}
      <div className="flex gap-2 mt-1">
        <input
          type={type}
          className="flex-1 rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-[var(--bob-cream)]"
          placeholder={placeholder}
          value={val}
          onChange={(e) => {
            setVal(e.target.value);
            setDirty(true);
          }}
          onBlur={() => {
            if (dirty) {
              onSave(val);
              setDirty(false);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onSave(val);
              setDirty(false);
            }
          }}
        />
        {dirty && (
          <button
            type="button"
            className="bob-btn rounded-full px-3 py-1 text-xs"
            onClick={() => {
              onSave(val);
              setDirty(false);
            }}
          >
            Salva
          </button>
        )}
      </div>
    </label>
  );
}
