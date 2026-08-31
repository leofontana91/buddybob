"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { AuthSplitLayout } from "@/components/bob/AuthSplitLayout";
import { Button } from "@/components/bob/Button";

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
    <AuthSplitLayout
      eyebrow="Account"
      title="Password dimenticata"
      subtitle="Ti invieremo un link per reimpostare la password."
    >
      {done ? (
        <p className="mt-8 text-sm leading-relaxed text-[var(--bob-text-2)]">
          Se l&apos;email è registrata, riceverai un messaggio con le
          istruzioni. Controlla anche lo spam.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 max-w-md space-y-4">
          <div>
            <label className="bob-label">Email</label>
            <input
              className="bob-input mt-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              required
            />
          </div>
          {error ? (
            <p className="text-sm text-[var(--bob-warn-ink)]">{error}</p>
          ) : null}
          <Button type="submit" className="w-full !py-4" disabled={loading}>
            {loading ? "Invio…" : "Invia link"}
          </Button>
        </form>
      )}

      <p className="mt-6 text-sm">
        <Link href="/login" className="bob-link">
          Torna al login
        </Link>
      </p>
    </AuthSplitLayout>
  );
}
