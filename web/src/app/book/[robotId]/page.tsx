"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useParams } from "next/navigation";
import { BrandLogo } from "@/components/bob/BrandLogo";
import { Button } from "@/components/bob/Button";
import { RobotPresence } from "@/components/bob/RobotPresence";

export default function PublicBookPage() {
  const params = useParams<{ robotId: string }>();
  const robotId = params.robotId;
  const [robotName, setRobotName] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [guestName, setGuestName] = useState("");
  const [selected, setSelected] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/public/book/${robotId}`);
      if (!res.ok) {
        setError("Robot non trovato");
        return;
      }
      const data = await res.json();
      setRobotName(data.robot?.displayName ?? robotId);
      setSlots(data.slots ?? []);
    })();
  }, [robotId]);

  const byDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const iso of slots) {
      const day = format(new Date(iso), "yyyy-MM-dd");
      const list = map.get(day) ?? [];
      list.push(iso);
      map.set(day, list);
    }
    return Array.from(map.entries());
  }, [slots]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch(`/api/public/book/${robotId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestName, startsAt: selected }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Prenotazione non riuscita");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <main className="min-h-screen grid lg:grid-cols-2">
        <section className="flex flex-col justify-center bg-[var(--bob-ink)] px-10 py-14 text-white">
          <BrandLogo variant="dark" wordmarkClassName="h-5 w-auto" />
          <h1 className="mt-auto font-[family-name:var(--font-poppins)] text-[clamp(28px,4vw,40px)] font-semibold tracking-[-0.03em]">
            Appuntamento fissato
          </h1>
          <p className="mt-3 text-[15px] text-[var(--bob-muted-2)]">
            Grazie {guestName}. Ti aspettiamo!
          </p>
          <div className="mt-10 flex justify-center lg:mt-auto">
            <RobotPresence state="idle" size={160} />
          </div>
        </section>
        <section className="flex items-center justify-center bg-white px-8 py-14">
          <p className="max-w-sm text-center text-[15px] leading-relaxed text-[var(--bob-muted)]">
            All&apos;arrivo dì il tuo nome a BOB: ti riconosce e avvisa il
            referente.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen grid lg:grid-cols-2">
      <section className="relative flex flex-col overflow-hidden bg-[var(--bob-ink)] px-10 py-14 lg:px-14">
        <BrandLogo variant="dark" wordmarkClassName="h-5 w-auto" />
        <p className="bob-eyebrow mt-10 !text-[var(--bob-cyan)]">Prenotazione</p>
        <h1 className="mt-3 max-w-[420px] font-[family-name:var(--font-poppins)] text-[clamp(28px,4vw,40px)] font-semibold leading-[1.12] tracking-[-0.035em] text-white">
          Fissa un appuntamento
        </h1>
        <p className="mt-3 text-[15px] text-[var(--bob-muted-2)]">{robotName}</p>
        <div className="relative mt-10 flex flex-1 items-end justify-center pb-6">
          <RobotPresence state="idle" size={180} />
        </div>
      </section>

      <section className="flex flex-col justify-center bg-white px-8 py-10 sm:px-14">
        <form onSubmit={onSubmit} className="mx-auto w-full max-w-lg space-y-5">
          <label className="bob-label">
            Il tuo nome
            <input
              required
              className="bob-input mt-2"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
            />
          </label>

          <div>
            <p className="bob-label mb-2">Scegli giorno e ora</p>
            {byDay.length === 0 ? (
              <p className="text-sm text-[var(--bob-muted)]">
                Nessuno slot disponibile.
              </p>
            ) : (
              <div className="max-h-80 space-y-4 overflow-auto pr-1">
                {byDay.map(([day, daySlots]) => (
                  <div key={day}>
                    <p className="mb-2 font-[family-name:var(--font-poppins)] text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--bob-cyan-dark)]">
                      {format(new Date(day), "dd/MM/yyyy")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {daySlots.map((iso) => (
                        <button
                          key={iso}
                          type="button"
                          onClick={() => setSelected(iso)}
                          className={`rounded-full border px-3 py-1.5 text-sm whitespace-nowrap ${
                            selected === iso
                              ? "border-[var(--bob-ink)] bg-[var(--bob-ink)] text-white"
                              : "border-[var(--bob-line-2)] bg-[var(--bob-bg-2)] text-[var(--bob-text)]"
                          }`}
                        >
                          {format(new Date(iso), "HH:mm")}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error ? (
            <p className="text-sm text-[var(--bob-warn-ink)]">{error}</p>
          ) : null}

          <Button
            type="submit"
            className="w-full !py-4"
            disabled={!selected || !guestName}
          >
            Conferma
          </Button>
        </form>
      </section>
    </main>
  );
}
