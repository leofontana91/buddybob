"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { useRobot } from "@/components/AdminShell";
import { TaskStep } from "@/lib/commands";

type Place = { name: string };
type Command = {
  id: string;
  type: string;
  status: string;
  placeName?: string | null;
  text?: string | null;
  taskName?: string | null;
  error?: string | null;
  createdAt: string;
};
type Phrase = { id: string; text: string };
type Task = { id: string; name: string; steps: TaskStep[] };

const emptyStep = (): TaskStep => ({ type: "speak", text: "" });

export default function ActionsPage() {
  const { robotId } = useRobot();
  const [places, setPlaces] = useState<Place[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [placeName, setPlaceName] = useState("");
  const [after, setAfter] = useState<"stay" | "return">("stay");
  const [returnAfterSec, setReturnAfterSec] = useState(10);
  const [speakText, setSpeakText] = useState("");
  const [newPhrase, setNewPhrase] = useState("");
  const [taskName, setTaskName] = useState("");
  const [taskSteps, setTaskSteps] = useState<TaskStep[]>([
    { type: "speak", text: "" },
    { type: "button", label: "Andiamo", speakOnPress: "" },
    { type: "goto", placeName: "" },
    { type: "return" },
  ]);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    if (!robotId) return;
    const [pRes, cRes, phRes, tRes] = await Promise.all([
      fetch(`/api/admin/places?robotId=${robotId}`),
      fetch(`/api/admin/commands?robotId=${robotId}`),
      fetch(`/api/admin/phrases?robotId=${robotId}`),
      fetch(`/api/admin/tasks?robotId=${robotId}`),
    ]);
    if (pRes.ok) setPlaces((await pRes.json()).places ?? []);
    if (cRes.ok) setCommands((await cRes.json()).commands ?? []);
    if (phRes.ok) setPhrases((await phRes.json()).phrases ?? []);
    if (tRes.ok) setTasks((await tRes.json()).tasks ?? []);
  }, [robotId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  async function send(body: Record<string, unknown>) {
    setMsg("");
    const res = await fetch("/api/admin/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ robotId, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error ?? "Invio non riuscito");
      return;
    }
    setMsg("Comando inviato al robot.");
    await load();
  }

  async function goTo(e: FormEvent) {
    e.preventDefault();
    await send({
      type: "goto",
      placeName: placeName.trim(),
      after,
      returnAfterSec: after === "return" ? returnAfterSec : 0,
    });
  }

  async function speak(e: FormEvent) {
    e.preventDefault();
    await send({ type: "speak", text: speakText.trim() });
  }

  async function savePhrase(e: FormEvent) {
    e.preventDefault();
    if (!newPhrase.trim()) return;
    await fetch("/api/admin/phrases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ robotId, text: newPhrase.trim() }),
    });
    setNewPhrase("");
    await load();
  }

  async function saveTask(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    const res = await fetch("/api/admin/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ robotId, name: taskName.trim(), steps: taskSteps }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error ?? "Task non valida");
      return;
    }
    setTaskName("");
    setMsg("Task salvata.");
    await load();
  }

  if (!robotId) {
    return (
      <p className="text-[var(--bob-muted)]">
        Nessun robot assegnato. Chiedi al super admin di associarne uno.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="bob-page-title">Azioni robot</h1>
        <p className="bob-page-sub">
          Muovi BOB, fagli dire una frase, oppure lancia una task.
        </p>
      </div>

      {msg ? <p className="text-sm text-[var(--bob-teal)]">{msg}</p> : null}

      <form
        onSubmit={goTo}
        className="bob-card p-6 space-y-3"
      >
        <h2 className="font-semibold text-lg">Dove deve andare</h2>
        <label className="text-sm block">
          Punto
          <select
            required
            className="mt-1 w-full bob-input"
            value={placeName}
            onChange={(e) => setPlaceName(e.target.value)}
          >
            <option value="">— scegli —</option>
            {places.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 bob-btn-secondary px-4 py-2 text-sm">
            <input
              type="radio"
              checked={after === "stay"}
              onChange={() => setAfter("stay")}
            />
            Resta al punto
          </label>
          <label className="flex items-center gap-2 bob-btn-secondary px-4 py-2 text-sm">
            <input
              type="radio"
              checked={after === "return"}
              onChange={() => setAfter("return")}
            />
            Torna indietro
          </label>
        </div>
        {after === "return" ? (
          <label className="text-sm block max-w-xs">
            Dopo quanti secondi torna
            <input
              type="number"
              min={0}
              max={600}
              className="mt-1 w-full bob-input"
              value={returnAfterSec}
              onChange={(e) => setReturnAfterSec(Number(e.target.value))}
            />
          </label>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="bob-btn px-5 py-2.5 font-medium">
            Invia
          </button>
          <button
            type="button"
            className="bob-btn-secondary px-5 py-2.5"
            onClick={() => send({ type: "stop" })}
          >
            Ferma
          </button>
        </div>
      </form>

      <form
        onSubmit={speak}
        className="bob-card p-6 space-y-3"
      >
        <h2 className="font-semibold text-lg">Fai parlare BOB</h2>
        <div className="flex flex-wrap gap-2">
          {phrases.map((p) => (
            <button
              key={p.id}
              type="button"
              className="bob-btn-secondary px-3 py-1.5 text-sm"
              onClick={() => setSpeakText(p.text)}
            >
              {p.text}
            </button>
          ))}
        </div>
        <textarea
          required
          rows={3}
          className="w-full bob-input"
          placeholder="Ciao, benvenuto in ufficio."
          value={speakText}
          onChange={(e) => setSpeakText(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="bob-btn px-5 py-2.5 font-medium">
            Fai parlare BOB
          </button>
        </div>
        <div className="flex gap-2 pt-2">
          <input
            className="flex-1 bob-input"
            placeholder="Salva una frase per riusarla"
            value={newPhrase}
            onChange={(e) => setNewPhrase(e.target.value)}
          />
          <button
            type="button"
            className="bob-btn-secondary px-4 py-2"
            onClick={(e) => {
              e.preventDefault();
              savePhrase(e as unknown as FormEvent);
            }}
          >
            Salva frase
          </button>
        </div>
      </form>

      <section className="bob-card p-6 space-y-4">
        <h2 className="font-semibold text-lg">Task</h2>
        <p className="text-sm text-[var(--bob-muted)]">
          Una sequenza di 2–4 azioni: parla, mostra un pulsante sul monitor,
          vai a un punto, torna all&apos;inizio.
        </p>
        <form onSubmit={saveTask} className="space-y-3">
          <input
            required
            className="w-full bob-input"
            placeholder="Nome task, es. Accompagna in sala"
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
          />
          {taskSteps.map((step, i) => (
            <div
              key={i}
              className="rounded-xl border border-[var(--bob-line)] p-3 grid md:grid-cols-3 gap-2"
            >
              <select
                className="bob-input"
                value={step.type}
                onChange={(e) => {
                  const type = e.target.value as TaskStep["type"];
                  const next = [...taskSteps];
                  next[i] =
                    type === "speak"
                      ? { type, text: "" }
                      : type === "button"
                        ? { type, label: "Andiamo", speakOnPress: "" }
                        : type === "goto"
                          ? { type, placeName: "" }
                          : type === "wait"
                            ? { type, seconds: 5 }
                            : { type: "return" };
                  setTaskSteps(next);
                }}
              >
                <option value="speak">Dire questo</option>
                <option value="button">Pulsante sul monitor</option>
                <option value="goto">Andare qua</option>
                <option value="wait">Aspetta (sec)</option>
                <option value="return">Tornare al punto iniziale</option>
              </select>
              {step.type === "speak" ? (
                <input
                  className="md:col-span-2 bob-input"
                  placeholder="Testo da dire"
                  value={step.text}
                  onChange={(e) => {
                    const next = [...taskSteps];
                    next[i] = { type: "speak", text: e.target.value };
                    setTaskSteps(next);
                  }}
                />
              ) : null}
              {step.type === "button" ? (
                <>
                  <input
                    className="bob-input"
                    placeholder="Testo pulsante"
                    value={step.label}
                    onChange={(e) => {
                      const next = [...taskSteps];
                      next[i] = { ...step, label: e.target.value };
                      setTaskSteps(next);
                    }}
                  />
                  <input
                    className="bob-input"
                    placeholder="Cosa dice quando premuto"
                    value={step.speakOnPress ?? ""}
                    onChange={(e) => {
                      const next = [...taskSteps];
                      next[i] = { ...step, speakOnPress: e.target.value };
                      setTaskSteps(next);
                    }}
                  />
                </>
              ) : null}
              {step.type === "goto" ? (
                <select
                  className="md:col-span-2 bob-input"
                  value={step.placeName}
                  onChange={(e) => {
                    const next = [...taskSteps];
                    next[i] = { type: "goto", placeName: e.target.value };
                    setTaskSteps(next);
                  }}
                >
                  <option value="">— punto —</option>
                  {places.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : null}
              {step.type === "wait" ? (
                <input
                  type="number"
                  min={1}
                  className="bob-input"
                  value={step.seconds}
                  onChange={(e) => {
                    const next = [...taskSteps];
                    next[i] = { type: "wait", seconds: Number(e.target.value) };
                    setTaskSteps(next);
                  }}
                />
              ) : null}
            </div>
          ))}
          <div className="flex gap-2">
            <button
              type="button"
              className="bob-btn-secondary px-4 py-2 text-sm"
              onClick={() => setTaskSteps([...taskSteps, emptyStep()])}
            >
              Aggiungi passo
            </button>
            <button type="submit" className="bob-btn px-5 py-2 font-medium">
              Salva task
            </button>
          </div>
        </form>

        <ul className="space-y-2 pt-2">
          {tasks.map((t) => (
            <li
              key={t.id}
              className="rounded-xl border border-[var(--bob-line)] px-4 py-3 flex flex-wrap justify-between gap-2 items-center"
            >
              <div>
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-[var(--bob-muted)]">
                  {t.steps.map(stepLabel).join(" → ")}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="bob-btn px-4 py-1.5 text-sm"
                  onClick={() => send({ type: "task", taskId: t.id })}
                >
                  Avvia
                </button>
                <button
                  type="button"
                  className="bob-btn-secondary px-3 py-1.5 text-sm"
                  onClick={async () => {
                    await fetch(`/api/admin/tasks?id=${t.id}`, {
                      method: "DELETE",
                    });
                    await load();
                  }}
                >
                  Elimina
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-semibold text-lg mb-3">Ultimi comandi</h2>
        <ul className="space-y-2">
          {commands.length === 0 ? (
            <li className="text-[var(--bob-muted)]">Nessun comando ancora.</li>
          ) : (
            commands.map((c) => (
              <li
                key={c.id}
                className="bob-card px-4 py-3 text-sm flex justify-between gap-3"
              >
                <span>
                  <strong>{labelType(c.type)}</strong>
                  {c.taskName ? ` · ${c.taskName}` : ""}
                  {c.placeName ? ` · ${c.placeName}` : ""}
                  {c.text ? ` · “${c.text}”` : ""}
                  {c.error ? ` · ${c.error}` : ""}
                </span>
                <span className="text-[var(--bob-muted)] whitespace-nowrap">
                  {c.status} · {format(new Date(c.createdAt), "HH:mm:ss")}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

function labelType(type: string) {
  if (type === "goto") return "Vai a";
  if (type === "speak") return "Parla";
  if (type === "stop") return "Ferma";
  if (type === "task") return "Task";
  return type;
}

function stepLabel(step: TaskStep) {
  if (step.type === "speak") return "dice";
  if (step.type === "button") return `pulsante “${step.label}”`;
  if (step.type === "goto") return `va a ${step.placeName}`;
  if (step.type === "wait") return `attende ${step.seconds}s`;
  return "torna";
}
