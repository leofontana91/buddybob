"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRobot } from "@/components/AdminShell";
import {
  DETECT_LEVEL_LABELS,
  detectLevelToMeters,
} from "@/lib/receptionSettings";
import {
  PLACE_MEDIA_ACCEPT,
  PLACE_MEDIA_MAX_BYTES,
  PLACE_MEDIA_TYPES,
  type PlaceMedia,
} from "@/lib/placeContent";

type Place = { name: string; label?: string | null };

async function uploadIdleMedia(
  robotId: string,
  file: File
): Promise<PlaceMedia> {
  if (!PLACE_MEDIA_TYPES.has(file.type)) {
    throw new Error("Formato non supportato. Usa foto o video.");
  }
  if (file.size > PLACE_MEDIA_MAX_BYTES) {
    throw new Error("File troppo grande (max 50 MB).");
  }
  if (file.type.startsWith("audio/")) {
    throw new Error("Per l'accoglienza usa una foto o un video.");
  }
  const startRes = await fetch("/api/admin/place-media/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      robotId,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    }),
  });
  const start = await startRes.json().catch(() => ({}));
  if (!startRes.ok) {
    throw new Error(start.error ?? "Impossibile preparare il caricamento");
  }
  const uploadUrl: string = start.uploadUrl;
  if (!uploadUrl || typeof uploadUrl !== "string") {
    throw new Error("URL di upload mancante");
  }
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "true",
    },
    body: file,
  });
  if (!put.ok) {
    const t = await put.text().catch(() => "");
    let msg = "Caricamento non riuscito";
    try {
      const j = JSON.parse(t) as { message?: string };
      if (j.message) msg = j.message;
    } catch {
      if (t) msg = t.slice(0, 200);
    }
    throw new Error(msg);
  }
  const doneRes = await fetch("/api/admin/place-media/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      robotId,
      objectPath: start.objectPath,
      contentType: file.type,
      fileName: file.name,
    }),
  });
  const done = await doneRes.json().catch(() => ({}));
  if (!doneRes.ok || !done.media) {
    throw new Error(done.error ?? "File caricato ma non confermato");
  }
  return done.media as PlaceMedia;
}

