function requireEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(
      `Missing env var ${name}. Needed for Android OTA Storage admin calls.`
    );
  }
  return value;
}

function firstEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const v = process.env[name]?.trim();
    if (v) return v;
  }
  return undefined;
}

function supabaseUrl(): string {
  return requireEnv(
    "SUPABASE_URL",
    firstEnv("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")
  );
}

function supabaseServiceRoleKey(): string {
  // Vercel↔Supabase: older integration uses SERVICE_ROLE_KEY,
  // Marketplace often injects SUPABASE_SECRET_KEY.
  return requireEnv(
    "SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY",
    firstEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY")
  );
}

function androidApkBucket(): string {
  return (
    firstEnv("SUPABASE_ANDROID_APK_BUCKET") ?? "bob-android-apks"
  );
}

const DEFAULT_SIGNED_URL_TTL_SEC = 60 * 60; // 1 hour

function signedUrlTtlSec(): number {
  return Number.parseInt(
    process.env.ANDROID_UPDATE_SIGNED_URL_TTL_SEC ??
      String(DEFAULT_SIGNED_URL_TTL_SEC),
    10
  );
}

/**
 * Aggiunge/sostituisce `token` una sola volta (evita token=a&token=b → 400 Supabase).
 */
export function withStorageUploadToken(
  uploadUrl: string,
  token: string
): string {
  const t = String(token || "").trim();
  if (!t) return uploadUrl;
  const u = new URL(uploadUrl);
  u.searchParams.set("token", t);
  return u.toString();
}

function encodeObjectPath(objectPath: string): string {
  // Encode each path segment but keep slashes for nested folder support.
  return objectPath
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

/**
 * Supabase often returns relative paths like `/object/sign/...`.
 * They must be under `/storage/v1`, not at the project root.
 */
export function absoluteStorageUrl(relativeOrAbsolute: string): string {
  const raw = relativeOrAbsolute.trim();
  if (!raw) throw new Error("Empty Storage URL");
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = supabaseUrl().replace(/\/$/, "");
  if (raw.startsWith("/storage/v1/")) return `${base}${raw}`;
  if (raw.startsWith("storage/v1/")) return `${base}/${raw}`;
  if (raw.startsWith("/object/")) return `${base}/storage/v1${raw}`;
  if (raw.startsWith("object/")) return `${base}/storage/v1/${raw}`;
  return `${base}/storage/v1/${raw.replace(/^\//, "")}`;
}

export async function createSignedApkUrl(params: {
  objectPath: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const { objectPath, expiresInSeconds } = params;
  const url =
    `${supabaseUrl()}/storage/v1/object/sign/` +
    `${encodeObjectPath(androidApkBucket())}/` +
    `${encodeObjectPath(objectPath)}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      apikey: supabaseServiceRoleKey(),
      Authorization: `Bearer ${supabaseServiceRoleKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      expiresIn:
        expiresInSeconds ?? signedUrlTtlSec(),
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `Supabase Storage signed URL failed (${resp.status}): ${text}`
    );
  }

  const data = (await resp.json()) as { signedURL?: string };
  if (!data.signedURL) {
    throw new Error("Supabase Storage signed URL missing in response");
  }
  return absoluteStorageUrl(data.signedURL);
}

export async function ensureAndroidApkBucket(): Promise<void> {
  const bucket = androidApkBucket();
  const resp = await fetch(`${supabaseUrl()}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      apikey: supabaseServiceRoleKey(),
      Authorization: `Bearer ${supabaseServiceRoleKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: bucket,
      name: bucket,
      public: false,
      file_size_limit: 157_286_400,
    }),
  });
  if (resp.ok || resp.status === 409) return;
  const text = await resp.text().catch(() => "");
  if (/already exists|duplicate/i.test(text)) return;
  throw new Error(`Bucket Storage ${bucket}: HTTP ${resp.status} ${text}`);
}

export async function uploadApkObject(params: {
  objectPath: string;
  body: ArrayBuffer;
}): Promise<void> {
  await ensureAndroidApkBucket();
  const url =
    `${supabaseUrl()}/storage/v1/object/` +
    `${encodeObjectPath(androidApkBucket())}/` +
    `${encodeObjectPath(params.objectPath)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      apikey: supabaseServiceRoleKey(),
      Authorization: `Bearer ${supabaseServiceRoleKey()}`,
      "Content-Type": "application/octet-stream",
      "x-upsert": "true",
      "cache-control": "3600",
    },
    body: params.body,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Upload Storage fallito (${resp.status}): ${text}`);
  }
}

