"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRobot } from "@/components/AdminShell";
import { Button, ButtonLink } from "@/components/bob/Button";
import { DarkPanel } from "@/components/bob/FilterPills";
import { ModuleToggle } from "@/components/bob/FilterPills";
import { RobotPresence } from "@/components/bob/RobotPresence";
import {
  DataTable,
  DataTableCell,
  DataTableRow,
} from "@/components/bob/DataTable";
import {
  enabledModuleLinks,
  MODULE_LABELS,
  type AdminModules,
} from "@/lib/modules";

type Status = {
  displayName: string;
  online: boolean;
  lastPlace: string | null;
  lastActivity: string | null;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  appointmentCount: number;
};

type Tab = "robot" | "utenti" | "rubrica" | "calendari";

const EXTRA_LINKS = [
  { href: "/admin/places", label: "Mappa / punti", hint: "Destinazioni Vai a…" },
  { href: "/admin/actions", label: "Azioni remote", hint: "Parla, vai, ferma" },
  { href: "/admin/waiting-room", label: "Sala d'attesa", hint: "Ospiti arrivati" },
];

export default function ImpostazioniPage() {
  const { robotId, robots, modules, robotPresence, setRobotId } = useRobot();
  const [tab, setTab] = useState<Tab>("robot");
  const [status, setStatus] = useState<Status | null>(null);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [uName, setUName] = useState("");
  const [uEmail, setUEmail] = useState("");
  const [uPassword, setUPassword] = useState("");
  const [userMsg, setUserMsg] = useState("");

  const [rubricaEnabled, setRubricaEnabled] = useState(true);
  const [collectPhone, setCollectPhone] = useState(true);
  const [collectEmail, setCollectEmail] = useState(true);
  const [collectCompany, setCollectCompany] = useState(false);
  const [collectNotes, setCollectNotes] = useState(true);
  const [rubricaMsg, setRubricaMsg] = useState("");

  const [calEnabled, setCalEnabled] = useState(false);
  const [calProvider, setCalProvider] = useState("none");
  const [calUrl, setCalUrl] = useState("");
  const [calLast, setCalLast] = useState<string | null>(null);
  const [calMsg, setCalMsg] = useState("");
  const [calBusy, setCalBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!robotId) return;
    const res = await fetch(`/api/admin/robot-status?robotId=${robotId}`);
    if (res.ok) setStatus(await res.json());
  }, [robotId]);

  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (!res.ok) return;
    setUsers((await res.json()).users ?? []);
  }, []);

  const loadSettings = useCallback(async () => {
    if (!robotId) return;
    const res = await fetch(`/api/admin/settings?robotId=${robotId}`);
    if (!res.ok) return;
    const s = (await res.json()).settings ?? {};
    setRubricaEnabled(s.rubricaEnabled !== false);
    setCollectPhone(s.rubricaCollectPhone !== false);
    setCollectEmail(s.rubricaCollectEmail !== false);
    setCollectCompany(!!s.rubricaCollectCompany);
    setCollectNotes(s.rubricaCollectNotes !== false);
    setCalEnabled(!!s.calendarSyncEnabled);
    setCalProvider(s.calendarSyncProvider ?? "none");
    setCalUrl(s.calendarSyncIcalUrl ?? "");
    setCalLast(s.calendarLastSyncAt ?? null);
  }, [robotId]);

  useEffect(() => {
    loadStatus();
    loadUsers();
    loadSettings();
    const t = setInterval(loadStatus, 8000);
    return () => clearInterval(t);
  }, [loadStatus, loadUsers, loadSettings]);

  async function createUser(e: FormEvent) {
    e.preventDefault();
    setUserMsg("");
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: uName,
        email: uEmail,
        password: uPassword,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setUserMsg(data.error ?? "Creazione non riuscita");
      return;
    }
    setUName("");
    setUEmail("");
    setUPassword("");
    setUserMsg("Utente creato.");
    loadUsers();
  }

  async function removeUser(id: string) {
    if (!confirm("Eliminare questo utente?")) return;
    await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" });
    loadUsers();
  }

  async function saveRubrica(e: FormEvent) {
    e.preventDefault();
    if (!robotId) return;
    setRubricaMsg("");
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        robotId,
        rubricaEnabled,
        rubricaCollectPhone: collectPhone,
        rubricaCollectEmail: collectEmail,
        rubricaCollectCompany: collectCompany,
        rubricaCollectNotes: collectNotes,
      }),
    });
    setRubricaMsg(res.ok ? "Salvato." : "Errore salvataggio");
  }

  async function saveCalendar(e: FormEvent) {
    e.preventDefault();
    if (!robotId) return;
    setCalMsg("");
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        robotId,
        calendarSyncEnabled: calEnabled,
        calendarSyncProvider: calProvider,
        calendarSyncIcalUrl: calUrl,
      }),
    });
    setCalMsg(res.ok ? "Salvato." : "Errore salvataggio");
  }

  async function runSync() {
    if (!robotId) return;
    setCalBusy(true);
    setCalMsg("");
    const res = await fetch("/api/admin/calendar-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ robotId, icalUrl: calUrl || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setCalBusy(false);
    if (!res.ok) {
      setCalMsg(data.error ?? "Sync non riuscita");
      return;
    }
    setCalMsg(
      `Importati ${data.created} nuovi, aggiornati ${data.updated} (da ${data.imported} eventi).`
    );
    setCalLast(new Date().toISOString());
  }

  const moduleLinks = enabledModuleLinks(modules);
  const selected = robots.find((r) => r.id === robotId);

  const tabs: { id: Tab; label: string }[] = [
    { id: "robot", label: "Robot" },
    { id: "utenti", label: "Utenti" },
    { id: "rubrica", label: "Rubrica" },
    { id: "calendari", label: "Calendari" },
  ];

  return (
    <div className="min-h-[calc(100vh-72px)] px-5 py-8 sm:px-8 lg:px-[34px] lg:py-[30px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="bob-eyebrow">Configurazione</p>
          <h1 className="bob-page-title mt-2">Impostazioni</h1>
          <p className="bob-page-sub">
            Robot, utenti interni, rubrica ospiti e sync calendari.
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

      <div className="mt-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="rounded-full px-4 py-2 text-[13px] font-medium whitespace-nowrap shrink-0"
            style={{
              background: tab === t.id ? "var(--bob-ink)" : "#fff",
              color: tab === t.id ? "#fff" : "var(--bob-ink)",
              border: tab === t.id ? "0" : "1px solid var(--bob-line-2)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "robot" ? (
        <div className="mt-8 grid gap-5 lg:grid-cols-[320px_1fr]">
          <DarkPanel className="p-6">
            <p className="m-0 font-[family-name:var(--font-poppins)] text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--bob-cyan)]">
              {selected?.displayName || status?.displayName || "BOB"}
            </p>
            <RobotPresence state={robotPresence} size={140} className="mt-4" />
            <p className="mt-2 font-[family-name:var(--font-poppins)] text-[20px] font-semibold text-white">
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
                    className="rounded-[14px] border border-[var(--bob-line)] bg-white px-4 py-3.5 hover:border-[var(--bob-cyan)]"
                  >
                    <p className="text-[14.5px] font-semibold">{m.label}</p>
                    <p className="mt-0.5 text-[12.5px] text-[var(--bob-muted)]">
                      {MODULE_LABELS[m.key as keyof AdminModules]}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
            <section>
              <p className="bob-eyebrow !text-[var(--bob-muted-2)]">Strumenti</p>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {EXTRA_LINKS.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="rounded-[14px] border border-[var(--bob-line)] bg-white px-4 py-3.5 hover:border-[var(--bob-cyan)]"
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
      ) : null}

      {tab === "utenti" ? (
        <div className="mt-8 max-w-3xl space-y-5">
          <p className="text-sm text-[var(--bob-muted)]">
            Referenti interni dell&apos;azienda (host appuntamenti, accesso
            utente).
          </p>
          <form
            onSubmit={createUser}
            className="grid gap-3 bob-card p-5 md:grid-cols-4"
          >
            <input
              required
              className="bob-input"
              placeholder="Nome"
              value={uName}
              onChange={(e) => setUName(e.target.value)}
            />
            <input
              required
              type="email"
              className="bob-input"
              placeholder="Email"
              value={uEmail}
              onChange={(e) => setUEmail(e.target.value)}
            />
            <input
              required
              type="password"
              minLength={6}
              className="bob-input"
              placeholder="Password"
              value={uPassword}
              onChange={(e) => setUPassword(e.target.value)}
            />
            <Button type="submit" className="w-full">
              Crea utente
            </Button>
            {userMsg ? (
              <p className="text-sm text-[var(--bob-muted)] md:col-span-4">
                {userMsg}
              </p>
            ) : null}
          </form>
          <DataTable headers={["Nome", "Email", "Appuntamenti", ""]}>
            {users.map((u) => (
              <DataTableRow key={u.id}>
                <DataTableCell className="font-semibold">{u.name}</DataTableCell>
                <DataTableCell className="text-[var(--bob-muted)]">
                  {u.email}
                </DataTableCell>
                <DataTableCell>{u.appointmentCount}</DataTableCell>
                <DataTableCell>
                  <button
                    type="button"
                    className="text-[13px] text-[var(--bob-warn-ink)]"
                    onClick={() => removeUser(u.id)}
                  >
                    Elimina
                  </button>
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTable>
        </div>
      ) : null}

      {tab === "rubrica" ? (
        <form onSubmit={saveRubrica} className="mt-8 max-w-xl space-y-4">
          <ModuleToggle
            label="Rubrica ospiti attiva"
            hint="Se spenta, la voce Rubrica in navigazione resta ma non raccoglie dati."
            checked={rubricaEnabled}
            onChange={setRubricaEnabled}
          />
          <p className="bob-label pt-2">Dati da salvare per ogni ospite</p>
          <ModuleToggle
            label="Telefono"
            checked={collectPhone}
            onChange={setCollectPhone}
          />
          <ModuleToggle
            label="Email"
            checked={collectEmail}
            onChange={setCollectEmail}
          />
          <ModuleToggle
            label="Azienda / studio"
            checked={collectCompany}
            onChange={setCollectCompany}
          />
          <ModuleToggle
            label="Note"
            checked={collectNotes}
            onChange={setCollectNotes}
          />
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit">Salva rubrica</Button>
            <Link href="/admin/rubrica" className="bob-link text-sm">
              Apri elenco ospiti
            </Link>
            {rubricaMsg ? (
              <span className="text-sm text-[var(--bob-cyan-dark)]">
                {rubricaMsg}
              </span>
            ) : null}
          </div>
        </form>
      ) : null}

      {tab === "calendari" ? (
        <form onSubmit={saveCalendar} className="mt-8 max-w-xl space-y-4">
          <p className="text-sm text-[var(--bob-muted)]">
            Collega Google Calendar, Outlook/Teams o qualsiasi feed iCal: gli
            eventi diventano appuntamenti in Agenda e in Oggi.
          </p>
          <ModuleToggle
            label="Sync automatica attiva"
            hint="Dopo il salvataggio usa «Sincronizza ora». Puoi anche rieseguirla quando vuoi."
            checked={calEnabled}
            onChange={setCalEnabled}
          />
          <label className="block">
            <span className="bob-label">Provider</span>
            <select
              className="bob-input mt-2"
              value={calProvider}
              onChange={(e) => setCalProvider(e.target.value)}
            >
              <option value="none">Nessuno</option>
              <option value="google">Google Calendar</option>
              <option value="teams">Microsoft Teams / Outlook</option>
              <option value="ical">Altro feed iCal</option>
            </select>
          </label>
          <label className="block">
            <span className="bob-label">URL feed iCal (ICS)</span>
            <input
              className="bob-input mt-2"
              placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
              value={calUrl}
              onChange={(e) => setCalUrl(e.target.value)}
            />
            <span className="mt-1.5 block text-[12.5px] text-[var(--bob-muted)]">
              Google: Impostazioni calendario → Integra → Indirizzo segreto in
              formato iCal. Outlook/Teams: Condividi → Pubblica → ICS.
            </span>
          </label>
          {calLast ? (
            <p className="text-[12.5px] text-[var(--bob-muted)]">
              Ultima sync: {new Date(calLast).toLocaleString("it-IT")}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button type="submit">Salva</Button>
            <Button
              type="button"
              variant="secondary"
              disabled={calBusy || !calUrl.trim()}
              onClick={runSync}
            >
              {calBusy ? "Sync…" : "Sincronizza ora"}
            </Button>
            {calMsg ? (
              <span className="text-sm text-[var(--bob-muted)]">{calMsg}</span>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
