import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateRobotRequest } from "@/lib/auth";
import { createSignedApkUrl } from "@/lib/supabaseStorageAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Candidate = {
  scope: "robot" | "global";
  versionName: string;
  versionCode: number | null;
  notes: string | null;
  storagePath: string;
  sha256: string | null;
  createdAt: Date;
};

function compareVersionNames(a: string, b: string): number {
  // Best-effort semver-ish compare: assumes dot-separated numeric segments.
  // If parsing fails, falls back to locale string compare.
  const aParts = a.split(".").map((s) => Number(s));
  const bParts = b.split(".").map((s) => Number(s));
  const aOk = aParts.every((n) => Number.isFinite(n));
  const bOk = bParts.every((n) => Number.isFinite(n));
  if (!aOk || !bOk) return a.localeCompare(b, "en", { numeric: true });

  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const av = aParts[i] ?? 0;
    const bv = bParts[i] ?? 0;
    if (av !== bv) return av > bv ? 1 : -1;
  }
  return 0;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: robotId } = await ctx.params;

  const robot = await authenticateRobotRequest(
    robotId,
    req.headers.get("authorization")
  );
  if (!robot) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [robotReleases, globalReleases] = await Promise.all([
    prisma.robotAndroidRelease.findMany({
      where: { robotId, isActive: true },
      take: 50,
    }),
    prisma.globalAndroidRelease.findMany({
      where: { isActive: true },
      take: 50,
    }),
  ]);

  const candidates: Candidate[] = [
    ...robotReleases.map((r) => ({
      scope: "robot" as const,
      versionName: r.versionName,
      versionCode: r.versionCode,
      notes: r.notes,
      storagePath: r.storagePath,
      sha256: r.sha256,
      createdAt: r.createdAt,
    })),
    ...globalReleases.map((r) => ({
      scope: "global" as const,
      versionName: r.versionName,
      versionCode: r.versionCode,
      notes: r.notes,
      storagePath: r.storagePath,
      sha256: r.sha256,
      createdAt: r.createdAt,
    })),
  ];

  let best: Candidate | null = null;
  for (const c of candidates) {
    if (!best) {
      best = c;
      continue;
    }
    const cmp = compareVersionNames(c.versionName, best.versionName);
    if (cmp > 0) {
      best = c;
      continue;
    }
    if (
      cmp === 0 &&
      c.scope === "robot" &&
      best.scope === "global"
    ) {
      best = c;
    }
  }

  if (!best) {
    return NextResponse.json({ robotId, release: null });
  }

  const apkUrl = await createSignedApkUrl({
    objectPath: best.storagePath,
  });

  return NextResponse.json({
    robotId,
    release: {
      scope: best.scope,
      versionName: best.versionName,
      versionCode: best.versionCode,
      notes: best.notes,
      sha256: best.sha256,
      createdAt: best.createdAt.toISOString(),
      apkUrl,
    },
  });
}

