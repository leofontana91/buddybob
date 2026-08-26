"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRobot } from "@/components/AdminShell";
import { Button } from "@/components/bob/Button";

export default function CallOperatorModulePage() {
  const { robotId } = useRobot();
  const [speak, setSpeak] = useState("Sto chiamando un operatore");
  const [inbox, setInbox] = useState(true);
  const [popup, setPopup] = useState(false);
  const [email, setEmail] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [msg, setMsg] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!robotId) return;
    const res = await fetch(`/api/admin/settings?robotId=${robotId}`);
    if (!res.ok) return;
    const data = await res.json();
    const s = data.settings ?? {};
    setSpeak(s.callOperatorSpeak ?? "Sto chiamando un operatore");
    setInbox(s.callOperatorNotifyInbox !== false);
    setPopup(!!s.callOperatorNotifyPopup);
    setEmail(!!s.callOperatorNotifyEmail);
    setEmailTo(s.callOperatorEmail ?? "");
  }, [robotId]);

  useEffect(() => {
    load();
  }, [load]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!robotId) return;
    setMsg("");
    setSaved(false);

    if (!inbox && !popup && !email) {
      setMsg("Scegli almeno un canale di notifica.");
      return;
    }
    if (email && !emailTo.trim()) {
      setMsg("Inserisci l’email destinazione.");
      return;
    }

    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        robotId,
        callOperatorSpeak: speak,
        callOperatorNotifyInbox: inbox,
        callOperatorNotifyPopup: popup,
        callOperatorNotifyEmail: email,
        callOperatorEmail: email ? emailTo.trim() : "",
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMsg(
        typeof data.error === "string"
          ? data.error
          : "Salvataggio non riuscito"
      );
      return;
    }
    setSaved(true);
  }

  if (!robotId) {
    return <p className="text-[var(--bob-muted)]">Nessun robot assegnato.</p>;
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <p className="bob-eyebrow">Modulo</p>
        <h1 className="bob-page-title mt-2">Chiama operatore</h1>
        <p className="bob-page-sub">
          Cosa dice il robot e come avvisare lo staff quando un ospite chiede
          aiuto.
        </p>
      </div>

      <form onSubmit={onSave} className="bob-card space-y-5 p-5">
        <label className="block">
          <span className="bob-label">Frase che dice il robot</span>
          <input
            className="bob-input mt-2"
            value={speak}
            onChange={(e) => {
              setSpeak(e.target.value);
              setSaved(false);
            }}
            maxLength={400}
          />
        </label>

        <fieldset className="space-y-3">
          <legend className="bob-label">Come avvisare lo staff</legend>
          <p className="text-sm text-[var(--bob-muted)]">
            Puoi attivare uno o più canali insieme.
          </p>

          <label className="flex items-start gap-3 rounded-[14px] border border-[var(--bob-line)] bg-white px-4 py-3.5 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={inbox}
              onChange={(e) => {
                setInbox(e.target.checked);
                setSaved(false);
              }}
            />
            <span>
              <span className="block text-[14.5px] font-semibold">
                Notifica in Inbox
              </span>
              <span className="text-[12.5px] text-[var(--bob-muted)]">
                Compare nell’Inbox della console e aumenta il badge sulla
                navigazione.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-[14px] border border-[var(--bob-line)] bg-white px-4 py-3.5 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={popup}
              onChange={(e) => {
                setPopup(e.target.checked);
                setSaved(false);
              }}
            />
            <span>
              <span className="block text-[14.5px] font-semibold">
                Popup in console
              </span>
              <span className="text-[12.5px] text-[var(--bob-muted)]">
                Se un admin ha la piattaforma aperta, appare subito un dialogo
                da confermare.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-[14px] border border-[var(--bob-line)] bg-white px-4 py-3.5 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={email}
              onChange={(e) => {
                setEmail(e.target.checked);
                setSaved(false);
              }}
            />
            <span className="block min-w-0 flex-1">
              <span className="block text-[14.5px] font-semibold">
                Email
              </span>
              <span className="text-[12.5px] text-[var(--bob-muted)]">
                Invia un messaggio all’indirizzo sotto (serve RESEND_API_KEY su
                Vercel).
              </span>
            </span>
          </label>

          {email ? (
            <label className="block pl-1">
              <span className="bob-label">Destinatario</span>
              <input
                type="email"
                required
                className="bob-input mt-2"
                placeholder="operatore@azienda.it"
                value={emailTo}
                onChange={(e) => {
                  setEmailTo(e.target.value);
                  setSaved(false);
                }}
              />
            </label>
          ) : null}
        </fieldset>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button type="submit">Salva</Button>
          {saved ? (
            <span className="text-sm text-[var(--bob-cyan-dark)]">Salvato.</span>
          ) : null}
          {msg ? (
            <span className="text-sm text-[var(--bob-warn-ink)]">{msg}</span>
          ) : null}
        </div>
      </form>
    </div>
  );
}
