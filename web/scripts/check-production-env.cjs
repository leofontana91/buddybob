/**
 * Fails the build on Vercel/production if AUTH_SECRET is missing or weak.
 */
const isProd =
  process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

if (isProd) {
  const secret = process.env.AUTH_SECRET?.trim() ?? "";
  const devFallback = "buddybob-dev-secret-change-me";

  if (!secret || secret.length < 32) {
    console.error(
      "[check-production-env] AUTH_SECRET mancante o < 32 caratteri. " +
        "Aggiungilo in Vercel → Settings → Environment Variables."
    );
    process.exit(1);
  }
  if (secret === devFallback) {
    console.error(
      "[check-production-env] AUTH_SECRET non può essere il valore di default."
    );
    process.exit(1);
  }
  console.log("[check-production-env] AUTH_SECRET ok");
}
