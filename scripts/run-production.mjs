import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const [command, ...args] = process.argv.slice(2);
if (!["build", "start"].includes(command)) {
  throw new Error("Expected build or start");
}

// Pass values through the environment so Next's workers do not inherit
// --env-file in NODE_OPTIONS, where Node does not permit it.
process.loadEnvFile(".env.declaut-production.local");
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url)),
  command,
  ...args,
], { env: process.env, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
