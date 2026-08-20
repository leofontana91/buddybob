"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRobot } from "@/components/AdminShell";

type FormRow = {
  id: string;
  name: string;
  enabled: boolean;
  fieldCount: number;
  submissionCount: number;
};

export default function DocumentsPage() {
  const { robotId } = useRobot();
  const [forms, setForms] = useState<FormRow[]>([]);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    if (!robotId) return;
    const res = await fetch(`/api/admin/forms?robotId=${robotId}`);
    if (!res.ok) return;
    const data = await res.json();
    setForms(data.forms ?? []);
  }, [robotId]);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    const res = await fetch("/api/admin/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ robotId, name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error ?? "Creazione non riuscita");
      return;
    }
    setName("");
    window.location.href = `/admin/documents/${data.id}`;
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
      <h1 className="text-3xl font-bold tracking-tight">Documenti</h1>
      <p className="text-[var(--bob-muted)] mt-1">
        Crea moduli con domande. Compariranno sul robot in Documenti, da far
        compilare al cliente.
      </p>

      <form
        onSubmit={create}
        className="mt-8 flex flex-wrap gap-3 items-end rounded-2xl bg-white border border-[var(--bob-line)] p-4"
      >
        <label className="text-sm grow min-w-[220px]">
          Nome modulo
          <input
            required
            className="mt-1 w-full rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-[var(--bob-cream)]"
            placeholder="es. Registrazione ospite"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button type="submit" className="bob-btn rounded-full px-5 py-2.5 font-medium">
          Crea modulo
        </button>
        {msg ? <p className="text-sm text-red-600 w-full">{msg}</p> : null}
      </form>

      <ul className="mt-6 space-y-3">
        {forms.length === 0 ? (
          <li className="text-[var(--bob-muted)]">Nessun modulo ancora.</li>
        ) : (
          forms.map((f) => (
            <li
              key={f.id}
              className="rounded-2xl bg-white border border-[var(--bob-line)] px-4 py-3 flex flex-wrap items-center justify-between gap-3"
            >
              <div>
                <p className="font-semibold text-lg">{f.name}</p>
                <p className="text-sm text-[var(--bob-muted)]">
                  {f.fieldCount} domande · {f.submissionCount} compilazioni
                  {f.enabled ? "" : " · nascosto sul robot"}
                </p>
              </div>
              <Link
                href={`/admin/documents/${f.id}`}
                className="bob-btn rounded-full px-4 py-2 text-sm"
              >
                Modifica
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
