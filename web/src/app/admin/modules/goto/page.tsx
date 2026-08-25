"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRobot } from "@/components/AdminShell";
import { PlaceContentEditor } from "@/components/place-content/PlaceContentEditor";
import {
  emptyPlaceContent,
  isEmptyPlaceContent,
  PLACE_CONTENT_MODES,
  type PlaceContent,
  type PlaceContentMode,
} from "@/lib/placeContent";

type Place = {
  id: string;
  name: string;
  label: string | null;
  x: number;
  y: number;
  waitSeconds: number;
  groupId: string | null;
  content: PlaceContent;
};

type Group = {
  id: string;
  name: string;
  content: PlaceContent;
  placeIds: string[];
};

export default function PlacesPage() {
  const { robotId } = useRobot();
  const [mode, setMode] = useState<PlaceContentMode>("per_place");
  const [shared, setShared] = useState<PlaceContent>(emptyPlaceContent());
  const [groups, setGroups] = useState<Group[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!robotId) return;
    const res = await fetch(`/api/admin/places?robotId=${robotId}`);
    if (!res.ok) return;
    const data = await res.json();
    setMode(data.mode ?? "per_place");
    setShared(data.shared ?? emptyPlaceContent());
    setGroups(data.groups ?? []);
    setPlaces(data.places ?? []);
  }, [robotId]);

  useEffect(() => {
    load();
  }, [load]);

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(""), 2500);
  }

  async function setContentMode(next: PlaceContentMode) {
    if (!robotId) return;
    if (next === "shared" && isEmptyPlaceContent(shared)) {
      const filled = places.find((p) => !isEmptyPlaceContent(p.content));
      if (filled) setShared(filled.content);
    }
    setMode(next);
    const res = await fetch("/api/admin/place-content", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ robotId, mode: next }),
    });
    if (res.ok) flash("Modalità salvata");
  }

  async function saveShared(e: FormEvent) {
    e.preventDefault();
    if (!robotId) return;
    const res = await fetch("/api/admin/place-content", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ robotId, shared }),
    });
    if (res.ok) flash("Contenuto salvato per tutti i punti");
    else flash("Salvataggio non riuscito");
  }

  async function createGroup(e: FormEvent) {
    e.preventDefault();
    if (!robotId || !newGroup.trim()) return;
    const res = await fetch("/api/admin/place-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ robotId, name: newGroup.trim() }),
    });
    if (res.ok) {
      setNewGroup("");
      await load();
      flash("Gruppo creato");
    }
  }

  async function saveGroup(group: Group, silent = false) {
    const res = await fetch("/api/admin/place-groups", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: group.id,
        name: group.name,
        content: group.content,
        placeIds: group.placeIds,
      }),
    });
    if (res.ok) {
      await load();
      if (!silent) flash("Gruppo salvato");
    } else if (!silent) flash("Salvataggio gruppo non riuscito");
  }

  async function deleteGroup(id: string) {
    await fetch(`/api/admin/place-groups?id=${id}`, { method: "DELETE" });
    await load();
  }

  async function savePlace(place: Place) {
    const res = await fetch("/api/admin/places", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: place.id,
        label: place.label ?? "",
        waitSeconds: place.waitSeconds,
        content: place.content,
      }),
    });
    if (res.ok) flash("Punto salvato");
    else flash("Salvataggio non riuscito");
  }

  function updatePlace(id: string, patch: Partial<Place>) {
    setPlaces((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function updateGroup(id: string, patch: Partial<Group>) {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }

  if (!robotId) {
    return (
      <p className="text-[var(--bob-muted)]">Nessun robot assegnato.</p>
    );
  }

  const modeMeta = PLACE_CONTENT_MODES.find((m) => m.id === mode);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="bob-page-title">Vai a…</h1>
        <p className="bob-page-sub">
          Punti mappa, frasi e cosa mostra il monitor in partenza e all&apos;arrivo.
        </p>
      </div>

      {msg ? <p className="text-sm text-[var(--bob-teal)]">{msg}</p> : null}

      <section className="space-y-3">
        <h2 className="font-semibold text-lg">Come vuoi configurare i contenuti</h2>
        <div className="flex flex-wrap gap-2">
          {PLACE_CONTENT_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                mode === m.id
                  ? "bob-btn"
                  : "border border-[var(--bob-line)] bg-white"
              }`}
              onClick={() => setContentMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        {modeMeta ? (
          <p className="text-sm text-[var(--bob-muted)]">{modeMeta.hint}</p>
        ) : null}
      </section>

      {mode === "shared" ? (
        <form onSubmit={saveShared} className="space-y-4">
          <PlaceContentEditor
            robotId={robotId}
            value={shared}
            onChange={setShared}
          />
          <button type="submit" className="bob-btn px-5 py-2.5 font-medium">
            Salva per tutti i punti
          </button>
        </form>
      ) : null}

      {mode === "groups" ? (
        <div className="space-y-6">
          <form onSubmit={createGroup} className="flex gap-2 max-w-lg">
            <input
              className="flex-1 rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-white"
              placeholder="Nome gruppo, es. Sale riunioni"
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
            />
            <button type="submit" className="bob-btn px-4 py-2 font-medium">
              Crea gruppo
            </button>
          </form>
          {groups.length === 0 ? (
            <p className="text-[var(--bob-muted)]">
              Nessun gruppo. Creane uno e spunta i punti che devono condividere
              le stesse frasi e gli stessi file.
            </p>
          ) : (
            groups.map((g) => (
              <div
                key={g.id}
                className="bob-card p-5 space-y-4"
              >
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <input
                    className="text-lg font-semibold rounded-xl border border-[var(--bob-line)] px-3 py-1.5 bg-[var(--bob-cream)]"
                    value={g.name}
                    onChange={(e) => updateGroup(g.id, { name: e.target.value })}
                  />
                  <button
                    type="button"
                    className="text-sm underline"
                    onClick={() => deleteGroup(g.id)}
                  >
                    Elimina gruppo
                  </button>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Punti in questo gruppo</p>
                  <div className="flex flex-wrap gap-2">
                    {places.map((p) => {
                      const checked = g.placeIds.includes(p.id);
                      const other = placesGroupName(groups, p.id, g.id);
                      return (
                        <label
                          key={p.id}
                          className={`rounded-full border px-3 py-1.5 text-sm ${
                            checked
                              ? "border-[var(--bob-navy)] bg-[var(--bob-cream)]"
                              : "border-[var(--bob-line)]"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mr-2"
                            checked={checked}
                            onChange={(e) => {
                              setGroups((prev) => {
                                const cur = prev.find((x) => x.id === g.id);
                                if (!cur) return prev;
                                const nextIds = e.target.checked
                                  ? Array.from(new Set([...cur.placeIds, p.id]))
                                  : cur.placeIds.filter((id) => id !== p.id);
                                const next = { ...cur, placeIds: nextIds };
                                void saveGroup(next, true);
                                return prev.map((x) =>
                                  x.id === g.id ? next : x
                                );
                              });
                            }}
                          />
                          {p.label || p.name}
                          {other ? (
                            <span className="text-[var(--bob-muted)]"> · da {other}</span>
                          ) : null}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <PlaceContentEditor
                  robotId={robotId}
                  value={g.content}
                  onChange={(content) => updateGroup(g.id, { content })}
                />
                <button
                  type="button"
                  className="bob-btn px-5 py-2 font-medium"
                  onClick={() => saveGroup(g)}
                >
                  Salva gruppo
                </button>
              </div>
            ))
          )}
        </div>
      ) : null}

      <section className="space-y-4">
        <h2 className="font-semibold text-lg">Punti mappa</h2>
        {places.length === 0 ? (
          <p className="text-[var(--bob-muted)]">
            Nessun punto. Accendi il robot e apri &quot;Vai a&quot; per sincronizzarli.
          </p>
        ) : (
          places.map((p) => (
            <div
              key={p.id}
              className="bob-card p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-lg">{p.label || p.name}</h3>
                  <span className="text-sm text-[var(--bob-muted)]">
                    {p.name}
                    {p.groupId
                      ? ` · ${groups.find((g) => g.id === p.groupId)?.name ?? "gruppo"}`
                      : ""}
                  </span>
                </div>
                <button
                  type="button"
                  className="text-sm underline text-[var(--bob-navy)]"
                  onClick={() => setEditing(editing === p.id ? null : p.id)}
                >
                  {editing === p.id ? "Chiudi" : mode === "per_place" ? "Configura" : "Dettagli"}
                </button>
              </div>
              {editing === p.id ? (
                <div className="mt-4 space-y-4">
                  <div className="grid md:grid-cols-2 gap-3">
                    <label className="text-sm block">
                      Etichetta
                      <input
                        className="mt-1 w-full bob-input"
                        value={p.label ?? ""}
                        placeholder={p.name}
                        onChange={(e) =>
                          updatePlace(p.id, { label: e.target.value })
                        }
                      />
                    </label>
                    <label className="text-sm block">
                      Sosta al punto (secondi)
                      <input
                        type="number"
                        min={0}
                        className="mt-1 w-full bob-input"
                        value={p.waitSeconds}
                        onChange={(e) =>
                          updatePlace(p.id, {
                            waitSeconds: parseInt(e.target.value, 10) || 0,
                          })
                        }
                      />
                    </label>
                  </div>
                  {mode === "per_place" ? (
                    <PlaceContentEditor
                      robotId={robotId}
                      value={p.content}
                      onChange={(content) => updatePlace(p.id, { content })}
                    />
                  ) : (
                    <p className="text-sm text-[var(--bob-muted)]">
                      Frasi e file si impostano{" "}
                      {mode === "shared"
                        ? "una volta sola sopra, per tutti i punti."
                        : "nel gruppo a cui appartiene questo punto."}
                    </p>
                  )}
                  <button
                    type="button"
                    className="bob-btn px-5 py-2 font-medium"
                    disabled={loading}
                    onClick={async () => {
                      setLoading(true);
                      await savePlace(p);
                      setLoading(false);
                    }}
                  >
                    Salva punto
                  </button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function placesGroupName(groups: Group[], placeId: string, currentId: string) {
  const other = groups.find(
    (g) => g.id !== currentId && g.placeIds.includes(placeId)
  );
  return other?.name ?? null;
}
