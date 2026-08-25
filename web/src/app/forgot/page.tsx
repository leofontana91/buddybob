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
    <main className="min-h-screen relative flex items-center justify-center px-4 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 20% 10%, rgba(13,44,80,0.08), transparent 55%), linear-gradient(180deg, #faf9f7 0%, var(--bob-cream) 100%)",
        }}
      />
      <form
        onSubmit={onSubmit}
        className="bob-card relative w-full max-w-[400px] p-8 sm:p-10"
      >
        <p className="bob-eyebrow">BOB Robotics</p>
        <h1 className="bob-page-title mt-3">Password dimenticata</h1>
        <p className="bob-page-sub">
          Ti invieremo un link per reimpostare la password.
        </p>

        {done ? (
          <p className="mt-8 text-sm text-[var(--bob-navy)] leading-relaxed">
            Se l&apos;email è registrata, riceverai un messaggio con le
            istruzioni. Controlla anche lo spam.
          </p>
        ) : (
          <>
            <label className="bob-label mt-8">Email</label>
            <input
              className="bob-input mt-1.5"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              required
            />
            {error ? (
              <p className="mt-3 text-sm text-[var(--bob-danger)]">{error}</p>
            ) : null}
            <button
              type="submit"
              disabled={loading}
              className="bob-btn mt-7 w-full py-3 text-[15px]"
            >
              {loading ? "Invio…" : "Invia link"}
            </button>
          </>
        )}

        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="bob-link">
            Torna al login
          </Link>
        </p>
      </form>
    </main>
  );
}
