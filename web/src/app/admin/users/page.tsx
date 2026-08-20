"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type UserRow = {
  id: string;
  name: string;
  email: string;
  appointmentCount: number;
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (!res.ok) return;
    const data = await res.json();
    setUsers(data.users ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Creazione non riuscita");
      return;
    }
    setName("");
    setEmail("");
    setPassword("");
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Eliminare questo utente?")) return;
    await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Utenti</h1>
      <p className="text-[var(--bob-muted)] mt-1">
        Persone della tua organizzazione, ognuna con i propri appuntamenti
      </p>

      <form
        onSubmit={create}
        className="mt-8 grid md:grid-cols-4 gap-3 rounded-2xl bg-white border border-[var(--bob-line)] p-4"
      >
        <input
          required
          placeholder="Nome"
          className="rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-[var(--bob-cream)]"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          required
          type="email"
          placeholder="Email"
          className="rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-[var(--bob-cream)]"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          required
          type="password"
          minLength={6}
          placeholder="Password"
          className="rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-[var(--bob-cream)]"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          type="submit"
          className="rounded-full bg-[var(--bob-black)] text-white px-5 py-2 font-medium"
        >
          Crea utente
        </button>
        {error ? (
          <p className="text-sm text-red-600 md:col-span-4">{error}</p>
        ) : null}
      </form>

      <ul className="mt-6 space-y-3">
        {users.length === 0 ? (
          <li className="text-[var(--bob-muted)]">Nessun utente ancora.</li>
        ) : (
          users.map((u) => (
            <li
              key={u.id}
              className="rounded-2xl bg-white border border-[var(--bob-line)] px-4 py-3 flex justify-between gap-3"
            >
              <div>
                <p className="font-semibold">{u.name}</p>
                <p className="text-sm text-[var(--bob-muted)]">
                  {u.email} · {u.appointmentCount} appuntamenti
                </p>
              </div>
              <button
                className="text-sm rounded-full border border-[var(--bob-line)] px-3 py-1.5 self-start"
                onClick={() => remove(u.id)}
              >
                Elimina
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
