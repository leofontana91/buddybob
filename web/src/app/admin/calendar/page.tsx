"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
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

type ViewMode = "month" | "week" | "day";

const HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 07–19

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Prenotato",
  checked_in: "Arrivato",
  in_progress: "In corso",
  completed: "Completato",
  cancelled: "Annullato",
  no_show: "Non presentato",
};

function rangeFor(view: ViewMode, anchor: Date) {
  if (view === "month") {
    const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });
    return { start, end };
  }
  if (view === "week") {
    const start = startOfWeek(anchor, { weekStartsOn: 1 });
    const end = endOfWeek(anchor, { weekStartsOn: 1 });
    return { start, end };
  }
  return { start: anchor, end: anchor };
}

export default function CalendarPage() {
  const { robotId } = useRobot();
  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(() => new Date());
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
  const [formDate, setFormDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [time, setTime] = useState("10:00");
  const [force, setForce] = useState(false);

  const { start, end } = useMemo(() => rangeFor(view, anchor), [view, anchor]);

  const load = useCallback(async () => {
    if (!robotId) return;
    const from = format(start, "yyyy-MM-dd");
    const to = format(end, "yyyy-MM-dd");
    const res = await fetch(
      `/api/admin/appointments?robotId=${robotId}&from=${from}&to=${to}`
    );
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.appointments ?? []);
  }, [robotId, start, end]);

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

  const byDay = useMemo(() => {
    const map = new Map<string, Appt[]>();
    for (const a of items) {
      const key = format(parseISO(a.startsAt), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [items]);

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

  function openCreate(day?: Date, hour?: number) {
    resetForm();
    const d = day ?? anchor;
    setFormDate(format(d, "yyyy-MM-dd"));
    if (typeof hour === "number") {
      setTime(`${String(hour).padStart(2, "0")}:00`);
    }
    setShowForm(true);
  }

  function openEdit(a: Appt) {
    setEditing(a);
    setGuestName(a.guestName);
    setGuestPhone(a.guestPhone ?? "");
    setHostUserId(a.hostUserId ?? "");
    setTypeId(a.typeId ?? "");
    setRoomId(a.roomId ?? "");
    setFormDate(format(parseISO(a.startsAt), "yyyy-MM-dd"));
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
    const startsAt = new Date(`${formDate}T${time}:00`).toISOString();
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

  function shift(dir: -1 | 1) {
    if (view === "month") setAnchor((d) => addMonths(d, dir));
    else if (view === "week") setAnchor((d) => addDays(d, dir * 7));
    else setAnchor((d) => addDays(d, dir));
  }

  const title = useMemo(() => {
    if (view === "month") {
      return format(anchor, "MMMM yyyy", { locale: it });
    }
    if (view === "week") {
      return `${format(start, "d MMM", { locale: it })} – ${format(end, "d MMM yyyy", { locale: it })}`;
    }
    return format(anchor, "EEEE d MMMM yyyy", { locale: it });
  }, [view, anchor, start, end]);

  const monthDays = useMemo(
    () => eachDayOfInterval({ start, end }),
    [start, end]
  );
  const weekDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(anchor, { weekStartsOn: 1 }),
        end: endOfWeek(anchor, { weekStartsOn: 1 }),
      }),
    [anchor]
  );

  function EventChip({ a, compact }: { a: Appt; compact?: boolean }) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openEdit(a);
        }}
        className="w-full text-left rounded-md px-1.5 py-0.5 text-[11px] leading-tight truncate border border-black/5"
        style={{
          background: a.typeColor ? `${a.typeColor}22` : "#f4f4f5",
          borderLeft: `3px solid ${a.typeColor || "#111"}`,
        }}
        title={`${a.guestName} · ${a.roomName ?? ""} · ${STATUS_LABEL[a.status] ?? a.status}`}
      >
        {compact ? (
          <>
            {format(parseISO(a.startsAt), "HH:mm")} {a.guestName}
          </>
        ) : (
          <>
            <span className="font-semibold">
              {format(parseISO(a.startsAt), "HH:mm")}
            </span>{" "}
            {a.guestName}
            {a.roomName ? ` · ${a.roomName}` : ""}
          </>
        )}
      </button>
    );
  }

  if (!robotId) {
    return <p className="text-[var(--bob-muted)]">Nessun robot assegnato.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="bob-page-title">Calendario</h1>
          <p className="text-[var(--bob-muted)] mt-1 capitalize">{title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-[var(--bob-line)] overflow-hidden">
            {(["month", "week", "day"] as ViewMode[]).map((v) => (
              <button
                key={v}
                type="button"
                className={`px-3 py-2 text-sm ${
                  view === v
                    ? "bg-[var(--bob-ink)] text-white"
                    : "bg-white text-[var(--bob-ink)]"
                }`}
                onClick={() => setView(v)}
              >
                {v === "month" ? "Mese" : v === "week" ? "Settimana" : "Giorno"}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="bob-btn-secondary px-3 py-2 text-sm"
            onClick={() => shift(-1)}
          >
            ←
          </button>
          <button
            type="button"
            className="bob-btn-secondary px-3 py-2 text-sm"
            onClick={() => setAnchor(new Date())}
          >
            Oggi
          </button>
          <button
            type="button"
            className="bob-btn-secondary px-3 py-2 text-sm"
            onClick={() => shift(1)}
          >
            →
          </button>
          <button
            type="button"
            className="bob-btn px-4 py-2 text-sm"
            onClick={() => openCreate()}
          >
            Nuovo
          </button>
        </div>
      </div>

      {view === "month" ? (
        <div className="bob-card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-[var(--bob-line)] bg-[var(--bob-cream)]/40">
            {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((d) => (
              <div
                key={d}
                className="px-2 py-2 text-xs font-semibold text-[var(--bob-muted)] text-center"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthDays.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayItems = byDay.get(key) ?? [];
              const inMonth = isSameMonth(day, anchor);
              const today = isSameDay(day, new Date());
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setAnchor(day);
                    setView("day");
                  }}
                  onDoubleClick={() => openCreate(day)}
                  className={`min-h-[110px] border-b border-r border-[var(--bob-line)] p-1.5 text-left align-top ${
                    inMonth ? "bg-white" : "bg-zinc-50 text-zinc-400"
                  } ${today ? "ring-2 ring-inset ring-[var(--bob-ink)]" : ""}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-sm font-semibold ${
                        today ? "text-[var(--bob-ink)]" : ""
                      }`}
                    >
                      {format(day, "d")}
                    </span>
                    {dayItems.length > 0 ? (
                      <span className="text-[10px] text-[var(--bob-muted)]">
                        {dayItems.length}
                      </span>
                    ) : null}
                  </div>
                  <div className="space-y-0.5">
                    {dayItems.slice(0, 3).map((a) => (
                      <EventChip key={a.id} a={a} compact />
                    ))}
                    {dayItems.length > 3 ? (
                      <p className="text-[10px] text-[var(--bob-muted)] px-1">
                        +{dayItems.length - 3} altri
                      </p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {view === "week" || view === "day" ? (
        <div className="bob-card overflow-x-auto">
          <div
            className="min-w-[720px]"
            style={{
              display: "grid",
              gridTemplateColumns:
                view === "day"
                  ? "56px 1fr"
                  : `56px repeat(${weekDays.length}, minmax(0, 1fr))`,
            }}
          >
            <div className="border-b border-[var(--bob-line)]" />
            {(view === "day" ? [anchor] : weekDays).map((day) => (
              <div
                key={format(day, "yyyy-MM-dd")}
                className="border-b border-l border-[var(--bob-line)] px-2 py-2 text-center"
              >
                <p className="text-xs uppercase text-[var(--bob-muted)]">
                  {format(day, "EEE", { locale: it })}
                </p>
                <button
                  type="button"
                  className={`text-lg font-semibold ${
                    isSameDay(day, new Date())
                      ? "underline decoration-2"
                      : ""
                  }`}
                  onClick={() => {
                    setAnchor(day);
                    setView("day");
                  }}
                >
                  {format(day, "d")}
                </button>
              </div>
            ))}

            {HOURS.map((hour) => (
              <div key={`row-${hour}`} className="contents">
                <div className="border-b border-[var(--bob-line)] px-1 py-0 text-[11px] text-[var(--bob-muted)] h-16 flex items-start justify-end pt-1">
                  {String(hour).padStart(2, "0")}:00
                </div>
                {(view === "day" ? [anchor] : weekDays).map((day) => {
                  const key = format(day, "yyyy-MM-dd");
                  const cellItems = (byDay.get(key) ?? []).filter((a) => {
                    const h = parseISO(a.startsAt).getHours();
                    return h === hour;
                  });
                  return (
                    <div
                      key={`${key}-${hour}`}
                      className="relative border-b border-l border-[var(--bob-line)] h-16 p-0.5 hover:bg-zinc-50 cursor-pointer"
                      onClick={() => openCreate(day, hour)}
                    >
                      <div className="space-y-0.5 absolute inset-0.5 overflow-hidden">
                        {cellItems.map((a) => (
                          <EventChip key={a.id} a={a} compact={view === "week"} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {showForm ? (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={submit}
            className="w-full max-w-lg bob-card p-5 space-y-3 max-h-[90vh] overflow-y-auto"
          >
            <h3 className="font-semibold text-lg">
              {editing ? "Modifica appuntamento" : "Nuovo appuntamento"}
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
              Referente
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
            <div className="flex flex-wrap gap-3">
              <label className="text-sm">
                Data
                <input
                  type="date"
                  required
                  className="mt-1 block bob-input"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                />
              </label>
              <label className="text-sm">
                Ora
                <input
                  type="time"
                  required
                  className="mt-1 block bob-input"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
              />
              Forza anche se la sala è occupata
            </label>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {suggestions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="bob-btn-secondary px-2.5 py-1 text-sm"
                    onClick={() => {
                      setFormDate(format(parseISO(s), "yyyy-MM-dd"));
                      setTime(format(parseISO(s), "HH:mm"));
                      setSuggestions([]);
                      setError("");
                    }}
                  >
                    {format(parseISO(s), "d/M HH:mm")}
                  </button>
                ))}
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
