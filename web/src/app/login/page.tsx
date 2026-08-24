"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Accesso non riuscito");
      return;
    }
    router.replace(data.redirect ?? "/admin");
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
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Accedi</h1>
        <p className="mt-1 text-[var(--bob-muted)] text-sm">
          Super admin, admin o utente
        </p>

        <label className="block mt-8 text-sm font-medium">Email</label>
        <input
          className="mt-1 w-full rounded-xl border border-[var(--bob-line)] px-3 py-2.5 bg-[var(--bob-cream)]"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          autoComplete="email"
          required
        />

        <label className="block mt-4 text-sm font-medium">Password</label>
        <input
          className="mt-1 w-full rounded-xl border border-[var(--bob-line)] px-3 py-2.5 bg-[var(--bob-cream)]"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          autoComplete="current-password"
          required
        />

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-full bg-[var(--bob-black)] text-white py-3 font-medium disabled:opacity-60"
        >
          {loading ? "Accesso…" : "Entra"}
        </button>

        <p className="mt-5 text-center">
          <Link href="/forgot" className="bob-link text-base">
            Password dimenticata? Recuperala
          </Link>
        </p>
      </form>
    </main>
  );
}