export async function createSignedUploadUrl(params: {
  objectPath: string;
  expiresInSeconds?: number;
}): Promise<{ uploadUrl: string; token: string; path: string }> {
  await ensureAndroidApkBucket();
  const { objectPath } = params;
  const url =
    `${supabaseUrl()}/storage/v1/object/upload/sign/` +
    `${encodeObjectPath(androidApkBucket())}/` +
    `${encodeObjectPath(objectPath)}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      apikey: supabaseServiceRoleKey(),
      Authorization: `Bearer ${supabaseServiceRoleKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `Supabase Storage signed upload URL failed (${resp.status}): ${text}`
    );
  }

  const data = (await resp.json()) as {
    url?: string;
    token?: string;
    path?: string;
    signedURL?: string;
  };
  const token = String(data.token ?? "").trim();
  if (!token) {
    throw new Error("Supabase signed upload token missing");
  }
  const relative = data.url || data.signedURL || "";
  const uploadUrl = withStorageUploadToken(
    absoluteStorageUrl(
      relative ||
        `/object/upload/sign/${encodeObjectPath(androidApkBucket())}/${encodeObjectPath(objectPath)}`
    ),
    token
  );
  return {
    uploadUrl,
    token,
    path: data.path || objectPath,
  };
}

function placeMediaBucket(): string {
  return firstEnv("SUPABASE_PLACE_MEDIA_BUCKET") ?? "bob-place-media";
}

export function publicPlaceMediaUrl(objectPath: string): string {
  const base = supabaseUrl().replace(/\/$/, "");
  return (
    `${base}/storage/v1/object/public/` +
    `${encodeObjectPath(placeMediaBucket())}/` +
    `${encodeObjectPath(objectPath)}`
  );
}

/** Estrae il path oggetto da un URL pubblico, signed o proxy buddybob. */
export function objectPathFromPlaceMediaUrl(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  try {
    const parsed = new URL(u);
    if (parsed.pathname.includes("/api/media/place")) {
      const p = parsed.searchParams.get("path")?.trim();
      if (p?.startsWith("place-media/")) return p;
    }
  } catch {
    /* not absolute */
  }
  const bucket = placeMediaBucket();
  const markers = [
    `/storage/v1/object/public/${bucket}/`,
    `/storage/v1/object/sign/${bucket}/`,
    `/storage/v1/object/${bucket}/`,
    `/object/public/${bucket}/`,
    `/object/sign/${bucket}/`,
  ];
  for (const m of markers) {
    const i = u.indexOf(m);
    if (i >= 0) {
      const rest = u.slice(i + m.length).split("?")[0] || "";
      try {
        return decodeURIComponent(rest);
      } catch {
        return rest;
      }
    }
  }
  return null;
}

/**
 * Scarica un oggetto Storage con la service role (funziona anche se il bucket
 * non è pubblico — evita 404 su /object/public/... dopo l'upload).
 */
export async function downloadPlaceMediaObject(
  objectPath: string
): Promise<Buffer> {
  const url =
    `${supabaseUrl()}/storage/v1/object/` +
    `${encodeObjectPath(placeMediaBucket())}/` +
    `${encodeObjectPath(objectPath)}`;

  let lastStatus = 0;
  let lastBody = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
    const resp = await fetch(url, {
      headers: {
        apikey: supabaseServiceRoleKey(),
        Authorization: `Bearer ${supabaseServiceRoleKey()}`,
      },
    });
    if (resp.ok) {
      return Buffer.from(await resp.arrayBuffer());
    }
    lastStatus = resp.status;
    lastBody = await resp.text().catch(() => "");
    if (resp.status !== 404 && resp.status !== 400) break;
  }
  throw new Error(
    `Storage download HTTP ${lastStatus}: ${lastBody.slice(0, 200)}`
  );
}

