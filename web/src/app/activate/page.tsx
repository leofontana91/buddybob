"use client";

import { FormEvent, useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthSplitLayout } from "@/components/bob/AuthSplitLayout";
import { Button } from "@/components/bob/Button";

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

  const subtitle = info
    ? `${info.companyName ? `${info.companyName} · ` : ""}${info.name} · ${info.email}`
    : undefined;

  return (
    <AuthSplitLayout
      eyebrow="Benvenuto"
      title="Attiva account"
      subtitle={subtitle}
    >
      <form onSubmit={onSubmit} className="mt-8 max-w-md space-y-4">
        <div>
          <label className="bob-label">Password</label>
          <input
            type="password"
            required
            minLength={6}
            className="bob-input mt-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <label className="bob-label">Conferma password</label>
          <input
            type="password"
            required
            minLength={6}
            className="bob-input mt-2"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {error ? (
          <p className="text-sm text-[var(--bob-warn-ink)]">{error}</p>
        ) : null}
        <Button
          type="submit"
          className="w-full !py-4"
          disabled={loading || !info}
        >
          {loading ? "Salvataggio…" : "Crea password e attiva"}
        </Button>
      </form>
    </AuthSplitLayout>
  );
}

export default function ActivatePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center p-8 text-[var(--bob-muted)]">
          Caricamento…
        </main>
      }
    >
      <ActivateForm />
    </Suspense>
  );
}
