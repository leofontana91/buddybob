import { ensureSeedIfEmpty } from "../src/lib/ensureSeed";

if (
  process.env.NODE_ENV === "production" &&
  process.env.ALLOW_DEMO_SEED !== "true"
) {
  console.log("[seed-if-empty] skipped in production");
  process.exit(0);
}

ensureSeedIfEmpty()
  .then((r) => {
    if (r.seeded) console.log("[seed-if-empty] demo data created");
    else console.log("[seed-if-empty] database already has accounts");
  })
  .catch((e) => {
    console.error("[seed-if-empty] failed", e);
    process.exit(1);
  });