export default function ReceptionModulePage() {
  const { robotId } = useRobot();
  const [displayName, setDisplayName] = useState("");
  const [settingsPin, setSettingsPin] = useState("1234");
  const [welcomeSpeak, setWelcomeSpeak] = useState("Benvenuto");
  const [howCanIHelpSpeak, setHowCanIHelpSpeak] = useState(
    "Come posso aiutarti?"
  );
  const [cooldownSec, setCooldownSec] = useState(45);
  const [detectLevel, setDetectLevel] = useState(2);
  const [standbyPlace, setStandbyPlace] = useState("");
  const [idleDisplayText, setIdleDisplayText] = useState("");
  const [idleMedia, setIdleMedia] = useState<PlaceMedia | null>(null);
  const [idleIntervalSec, setIdleIntervalSec] = useState(20);
  const [idleStopMode, setIdleStopMode] = useState<"person" | "tap">("person");
  const [places, setPlaces] = useState<Place[]>([]);
  const [saved, setSaved] = useState(false);
  const [msg, setMsg] = useState("");
  const [busyMedia, setBusyMedia] = useState(false);

  const load = useCallback(async () => {
    if (!robotId) return;
    const [sRes, pRes] = await Promise.all([
      fetch(`/api/admin/settings?robotId=${robotId}`),
      fetch(`/api/admin/places?robotId=${robotId}`),
    ]);
    if (sRes.ok) {
      const data = await sRes.json();
      const s = data.settings ?? {};
      setDisplayName(data.displayName ?? "");
      setSettingsPin(s.settingsPin ?? "1234");
      setWelcomeSpeak(s.welcomeSpeak ?? "Benvenuto");
      setHowCanIHelpSpeak(s.howCanIHelpSpeak ?? "Come posso aiutarti?");
      setCooldownSec(s.receptionCooldownSec ?? 45);
      setDetectLevel(s.receptionDetectLevel ?? 2);
      setStandbyPlace(s.standbyPlace ?? "");
      setIdleDisplayText(s.idleDisplayText ?? "");
      setIdleIntervalSec(s.idleMediaIntervalSec ?? 20);
      setIdleStopMode(s.idleMediaStopMode === "tap" ? "tap" : "person");
      if (s.idleMediaUrl) {
        setIdleMedia({
          path: "",
          url: s.idleMediaUrl,
          contentType: s.idleMediaContentType || "image/jpeg",
          fileName: "media",
        });
      } else {
        setIdleMedia(null);
      }
    }
    if (pRes.ok) {
      setPlaces((await pRes.json()).places ?? []);
    }
  }, [robotId]);

  useEffect(() => {
    load();
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!robotId) return;
    setSaved(false);
    setMsg("");
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        robotId,
        displayName,
        settingsPin,
        welcomeSpeak,
        howCanIHelpSpeak,
        receptionCooldownSec: cooldownSec,
        receptionDetectLevel: detectLevel,
        standbyPlace,
        idleDisplayText,
        idleMediaUrl: idleMedia?.url ?? "",
        idleMediaContentType: idleMedia?.contentType ?? "",
        idleMediaIntervalSec: idleIntervalSec,
        idleMediaStopMode: idleStopMode,
      }),
    });
    if (res.ok) {
      setSaved(true);
      setMsg("Salvato. Il robot aggiorna la config al prossimo sync.");
    } else {
      setMsg("Salvataggio non riuscito");
    }
  }

  async function onPickMedia(file: File | undefined) {
    if (!file || !robotId) return;
    setBusyMedia(true);
    setMsg("");
    try {
      setIdleMedia(await uploadIdleMedia(robotId, file));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Upload non riuscito");
    } finally {
      setBusyMedia(false);
    }
  }

  if (!robotId) {
    return <p className="text-[var(--bob-muted)]">Nessun robot assegnato.</p>;
  }

  const placeLabel = (p: Place) =>
    (p.label && p.label.trim()) || p.name;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="bob-page-title">Accoglienza</h1>
        <p className="bob-page-sub">
          Cosa dice BOB quando vede qualcuno, quanto è sensibile, dove torna in
          standby e cosa mostra a schermo da solo.
        </p>
      </div>

      <form onSubmit={onSubmit} className="bob-card p-6 space-y-8">
        <section className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">Generale</h2>
          <label className="block text-sm font-medium">
            Nome robot
            <input
              className="mt-1 w-full bob-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            Password impostazioni APK
            <input
              className="mt-1 w-full bob-input"
              value={settingsPin}
              onChange={(e) => setSettingsPin(e.target.value)}
              minLength={4}
              required
            />
          </label>
          <p className="text-sm text-[var(--bob-muted)]">
            Frase e canali di «Chiama operatore» si configurano in{" "}
            <Link className="bob-link" href="/admin/modules/operator">
              Impostazioni → Chiama operatore
            </Link>
            .
          </p>
        </section>

        <section className="space-y-4 border-t border-[var(--bob-line)] pt-6">
          <h2 className="text-lg font-semibold tracking-tight">
            Quando vede una persona
          </h2>
          <label className="block text-sm font-medium">
            Prima frase (saluto)
            <input
              className="mt-1 w-full bob-input"
              value={welcomeSpeak}
              onChange={(e) => setWelcomeSpeak(e.target.value)}
              placeholder="Benvenuto"
            />
          </label>
          <label className="block text-sm font-medium">
            Seconda frase
            <input
              className="mt-1 w-full bob-input"
              value={howCanIHelpSpeak}
              onChange={(e) => setHowCanIHelpSpeak(e.target.value)}
              placeholder="Come posso aiutarti?"
            />
          </label>
          <label className="block text-sm font-medium">
            Sensibilità di rilevazione
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              className="mt-3 w-full"
              value={detectLevel}
              onChange={(e) => setDetectLevel(Number(e.target.value))}
            />
            <span className="mt-1 block text-sm text-[var(--bob-muted)]">
              {DETECT_LEVEL_LABELS[detectLevel] ?? DETECT_LEVEL_LABELS[2]} ·
              distanza effettiva ~{detectLevelToMeters(detectLevel)} m.
              Consigliato: 1–2 per evitare saluti su passaggi lontani.
            </span>
          </label>
          <label className="block text-sm font-medium">
            Secondi di inattività prima di tornare in accoglienza
            <input
              type="number"
              min={10}
              max={600}
              className="mt-1 w-full bob-input"
              value={cooldownSec}
              onChange={(e) => setCooldownSec(Number(e.target.value) || 45)}
            />
            <span className="mt-1 block text-sm text-[var(--bob-muted)]">
              Dopo un servizio (es. «Vai a…»), senza tocchi torna alla reception.
            </span>
          </label>
          <label className="block text-sm font-medium">
            Punto di accoglienza (standby)
            <select
              className="mt-1 w-full bob-input"
              value={standbyPlace}
              onChange={(e) => setStandbyPlace(e.target.value)}
            >
              <option value="">— nessuno —</option>
              {places.map((p) => (
                <option key={p.name} value={p.name}>
                  {placeLabel(p)}
                  {p.label ? ` (${p.name})` : ""}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-sm text-[var(--bob-muted)]">
              Quando torna in idle, se impostato va a questo punto mappa.
            </span>
          </label>
        </section>

        <section className="space-y-4 border-t border-[var(--bob-line)] pt-6">
          <h2 className="text-lg font-semibold tracking-tight">
            Schermo in attesa (senza ospite)
          </h2>
          <label className="block text-sm font-medium">
            Frase / testo a monitor
            <textarea
              className="mt-1 w-full bob-input min-h-[88px]"
              value={idleDisplayText}
              onChange={(e) => setIdleDisplayText(e.target.value)}
              placeholder="Benvenuti. Avvicinatevi o toccate lo schermo."
            />
          </label>
          <div className="space-y-2">
            <p className="text-sm font-medium">Foto o video</p>
            {idleMedia ? (
              <div className="rounded-[var(--bob-radius)] border border-[var(--bob-line)] bg-[var(--bob-cream)] p-3 space-y-2">
                <p className="text-sm break-all text-[var(--bob-muted)]">
                  {idleMedia.contentType} · {idleMedia.fileName}
                </p>
                {idleMedia.contentType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={idleMedia.url}
                    alt=""
                    className="max-h-40 rounded-md object-contain"
                  />
                ) : null}
                <button
                  type="button"
                  className="text-sm text-[var(--bob-danger)]"
                  onClick={() => setIdleMedia(null)}
                >
                  Rimuovi media
                </button>
              </div>
            ) : (
              <p className="text-sm text-[var(--bob-muted)]">
                Nessun media. In idle resta l&apos;avatar BOB.
              </p>
            )}
            <input
              type="file"
              accept={PLACE_MEDIA_ACCEPT}
              disabled={busyMedia}
              onChange={(e) => onPickMedia(e.target.files?.[0])}
            />
            {busyMedia ? (
              <p className="text-sm text-[var(--bob-muted)]">Caricamento…</p>
            ) : null}
          </div>
          <label className="block text-sm font-medium">
            Ogni quanti secondi mostrare / ripresentare i media
            <input
              type="number"
              min={0}
              max={600}
              className="mt-1 w-full bob-input"
              value={idleIntervalSec}
              onChange={(e) => setIdleIntervalSec(Number(e.target.value) || 0)}
            />
            <span className="mt-1 block text-sm text-[var(--bob-muted)]">
              0 = sempre a schermo. Con un video, resta in loop; con una foto si
              ripresenta a intervallo.
            </span>
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              Quando interrompere i media
            </legend>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="idleStop"
                checked={idleStopMode === "person"}
                onChange={() => setIdleStopMode("person")}
              />
              <span>
                Se vede qualcuno (inizia subito il saluto e toglie foto/video)
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="idleStop"
                checked={idleStopMode === "tap"}
                onChange={() => setIdleStopMode("tap")}
              />
              <span>
                Solo se si tocca il monitor (finché c&apos;è il media, non saluta
                da solo)
              </span>
            </label>
          </fieldset>
        </section>

        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--bob-line)] pt-6">
          <button type="submit" className="bob-btn px-6 py-2.5 font-medium">
            Salva
          </button>
          {saved ? (
            <p className="text-sm text-[var(--bob-teal)] font-medium">Salvato.</p>
          ) : null}
          {msg ? (
            <p className="text-sm text-[var(--bob-muted)]">{msg}</p>
          ) : null}
        </div>
      </form>
    </div>
  );
}
