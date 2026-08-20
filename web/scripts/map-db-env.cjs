/**
 * Maps Vercel↔Supabase integration env vars to what Prisma expects.
 * Run as: node scripts/map-db-env.cjs <command> [args...]
 *
 * Integration typically provides:
 *   POSTGRES_PRISMA_URL      — pooled (port 6543)  → DATABASE_URL
 *   POSTGRES_URL_NON_POOLING — direct  (port 5432) → DIRECT_URL
 */
const { spawnSync } = require("child_process");

function first(...vals) {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

const pooled = first(
  process.env.DATABASE_URL,
  process.env.POSTGRES_PRISMA_URL,
  process.env.POSTGRES_URL
);
const direct = first(
  process.env.DIRECT_URL,
  process.env.POSTGRES_URL_NON_POOLING,
  // Last resort: same as pooled (may hang on DDL against pgbouncer)
  pooled
);

process.env.DATABASE_URL = pooled;
process.env.DIRECT_URL = direct;

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log("DATABASE_URL set:", Boolean(process.env.DATABASE_URL));
  console.log("DIRECT_URL set:", Boolean(process.env.DIRECT_URL));
  console.log(
    "DIRECT looks non-pooled:",
    !/:(6543)\b/.test(process.env.DIRECT_URL || "")
  );
  process.exit(0);
}

// prisma db push / migrate need the direct connection. Force it onto
// DATABASE_URL as well so even older Prisma paths don't hit :6543.
const joined = args.join(" ");
const isSchemaSync =
  /\bdb\s+push\b/.test(joined) ||
  /\bmigrate\b/.test(joined) ||
  args.includes("db") && (args.includes("push") || args.includes("migrate"));

if (isSchemaSync && direct) {
  process.env.DATABASE_URL = direct;
  console.log(
    "[map-db-env] schema sync → using DIRECT_URL host",
    (() => {
      try {
        return new URL(direct.replace(/^prisma\+?/, "")).host;
      } catch {
        return "(unparsed)";
      }
    })()
  );
}

const result = spawnSync(args[0], args.slice(1), {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
