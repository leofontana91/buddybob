import { createHmac, timingSafeEqual } from "crypto";
import { publicAppUrl } from "./appUrl";
import { getAuthSecret } from "./auth-secret";

function secretString(): string {
  return new TextDecoder().decode(getAuthSecret());
}

export function signPlaceMediaAccess(
  objectPath: string,
  expiresUnix: number
): string {
  return createHmac("sha256", secretString())
    .update(`${objectPath}|${expiresUnix}`)
    .digest("hex");
}

export function verifyPlaceMediaAccess(
  objectPath: string,
  expiresUnix: number,
  sig: string
): boolean {
  if (!objectPath || !sig || !expiresUnix) return false;
  if (expiresUnix < Math.floor(Date.now() / 1000)) return false;
  const expected = signPlaceMediaAccess(objectPath, expiresUnix);
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(sig, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** URL sul nostro dominio: funziona per ImageView/VideoView senza auth header. */
export function placeMediaProxyUrl(
  objectPath: string,
  req?: Request,
  ttlSec = 60 * 60 * 24 * 14
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = signPlaceMediaAccess(objectPath, exp);
  const q = new URLSearchParams({
    path: objectPath,
    exp: String(exp),
    sig,
  });
  return `${publicAppUrl(req)}/api/media/place?${q.toString()}`;
}

export function guessPlaceMediaContentType(objectPath: string): string {
  const lower = objectPath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  return "application/octet-stream";
}
