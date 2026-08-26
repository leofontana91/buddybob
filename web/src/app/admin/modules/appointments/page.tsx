"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRobot } from "@/components/AdminShell";

type TypeRow = {
  id: string;
  name: string;
  durationMinutes: number;
  color: string;
  active: boolean;
  roomIds: string[];
};

type RoomRow = {
  id: string;
  name: string;
  mapPlaceName: string | null;
  dayStart: string | null;
  dayEnd: string | null;
  weekdays: string | null;
  active: boolean;
};

type PlaceOpt = { name: string; label?: string | null };

const WEEKDAY_OPTS = [
  { id: 1, label: "Lun" },
  { id: 2, label: "Mar" },
  { id: 3, label: "Mer" },
  { id: 4, label: "Gio" },
  { id: 5, label: "Ven" },
  { id: 6, label: "Sab" },
  { id: 7, label: "Dom" },
];

function parseWeekdays(raw: string | null | undefined): number[] {
  if (!raw) return [1, 2, 3, 4, 5];
  return raw
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => n >= 1 && n <= 7);
}

function WeekdayPicker({
  value,
  onChange,
}: {
  value: number[];
  onChange: (v: number[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {WEEKDAY_OPTS.map((d) => {
        const on = value.includes(d.id);
        return (
          <button
            key={d.id}
            type="button"
            className={`px-3 py-1.5 text-sm rounded-lg border ${
              on
                ? "border-[var(--bob-ink)] bg-[var(--bob-cream)] font-medium"
                : "border-[var(--bob-line)] opacity-60"
            }`}
            onClick={() =>
              onChange(
                on ? value.filter((x) => x !== d.id) : [...value, d.id].sort()
              )
            }
          >
            {d.label}
          </button>
        );
      })}
    </div>
  );
}

export default function AppointmentsSettingsPage() {
  const { robotId } = useRobot();
  const [types, setTypes] = useState<TypeRow[]>([]);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [places, setPlaces] = useState<PlaceOpt[]>([]);
  const [msg, setMsg] = useState("");

  const [typeName, setTypeName] = useState("");
  const [typeDuration, setTypeDuration] = useState(30);
  const [typeColor, setTypeColor] = useState("#1a1a1a");
  const [typeRooms, setTypeRooms] = useState<string[]>([]);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);

  const [roomName, setRoomName] = useState("");
  const [roomPlace, setRoomPlace] = useState("");
  const [roomCustomHours, setRoomCustomHours] = useState(false);
  const [roomDayStart, setRoomDayStart] = useState("09:00");
  const [roomDayEnd, setRoomDayEnd] = useState("18:00");
  const [roomWeekdays, setRoomWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);

  const [settings, setSettings] = useState<{
    bookingMode: string;
    bookingUrl: string;
    checkInSpeak: string;
    dayStart: string;
    dayEnd: string;
    slotMinutes: number;
    bookableWeekdays?: string;
  } | null>(null);
  const [globalWeekdays, setGlobalWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);

  const load = useCallback(async () => {
    const [t, r] = await Promise.all([
      fetch("/api/admin/appointment-types"),
      fetch("/api/admin/rooms"),
    ]);
    if (t.ok) setTypes((await t.json()).types ?? []);
    if (r.ok) setRooms((await r.json()).rooms ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!robotId) return;
    (async () => {
      const [s, p] = await Promise.all([
        fetch(`/api/admin/settings?robotId=${robotId}`),
        fetch(`/api/admin/places?robotId=${robotId}`),
      ]);
      if (s.ok) {
        const data = await s.json();
        if (data.settings) {
          setSettings(data.settings);
          setGlobalWeekdays(parseWeekdays(data.settings.bookableWeekdays));
        }
      }
      if (p.ok) {
        const data = await p.json();
        setPlaces(data.places ?? []);
      }
    })();
  }, [robotId]);

  async function saveType(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    const res = await fetch("/api/admin/appointment-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingTypeId || undefined,
        name: typeName,
        durationMinutes: typeDuration,
        color: typeColor,
        roomIds: typeRooms,
      }),
    });
    if (!res.ok) {
      setMsg("Salvataggio tipo non riuscito");
      return;
    }
    setTypeName("");
    setTypeDuration(30);
    setTypeColor("#1a1a1a");
    setTypeRooms([]);
    setEditingTypeId(null);
    setMsg("Tipo salvato");
    await load();
  }

  async function saveRoom(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    const res = await fetch("/api/admin/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingRoomId || undefined,
        name: roomName,
        mapPlaceName: roomPlace || null,
        customHours: roomCustomHours,
        dayStart: roomDayStart,
        dayEnd: roomDayEnd,
        weekdays: roomWeekdays.join(","),
      }),
    });
    if (!res.ok) {
      setMsg("Salvataggio sala non riuscito");
      return;
    }
    setRoomName("");
    setRoomPlace("");
    setRoomCustomHours(false);
    setRoomDayStart("09:00");
    setRoomDayEnd("18:00");
    setRoomWeekdays([1, 2, 3, 4, 5]);
    setEditingRoomId(null);
    setMsg("Sala salvata");
    await load();
  }

  async function saveBooking(e: FormEvent) {
    e.preventDefault();
    if (!robotId || !settings) return;
    setMsg("");
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        robotId,
        ...settings,
        bookableWeekdays: globalWeekdays.join(",") || "1,2,3,4,5",
      }),
    });
    setMsg(res.ok ? "Orari e prenotazione aggiornati" : "Errore salvataggio");
  }

  function editType(t: TypeRow) {
    setEditingTypeId(t.id);
    setTypeName(t.name);
    setTypeDuration(t.durationMinutes);
    setTypeColor(t.color);
    setTypeRooms(t.roomIds);
  }

  function editRoom(r: RoomRow) {
    setEditingRoomId(r.id);
    setRoomName(r.name);
    setRoomPlace(r.mapPlaceName ?? "");
    const custom = !!(r.dayStart || r.dayEnd || r.weekdays);
    setRoomCustomHours(custom);
    setRoomDayStart(r.dayStart || "09:00");
    setRoomDayEnd(r.dayEnd || "18:00");
    setRoomWeekdays(parseWeekdays(r.weekdays));
  }

  function toggleTypeRoom(id: string) {
    setTypeRooms((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    <div className="space-y-10 max-w-3xl">
      <div>
        <h1 className="bob-page-title">Impostazioni appuntamenti</h1>
        <p className="text-[var(--bob-muted)] mt-1">
          Orari prenotabili, tipi di visita e sale. Operatività in{" "}
          <Link href="/admin/calendar" className="underline">
            Calendario
          </Link>{" "}
          e{" "}
          <Link href="/admin/guests" className="underline">
            Gestione clienti
          </Link>
          .
        </p>
        {msg ? (
          <p className="text-sm mt-2 text-[var(--bob-muted)]">{msg}</p>
        ) : null}
      </div>

      {settings && robotId ? (
        <form onSubmit={saveBooking} className="bob-card p-6 space-y-4">
          <h2 className="font-semibold text-lg">Orari prenotabili (globali)</h2>
          <p className="text-sm text-[var(--bob-muted)]">
            Valgono per tutte le sale, salvo override sulla singola sala.
          </p>
          <div className="flex flex-wrap gap-3">
            <label className="text-sm">
              Dalle
              <input
                type="time"
                className="mt-1 block bob-input"
                value={settings.dayStart}
                onChange={(e) =>
                  setSettings({ ...settings, dayStart: e.target.value })
                }
              />
            </label>
            <label className="text-sm">
              Alle
              <input
                type="time"
                className="mt-1 block bob-input"
                value={settings.dayEnd}
                onChange={(e) =>
                  setSettings({ ...settings, dayEnd: e.target.value })
                }
              />
            </label>
            <label className="text-sm">
              Griglia (min)
              <input
                type="number"
                min={5}
                className="mt-1 block bob-input w-24"
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
          <div>
            <p className="text-sm font-medium">Giorni aperti</p>
            <WeekdayPicker value={globalWeekdays} onChange={setGlobalWeekdays} />
          </div>

          <hr className="border-[var(--bob-line)]" />

          <h3 className="font-medium">Prenotazione pubblica / robot</h3>
          <fieldset>
            <legend className="text-sm font-medium">Come si fissa</legend>
            <div className="mt-2 flex flex-wrap gap-3">
              <label className="flex items-center gap-2 bob-btn-secondary px-4 py-2">
                <input
                  type="radio"
                  checked={settings.bookingMode === "qr"}
                  onChange={() =>
                    setSettings({ ...settings, bookingMode: "qr" })
                  }
                />
                QR verso pagina web
              </label>
              <label className="flex items-center gap-2 bob-btn-secondary px-4 py-2">
                <input
                  type="radio"
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
            URL prenotazione
            <input
              className="mt-1 w-full bob-input"
              value={settings.bookingUrl}
              onChange={(e) =>
                setSettings({ ...settings, bookingUrl: e.target.value })
              }
            />
          </label>
          <label className="block text-sm font-medium">
            Frase dopo check-in
            <input
              className="mt-1 w-full bob-input"
              value={settings.checkInSpeak}
              onChange={(e) =>
                setSettings({ ...settings, checkInSpeak: e.target.value })
              }
            />
          </label>
          <button type="submit" className="bob-btn px-5 py-2.5">
            Salva orari e prenotazione
          </button>
        </form>
      ) : null}

      <section className="space-y-4">
        <h2 className="font-semibold text-lg">Sale</h2>
        <form onSubmit={saveRoom} className="bob-card p-4 space-y-3">
          <label className="block text-sm">
            Nome sala
            <input
              required
              className="mt-1 w-full bob-input"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Punto mappa robot (per accompagnare)
            <select
              className="mt-1 w-full bob-input"
              value={roomPlace}
              onChange={(e) => setRoomPlace(e.target.value)}
            >
              <option value="">— nessuno —</option>
              {places.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.label || p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={roomCustomHours}
              onChange={(e) => setRoomCustomHours(e.target.checked)}
            />
            Orari diversi da quelli globali
          </label>
          {roomCustomHours ? (
            <div className="space-y-3 pl-1 border-l-2 border-[var(--bob-line)] ml-1">
              <div className="flex flex-wrap gap-3">
                <label className="text-sm">
                  Dalle
                  <input
                    type="time"
                    className="mt-1 block bob-input"
                    value={roomDayStart}
                    onChange={(e) => setRoomDayStart(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Alle
                  <input
                    type="time"
                    className="mt-1 block bob-input"
                    value={roomDayEnd}
                    onChange={(e) => setRoomDayEnd(e.target.value)}
                  />
                </label>
              </div>
              <div>
                <p className="text-sm font-medium">Giorni aperti per questa sala</p>
                <WeekdayPicker
                  value={roomWeekdays}
                  onChange={setRoomWeekdays}
                />
              </div>
            </div>
          ) : null}
          <div className="flex gap-2">
            <button type="submit" className="bob-btn px-4 py-2 text-sm">
              {editingRoomId ? "Aggiorna sala" : "Aggiungi sala"}
            </button>
            {editingRoomId ? (
              <button
                type="button"
                className="bob-btn-secondary px-4 py-2 text-sm"
                onClick={() => {
                  setEditingRoomId(null);
                  setRoomName("");
                  setRoomPlace("");
                  setRoomCustomHours(false);
                }}
              >
                Annulla
              </button>
            ) : null}
          </div>
        </form>
        <ul className="space-y-2">
          {rooms.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 bob-card px-4 py-3"
            >
              <div>
                <p className="font-medium">{r.name}</p>
                <p className="text-sm text-[var(--bob-muted)]">
                  {r.mapPlaceName
                    ? `Mappa: ${r.mapPlaceName}`
                    : "Nessun punto mappa"}
                  {r.dayStart
                    ? ` · ${r.dayStart}–${r.dayEnd}`
                    : " · orari globali"}
                  {!r.active ? " · disattivata" : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="bob-btn-secondary px-3 py-1.5 text-sm"
                  onClick={() => editRoom(r)}
                >
                  Modifica
                </button>
                <button
                  type="button"
                  className="bob-btn-secondary px-3 py-1.5 text-sm"
                  onClick={async () => {
                    await fetch("/api/admin/rooms", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: r.id, active: !r.active }),
                    });
                    await load();
                  }}
                >
                  {r.active ? "Disattiva" : "Attiva"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold text-lg">Tipi di visita</h2>
        <form onSubmit={saveType} className="bob-card p-4 space-y-3">
          <label className="block text-sm">
            Nome
            <input
              required
              className="mt-1 w-full bob-input"
              value={typeName}
              onChange={(e) => setTypeName(e.target.value)}
              placeholder="es. Colloquio, Visita commerciale"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="text-sm">
              Durata (min)
              <input
                type="number"
                min={5}
                max={480}
                required
                className="mt-1 block bob-input w-28"
                value={typeDuration}
                onChange={(e) => setTypeDuration(Number(e.target.value))}
              />
            </label>
            <label className="text-sm">
              Colore
              <input
                type="color"
                className="mt-1 block h-10 w-16 bob-input p-1"
                value={typeColor}
                onChange={(e) => setTypeColor(e.target.value)}
              />
            </label>
          </div>
          <fieldset>
            <legend className="text-sm font-medium">
              Sale ammesse (vuoto = tutte)
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {rooms
                .filter((r) => r.active)
                .map((r) => (
                  <label
                    key={r.id}
                    className="flex items-center gap-2 bob-btn-secondary px-3 py-1.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={typeRooms.includes(r.id)}
                      onChange={() => toggleTypeRoom(r.id)}
                    />
                    {r.name}
                  </label>
                ))}
            </div>
          </fieldset>
          <div className="flex gap-2">
            <button type="submit" className="bob-btn px-4 py-2 text-sm">
              {editingTypeId ? "Aggiorna tipo" : "Aggiungi tipo"}
            </button>
            {editingTypeId ? (
              <button
                type="button"
                className="bob-btn-secondary px-4 py-2 text-sm"
                onClick={() => {
                  setEditingTypeId(null);
                  setTypeName("");
                  setTypeDuration(30);
                  setTypeColor("#1a1a1a");
                  setTypeRooms([]);
                }}
              >
                Annulla
              </button>
            ) : null}
          </div>
        </form>
        <ul className="space-y-2">
          {types.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 bob-card px-4 py-3"
              style={{ borderLeft: `4px solid ${t.color}` }}
            >
              <div>
                <p className="font-medium">{t.name}</p>
                <p className="text-sm text-[var(--bob-muted)]">
                  {t.durationMinutes} min
                  {t.roomIds.length
                    ? ` · ${t.roomIds.length} sale collegate`
                    : " · tutte le sale"}
                  {!t.active ? " · disattivato" : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="bob-btn-secondary px-3 py-1.5 text-sm"
                  onClick={() => editType(t)}
                >
                  Modifica
                </button>
                <button
                  type="button"
                  className="bob-btn-secondary px-3 py-1.5 text-sm"
                  onClick={async () => {
                    await fetch("/api/admin/appointment-types", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: t.id, active: !t.active }),
                    });
                    await load();
                  }}
                >
                  {t.active ? "Disattiva" : "Attiva"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
