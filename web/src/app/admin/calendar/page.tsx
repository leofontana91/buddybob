"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { useRobot } from "@/components/AdminShell";

type Appt = {
  id: string;
  guestName: string;
  guestPhone?: string | null;
  hostUserId?: string | null;
  hostName?: string | null;
  typeId?: string | null;
  typeName?: string | null;
  typeColor?: string | null;
  durationMinutes: number;
  roomId?: string | null;
  roomName?: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
  notes?: string | null;
};

type UserOpt = { id: string; name: string };
type TypeOpt = {
  id: string;
  name: string;
  durationMinutes: number;
  color: string;
  roomIds: string[];
  active: boolean;
};
type RoomOpt = { id: string; name: string; active: boolean };

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Prenotato",
  checked_in: "Arrivato",
  in_progress: "In corso",
  completed: "Completato",
  cancelled: "Annullato",
  no_show: "Non presentato",
};

export default function CalendarPage() {
  const { robotId } = useRobot();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [items, setItems] = useState<Appt[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [types, setTypes] = useState<TypeOpt[]>([]);
  const [rooms, setRooms] = useState<RoomOpt[]>([]);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Appt | null>(null);

  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [hostUserId, setHostUserId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [time, setTime] = useState("10:00");
  const [force, setForce] = useState(false);

  const load = useCallback(async () => {
    if (!robotId) return;
    const res = await fetch(
      `/api/admin/appointments?robotId=${robotId}&date=${date}`
    );
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.appointments ?? []);
  }, [date, robotId]);

  const loadMeta = useCallback(async () => {
    const [u, t, r] = await Promise.all([
      fetch("/api/admin/users"),
      fetch("/api/admin/appointment-types"),
      fetch("/api/admin/rooms"),
    ]);
    if (u.ok) setUsers((await u.json()).users ?? []);
    if (t.ok) {
      const data = await t.json();
      setTypes((data.types ?? []).filter((x: TypeOpt) => x.active));
    }
    if (r.ok) {
      const data = await r.json();
      setRooms((data.rooms ?? []).filter((x: RoomOpt) => x.active));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  const selectedType = types.find((t) => t.id === typeId);
  const roomsForType = useMemo(() => {
    if (!selectedType || !selectedType.roomIds.length) return rooms;
    return rooms.filter((r) => selectedType.roomIds.includes(r.id));
  }, [rooms, selectedType]);

  const lanes = useMemo(() => {
    const map = new Map<string, { key: string; label: string; appts: Appt[] }>();
    map.set("__none__", { key: "__none__", label: "Senza referente", appts: [] });
    for (const u of users) {
      map.set(u.id, { key: u.id, label: u.name, appts: [] });
    }
    for (const a of items) {
      const key = a.hostUserId && map.has(a.hostUserId) ? a.hostUserId : "__none__";
      map.get(key)!.appts.push(a);
    }
    return [...map.values()].filter(
      (l) => l.key !== "__none__" || l.appts.length > 0 || users.length === 0
    );
  }, [items, users]);

  function resetForm() {
    setGuestName("");
    setGuestPhone("");
    setHostUserId("");
    setTypeId("");
    setRoomId("");
    setTime("10:00");
    setForce(false);
    setError("");
    setSuggestions([]);
    setEditing(null);
  }

  function openCreate(prefillHost?: string, prefillTime?: string) {
    resetForm();
    if (prefillHost) setHostUserId(prefillHost);
    if (prefillTime) setTime(prefillTime);
    setShowForm(true);
  }

  function openEdit(a: Appt) {
    setEditing(a);
    setGuestName(a.guestName);
    setGuestPhone(a.guestPhone ?? "");
    setHostUserId(a.hostUserId ?? "");
    setTypeId(a.typeId ?? "");
    setRoomId(a.roomId ?? "");
    setTime(format(parseISO(a.startsAt), "HH:mm"));
    setForce(false);
    setError("");
    setSuggestions([]);
    setShowForm(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!robotId) return;
    setError("");
    setSuggestions([]);
    const startsAt = new Date(`${date}T${time}:00`).toISOString();
    const body = {
      robotId,
      guestName,
      guestPhone: guestPhone || null,
      hostUserId: hostUserId || null,
      typeId: typeId || null,
      roomId: roomId || null,
      startsAt,
      force,
    };

    const res = await fetch("/api/admin/appointments", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing ? { id: editing.id, ...body } : body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Operazione non riuscita");
      setSuggestions(data.suggestions ?? []);
      return;
    }
    if (data.warning) setError(data.warning);
    setShowForm(false);
    resetForm();
    await load();
  }

  async function moveToSuggestion(iso: string) {
    setTime(format(parseISO(iso), "HH:mm"));
    setSuggestions([]);
    setError("");
  }

  async function setStatus(id: string, status: string) {
    await fetch("/api/admin/appointments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    await load();
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="bob-page-title">Calendario</h1>
          <p className="text-[var(--bob-muted)] mt-1">
            Vista giornaliera per referente. Gli utenti possono sovrapporsi; le
            sale no.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="bob-btn-secondary px-3 py-2 text-sm"
            onClick={() => setDate(format(addDays(parseISO(date), -1), "yyyy-MM-dd"))}
          >
            ←
          </button>
          <input
            type="date"
            className="bob-input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button
            type="button"
            className="bob-btn-secondary px-3 py-2 text-sm"
            onClick={() => setDate(format(addDays(parseISO(date), 1), "yyyy-MM-dd"))}
          >
            →
          </button>
          <button
            type="button"
            className="bob-btn px-4 py-2 text-sm"
            onClick={() => openCreate()}
          >
            Nuovo appuntamento
          </button>
        </div>
      </div>

      <p className="text-sm text-[var(--bob-muted)] capitalize">
        {format(parseISO(date), "EEEE d MMMM yyyy", { locale: it })}
      </p>

      <div className="space-y-4">
        {lanes.map((lane) => (
          <section key={lane.key} className="bob-card p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="font-semibold">{lane.label}</h2>
              <button
                type="button"
                className="text-sm text-[var(--bob-muted)] hover:underline"
                onClick={() =>
                  openCreate(lane.key === "__none__" ? "" : lane.key)
                }
              >
                + aggiungi
              </button>
            </div>
            {lane.appts.length === 0 ? (
              <p className="text-sm text-[var(--bob-muted)]">Nessun appuntamento</p>
            ) : (
              <ul className="space-y-2">
                {lane.appts.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--bob-line)] px-3 py-2.5"
                    style={{
                      borderLeftWidth: 4,
                      borderLeftColor: a.typeColor || "var(--bob-ink)",
                    }}
                  >
                    <div>
                      <p className="font-medium">
                        {format(parseISO(a.startsAt), "HH:mm")}–
                        {format(parseISO(a.endsAt), "HH:mm")} · {a.guestName}
                      </p>
                      <p className="text-sm text-[var(--bob-muted)]">
                        {a.typeName ?? "Senza tipo"}
                        {a.roomName ? ` · ${a.roomName}` : ""}
                        {" · "}
                        {STATUS_LABEL[a.status] ?? a.status}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="bob-btn-secondary px-3 py-1.5 text-sm"
                        onClick={() => openEdit(a)}
                      >
                        Modifica
                      </button>
                      {a.status === "scheduled" ? (
                        <button
                          type="button"
                          className="bob-btn-secondary px-3 py-1.5 text-sm"
                          onClick={() => setStatus(a.id, "cancelled")}
                        >
                          Annulla
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      {showForm ? (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={submit}
            className="w-full max-w-lg bob-card p-5 space-y-3 max-h-[90vh] overflow-y-auto"
          >
            <h3 className="font-semibold text-lg">
              {editing ? "Sposta / modifica" : "Nuovo appuntamento"}
            </h3>
            <label className="block text-sm">
              Ospite
              <input
                required
                className="mt-1 w-full bob-input"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Telefono
              <input
                className="mt-1 w-full bob-input"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Referente (utente azienda)
              <select
                className="mt-1 w-full bob-input"
                value={hostUserId}
                onChange={(e) => setHostUserId(e.target.value)}
              >
                <option value="">— nessuno —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Tipo visita
              <select
                className="mt-1 w-full bob-input"
                value={typeId}
                onChange={(e) => {
                  setTypeId(e.target.value);
                  setRoomId("");
                }}
              >
                <option value="">— senza tipo —</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.durationMinutes} min)
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Sala
              <select
                className="mt-1 w-full bob-input"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
              >
                <option value="">— nessuna —</option>
                {roomsForType.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Ora inizio
              <input
                type="time"
                required
                className="mt-1 bob-input"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </label>
            {selectedType ? (
              <p className="text-xs text-[var(--bob-muted)]">
                Durata riservata: {selectedType.durationMinutes} minuti
              </p>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
              />
              Forza anche se la sala è occupata
            </label>
            {error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : null}
            {suggestions.length > 0 ? (
              <div className="space-y-1">
                <p className="text-sm font-medium">Slot suggeriti</p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="bob-btn-secondary px-2.5 py-1 text-sm"
                      onClick={() => moveToSuggestion(s)}
                    >
                      {format(parseISO(s), "HH:mm")}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="bob-btn-secondary px-4 py-2"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
              >
                Chiudi
              </button>
              <button type="submit" className="bob-btn px-4 py-2">
                Salva
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
