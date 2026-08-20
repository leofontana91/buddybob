"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";

type Field = {
  id?: string;
  label: string;
  type: "text" | "textarea" | "yesno" | "number";
  required: boolean;
};

type Submission = {
  id: string;
  guestName?: string | null;
  answers: { label: string; value: string }[];
  createdAt: string;
};

const TYPE_LABEL: Record<Field["type"], string> = {
  text: "Testo breve",
  textarea: "Testo lungo",
  yesno: "Sì / No",
  number: "Numero",
};

export default function DocumentEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [fields, setFields] = useState<Field[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/forms/${params.id}`);
    if (res.status === 404) {
      router.replace("/admin/documents");
      return;
    }
    if (!res.ok) return;
    const data = await res.json();
    setName(data.name ?? "");
    setEnabled(!!data.enabled);
    setFields(
      (data.fields ?? []).map((f: Field) => ({
        label: f.label,
        type: f.type,
        required: f.required,
      }))
    );
    setSubmissions(data.submissions ?? []);
    setLoading(false);
  }, [params.id, router]);

  useEffect(() => {
    load();
  }, [load]);

  function addField() {
    setFields((prev) => [
      ...prev,
      { label: "", type: "text", required: true },
    ]);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    const res = await fetch(`/api/admin/forms/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        enabled,
        fields: fields.filter((f) => f.label.trim()),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error ?? "Salvataggio non riuscito");
      return;
    }
    setMsg("Salvato. Il modulo è visibile sul robot se è abilitato.");
    await load();
  }

  async function remove() {
    if (!confirm("Eliminare questo modulo e le compilazioni?")) return;
    await fetch(`/api/admin/forms/${params.id}`, { method: "DELETE" });
    router.replace("/admin/documents");
  }

  if (loading) {
    return <p className="text-[var(--bob-muted)]">Caricamento…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/documents" className="text-sm text-[var(--bob-muted)]">
          ← Tutti i moduli
        </Link>
        <h1 className="text-3xl font-bold tracking-tight mt-2">Modulo</h1>
      </div>

      {msg ? <p className="text-sm text-[var(--bob-teal)]">{msg}</p> : null}

      <form
        onSubmit={save}
        className="rounded-2xl bg-white border border-[var(--bob-line)] p-6 space-y-4"
      >
        <label className="text-sm block">
          Nome (come compare sul robot)
          <input
            required
            className="mt-1 w-full rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-[var(--bob-cream)]"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Visibile sul robot
        </label>

        <div className="flex items-center justify-between pt-2">
          <h2 className="font-semibold">Domande</h2>
          <button
            type="button"
            className="text-sm rounded-full border border-[var(--bob-line)] px-3 py-1.5"
            onClick={addField}
          >
            Aggiungi domanda
          </button>
        </div>

        <ul className="space-y-3">
          {fields.length === 0 ? (
            <li className="text-sm text-[var(--bob-muted)]">
              Nessuna domanda. Aggiungine almeno una.
            </li>
          ) : (
            fields.map((field, i) => (
              <li
                key={i}
                className="rounded-xl border border-[var(--bob-line)] p-3 grid md:grid-cols-12 gap-2 items-end"
              >
                <label className="text-sm md:col-span-6">
                  Testo domanda
                  <input
                    className="mt-1 w-full rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-[var(--bob-cream)]"
                    value={field.label}
                    onChange={(e) =>
                      setFields((prev) =>
                        prev.map((f, idx) =>
                          idx === i ? { ...f, label: e.target.value } : f
                        )
                      )
                    }
                  />
                </label>
                <label className="text-sm md:col-span-3">
                  Tipo
                  <select
                    className="mt-1 w-full rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-[var(--bob-cream)]"
                    value={field.type}
                    onChange={(e) =>
                      setFields((prev) =>
                        prev.map((f, idx) =>
                          idx === i
                            ? { ...f, type: e.target.value as Field["type"] }
                            : f
                        )
                      )
                    }
                  >
                    {(Object.keys(TYPE_LABEL) as Field["type"][]).map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm md:col-span-2 flex items-center gap-2 pb-2">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(e) =>
                      setFields((prev) =>
                        prev.map((f, idx) =>
                          idx === i ? { ...f, required: e.target.checked } : f
                        )
                      )
                    }
                  />
                  Obbligatoria
                </label>
                <button
                  type="button"
                  className="text-sm text-red-600 md:col-span-1 pb-2"
                  onClick={() =>
                    setFields((prev) => prev.filter((_, idx) => idx !== i))
                  }
                >
                  Rimuovi
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="flex flex-wrap gap-2">
          <button type="submit" className="bob-btn rounded-full px-5 py-2.5 font-medium">
            Salva modulo
          </button>
          <button
            type="button"
            className="rounded-full border border-[var(--bob-line)] px-5 py-2.5"
            onClick={remove}
          >
            Elimina
          </button>
        </div>
      </form>

      <section>
        <h2 className="font-semibold text-lg mb-3">Compilazioni</h2>
        <ul className="space-y-3">
          {submissions.length === 0 ? (
            <li className="text-[var(--bob-muted)]">Nessuna compilazione ancora.</li>
          ) : (
            submissions.map((s) => (
              <li
                key={s.id}
                className="rounded-2xl bg-white border border-[var(--bob-line)] px-4 py-3"
              >
                <p className="text-sm text-[var(--bob-muted)]">
                  {format(new Date(s.createdAt), "dd/MM/yyyy HH:mm")}
                  {s.guestName ? ` · ${s.guestName}` : ""}
                </p>
                <ul className="mt-2 text-sm space-y-1">
                  {s.answers.map((row, idx) => (
                    <li key={idx}>
                      <span className="text-[var(--bob-muted)]">{row.label}: </span>
                      {row.value}
                    </li>
                  ))}
                </ul>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
