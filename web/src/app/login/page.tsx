"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/bob/Button";
import { RobotPresence } from "@/components/bob/RobotPresence";

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
    <main className="min-h-screen grid lg:grid-cols-2">
      <section className="relative flex flex-col overflow-hidden bg-[var(--bob-ink)] px-10 py-14 lg:px-14">
        <Image
          src="/brand/bob-wordmark-white.png"
          alt="BOB"
          width={80}
          height={18}
          className="h-5 w-auto self-start"
          priority
        />
        <h1 className="mt-auto max-w-[460px] font-[family-name:var(--font-poppins)] text-[clamp(32px,4vw,44px)] font-semibold leading-[1.12] tracking-[-0.035em] text-white">
          I tuoi robot,
          <br />
          la tua giornata,
          <br />
          una sola schermata.
        </h1>
        <p className="mt-[18px] max-w-[400px] text-[15px] leading-relaxed text-[var(--bob-muted-2)]">
          Accogli, accompagna e parla con i visitatori. BOB fa il lavoro
          operativo, tu vedi tutto da qui.
        </p>
        <div className="relative mt-10 flex h-[250px] items-end justify-center lg:mt-auto">
          <RobotPresence state="idle" size={200} />
        </div>
      </section>

      <section className="flex flex-col justify-center bg-white px-8 py-14 sm:px-14">
        <p className="bob-eyebrow">Area riservata</p>
        <h2 className="mt-3 font-[family-name:var(--font-poppins)] text-[34px] font-semibold tracking-[-0.03em]">
          Accedi
        </h2>
        <p className="mt-2 text-[14.5px] text-[var(--bob-muted)]">
          Un solo accesso per super admin, aziende e utenti.
        </p>

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
      </section>
    </main>
  );
}
