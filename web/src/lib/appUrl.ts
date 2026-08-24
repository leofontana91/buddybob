/**
 * Public site URL for emails, pairing, booking links.
 * Prefer the stable Production host — unique deployment URLs get paused by Vercel.
 */
export function publicAppUrl(req?: Request): string {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(
    /^https?:\/\//,
    ""
  );
  if (production) {
    return `https://${production.replace(/\/$/, "")}`;
  }

  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (explicit && !isPausedDeploymentHost(explicit)) {
    return explicit;
  }

  if (req) {
    try {
      const origin = new URL(req.url).origin;
      if (!isPausedDeploymentHost(origin)) return origin;
    } catch {
      /* ignore */
    }
  }

  if (explicit) return explicit;
  return "http://localhost:3000";
}

function isPausedDeploymentHost(url: string): boolean {
  // Unique Vercel deployment: project-<hash>-team.vercel.app
  return /-[a-z0-9]{8,}-[a-z0-9-]+\.vercel\.app/i.test(url);
}
