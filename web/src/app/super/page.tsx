"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_ADMIN_MODULES,
  MODULE_LABELS,
  TOGGLEABLE_MODULE_KEYS,
  AdminModules,
} from "@/lib/modules";

type AdminRow = {
  id: string;
  email: string;
  name: string;
  companyName?: string | null;
  address?: string | null;
  city?: string | null;
  status: string;
  userCount: number;
  modules: AdminModules;
  robots: {
    id: string;
    displayName: string;
    serialNumber: string;
    enabled: boolean;
    pairingOpenUntil?: string | null;
  }[];
};

function formatApiError(
  data: { error?: string; details?: string },
  fallback: string
) {
  const parts = [data.error || fallback, data.details].filter(Boolean);
  return parts.join(" — ");
}

async function putApkToStorage(params: {
  file: File;
  uploadUrl?: string;
  token?: string;
  objectPath: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { file, uploadUrl, token, objectPath } = params;

  if (uploadUrl) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/octet-stream",
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      const url =
        token && !uploadUrl.includes("token=")
          ? `${uploadUrl}${uploadUrl.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`
          : uploadUrl;
      const putRes = await fetch(url, {
        method: "PUT",
        headers,
        body: file,
      });
      if (putRes.ok) return { ok: true };
      const t = await putRes.text().catch(() => "");
      if (putRes.status !== 0) {
        const viaProxy = await pushApkViaServer(objectPath, file);
        if (viaProxy.ok) return { ok: true };
        return {
          ok: false,
          error: `Upload Storage fallito (${putRes.status}) ${t}`.trim() +
            (viaProxy.error ? ` — fallback: ${viaProxy.error}` : ""),
        };
      }
    } catch {
      const viaProxy = await pushApkViaServer(objectPath, file);
      if (viaProxy.ok) return { ok: true };
      return {
        ok: false,
        error:
          viaProxy.error ||
          "Il browser non riesce a inviare l'APK a Storage (CORS). Se l'APK è sotto ~4.5 MB il server riprova in automatico.",
      };
    }
  }

  return pushApkViaServer(objectPath, file);
}

