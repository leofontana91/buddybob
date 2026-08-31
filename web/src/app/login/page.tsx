"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthSplitLayout } from "@/components/bob/AuthSplitLayout";
import { Button } from "@/components/bob/Button";

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
    <AuthSplitLayout
      eyebrow="Area riservata"
      title="Accedi"
      subtitle="Un solo accesso per super admin, aziende e utenti."
    >
      <form onSubmit={onSubmit} className="mt-8 max-w-md space-y-4">
        <div>
          <label className="bob-label">Email</label>
          <input
            type="email"
            required
            autoComplete="username"
            className="bob-input mt-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="bob-label">Password</label>
          <input
            type="password"
            required
            autoComplete="current-password"
            className="bob-input mt-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error ? (
          <p className="text-sm text-[var(--bob-warn-ink)]">{error}</p>
        ) : null}
        <Button type="submit" className="w-full !py-4" disabled={loading}>
          {loading ? "Accesso…" : "Entra"}
        </Button>
      </form>
    </AuthSplitLayout>
  );
}
