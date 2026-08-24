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

  return (
    <Ctx.Provider value={value}>
      <div className="min-h-screen">
        <header className="border-b border-[var(--bob-line)] bg-white">
          <div className="mx-auto max-w-6xl px-4 py-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs tracking-[0.18em] uppercase text-[var(--bob-navy)] font-semibold">
                BOB · {roleLabel}
              </p>
              <p className="text-sm text-[var(--bob-muted)]">{operatorName}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {withRobotSelect && robots.length > 0 ? (
                <select
                  className="rounded-full border border-[var(--bob-line)] px-3 py-2 text-sm bg-[var(--bob-cream)]"
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
              <nav className="flex flex-wrap items-center gap-1">
                {links.map((l) => {
                  const active =
                    l.href === "/admin"
                      ? pathname === "/admin"
                      : pathname.startsWith(l.href);
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      className={`px-3 py-2 rounded-full text-sm font-medium ${
                        active ? "bob-btn" : "hover:bg-[var(--bob-cream)]"
                      }`}
                    >
                      {l.label}
                      {l.badgeKey === "inbox" && unread > 0 ? (
                        <span className="ml-2 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-red-600 text-white text-xs px-1">
                          {unread}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
                {withRobotSelect ? (
                  <div className="relative group">
                    <span className="px-3 py-2 rounded-full text-sm font-medium hover:bg-[var(--bob-cream)] cursor-default inline-block">
                      Moduli
                    </span>
                    <div className="absolute left-0 top-full z-20 hidden group-hover:block min-w-52 rounded-2xl border border-[var(--bob-line)] bg-white p-2 shadow-lg">
                      {enabledModuleLinks(modules).map((m) => (
                        <Link
                          key={m.href}
                          href={m.href}
                          className={`block rounded-xl px-3 py-2 text-sm ${
                            pathname.startsWith(m.href)
                              ? "bg-[var(--bob-cream)] font-medium"
                              : "hover:bg-[var(--bob-cream)]"
                          }`}
                        >
                          {m.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
                {backToSuper ? (
                  <button
                    type="button"
                    onClick={leaveClientPanel}
                    className="px-3 py-2 rounded-full text-sm bg-[var(--bob-navy)] text-white"
                  >
                    Torna a Super Admin
                  </button>
                ) : null}
                <button
                  onClick={logout}
                  className="ml-2 px-3 py-2 rounded-full text-sm border border-[var(--bob-line)]"
                >
                  Esci
                </button>
              </nav>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </div>
    </Ctx.Provider>
  );
}
