"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRobot } from "@/components/AdminShell";

type Preview = {
  speak: string;
  actions: { type: string; module?: string; placeName?: string }[];
  source: string;
  aiConfigured: boolean;
};

export default function SpeechModulePage() {
  const { robotId } = useRobot();
  const [aiConfigured, setAiConfigured] = useState(false);
  const [model, setModel] = useState("gpt-4o-mini");
  const [text, setText] = useState("Apri appuntamenti");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/voice");
      if (res.ok) {
        const data = await res.json();
        setAiConfigured(!!data.aiConfigured);
        if (data.model) setModel(data.model);
      }
    })();
  }, []);

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
          Comandi vocali: aprire moduli, andare a un punto, chiamare
          l&apos;operatore. Le domande sulla knowledge base arriveranno dopo.
        </p>
      </div>

      <section className="rounded-2xl bg-white border border-[var(--bob-line)] p-5 space-y-2">
        <h2 className="font-semibold">Intelligenza</h2>
        {aiConfigured ? (
          <p className="text-sm">
            OpenAI collegata ({model}). I comandi naturali passano dall&apos;AI,
            con regole italiane di riserva.
          </p>
        ) : (
          <p className="text-sm text-[var(--bob-muted)]">
            Nessuna chiave AI: funzionano le regole italiane («apri
            appuntamenti», «accompagnami a…»). Su Vercel aggiungi{" "}
            <code className="text-[var(--bob-navy)]">OPENAI_API_KEY</code> (e
            opzionale <code className="text-[var(--bob-navy)]">OPENAI_MODEL</code>
            ).
          </p>
        )}
      </section>

      <form
        onSubmit={onPreview}
        className="rounded-2xl bg-white border border-[var(--bob-line)] p-5 space-y-3"
      >
        <h2 className="font-semibold">Prova una frase</h2>
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
            "Ferma",
            "Torna al menu",
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
