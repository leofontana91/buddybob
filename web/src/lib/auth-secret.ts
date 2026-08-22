/**
 * Resolves the JWT signing secret. In production AUTH_SECRET is mandatory.
 */
export function getAuthSecret(): Uint8Array {
  const raw = process.env.AUTH_SECRET?.trim();
  const devFallback = "buddybob-dev-secret-change-me";

  if (process.env.NODE_ENV === "production") {
    if (!raw || raw.length < 32) {
      throw new Error(
        "AUTH_SECRET mancante o troppo corto: imposta almeno 32 caratteri random su Vercel."
      );
    }
    if (raw === devFallback) {
      throw new Error(
        "AUTH_SECRET non può usare il valore di default in produzione."
      );
    }
    return new TextEncoder().encode(raw);
  }

  return new TextEncoder().encode(raw || devFallback);
}
