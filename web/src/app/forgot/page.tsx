"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Richiesta non riuscita");
      return;
    }
    setDone(true);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-2xl bg-white border border-[var(--bob-line)] p-8 shadow-sm"
      >
        <p className="text-xs tracking-[0.2em] uppercase text-[var(--bob-navy)] font-semibold">
          BOB Robotics
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Password dimenticata
        </h1>
        <p className="mt-1 text-[var(--bob-muted)] text-sm">
          Inserisci l&apos;email dell&apos;account. Ti invieremo un link per
          reimpostare la password.
        </p>

        {done ? (
          <p className="mt-8 text-sm text-[var(--bob-navy)]">
            Se l&apos;email è registrata, riceverai un messaggio con le
            istruzioni. Controlla anche lo spam.
          </p>
        ) : (
          <>
            <label className="block mt-8 text-sm font-medium">Email</label>
            <input
              className="mt-1 w-full rounded-xl border border-[var(--bob-line)] px-3 py-2.5 bg-[var(--bob-cream)]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              required
            />
            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
            <button
              type="submit"
              disabled={loading}
              className="mt-6 w-full rounded-full bg-[var(--bob-black)] text-white py-3 font-medium disabled:opacity-60"
            >
              {loading ? "Invio…" : "Invia link"}
            </button>
          </>
        )}

        <p className="mt-6 text-sm">
          <Link href="/login" className="underline text-[var(--bob-navy)]">
            Torna al login
          </Link>
        </p>
      </form>
    </main>
  );
}
