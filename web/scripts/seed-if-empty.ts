import { ensureSeedIfEmpty } from "../src/lib/ensureSeed";

ensureSeedIfEmpty()
  .then((r) => {
    if (r.seeded) console.log("[seed-if-empty] demo data created");
    else console.log("[seed-if-empty] database already has accounts");
  })
  .catch((e) => {
    console.error("[seed-if-empty] failed", e);
    process.exit(1);
  });
