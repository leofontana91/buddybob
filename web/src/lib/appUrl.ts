/** Canonical production domain (custom Vercel host). */
export const CANONICAL_APP_HOST = "buddybob.app";
export const CANONICAL_APP_URL = `https://${CANONICAL_APP_HOST}`;

/**
 * Public site URL for emails, pairing, booking links, and APK config.
 * Always prefers buddybob.app in production — unique *.vercel.app hosts get paused.
 */
export function publicAppUrl(req?: Request): string {
  const explicit = normalizeUrl(process.env.NEXT_PUBLIC_APP_URL);
  if (explicit && isUsablePublicUrl(explicit)) {
    return canonicalizeIfOurs(explicit);
  }

  if (isProduction()) {
    return CANONICAL_APP_URL;
  }

  if (req) {
    try {
      const origin = new URL(req.url).origin;
      if (isUsablePublicUrl(origin)) return canonicalizeIfOurs(origin.replace(/\/$/, ""));
    } catch {
      /* ignore */
    }
  }

  return "http://localhost:3000";
}

/** Booking / config URLs: rewrite stale Vercel or emulator hosts to the canonical app. */
export function publicPathUrl(path: string, req?: Request): string {
  const base = publicAppUrl(req);
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

export function rewriteStaleAppUrl(
  stored: string | null | undefined,
  fallbackPath: string,
  req?: Request
): string {
  const fallback = publicPathUrl(fallbackPath, req);
  if (!stored?.trim()) return fallback;
  if (isStaleAppHost(stored)) return fallback;
  return stored.replace(/\/$/, "");
}

function isProduction(): boolean {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

function normalizeUrl(raw?: string | null): string {
  return (raw ?? "").trim().replace(/\/$/, "");
}

function hostnameOf(url: string): string {
  try {
    const href = /^(https?:)?\/\//i.test(url) ? url : `https://${url}`;
    return new URL(href).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function canonicalizeIfOurs(url: string): string {
  const host = hostnameOf(url);
  if (host === CANONICAL_APP_HOST || host === `www.${CANONICAL_APP_HOST}`) {
    return CANONICAL_APP_URL;
  }
  return url;
}

function isPausedDeploymentHost(url: string): boolean {
  // Unique Vercel deployment: project-<hash>-team.vercel.app
  return /-[a-z0-9]{8,}-[a-z0-9-]+\.vercel\.app/i.test(url);
}

function isVercelAppHost(url: string): boolean {
  return hostnameOf(url).endsWith(".vercel.app");
}

export function isStaleAppHost(url: string): boolean {
  const host = hostnameOf(url);
  if (!host) return true;
  if (host === "localhost" || host === "127.0.0.1" || host === "10.0.2.2") {
    return true;
  }
  if (isPausedDeploymentHost(url) || isVercelAppHost(url)) return true;
  return false;
}

function isUsablePublicUrl(url: string): boolean {
  if (!url) return false;
  if (isStaleAppHost(url)) return false;
  return true;
}
