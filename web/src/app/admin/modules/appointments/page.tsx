"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { useRobot } from "@/components/AdminShell";

type Appt = {
  id: string;
  guestName: string;
  userId?: string | null;
  startsAt: string;
  status: string;
};

type UserOpt = { id: string; name: string; email: string };

export default function AgendaPage() {
  const { robotId } = useRobot();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [items, setItems] = useState<Appt[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [userId, setUserId] = useState("");
  const [guestName, setGuestName] = useState("");
  const [time, setTime] = useState("10:00");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!robotId) return;
    const res = await fetch(
      `/api/admin/appointments?robotId=${robotId}&date=${date}`
    );
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.appointments ?? []);
  }, [date, robotId]);

  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (!res.ok) return;
    const data = await res.json();
    setUsers(data.users ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!robotId) return;
    setError("");
    const startsAt = new Date(`${date}T${time}:00`).toISOString();
    const res = await fetch("/api/admin/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        robotId,
        startsAt,
        userId: userId || undefined,
        guestName: userId ? undefined : guestName,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Creazione non riuscita");
      return;
    }
    setGuestName("");
    setUserId("");
    await load();
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
        Nessun robot assegnato. Chiedi al super admin di associarne uno.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Appuntamenti</h1>
          <p className="text-[var(--bob-muted)] mt-1">
            Agenda e sala d&apos;attesa per questo robot
          </p>
        </div>
        <label className="text-sm">
          Giorno
          <input
            type="date"
            className="ml-2 rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-white"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>

      <form
        onSubmit={create}
        className="mt-8 flex flex-wrap gap-3 items-end rounded-2xl bg-white border border-[var(--bob-line)] p-4"
      >
        <label className="text-sm grow min-w-[180px]">
          Utente piattaforma
          <select
            className="mt-1 w-full rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-[var(--bob-cream)]"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">— oppure nome libero —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        {!userId ? (
          <label className="text-sm grow min-w-[160px]">
            Nome ospite
            <input
              required={!userId}
              className="mt-1 w-full rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-[var(--bob-cream)]"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
            />
          </label>
        ) : null}
        <label className="text-sm">
          Ora
          <input
            type="time"
            required
            className="mt-1 block rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-[var(--bob-cream)]"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
        <button
          type="submit"
          className="rounded-full bg-[var(--bob-black)] text-white px-5 py-2.5 font-medium"
        >
          Aggiungi
        </button>
        {error ? (
          <p className="text-sm text-red-600 w-full">
            {typeof error === "string" ? error : "Errore"}
          </p>
        ) : null}
      </form>

      <ul className="mt-6 space-y-3">
        {items.length === 0 ? (
          <li className="text-[var(--bob-muted)]">Nessun appuntamento.</li>
        ) : (
          items.map((a) => (
            <li
              key={a.id}
              className="rounded-2xl bg-white border border-[var(--bob-line)] px-4 py-3 flex flex-wrap items-center justify-between gap-3"
            >
              <div>
                <p className="font-semibold text-lg">{a.guestName}</p>
                <p className="text-sm text-[var(--bob-muted)]">
                  {format(new Date(a.startsAt), "HH:mm")} · {a.status}
                  {a.userId ? " · utente piattaforma" : ""}
                </p>
              </div>
              <div className="flex gap-2">
                {a.status === "scheduled" ? (
                  <>
                    <button
                      className="rounded-full border border-[var(--bob-line)] px-3 py-1.5 text-sm"
                      onClick={() => setStatus(a.id, "checked_in")}
                    >
                      Check-in
                    </button>
                    <button
                      className="rounded-full border border-[var(--bob-line)] px-3 py-1.5 text-sm"
                      onClick={() => setStatus(a.id, "cancelled")}
                    >
                      Annulla
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          ))
        )}
      </ul>

      <BookingSettings robotId={robotId} />
    </div>
  );
}

function BookingSettings({ robotId }: { robotId: string }) {
  const [settings, setSettings] = useState<{
    bookingMode: string;
    bookingUrl: string;
    checkInSpeak: string;
    dayStart: string;
    dayEnd: string;
    slotMinutes: number;
  } | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/admin/settings?robotId=${robotId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.settings) setSettings(data.settings);
    })();
  }, [robotId]);

  if (!settings) return null;

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ robotId, ...settings }),
    });
    if (res.ok) setSaved(true);
  }

  return (
    <form
      onSubmit={save}
      className="mt-10 rounded-2xl bg-white border border-[var(--bob-line)] p-6 space-y-4 max-w-xl"
    >
      <h2 className="font-semibold text-lg">Impostazioni prenotazione</h2>
      <fieldset>
        <legend className="text-sm font-medium">Come si fissa l&apos;appuntamento</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          <label className="flex items-center gap-2 rounded-full border border-[var(--bob-line)] px-4 py-2">
            <input
              type="radio"
              checked={settings.bookingMode === "qr"}
              onChange={() => setSettings({ ...settings, bookingMode: "qr" })}
            />
            QR verso pagina web
          </label>
          <label className="flex items-center gap-2 rounded-full border border-[var(--bob-line)] px-4 py-2">
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
      <button type="submit" className="bob-btn rounded-full px-6 py-2.5 font-medium">
        Salva impostazioni
      </button>
      {saved ? <p className="text-sm text-[var(--bob-teal)]">Salvato.</p> : null}
    </form>
  );
}
