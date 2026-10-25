import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const publicPages = ["/", "/login", "/preturi", "/descarcare", "/intrebari-frecvente", "/contact"];

export function deploymentOrigin(value, { allowLocal = false } = {}) {
  if (!value) throw new Error("Provide --url=https://YOUR-DEPLOYMENT.vercel.app or DEPLOYMENT_URL");
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(allowLocal && local && url.protocol === "http:")) {
    throw new Error("Use an HTTPS deployment origin; --allow-local permits HTTP loopback for local checks");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Use a deployment origin without credentials, a path, query parameters or a fragment");
  }
  return url.origin;
}

async function responseText(response) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1_048_576) {
        await reader.cancel();
        throw new Error("Response exceeded the health-check size limit");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}

export async function checkDeployment(origin, { fetcher = fetch, coreOnly = false, timeoutMs = 12_000 } = {}) {
  const pages = coreOnly ? ["/", "/login"] : publicPages;
  const probes = [...pages.map((path) => ({ path, method: "GET" })), { path: "/api/license", method: "POST" }];
  return Promise.all(probes.map(async ({ path, method }) => {
    try {
      const response = await fetcher(new URL(path, origin), {
        method,
        redirect: "manual",
        credentials: "omit",
        signal: AbortSignal.timeout(timeoutMs),
        headers: method === "POST" ? { Accept: "application/json", "Content-Type": "application/json" } : { Accept: "text/html" },
        ...(method === "POST" ? { body: JSON.stringify({ device_id: "deployment-health-check", device_name: "Deployment health check" }) } : {}),
      });
      if (response.status >= 300 && response.status < 400) {
        return { path, method, status: response.status, ok: false, reason: "Unexpected redirect; check domain assignment and Vercel Authentication" };
      }
      const body = await responseText(response);
      const contentType = response.headers.get("content-type") ?? "";
      if (method === "GET") {
        if (response.status !== 200 || !contentType.includes("text/html")) {
          return { path, method, status: response.status, ok: false, reason: "Expected an HTML page with HTTP 200" };
        }
        if (path === "/login" && !body.includes("/api/auth/login")) {
          return { path, method, status: response.status, ok: false, reason: "The page does not contain the Declaut login form" };
        }
        return { path, method, status: response.status, ok: true };
      }
      let result;
      try { result = JSON.parse(body); } catch { /* A platform error is not an application auth response. */ }
      const applicationAuth = response.status === 401
        && contentType.includes("application/json")
        && result?.error?.code === "unauthorized"
        && response.headers.get("cache-control")?.toLowerCase().includes("no-store");
      return applicationAuth
        ? { path, method, status: response.status, ok: true }
        : { path, method, status: response.status, ok: false, reason: "Expected the application's no-store unauthorized JSON; a Vercel gate or generic 401 is not sufficient" };
    } catch {
      return { path, method, status: 0, ok: false, reason: "Request failed, timed out or exceeded the response size limit" };
    }
  }));
}

async function main() {
  const args = process.argv.slice(2);
  const flag = args.find((value) => value.startsWith("--url="));
  const index = args.indexOf("--url");
  const value = flag?.slice("--url=".length) ?? (index >= 0 ? args[index + 1] : undefined) ?? process.env.DEPLOYMENT_URL;
  const origin = deploymentOrigin(value, { allowLocal: args.includes("--allow-local") });
  console.log(`Checking ${origin} without credentials or test-account writes`);
  const results = await checkDeployment(origin, { coreOnly: args.includes("--core-only") });
  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"} ${result.method} ${result.path}: ${result.status || "network error"}${result.reason ? ` — ${result.reason}` : ""}`);
  }
  if (results.some((result) => !result.ok)) process.exitCode = 1;
  else console.log("Deployment page and authentication-boundary checks passed. Authenticated, email and payment acceptance checks are separate.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : "Deployment check failed"); process.exitCode = 1; });
}
