"use client";

import { useParams } from "next/navigation";
import { MODULE_LABELS, AdminModules } from "@/lib/modules";

const SLUG_TO_KEY: Record<string, keyof AdminModules> = {
  speech: "speech",
  operator: "callOperator",
  games: "games",
  follow: "follow",
  motion: "motion",
  memos: "voiceMemos",
  charge: "charge",
};

export default function GenericModulePage() {
  const params = useParams<{ slug: string }>();
  const key = SLUG_TO_KEY[params.slug];
  const label = key ? MODULE_LABELS[key] : params.slug;

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="bob-page-title">{label}</h1>
      <p className="text-[var(--bob-muted)]">
        Questo modulo è attivo sull&apos;account. Le azioni quotidiane stanno in{" "}
        <strong>Azioni robot</strong>; qui arriveranno impostazioni dedicate
        (frasi, tempi, comportamento).
      </p>
    </div>
  );
}
