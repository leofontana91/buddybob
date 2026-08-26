/** Sensibilità rilevazione ospite (1 = solo molto vicino, 5 = anche lontano). */
export function detectLevelToMeters(level: number): number {
  const n = Math.min(5, Math.max(1, Math.round(level) || 2));
  // Soglie conservative: evita saluti su movimento lontano / laterale
  return ([1.0, 1.4, 1.8, 2.4, 3.2] as const)[n - 1];
}

export function detectLevelToAngleDeg(level: number): number {
  const n = Math.min(5, Math.max(1, Math.round(level) || 2));
  return ([25, 30, 35, 42, 50] as const)[n - 1];
}

export const DETECT_LEVEL_LABELS: Record<number, string> = {
  1: "Molto vicino (~1 m)",
  2: "Vicino (~1,4 m)",
  3: "Medio (~1,8 m)",
  4: "Lontano (~2,4 m)",
  5: "Molto lontano (~3,2 m)",
};
