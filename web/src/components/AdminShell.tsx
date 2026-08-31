"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BrandLogo } from "@/components/bob/BrandLogo";
import { NavPill } from "@/components/bob/NavPill";
import { robotDotColor, type RobotPresenceState } from "@/components/bob/RobotPresence";
import {
  AdminModules,
  DEFAULT_ADMIN_MODULES,
} from "@/lib/modules";

type Robot = { id: string; displayName: string };

type RobotCtx = {
  robots: Robot[];
  robotId: string;
  setRobotId: (id: string) => void;
  reloadRobots: () => Promise<void>;
  modules: AdminModules;
  robotOnline: boolean;
  robotPresence: RobotPresenceState;
};

const Ctx = createContext<RobotCtx | null>(null);

export function useRobot() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRobot outside provider");
  return v;
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "BB";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
  const [robotOnline, setRobotOnline] = useState(false);
  const [robotPresence, setRobotPresence] =
    useState<RobotPresenceState>("offline");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [popupAlert, setPopupAlert] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

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
    setPickerOpen(false);
  }, []);

  useEffect(() => {
    if (withRobotSelect) reloadRobots();
  }, [reloadRobots, withRobotSelect]);

  useEffect(() => {
    if (!withRobotSelect || !robotId) return;
    let alive = true;
    async function poll() {
      const [aRes, sRes] = await Promise.all([
        fetch(`/api/admin/alerts?robotId=${robotId}`),
        fetch(`/api/admin/robot-status?robotId=${robotId}`),
      ]);
      if (!alive) return;
      if (aRes.ok) {
        const data = await aRes.json();
        setUnread(data.unreadCount ?? 0);
        const next = (data.popups as { id: string; message: string }[] | undefined)?.[0];
        if (next) {
          setPopupAlert((prev) =>
            prev?.id === next.id ? prev : { id: next.id, message: next.message }
          );
        }
      }
      if (sRes.ok) {
        const data = await sRes.json();
        const online = !!data.online;
        setRobotOnline(online);
        const activity = String(data.lastActivity ?? "").toLowerCase();
        if (!online) setRobotPresence("offline");
        else if (activity.includes("ricaric") || activity.includes("charg"))
          setRobotPresence("charging");
        else if (
          activity.includes("navig") ||
          activity.includes("vado") ||
          activity.includes("mov")
        )
          setRobotPresence("moving");
        else setRobotPresence("idle");
      }
    }
    poll();
    const t = setInterval(poll, 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [robotId, withRobotSelect]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (pickerRef.current && !pickerRef.current.contains(t)) {
        setPickerOpen(false);
      }
      if (userRef.current && !userRef.current.contains(t)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const value = useMemo(
    () => ({
      robots,
      robotId,
      setRobotId,
      reloadRobots,
      modules,
      robotOnline,
      robotPresence,
    }),
    [
      robots,
      robotId,
      setRobotId,
      reloadRobots,
      modules,
      robotOnline,
      robotPresence,
    ]
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

  async function dismissPopup() {
    if (!popupAlert) return;
    const id = popupAlert.id;
    setPopupAlert(null);
    await fetch("/api/admin/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
  }

  function isActive(href: string) {
    if (href === "/admin" || href === "/super" || href === "/me") {
      return pathname === href;
    }
    return pathname.startsWith(href);
  }

  const selected = robots.find((r) => r.id === robotId);
  const fullBleed =
    pathname === "/admin" ||
    pathname === "/super" ||
    pathname.startsWith("/admin/agenda") ||
    pathname.startsWith("/admin/calendar") ||
    pathname.startsWith("/admin/robot") ||
    pathname.startsWith("/admin/impostazioni");

  return (
    <Ctx.Provider value={value}>
      <div className="min-h-screen flex flex-col bg-[var(--bob-bg)] text-[var(--bob-text)]">
        <header className="sticky top-0 z-40 flex h-[72px] shrink-0 items-center gap-4 sm:gap-7 bg-[var(--bob-ink)] px-4 sm:px-7">
          <BrandLogo
            variant="dark"
            href="/admin"
            markClassName="h-10 w-auto"
            wordmarkClassName="hidden sm:block h-4 w-auto"
          />

          <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
            {links.map((l) => (
              <NavPill
                key={l.href}
                href={l.href}
                label={l.label}
                active={isActive(l.href)}
                badge={l.badgeKey === "inbox" ? unread : undefined}
              />
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            {withRobotSelect && robots.length > 0 ? (
              <div className="relative" ref={pickerRef}>
                <button
                  type="button"
                  onClick={() => setPickerOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-full border border-[#232c36] bg-[var(--bob-ink-2)] px-3.5 py-1.5 text-[#e7ecf1] whitespace-nowrap hover:border-[var(--bob-cyan)]"
                >
                  <span
                    className="h-[7px] w-[7px] rounded-full"
                    style={{ background: robotDotColor(robotPresence) }}
                  />
                  <span className="max-w-[140px] truncate text-[13px] font-medium">
                    {selected?.displayName ?? "Robot"}
                  </span>
                  <span className="text-[13px] text-[#7d8b98]">▾</span>
                </button>
                {pickerOpen ? (
                  <div className="absolute right-0 mt-2 min-w-[220px] overflow-hidden rounded-[16px] border border-[var(--bob-ink-line)] bg-[var(--bob-ink-2)] shadow-xl">
                    {robots.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] text-[#e7ecf1] hover:bg-[var(--bob-ink)]"
                        onClick={() => setRobotId(r.id)}
                      >
                        {r.displayName}
                        {r.id === robotId ? (
                          <span className="ml-auto text-[var(--bob-cyan)]">✓</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <p className="hidden md:block m-0 max-w-[160px] truncate text-[13px] text-[var(--bob-muted-2)]">
              {roleLabel}
            </p>

            <div className="relative" ref={userRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[var(--bob-ink-line)] text-[12px] font-semibold text-[#c6d0da]"
                aria-label="Menu account"
              >
                {initialsOf(operatorName)}
              </button>
              {userMenuOpen ? (
                <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-[16px] border border-[var(--bob-line)] bg-white shadow-[var(--bob-shadow-card)]">
                  <div className="border-b border-[var(--bob-line)] px-4 py-3">
                    <p className="text-[13px] font-semibold truncate">
                      {operatorName}
                    </p>
                    <p className="text-[12px] text-[var(--bob-muted)]">
                      {roleLabel}
                    </p>
                  </div>
                  {backToSuper ? (
                    <button
                      type="button"
                      className="block w-full px-4 py-2.5 text-left text-[13px] hover:bg-[var(--bob-bg)]"
                      onClick={leaveClientPanel}
                    >
                      Torna a Super Admin
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="block w-full px-4 py-2.5 text-left text-[13px] hover:bg-[var(--bob-bg)]"
                    onClick={logout}
                  >
                    Esci
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="flex-1 min-h-0 min-w-0">
          {fullBleed ? (
            children
          ) : (
            <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 lg:py-10">
              {children}
            </div>
          )}
        </main>

        {popupAlert ? (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="bob-op-popup-title"
          >
            <div className="w-full max-w-md rounded-[22px] bg-white p-6 shadow-[var(--bob-shadow-card)]">
              <p className="bob-eyebrow">Chiama operatore</p>
              <h2
                id="bob-op-popup-title"
                className="mt-2 font-[family-name:var(--font-poppins)] text-[24px] font-semibold tracking-[-0.03em]"
              >
                Serve qualcuno in reception
              </h2>
              <p className="mt-3 text-[15px] text-[var(--bob-text-2)]">
                {popupAlert.message}
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <button type="button" className="bob-btn" onClick={dismissPopup}>
                  Ci penso io
                </button>
                <button
                  type="button"
                  className="bob-btn-secondary"
                  onClick={() => {
                    dismissPopup();
                    router.push("/admin/inbox");
                  }}
                >
                  Apri Inbox
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Ctx.Provider>
  );
}
