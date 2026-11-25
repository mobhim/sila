// Runs the demo seed during a deploy build only when ALLOW_DEMO_SEED=true (demo/staging sites).
import { execSync } from "node:child_process";
if (process.env.ALLOW_DEMO_SEED === "true") {
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
} else {
  console.log("Demo seed skipped (ALLOW_DEMO_SEED is not true).");
}
