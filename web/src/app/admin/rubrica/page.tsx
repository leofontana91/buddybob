"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRobot } from "@/components/AdminShell";
import { Button } from "@/components/bob/Button";
import {
  DataTable,
  DataTableCell,
  DataTableRow,
} from "@/components/bob/DataTable";

type Guest = {
  id: string;
  name: string;
  phone: string;
  email: string;
  company: string;
  notes: string;
  lastSeenAt: string | null;
};

type Fields = {
  phone: boolean;
  email: boolean;
  company: boolean;
  notes: boolean;
};

export default function RubricaPage() {
  const { robotId } = useRobot();
  const [enabled, setEnabled] = useState(true);
  const [fields, setFields] = useState<Fields>({
    phone: true,
    email: true,
    company: false,
    notes: true,
  });
  const [guests, setGuests] = useState<Guest[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const loadSettings = useCallback(async () => {
    if (!robotId) return;
    const res = await fetch(`/api/admin/settings?robotId=${robotId}`);
    if (!res.ok) return;
    const s = (await res.json()).settings ?? {};
    setEnabled(s.rubricaEnabled !== false);
    setFields({
      phone: s.rubricaCollectPhone !== false,
      email: s.rubricaCollectEmail !== false,
      company: !!s.rubricaCollectCompany,
      notes: s.rubricaCollectNotes !== false,
    });
  }, [robotId]);

  const loadGuests = useCallback(async () => {
    const res = await fetch("/api/admin/guests");
    if (!res.ok) return;
    setGuests((await res.json()).guests ?? []);
  }, []);

  useEffect(() => {
    loadSettings();
    loadGuests();
  }, [loadSettings, loadGuests]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setPhone("");
    setEmail("");
    setCompany("");
    setNotes("");
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    const res = await fetch("/api/admin/guests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingId ?? undefined,
        name,
        phone: fields.phone ? phone : "",
        email: fields.email ? email : "",
        company: fields.company ? company : "",
        notes: fields.notes ? notes : "",
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMsg(data.error ?? "Salvataggio non riuscito");
      return;
    }
    resetForm();
    loadGuests();
  }

  async function remove(id: string) {
    if (!confirm("Eliminare questo ospite?")) return;
    await fetch(`/api/admin/guests?id=${id}`, { method: "DELETE" });
    loadGuests();
  }

  function edit(g: Guest) {
    setEditingId(g.id);
    setName(g.name);
    setPhone(g.phone);
    setEmail(g.email);
    setCompany(g.company);
    setNotes(g.notes);
  }

  if (!enabled) {
    return (
      <div className="bob-card max-w-lg p-8">
        <p className="bob-eyebrow">Rubrica</p>
        <h1 className="bob-page-title mt-2 text-[28px]">Disattivata</h1>
        <p className="bob-page-sub">
          Attivala e scegli i campi da salvare in Impostazioni → Rubrica.
        </p>
        <ButtonLinkHref />
      </div>
    );
  }

  const headers = [
    "Nome",
    ...(fields.phone ? ["Telefono"] : []),
    ...(fields.email ? ["Email"] : []),
    ...(fields.company ? ["Azienda"] : []),
    ...(fields.notes ? ["Note"] : []),
    "",
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="bob-eyebrow">Ospiti</p>
          <h1 className="bob-page-title mt-2">Rubrica</h1>
          <p className="bob-page-sub">
            Anagrafica ospiti. I referenti interni si gestiscono in
            Impostazioni → Utenti.
          </p>
        </div>
        <Link href="/admin/impostazioni" className="bob-link text-sm">
          Configura campi
        </Link>
      </div>

      <form
        onSubmit={onSave}
        className="grid gap-3 bob-card p-5 sm:grid-cols-2"
      >
        <p className="bob-label sm:col-span-2">
          {editingId ? "Modifica ospite" : "Nuovo ospite"}
        </p>
        <input
          required
          className="bob-input sm:col-span-2"
          placeholder="Nome e cognome"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {fields.phone ? (
          <input
            className="bob-input"
            placeholder="Telefono"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        ) : null}
        {fields.email ? (
          <input
            type="email"
            className="bob-input"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        ) : null}
        {fields.company ? (
          <input
            className="bob-input sm:col-span-2"
            placeholder="Azienda / studio"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        ) : null}
        {fields.notes ? (
          <textarea
            className="bob-input sm:col-span-2 min-h-[80px]"
            placeholder="Note"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        ) : null}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit">{editingId ? "Aggiorna" : "Aggiungi"}</Button>
          {editingId ? (
            <Button type="button" variant="secondary" onClick={resetForm}>
              Annulla
            </Button>
          ) : null}
          {msg ? (
            <span className="text-sm text-[var(--bob-warn-ink)]">{msg}</span>
          ) : null}
        </div>
      </form>

      <DataTable headers={headers}>
        {guests.length === 0 ? (
          <DataTableRow>
            <DataTableCell className="text-[var(--bob-muted)]">
              Nessun ospite in rubrica.
            </DataTableCell>
          </DataTableRow>
        ) : (
          guests.map((g) => (
            <DataTableRow key={g.id}>
              <DataTableCell className="font-semibold">{g.name}</DataTableCell>
              {fields.phone ? (
                <DataTableCell className="text-[var(--bob-muted)]">
                  {g.phone || "—"}
                </DataTableCell>
              ) : null}
              {fields.email ? (
                <DataTableCell className="text-[var(--bob-muted)]">
                  {g.email || "—"}
                </DataTableCell>
              ) : null}
              {fields.company ? (
                <DataTableCell className="text-[var(--bob-muted)]">
                  {g.company || "—"}
                </DataTableCell>
              ) : null}
              {fields.notes ? (
                <DataTableCell className="text-[var(--bob-muted)] max-w-[200px] truncate">
                  {g.notes || "—"}
                </DataTableCell>
              ) : null}
              <DataTableCell>
                <div className="flex gap-3">
                  <button
                    type="button"
                    className="text-[13px] text-[var(--bob-cyan-dark)]"
                    onClick={() => edit(g)}
                  >
                    Modifica
                  </button>
                  <button
                    type="button"
                    className="text-[13px] text-[var(--bob-warn-ink)]"
                    onClick={() => remove(g.id)}
                  >
                    Elimina
                  </button>
                </div>
              </DataTableCell>
            </DataTableRow>
          ))
        )}
      </DataTable>
    </div>
  );
}

function ButtonLinkHref() {
  return (
    <Link href="/admin/impostazioni" className="bob-btn mt-6 inline-flex">
      Vai a Impostazioni
    </Link>
  );
}
