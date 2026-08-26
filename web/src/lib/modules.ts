/** Default / known module flags for an Admin (azienda). */
export type AdminModules = {
  reception: boolean;
  appointments: boolean;
  goTo: boolean;
  motion: boolean;
  speech: boolean;
  follow: boolean;
  documents: boolean;
  games: boolean;
  callOperator: boolean;
  voiceMemos: boolean;
  accessControl: boolean;
  charge: boolean;
  settings: boolean;
};

/**
 * Capacità di serie su ogni robot: non si vendono / non si spengono come moduli.
 * Restano nel tipo per compatibilità col config APK.
 */
export const CORE_ALWAYS_ON = ["motion", "follow", "charge"] as const;
export type CoreAlwaysOnKey = (typeof CORE_ALWAYS_ON)[number];

export const DEFAULT_ADMIN_MODULES: AdminModules = {
  reception: true,
  appointments: true,
  goTo: true,
  motion: true,
  speech: true,
  follow: true,
  documents: true,
  games: true,
  callOperator: true,
  voiceMemos: true,
  accessControl: true,
  charge: true,
  settings: true,
};

export const MODULE_LABELS: Record<keyof AdminModules, string> = {
  reception: "Accoglienza",
  appointments: "Impostazioni appuntamenti",
  goTo: "Vai a…",
  motion: "Movimento",
  speech: "Voce / Parla con me",
  follow: "Segui",
  documents: "Documenti",
  games: "Giochi",
  callOperator: "Chiama operatore",
  voiceMemos: "Memo vocali",
  accessControl: "Controllo accessi",
  charge: "Ricarica",
  settings: "Impostazioni tecniche",
};

/** Moduli che Super Admin può ancora abilitare/disabilitare per azienda. */
export const TOGGLEABLE_MODULE_KEYS = (
  Object.keys(MODULE_LABELS) as (keyof AdminModules)[]
).filter((k) => !CORE_ALWAYS_ON.includes(k as CoreAlwaysOnKey));

/** Admin pages that configure a module (niente link per le core always-on). */
export const MODULE_ADMIN_HREF: Partial<Record<keyof AdminModules, string>> = {
  reception: "/admin/modules/reception",
  appointments: "/admin/modules/appointments",
  goTo: "/admin/modules/goto",
  documents: "/admin/documents",
  accessControl: "/admin/access",
  speech: "/admin/modules/speech",
  callOperator: "/admin/modules/operator",
  games: "/admin/modules/games",
  voiceMemos: "/admin/modules/memos",
};

function withCoreAlwaysOn(modules: AdminModules): AdminModules {
  return {
    ...modules,
    motion: true,
    follow: true,
    charge: true,
  };
}

export function enabledModuleLinks(modules: AdminModules) {
  return (Object.keys(MODULE_ADMIN_HREF) as (keyof AdminModules)[])
    .filter((key) => modules[key])
    .map((key) => ({
      key,
      href: MODULE_ADMIN_HREF[key] as string,
      label: MODULE_LABELS[key],
    }));
}

export function parseModules(json: string | null | undefined): AdminModules {
  try {
    const raw = json ? JSON.parse(json) : {};
    return withCoreAlwaysOn({ ...DEFAULT_ADMIN_MODULES, ...raw });
  } catch {
    return { ...DEFAULT_ADMIN_MODULES };
  }
}

export function stringifyModules(modules: Partial<AdminModules>): string {
  return JSON.stringify(
    withCoreAlwaysOn({ ...DEFAULT_ADMIN_MODULES, ...modules })
  );
}
