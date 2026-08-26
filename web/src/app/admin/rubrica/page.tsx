"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { useRobot } from "@/components/AdminShell";
import { Button } from "@/components/bob/Button";
import {
  DataTable,
  DataTableCell,
  DataTableRow,
} from "@/components/bob/DataTable";
import { FilterPills } from "@/components/bob/FilterPills";

type UserRow = {
  id: string;
  name: string;
  email: string;
  appointmentCount: number;
};

type GuestRow = {
  id: string;
  guestName: string;
  guestPhone?: string | null;
  hostName?: string | null;
  typeName?: string | null;
  startsAt: string;
  status: string;
};

type FilterId = "all" | "hosts" | "guests";

export default function RubricaPage() {
  const { robotId } = useRobot();
  const [filter, setFilter] = useState<FilterId>("all");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (!res.ok) return;
    const data = await res.json();
    setUsers(data.users ?? []);
  }, []);

  const loadGuests = useCallback(async () => {
    if (!robotId) return;
    const date = format(new Date(), "yyyy-MM-dd");
    const res = await fetch(
      `/api/admin/appointments?robotId=${robotId}&date=${date}`
    );
    if (!res.ok) return;
    const data = await res.json();
    setGuests(data.appointments ?? []);
  }, [robotId]);

  useEffect(() => {
    loadUsers();
    loadGuests();
  }, [loadUsers, loadGuests]);

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
    await loadUsers();
  }

  async function remove(id: string) {
    if (!confirm("Eliminare questo referente?")) return;
    await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" });
    await loadUsers();
  }

  const rows = useMemo(() => {
    const hostRows = users.map((u) => ({
      key: `h-${u.id}`,
      kind: "Referente" as const,
      name: u.name,
      detail: u.email,
      meta: `${u.appointmentCount} appuntamenti`,
      action: (
        <button
          type="button"
          className="text-[13px] text-[var(--bob-warn-ink)]"
          onClick={() => remove(u.id)}
        >
          Elimina
        </button>
      ),
    }));
    const guestRows = guests.map((g) => ({
      key: `g-${g.id}`,
      kind: "Ospite" as const,
      name: g.guestName,
      detail: [g.guestPhone, g.hostName ? `con ${g.hostName}` : null]
        .filter(Boolean)
        .join(" · "),
      meta: `${format(parseISO(g.startsAt), "HH:mm")} · ${g.typeName || g.status}`,
      action: (
        <Link href="/admin/agenda" className="bob-link text-[13px]">
          Agenda
        </Link>
      ),
    }));
    if (filter === "hosts") return hostRows;
    if (filter === "guests") return guestRows;
    return [...hostRows, ...guestRows];
  }, [users, guests, filter]);

  return (
    <div className="space-y-6">
      <div>
        <p className="bob-eyebrow">Persone</p>
        <h1 className="bob-page-title mt-2">Rubrica</h1>
        <p className="bob-page-sub">
          Contatti esterni e referenti interni nello stesso elenco.
        </p>
      </div>

      <FilterPills
        value={filter}
        onChange={(id) => setFilter(id as FilterId)}
        items={[
          { id: "all", label: "Tutto", count: users.length + guests.length },
          { id: "hosts", label: "Referenti", count: users.length },
          { id: "guests", label: "Ospiti oggi", count: guests.length },
        ]}
      />

      <form
        onSubmit={create}
        className="grid gap-3 bob-card p-5 md:grid-cols-4"
      >
        <p className="md:col-span-4 bob-label">Nuovo referente interno</p>
        <input
          required
          placeholder="Nome"
          className="bob-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          required
          type="email"
          placeholder="Email"
          className="bob-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          required
          type="password"
          minLength={6}
          placeholder="Password"
          className="bob-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" className="w-full">
          Crea
        </Button>
        {error ? (
          <p className="text-sm text-[var(--bob-warn-ink)] md:col-span-4">
            {error}
          </p>
        ) : null}
      </form>

      <DataTable headers={["Tipo", "Nome", "Dettaglio", "Meta", ""]}>
        {rows.map((r) => (
          <DataTableRow key={r.key}>
            <DataTableCell>
              <span className="rounded-full bg-[var(--bob-cyan-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--bob-cyan-soft-ink)]">
                {r.kind}
              </span>
            </DataTableCell>
            <DataTableCell className="font-semibold">{r.name}</DataTableCell>
            <DataTableCell className="text-[var(--bob-muted)]">
              {r.detail || "—"}
            </DataTableCell>
            <DataTableCell className="text-[var(--bob-muted)]">
              {r.meta}
            </DataTableCell>
            <DataTableCell>{r.action}</DataTableCell>
          </DataTableRow>
        ))}
      </DataTable>
    </div>
  );
}