export async function ensurePlaceMediaBucket(): Promise<void> {
  const bucket = placeMediaBucket();
  const create = await fetch(`${supabaseUrl()}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      apikey: supabaseServiceRoleKey(),
      Authorization: `Bearer ${supabaseServiceRoleKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: bucket,
      name: bucket,
      public: true,
      file_size_limit: 52_428_800,
    }),
  });
  if (create.ok) return;
  const text = await create.text().catch(() => "");
  if (create.status !== 409 && !/already exists|duplicate/i.test(text)) {
    throw new Error(`Bucket Storage ${bucket}: HTTP ${create.status} ${text}`);
  }
  // Esisteva già (magari privato): forza pubblico
  const upd = await fetch(`${supabaseUrl()}/storage/v1/bucket/${bucket}`, {
    method: "PUT",
    headers: {
      apikey: supabaseServiceRoleKey(),
      Authorization: `Bearer ${supabaseServiceRoleKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      public: true,
      file_size_limit: 52_428_800,
    }),
  });
  if (!upd.ok && upd.status !== 409) {
    const t = await upd.text().catch(() => "");
    // Non bloccare l'upload se il PATCH fallisce: useremo signed URL
    console.warn(`Bucket ${bucket} public update: HTTP ${upd.status} ${t}`);
  }
}

/** URL firmato in lettura (funziona anche con bucket privato). */
export async function createSignedPlaceMediaReadUrl(
  objectPath: string,
  expiresInSeconds = 60 * 60 * 24 * 14
): Promise<string> {
  const url =
    `${supabaseUrl()}/storage/v1/object/sign/` +
    `${encodeObjectPath(placeMediaBucket())}/` +
    `${encodeObjectPath(objectPath)}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      apikey: supabaseServiceRoleKey(),
      Authorization: `Bearer ${supabaseServiceRoleKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: expiresInSeconds }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `Supabase signed read URL failed (${resp.status}): ${text.slice(0, 200)}`
    );
  }
  const data = (await resp.json()) as {
    signedURL?: string;
    signedUrl?: string;
    url?: string;
  };
  const relative = data.signedURL || data.signedUrl || data.url || "";
  if (!relative) throw new Error("Supabase signed read URL missing");
  return absoluteStorageUrl(relative);
}

/**
 * URL leggibile dal browser/robot: prova pubblico, altrimenti signed.
 * Verifica che l'oggetto esista (service role).
 */
export async function resolveReadablePlaceMediaUrl(
  objectPath: string
): Promise<string> {
  await downloadPlaceMediaObject(objectPath);
  await ensurePlaceMediaBucket();
  const publicUrl = publicPlaceMediaUrl(objectPath);
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 350 * attempt));
    }
    const head = await fetch(publicUrl, { method: "HEAD" }).catch(() => null);
    if (head?.ok) return publicUrl;
    const get = await fetch(publicUrl, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
    }).catch(() => null);
    if (get?.ok || get?.status === 206) return publicUrl;
  }
  return createSignedPlaceMediaReadUrl(objectPath);
}

export async function createSignedPlaceMediaUploadUrl(params: {
  objectPath: string;
}): Promise<{ uploadUrl: string; token: string; path: string }> {
  await ensurePlaceMediaBucket();
  const { objectPath } = params;
  const url =
    `${supabaseUrl()}/storage/v1/object/upload/sign/` +
    `${encodeObjectPath(placeMediaBucket())}/` +
    `${encodeObjectPath(objectPath)}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      apikey: supabaseServiceRoleKey(),
      Authorization: `Bearer ${supabaseServiceRoleKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `Supabase Storage signed upload URL failed (${resp.status}): ${text}`
    );
  }

  const data = (await resp.json()) as {
    url?: string;
    token?: string;
    path?: string;
    signedURL?: string;
  };
  const token = String(data.token ?? "").trim();
  if (!token) {
    throw new Error("Supabase signed upload token missing");
  }
  const relative = data.url || data.signedURL || "";
  const uploadUrl = withStorageUploadToken(
    absoluteStorageUrl(
      relative ||
        `/object/upload/sign/${encodeObjectPath(placeMediaBucket())}/${encodeObjectPath(objectPath)}`
    ),
    token
  );
  return {
    uploadUrl,
    token,
    path: data.path || objectPath,
  };
}

/** Alias: i memo vocali usano lo stesso bucket pubblico place-media. */
export const createSignedVoiceMemoUploadUrl = createSignedPlaceMediaUploadUrl;
export const publicVoiceMemoUrl = publicPlaceMediaUrl;


