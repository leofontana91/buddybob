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

function encodeObjectPath(objectPath: string): string {
  // Encode each path segment but keep slashes for nested folder support.
  return objectPath
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
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
  const signed = data.signedURL;
  if (signed.startsWith("http://") || signed.startsWith("https://")) {
    return signed;
  }
  const base = supabaseUrl().replace(/\/$/, "");
  return signed.startsWith("/") ? `${base}${signed}` : `${base}/${signed}`;
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
  const token = data.token;
  if (!token) {
    throw new Error("Supabase signed upload token missing");
  }
  const relative = data.url || data.signedURL || "";
  const base = supabaseUrl().replace(/\/$/, "");
  const uploadUrl = relative.startsWith("http")
    ? relative
    : `${base}${relative.startsWith("/") ? "" : "/"}${relative}`;
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

export async function ensurePlaceMediaBucket(): Promise<void> {
  const bucket = placeMediaBucket();
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
      public: true,
      file_size_limit: 52_428_800,
    }),
  });
  if (resp.ok || resp.status === 409) return;
  const text = await resp.text().catch(() => "");
  if (/already exists|duplicate/i.test(text)) return;
  throw new Error(`Bucket Storage ${bucket}: HTTP ${resp.status} ${text}`);
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
  const token = data.token;
  if (!token) {
    throw new Error("Supabase signed upload token missing");
  }
  const relative = data.url || data.signedURL || "";
  const base = supabaseUrl().replace(/\/$/, "");
  const uploadUrl = relative.startsWith("http")
    ? relative
    : `${base}${relative.startsWith("/") ? "" : "/"}${relative}`;
  return {
    uploadUrl,
    token,
    path: data.path || objectPath,
  };
}

/** Alias: i memo vocali usano lo stesso bucket pubblico place-media. */
export const createSignedVoiceMemoUploadUrl = createSignedPlaceMediaUploadUrl;
export const publicVoiceMemoUrl = publicPlaceMediaUrl;


