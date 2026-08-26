/** Sensibilità rilevazione ospite (1 = solo molto vicino, 5 = anche lontano). */
export function detectLevelToMeters(level: number): number {
  const n = Math.min(5, Math.max(1, Math.round(level) || 3));
  return ([1.2, 1.8, 2.5, 3.5, 4.5] as const)[n - 1];
}

export function detectLevelToAngleDeg(level: number): number {
  const n = Math.min(5, Math.max(1, Math.round(level) || 3));
  return ([35, 45, 55, 65, 75] as const)[n - 1];
}

export const DETECT_LEVEL_LABELS: Record<number, string> = {
  1: "Molto vicino (~1,2 m)",
  2: "Vicino (~1,8 m)",
  3: "Medio (~2,5 m)",
  4: "Lontano (~3,5 m)",
  5: "Molto lontano (~4,5 m)",
};
