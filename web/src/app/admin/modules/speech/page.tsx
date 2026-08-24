"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRobot } from "@/components/AdminShell";

type Preview = {
  speak: string;
  actions: { type: string; module?: string; placeName?: string }[];
  source: string;
  aiConfigured: boolean;
};

const EXAMPLE_INSTRUCTIONS = `Se dicono «accompagnami», «portami» o «vieni con me» tratta come un comando vai a (goto) verso il punto citato.
Non rispondere a domande sul meteo, le notizie o argomenti esterni: di' che non puoi aiutarlo su quello e proponi i moduli (appuntamenti, documenti).
Se chiedono orari di apertura, rispondi solo: «Gli orari li trova in reception o chiedendo a un operatore».
Tono cortese e formale.`;

export default function SpeechModulePage() {
  const { robotId } = useRobot();
  const [aiConfigured, setAiConfigured] = useState(false);
  const [model, setModel] = useState("gpt-4o-mini");
  const [instructions, setInstructions] = useState("");
  const [text, setText] = useState("Apri appuntamenti");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [msg, setMsg] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const [vRes, sRes] = await Promise.all([
      fetch("/api/admin/voice"),
      robotId
        ? fetch(`/api/admin/settings?robotId=${robotId}`)
        : Promise.resolve(null),
    ]);
    if (vRes.ok) {
      const data = await vRes.json();
      setAiConfigured(!!data.aiConfigured);
      if (data.model) setModel(data.model);
    }
    if (sRes?.ok) {
      const data = await sRes.json();
      setInstructions(data.settings?.voiceInstructions ?? "");
    }
  }, [robotId]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveInstructions(e: FormEvent) {
    e.preventDefault();
    if (!robotId) return;
    setSaved(false);
    setMsg("");
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        robotId,
        voiceInstructions: instructions,
      }),
    });
    if (!res.ok) {
      setMsg("Salvataggio non riuscito");
      return;
    }
    setSaved(true);
  }

  async function onPreview(e: FormEvent) {
    e.preventDefault();
    if (!robotId || !text.trim()) return;
    setMsg("");
    setPreview(null);
    const res = await fetch("/api/admin/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ robotId, text: text.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error ?? "Prova non riuscita");
      return;
    }
    setPreview(data);
  }

  if (!robotId) {
    return <p className="text-[var(--bob-muted)]">Nessun robot assegnato.</p>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Parla con me</h1>
        <p className="text-[var(--bob-muted)] mt-1">
          Comandi vocali e istruzioni per l&apos;AI: sinonimi, cosa può dire e
          cosa deve evitare.
        </p>
      </div>

      <section className="rounded-2xl bg-white border border-[var(--bob-line)] p-5 space-y-2">
        <h2 className="font-semibold">Intelligenza</h2>
        {aiConfigured ? (
          <p className="text-sm">
            OpenAI collegata ({model}). I comandi naturali usano l&apos;AI più le
            istruzioni qui sotto; senza AI restano le regole italiane di base.
          </p>
        ) : (
          <p className="text-sm text-[var(--bob-muted)]">
            Nessuna chiave AI: funzionano solo le regole italiane. Su Vercel
            aggiungi{" "}
            <code className="text-[var(--bob-navy)]">OPENAI_API_KEY</code>.
          </p>
        )}
      </section>

      <form
        onSubmit={saveInstructions}
        className="rounded-2xl bg-white border border-[var(--bob-line)] p-5 space-y-3"
      >
        <h2 className="font-semibold">Istruzioni per l&apos;AI</h2>
        <p className="text-sm text-[var(--bob-muted)]">
          Scrivi in italiano regole del tipo: «accompagnami = vai a», «non
          rispondere sul meteo», «se chiedono X di&apos; Y». Non può inventare
          punti mappa né aprire moduli non attivi.
        </p>
        <textarea
          rows={8}
          className="w-full rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-[var(--bob-cream)] text-sm"
          placeholder={EXAMPLE_INSTRUCTIONS}
          value={instructions}
          onChange={(e) => {
            setInstructions(e.target.value);
            setSaved(false);
          }}
        />
        <button
          type="button"
          className="text-sm underline text-[var(--bob-navy)]"
          onClick={() => {
            setInstructions(EXAMPLE_INSTRUCTIONS);
            setSaved(false);
          }}
        >
          Inserisci esempio
        </button>
        <div className="flex items-center gap-3">
          <button type="submit" className="bob-btn rounded-full px-5 py-2 font-medium">
            Salva istruzioni
          </button>
          {saved ? (
            <span className="text-sm text-[var(--bob-teal)]">Salvato.</span>
          ) : null}
        </div>
      </form>

      <form
        onSubmit={onPreview}
        className="rounded-2xl bg-white border border-[var(--bob-line)] p-5 space-y-3"
      >
        <h2 className="font-semibold">Prova una frase</h2>
        <p className="text-sm text-[var(--bob-muted)]">
          Usa le istruzioni già salvate (salva prima se le hai appena modificate).
        </p>
        <input
          className="w-full rounded-xl border border-[var(--bob-line)] px-3 py-2 bg-[var(--bob-cream)]"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Accompagnami in sala riunioni"
        />
        <div className="flex flex-wrap gap-2 text-sm">
          {[
            "Apri appuntamenti",
            "Chiama un operatore",
            "Accompagnami in reception",
            "Che tempo fa domani?",
            "Ferma",
          ].map((ex) => (
            <button
              key={ex}
              type="button"
              className="rounded-full border border-[var(--bob-line)] px-3 py-1"
              onClick={() => setText(ex)}
            >
              {ex}
            </button>
          ))}
        </div>
        <button type="submit" className="bob-btn rounded-full px-5 py-2 font-medium">
          Interpreta
        </button>
        {msg ? <p className="text-sm text-red-700">{msg}</p> : null}
        {preview ? (
          <div className="text-sm space-y-1 pt-2 border-t border-[var(--bob-line)]">
            <p>
              Fonte: <strong>{preview.source}</strong>
              {preview.aiConfigured ? " · AI disponibile" : " · solo regole"}
            </p>
            <p>
              Dice: <strong>{preview.speak}</strong>
            </p>
            <p>
              Azioni:{" "}
              {preview.actions.length
                ? preview.actions
                    .map((a) =>
                      a.type === "open"
                        ? `open:${a.module}`
                        : a.type === "goto"
                          ? `goto:${a.placeName}`
                          : a.type
                    )
                    .join(", ")
                : "nessuna"}
            </p>
          </div>
        ) : null}
      </form>
    </div>
  );
}
