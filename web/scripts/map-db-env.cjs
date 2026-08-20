/**
 * Maps Vercel↔Supabase integration env vars to what Prisma expects.
 * Run as: node scripts/map-db-env.cjs <command> [args...]
 */
const { spawnSync } = require("child_process");

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    "";
}

if (!process.env.DIRECT_URL) {
  process.env.DIRECT_URL =
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    "";
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log(
    "DATABASE_URL set:",
    Boolean(process.env.DATABASE_URL),
    "from integration:",
    Boolean(process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL)
  );
  process.exit(0);
}

const result = spawnSync(args[0], args.slice(1), {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
