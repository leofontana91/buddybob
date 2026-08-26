"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AdminModules,
  DEFAULT_ADMIN_MODULES,
  enabledModuleLinks,
} from "@/lib/modules";

type Robot = { id: string; displayName: string };

type RobotCtx = {
  robots: Robot[];
  robotId: string;
  setRobotId: (id: string) => void;
  reloadRobots: () => Promise<void>;
  modules: AdminModules;
};

const Ctx = createContext<RobotCtx | null>(null);

export function useRobot() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRobot outside provider");
  return v;
}

export function AdminShell({
  operatorName,
  roleLabel,
  links,
  children,
  withRobotSelect = true,
  backToSuper = false,
}: {
  operatorName: string;
  roleLabel: string;
  links: { href: string; label: string; badgeKey?: "inbox" }[];
  children: React.ReactNode;
  withRobotSelect?: boolean;
  backToSuper?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [robots, setRobots] = useState<Robot[]>([]);
  const [robotId, setRobotIdState] = useState("");
  const [unread, setUnread] = useState(0);
  const [modules, setModules] = useState<AdminModules>(DEFAULT_ADMIN_MODULES);
  const [modulesOpen, setModulesOpen] = useState(false);

  const reloadRobots = useCallback(async () => {
    const res = await fetch("/api/admin/robots");
    if (!res.ok) return;
    const data = await res.json();
    const list: Robot[] = data.robots ?? [];
    if (data.modules) setModules(data.modules);
    setRobots(list);
    setRobotIdState((prev) => {
      if (prev && list.some((r) => r.id === prev)) return prev;
      const stored =
        typeof window !== "undefined"
          ? localStorage.getItem("bob_robot_id")
          : null;
      if (stored && list.some((r) => r.id === stored)) return stored;
      return list[0]?.id ?? "";
    });
  }, []);

  const setRobotId = useCallback((id: string) => {
    setRobotIdState(id);
    localStorage.setItem("bob_robot_id", id);
  }, []);

  useEffect(() => {
    if (withRobotSelect) reloadRobots();
  }, [reloadRobots, withRobotSelect]);

  useEffect(() => {
    if (!withRobotSelect || !robotId) return;
    let alive = true;
    async function poll() {
      const res = await fetch(`/api/admin/alerts?robotId=${robotId}`);
      if (!res.ok || !alive) return;
      const data = await res.json();
      setUnread(data.unreadCount ?? 0);
    }
    poll();
    const t = setInterval(poll, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [robotId, withRobotSelect]);

  const value = useMemo(
    () => ({ robots, robotId, setRobotId, reloadRobots, modules }),
    [robots, robotId, setRobotId, reloadRobots, modules]
  );

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/login");
  }

  async function leaveClientPanel() {
    await fetch("/api/super/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId: null }),
    });
    router.replace("/super");
  }

  const moduleLinks = withRobotSelect ? enabledModuleLinks(modules) : [];

  const featureLinks =
    withRobotSelect && modules.appointments
      ? [
          { href: "/admin/calendar", label: "Calendario" },
          { href: "/admin/guests", label: "Gestione clienti" },
        ]
      : [];

  function isActive(href: string) {
    if (href === "/admin" || href === "/super" || href === "/me") {
      return pathname === href;
    }
    return pathname.startsWith(href);
  }

  const nav = (
    <>
      <div className="px-1 mb-6">
        <p className="bob-eyebrow">BOB</p>
        <p className="mt-1 text-[15px] font-semibold tracking-tight text-[var(--bob-ink)]">
          {roleLabel}
        </p>
        <p className="mt-0.5 text-[13px] text-[var(--bob-muted)] truncate">
          {operatorName}
        </p>
      </div>

      {withRobotSelect && robots.length > 0 ? (
        <div className="mb-5">
          <label className="bob-label mb-1.5">Robot</label>
          <select
            className="bob-input text-sm"
            value={robotId}
            onChange={(e) => setRobotId(e.target.value)}
          >
            {robots.map((r) => (
              <option key={r.id} value={r.id}>
                {r.displayName}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <nav className="flex flex-col gap-0.5">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="bob-nav-item"
            data-active={isActive(l.href) ? "true" : "false"}
          >
            <span className="flex-1">{l.label}</span>
            {l.badgeKey === "inbox" && unread > 0 ? (
              <span className="inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-[var(--bob-danger)] text-white text-[11px] font-semibold px-1.5">
                {unread}
              </span>
            ) : null}
          </Link>
        ))}

        {featureLinks.length > 0 ? (
          <div className="mt-3 pt-3 border-t border-[var(--bob-line)]">
            <p className="bob-label mb-1.5 px-2">Appuntamenti</p>
            {featureLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="bob-nav-item"
                data-active={isActive(l.href) ? "true" : "false"}
              >
                {l.label}
              </Link>
            ))}
          </div>
        ) : null}

        {moduleLinks.length > 0 ? (
          <div className="mt-3 pt-3 border-t border-[var(--bob-line)]">
            <button
              type="button"
              className="bob-nav-item w-full text-left"
              onClick={() => setModulesOpen((v) => !v)}
            >
              <span className="flex-1">Moduli</span>
              <span className="text-[var(--bob-muted)] text-xs">
                {modulesOpen ? "−" : "+"}
              </span>
            </button>
            {modulesOpen ||
            moduleLinks.some((m) => pathname.startsWith(m.href)) ? (
              <div className="mt-0.5 ml-2 flex flex-col gap-0.5 border-l border-[var(--bob-line)] pl-2">
                {moduleLinks.map((m) => (
                  <Link
                    key={m.href}
                    href={m.href}
                    className="bob-nav-item"
                    data-active={
                      pathname.startsWith(m.href) ? "true" : "false"
                    }
                  >
                    {m.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </nav>

      <div className="mt-auto pt-6 flex flex-col gap-2">
        {backToSuper ? (
          <button
            type="button"
            onClick={leaveClientPanel}
            className="bob-btn-secondary px-3 py-2.5 text-sm"
          >
            Torna a Super Admin
          </button>
        ) : null}
        <button
          type="button"
          onClick={logout}
          className="bob-btn-secondary px-3 py-2.5 text-sm"
        >
          Esci
        </button>
      </div>
    </>
  );

  return (
    <Ctx.Provider value={value}>
      <div className="min-h-screen lg:flex">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex w-[248px] shrink-0 flex-col border-r border-[var(--bob-line)] bg-[var(--bob-surface)] px-4 py-6 sticky top-0 h-screen">
          {nav}
        </aside>

        {/* Mobile top bar */}
        <div className="lg:hidden border-b border-[var(--bob-line)] bg-[var(--bob-surface)]">
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="bob-eyebrow">BOB · {roleLabel}</p>
              <p className="text-sm text-[var(--bob-muted)] truncate">
                {operatorName}
              </p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="bob-btn-secondary px-3 py-1.5 text-sm shrink-0"
            >
              Esci
            </button>
          </div>
          <div className="px-3 pb-3 flex gap-1 overflow-x-auto">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="bob-nav-item whitespace-nowrap shrink-0"
                data-active={isActive(l.href) ? "true" : "false"}
              >
                {l.label}
                {l.badgeKey === "inbox" && unread > 0 ? (
                  <span className="ml-1 text-[11px] font-semibold text-[var(--bob-danger)]">
                    {unread}
                  </span>
                ) : null}
              </Link>
            ))}
            {moduleLinks.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className="bob-nav-item whitespace-nowrap shrink-0"
                data-active={pathname.startsWith(m.href) ? "true" : "false"}
              >
                {m.label}
              </Link>
            ))}
          </div>
          {withRobotSelect && robots.length > 0 ? (
            <div className="px-4 pb-3">
              <select
                className="bob-input text-sm"
                value={robotId}
                onChange={(e) => setRobotId(e.target.value)}
              >
                {robots.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.displayName}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        <main className="flex-1 min-w-0">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 lg:py-10">
            {children}
          </div>
        </main>
      </div>
    </Ctx.Provider>
  );
}