async function pushApkViaServer(
  objectPath: string,
  file: File
): Promise<{ ok: true } | { ok: false; error: string }> {
  const form = new FormData();
  form.set("objectPath", objectPath);
  form.set("file", file);
  try {
    const res = await fetch("/api/super/android-update/releases/push", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      details?: string;
    };
    if (!res.ok) {
      return { ok: false, error: formatApiError(data, `Upload server HTTP ${res.status}`) };
    }
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}

type RobotRow = {
  id: string;
  displayName: string;
  serialNumber: string;
  apiKey: string;
  enabled: boolean;
  admins: { id: string; name: string; companyName?: string | null; email: string }[];
};

export default function SuperPage() {
  const router = useRouter();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [robots, setRobots] = useState<RobotRow[]>([]);
  const [msg, setMsg] = useState("");
  const [activationUrl, setActivationUrl] = useState("");

  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [robotSerial, setRobotSerial] = useState("");
  const [robotDisplayName, setRobotDisplayName] = useState("");
  const [robotEnabled, setRobotEnabled] = useState(true);
  const [modules, setModules] = useState<AdminModules>({
    ...DEFAULT_ADMIN_MODULES,
  });

  const [pairOpen, setPairOpen] = useState(false);
  const [pairLoading, setPairLoading] = useState(false);
  const [pairTitle, setPairTitle] = useState("");
  const [pairSerial, setPairSerial] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [pairUntil, setPairUntil] = useState("");

  // Android OTA-like updates (uploaded by SUPER_ADMIN).
  const [androidUpdateRobotId, setAndroidUpdateRobotId] = useState<string>("");
  // "" => global release (tutti i robot)
  const [androidUpdateVersionName, setAndroidUpdateVersionName] =
    useState<string>("");
  const [androidUpdateNotes, setAndroidUpdateNotes] = useState<string>("");
  const [androidUpdateFile, setAndroidUpdateFile] =
    useState<File | null>(null);
  const [androidUpdateUploading, setAndroidUpdateUploading] =
    useState<boolean>(false);
  const [androidUpdateMsg, setAndroidUpdateMsg] = useState<string>("");

  const load = useCallback(async () => {
    const res = await fetch("/api/super");
    if (!res.ok) return;
    const data = await res.json();
    setAdmins(data.admins ?? []);
    setRobots(data.robots ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    setMsg("");
    setActivationUrl("");
    const res = await fetch("/api/super", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error ?? "Errore");
      return data;
    }
    setMsg("OK");
    if (data.activationUrl) setActivationUrl(data.activationUrl);
    if (data.emailSent) {
      setMsg("OK — email di attivazione inviata");
    } else if (data.mailError) {
      setMsg(`OK account, email non inviata: ${data.mailError}`);
    }
    await load();
    return data;
  }

  async function uploadAndroidUpdate(e: FormEvent) {
    e.preventDefault();
    if (!androidUpdateFile) {
      setAndroidUpdateMsg("Seleziona un file APK");
      return;
    }
    if (!androidUpdateVersionName.trim()) {
      setAndroidUpdateMsg("Inserisci la versione (versionName)");
      return;
    }

    setAndroidUpdateMsg("");
    setAndroidUpdateUploading(true);
    try {
      const startRes = await fetch("/api/super/android-update/releases/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          robotId: androidUpdateRobotId.trim() || undefined,
          versionName: androidUpdateVersionName.trim(),
        }),
      });
      const startData = (await startRes.json().catch(() => ({}))) as {
        error?: string;
        details?: string;
        uploadUrl?: string;
        token?: string;
        objectPath?: string;
      };
      if (!startRes.ok) {
        setAndroidUpdateMsg(
          formatApiError(
            startData,
            startRes.status === 401
              ? "Sessione scaduta: ricarica la pagina e accedi di nuovo."
              : "Errore preparazione upload"
          )
        );
        return;
      }
      if (!startData.objectPath) {
        setAndroidUpdateMsg("Risposta upload incompleta (manca objectPath)");
        return;
      }

      const stored = await putApkToStorage({
        file: androidUpdateFile,
        uploadUrl: startData.uploadUrl,
        token: startData.token,
        objectPath: startData.objectPath,
      });
      if (!stored.ok) {
        setAndroidUpdateMsg(stored.error);
        return;
      }

      const completeRes = await fetch(
        "/api/super/android-update/releases/complete",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            robotId: androidUpdateRobotId.trim() || undefined,
            versionName: androidUpdateVersionName.trim(),
            notes: androidUpdateNotes.trim() || undefined,
            objectPath: startData.objectPath,
          }),
        }
      );
      const completeData = await completeRes.json().catch(() => ({}));
      if (!completeRes.ok) {
        setAndroidUpdateMsg(
          formatApiError(completeData, "Errore salvataggio rilascio")
        );
        return;
      }

      setAndroidUpdateMsg("OK: rilascio creato. Il robot lo vedrà al prossimo controllo (o al riavvio dell'app).");
      setAndroidUpdateVersionName("");
      setAndroidUpdateNotes("");
      setAndroidUpdateFile(null);
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setAndroidUpdateMsg(`Upload interrotto: ${message}`);
    } finally {
      setAndroidUpdateUploading(false);
    }
  }

  async function createAdmin(e: FormEvent) {
    e.preventDefault();
    await post({
      action: "create_admin",
      email,
      companyName,
      name,
      address,
      city,
      robotSerial,
      robotDisplayName: robotDisplayName || undefined,
      robotEnabled,
      modules,
    });
    setEmail("");
    setCompanyName("");
    setName("");
    setAddress("");
    setCity("");
    setRobotSerial("");
    setRobotDisplayName("");
    setModules({ ...DEFAULT_ADMIN_MODULES });
  }

  function toggleModule(key: keyof AdminModules) {
    setModules((m) => ({ ...m, [key]: !m[key] }));
  }

  async function openClientPanel(adminId: string) {
    const res = await fetch("/api/super/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error ?? "Impossibile aprire il pannello");
      return;
    }
    router.push(data.redirect ?? "/admin");
  }

  async function openPairing(robotId: string) {
    setPairOpen(true);
    setPairLoading(true);
    setPairCode("");
    setPairSerial("");
    setPairUntil("");
    setPairTitle(robotId);
    const data = (await post({ action: "open_pairing", robotId })) as {
      pairingCode?: string;
      serialNumber?: string;
      displayName?: string;
      pairingOpenUntil?: string;
      error?: string;
    };
    setPairLoading(false);
    if (!data?.pairingCode) {
      setPairOpen(false);
      return;
    }
    setPairTitle(data.displayName ?? robotId);
    setPairSerial(data.serialNumber ?? "");
    setPairCode(data.pairingCode);
    setPairUntil(data.pairingOpenUntil ?? "");
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="bob-page-title">Super Admin</h1>
        <p className="text-[var(--bob-muted)] mt-1">
          Crea aziende (admin), collega robot per seriale, abilita moduli
        </p>
        {msg ? (
          <p className="mt-2 text-sm text-[var(--bob-teal)]">{msg}</p>
        ) : null}
        {activationUrl ? (
          <p className="mt-2 text-sm break-all">
            Link attivazione (copia e invia se l&apos;email non è partita):{" "}
            <a className="underline text-[var(--bob-navy)]" href={activationUrl}>
              {activationUrl}
            </a>
          </p>
        ) : null}
      </div>

      <form
        onSubmit={createAdmin}
        className="bob-card p-6 space-y-4"
      >
        <h2 className="font-semibold text-lg">Nuova azienda (Admin)</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <input
            required
            placeholder="Nome azienda"
            className="bob-input"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
          <input
            required
            placeholder="Nome persona di riferimento"
            className="bob-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            required
            type="email"
            placeholder="Email (riceverà attivazione)"
            className="bob-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            required
            placeholder="Città"
            className="bob-input"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
          <input
            required
            placeholder="Indirizzo"
            className="md:col-span-2 bob-input"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>

        <h3 className="font-medium pt-2">Robot</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <input
            required
            placeholder="Numero di serie"
            className="bob-input"
            value={robotSerial}
            onChange={(e) => setRobotSerial(e.target.value)}
          />
          <input
            placeholder="Nome robot (opzionale)"
            className="bob-input"
            value={robotDisplayName}
            onChange={(e) => setRobotDisplayName(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={robotEnabled}
              onChange={(e) => setRobotEnabled(e.target.checked)}
            />
            Robot abilitato
          </label>
        </div>

        <h3 className="font-medium pt-2">Moduli abilitati</h3>
        <div className="flex flex-wrap gap-2">
          {TOGGLEABLE_MODULE_KEYS.map((key) => (
            <label
              key={key}
              className={`flex items-center gap-2 border px-3 py-1.5 text-sm cursor-pointer ${
                modules[key]
                  ? "border-[var(--bob-black)] bg-[var(--bob-cream)]"
                  : "border-[var(--bob-line)] opacity-60"
              }`}
            >
              <input
                type="checkbox"
                checked={modules[key]}
                onChange={() => toggleModule(key)}
              />
              {MODULE_LABELS[key]}
            </label>
          ))}
        </div>
        <p className="text-xs text-[var(--bob-muted)]">
          Movimento, Segui e Ricarica sono di serie su ogni robot.
        </p>

        <button
          type="submit"
          className="bob-btn px-6 py-2.5 font-medium"
        >
          Crea admin + robot e invia attivazione
        </button>
      </form>

      <section>
        <h2 className="font-semibold text-lg mb-3">Aziende / Admin</h2>
        <ul className="space-y-4">
          {admins.map((a) => (
            <li
              key={a.id}
              className="bob-card px-4 py-4 space-y-3"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <p className="font-semibold text-lg">
                    {a.companyName ?? a.name}
                  </p>
                  <p className="text-sm text-[var(--bob-muted)]">
                    {a.name} · {a.email}
                    {a.city ? ` · ${a.city}` : ""}
                    {a.address ? ` · ${a.address}` : ""}
                  </p>
                  <p className="text-xs mt-1 uppercase tracking-wide">
                    Stato: <strong>{a.status}</strong> · Utenti: {a.userCount}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="text-xs bob-btn px-3 py-1.5"
                    onClick={() => openClientPanel(a.id)}
                  >
                    Entra nel pannello
                  </button>
                  {a.status !== "active" ? (
                    <button
                      type="button"
                      className="text-xs bob-btn-secondary px-3 py-1.5"
                      onClick={() =>
                        post({ action: "resend_activation", adminId: a.id })
                      }
                    >
                      Reinvia attivazione
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="text-xs bob-btn-secondary px-3 py-1.5"
                    onClick={() =>
                      post({
                        action: "set_admin_status",
                        adminId: a.id,
                        status: a.status === "disabled" ? "active" : "disabled",
                      })
                    }
                  >
                    {a.status === "disabled" ? "Abilita account" : "Disabilita"}
                  </button>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Moduli</p>
                <p className="text-xs text-[var(--bob-muted)] mb-2">
                  Spegnendo un modulo sparisce dal menu del robot. Il robot
                  associato e online aggiorna da solo entro circa 30 secondi.
                  Movimento, Segui e Ricarica restano sempre disponibili.
                </p>
                <div className="flex flex-wrap gap-2">
                  {TOGGLEABLE_MODULE_KEYS.map((key) => (
                      <label
                        key={key}
                        className="flex items-center gap-1.5 text-xs bob-btn-secondary px-2.5 py-1"
                      >
                        <input
                          type="checkbox"
                          checked={!!a.modules[key]}
                          onChange={(e) =>
                            post({
                              action: "update_modules",
                              adminId: a.id,
                              modules: { [key]: e.target.checked },
                            })
                          }
                        />
                        {MODULE_LABELS[key]}
                      </label>
                    ))}
                </div>
              </div>

              <div className="text-sm">
                <p className="font-medium">Robot</p>
                {a.robots.length === 0 ? (
                  <p className="text-[var(--bob-muted)]">Nessuno</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {a.robots.map((r) => (
                      <li key={r.id} className="flex flex-wrap gap-2 items-center">
                        <span>
                          {r.displayName} · SN {r.serialNumber}{" "}
                          <code className="text-xs">{r.id}</code>
                        </span>
                        <button
                          type="button"
                          className="text-xs border px-2 py-0.5"
                          onClick={() =>
                            post({
                              action: "set_robot_enabled",
                              robotId: r.id,
                              enabled: !r.enabled,
                            })
                          }
                        >
                          {r.enabled ? "Disabilita robot" : "Abilita robot"}
                        </button>
                        <button
                          type="button"
                          className="bob-btn text-xs px-2 py-0.5"
                          onClick={() => openPairing(r.id)}
                        >
                          Prepara associazione
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-semibold text-lg mb-3">Tutti i robot</h2>
        <ul className="space-y-3">
          {robots.map((r) => (
            <li
              key={r.id}
              className="bob-card px-4 py-3"
            >
              <p className="font-semibold">
                {r.displayName}{" "}
                <span className="text-sm font-normal text-[var(--bob-muted)]">
                  SN {r.serialNumber} · {r.enabled ? "ON" : "OFF"}
                </span>
              </p>
              <p className="text-xs mt-1 break-all">
                API key: <code>{r.apiKey}</code>
              </p>
              <p className="text-sm text-[var(--bob-muted)] mt-1">
                Admin:{" "}
                {r.admins
                  .map((a) => a.companyName || a.name)
                  .join(", ") || "—"}
              </p>
              <button
                type="button"
                className="bob-btn mt-2 text-sm px-4 py-1.5"
                onClick={() => openPairing(r.id)}
              >
                Prepara associazione
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-semibold text-lg mb-3">Aggiornamenti Android</h2>
        <p className="text-sm text-[var(--bob-muted)] mt-1">
          Carica un nuovo APK: i robot controlleranno il manifest e proporranno
          l&apos;aggiornamento. Il file va su Supabase Storage (non passa da Vercel).
        </p>

        <form
          onSubmit={uploadAndroidUpdate}
          className="bob-card p-6 space-y-4 mt-4"
        >
          <div className="grid md:grid-cols-2 gap-3">
            <select
              value={androidUpdateRobotId}
              onChange={(e) => setAndroidUpdateRobotId(e.target.value)}
              className="bob-input"
            >
              <option value="">Globale (tutti i robot)</option>
              {robots.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.displayName} ({r.id})
                </option>
              ))}
            </select>

            <input
              required
              placeholder="versionName (es. 1.1.1)"
              className="bob-input"
              value={androidUpdateVersionName}
              onChange={(e) => setAndroidUpdateVersionName(e.target.value)}
            />

            <textarea
              placeholder="Note (opzionale)"
              className="md:col-span-2 bob-input"
              value={androidUpdateNotes}
              onChange={(e) => setAndroidUpdateNotes(e.target.value)}
              rows={3}
            />

            <div className="md:col-span-2">
              <input
                required
                type="file"
                accept=".apk"
                onChange={(e) =>
                  setAndroidUpdateFile(e.target.files?.[0] ?? null)
                }
                className="w-full text-sm"
              />
              {androidUpdateFile ? (
                <p className="text-xs mt-2 text-[var(--bob-muted)] break-all">
                  Selezionato: {androidUpdateFile.name}
                </p>
              ) : null}
            </div>
          </div>

          <button
            type="submit"
            className="bob-btn px-6 py-2.5 font-medium"
            disabled={androidUpdateUploading}
          >
            {androidUpdateUploading ? "Caricamento…" : "Carica APK"}
          </button>

          {androidUpdateMsg ? (
            <p
              className={`text-sm mt-2 ${
                androidUpdateMsg.startsWith("OK:")
                  ? "text-[var(--bob-teal)]"
                  : "text-red-700"
              }`}
            >
              {androidUpdateMsg}
            </p>
          ) : null}
        </form>
      </section>

      {pairOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(24, 24, 24, 0.5)" }}
        >
          <div className="bob-dialog rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-[var(--bob-line)]">
            <div className="flex justify-between gap-3 items-start">
              <div>
                <h3 className="font-semibold text-lg">Associa il robot</h3>
                <p className="text-sm text-[var(--bob-muted)]">{pairTitle}</p>
              </div>
              <button
                type="button"
                className="text-sm bob-btn-secondary px-3 py-1"
                onClick={() => setPairOpen(false)}
              >
                Chiudi
              </button>
            </div>
            {pairLoading ? (
              <p className="text-sm text-[var(--bob-muted)]">Generazione codice…</p>
            ) : (
              <>
                <p className="text-sm">Numero di serie</p>
                <p className="text-2xl font-mono font-bold tracking-wide">
                  {pairSerial}
                </p>
                <p className="text-sm pt-2">Codice da inserire sul robot (15 minuti)</p>
                <p className="text-5xl font-bold tracking-[0.25em] text-center py-2">
                  {pairCode}
                </p>
                {pairUntil ? (
                  <p className="text-xs text-[var(--bob-muted)]">
                    Valido fino a {new Date(pairUntil).toLocaleTimeString("it-IT")}
                  </p>
                ) : null}
                <p className="text-sm text-[var(--bob-muted)]">
                  Sull&apos;app: Associa robot → conferma il seriale → inserisci
                  questo codice → Collega. Non serve scansionare nulla.
                </p>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
