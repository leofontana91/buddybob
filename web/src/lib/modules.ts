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
  charge: false,
  settings: true,
};

export const MODULE_LABELS: Record<keyof AdminModules, string> = {
  reception: "Accoglienza",
  appointments: "Appuntamenti",
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

export function parseModules(json: string | null | undefined): AdminModules {
  try {
    const raw = json ? JSON.parse(json) : {};
    return { ...DEFAULT_ADMIN_MODULES, ...raw };
  } catch {
    return { ...DEFAULT_ADMIN_MODULES };
  }
}

export function stringifyModules(modules: Partial<AdminModules>): string {
  return JSON.stringify({ ...DEFAULT_ADMIN_MODULES, ...modules });
}
