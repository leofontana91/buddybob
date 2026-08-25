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
    <main className="min-h-screen relative flex items-center justify-center px-4 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 20% 10%, rgba(13,44,80,0.08), transparent 55%), radial-gradient(ellipse 70% 50% at 90% 80%, rgba(10,122,140,0.07), transparent 50%), linear-gradient(180deg, #faf9f7 0%, var(--bob-cream) 100%)",
        }}
      />
      <form
        onSubmit={onSubmit}
        className="bob-card relative w-full max-w-[400px] p-8 sm:p-10"
      >
        <p className="bob-eyebrow">BOB Robotics</p>
        <h1 className="bob-page-title mt-3">Accedi</h1>
        <p className="bob-page-sub">
          Super admin, admin o utente
        </p>

        <label className="bob-label mt-8">Email</label>
        <input
          className="bob-input mt-1.5"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          autoComplete="email"
          required
        />

        <label className="bob-label mt-4">Password</label>
        <input
          className="bob-input mt-1.5"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          autoComplete="current-password"
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
          {loading ? "Accesso…" : "Entra"}
        </button>

        <p className="mt-6 text-center text-sm">
          <Link href="/forgot" className="bob-link">
            Password dimenticata?
          </Link>
        </p>
      </form>
    </main>
  );
}
