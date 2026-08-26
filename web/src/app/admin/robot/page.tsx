"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRobot } from "@/components/AdminShell";
import { ButtonLink } from "@/components/bob/Button";
import { DarkPanel } from "@/components/bob/FilterPills";
import {
  RobotPresence,
} from "@/components/bob/RobotPresence";
import {
  enabledModuleLinks,
  MODULE_LABELS,
  type AdminModules,
} from "@/lib/modules";

type Status = {
  displayName: string;
  online: boolean;
  lastSeenAt: string | null;
  lastPlace: string | null;
  lastActivity: string | null;
};

const EXTRA_LINKS = [
  { href: "/admin/places", label: "Mappa / punti", hint: "Destinazioni Vai a…" },
  { href: "/admin/actions", label: "Azioni remote", hint: "Parla, vai, ferma" },
  { href: "/admin/settings", label: "PIN e idle", hint: "Impostazioni tecniche" },
  {
    href: "/admin/waiting-room",
    label: "Sala d'attesa",
    hint: "Ospiti arrivati",
  },
];

export default function RobotPage() {
  const { robotId, robots, modules, robotPresence, setRobotId } = useRobot();
  const [status, setStatus] = useState<Status | null>(null);

  const load = useCallback(async () => {
    if (!robotId) return;
    const res = await fetch(`/api/admin/robot-status?robotId=${robotId}`);
    if (!res.ok) return;
    setStatus(await res.json());
  }, [robotId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [load]);

  const moduleLinks = enabledModuleLinks(modules);
  const selected = robots.find((r) => r.id === robotId);

  return (
    <div className="min-h-[calc(100vh-72px)] px-5 py-8 sm:px-8 lg:px-[34px] lg:py-[30px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="bob-eyebrow">Configurazione</p>
          <h1 className="bob-page-title mt-2">Robot</h1>
          <p className="bob-page-sub">
            Scheda, moduli e mappa — le impostazioni vivono qui.
          </p>
        </div>
        {robots.length > 1 ? (
          <select
            className="bob-input max-w-xs"
            value={robotId}
            onChange={(e) => setRobotId(e.target.value)}
          >
            {robots.map((r) => (
              <option key={r.id} value={r.id}>
                {r.displayName}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[340px_1fr]">
        <DarkPanel className="p-6">
          <p className="m-0 font-[family-name:var(--font-poppins)] text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--bob-cyan)]">
            {selected?.displayName || status?.displayName || "BOB"}
          </p>
          <RobotPresence state={robotPresence} size={160} className="mt-4" />
          <p className="mt-2 font-[family-name:var(--font-poppins)] text-[22px] font-semibold text-white">
            {status?.online ? status.lastActivity || "Online" : "Offline"}
          </p>
          <p className="mt-1 text-[13px] text-[var(--bob-muted-2)]">
            {status?.lastPlace || "Posizione sconosciuta"}
          </p>
          <div className="mt-5 flex gap-2">
            <ButtonLink
              href="/admin/actions"
              variant="cyan"
              className="flex-1 !text-[12.5px] !normal-case !tracking-normal"
            >
              Azioni
            </ButtonLink>
            <ButtonLink
              href="/admin"
              variant="ghost-dark"
              className="flex-1 !text-[12.5px] !normal-case !tracking-normal !font-medium"
            >
              Oggi
            </ButtonLink>
          </div>
          <div className="mt-5 flex items-center gap-3 border-t border-[var(--bob-ink-line)] pt-4">
            <Image
              src="/brand/bob-wordmark-white.png"
              alt="BOB"
              width={64}
              height={14}
              className="h-3.5 w-auto opacity-70"
            />
            <span className="text-[12px] text-[#7d8b98]">
              {status?.online ? "connesso" : "non in linea"}
            </span>
          </div>
        </DarkPanel>

        <div className="space-y-5">
          <section>
            <p className="bob-eyebrow !text-[var(--bob-muted-2)]">Moduli</p>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {moduleLinks.map((m) => (
                <Link
                  key={m.href}
                  href={m.href}
                  className="rounded-[14px] border border-[var(--bob-line)] bg-white px-4 py-3.5 transition-colors hover:border-[var(--bob-cyan)]"
                >
                  <p className="text-[14.5px] font-semibold">{m.label}</p>
                  <p className="mt-0.5 text-[12.5px] text-[var(--bob-muted)]">
                    Configura {MODULE_LABELS[m.key as keyof AdminModules]}
                  </p>
                </Link>
              ))}
              {moduleLinks.length === 0 ? (
                <p className="text-sm text-[var(--bob-muted)]">
                  Nessun modulo configurabile attivo.
                </p>
              ) : null}
            </div>
          </section>

          <section>
            <p className="bob-eyebrow !text-[var(--bob-muted-2)]">Strumenti</p>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {EXTRA_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="rounded-[14px] border border-[var(--bob-line)] bg-white px-4 py-3.5 transition-colors hover:border-[var(--bob-cyan)]"
                >
                  <p className="text-[14.5px] font-semibold">{l.label}</p>
                  <p className="mt-0.5 text-[12.5px] text-[var(--bob-muted)]">
                    {l.hint}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
