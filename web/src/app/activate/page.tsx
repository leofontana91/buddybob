"use client";

import { FormEvent, useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function ActivateForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const router = useRouter();
  const [info, setInfo] = useState<{
    email: string;
    name: string;
    companyName?: string | null;
  } | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Link non valido");
      return;
    }
    (async () => {
      const res = await fetch(`/api/activate?token=${encodeURIComponent(token)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Link non valido");
        return;
      }
      setInfo(data);
    })();
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Le password non coincidono");
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch("/api/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    setLoading(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Attivazione non riuscita");
      return;
    }
    router.replace("/login");
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md bob-card p-8 shadow-sm"
      >
        <p className="bob-eyebrow">BOB Robotics</p>
        <h1 className="bob-page-title mt-3">Attiva account</h1>
        {info ? (
          <p className="mt-2 text-sm text-[var(--bob-muted)]">
            {info.companyName ? `${info.companyName} · ` : ""}
            {info.name} · {info.email}
          </p>
        ) : null}

        <label className="block mt-8 text-sm font-medium">Password</label>
        <input
          type="password"
          required
          minLength={6}
          className="mt-1 w-full bob-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <label className="block mt-4 text-sm font-medium">
          Conferma password
        </label>
        <input
          type="password"
          required
          minLength={6}
          className="mt-1 w-full bob-input"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={loading || !info}
          className="bob-btn mt-7 w-full py-3 font-medium disabled:opacity-50"
        >
          {loading ? "Salvataggio…" : "Crea password e attiva"}
        </button>
      </form>
    </main>
  );
}

export default function ActivatePage() {
  return (
    <Suspense fallback={<main className="p-8">Caricamento…</main>}>
      <ActivateForm />
    </Suspense>
  );
}
