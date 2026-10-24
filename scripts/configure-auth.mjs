import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

process.loadEnvFile(".env.local");
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const includeTemplates = !args.includes("--settings-only");
const site = args.find((arg) => arg.startsWith("--site-url="))?.slice("--site-url=".length);
if (!site) throw new Error("Use --site-url=https://YOUR-STAGING-DOMAIN.vercel.app (and --apply to save)");
const origin = new URL(site);
if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password) throw new Error("Use an HTTPS origin without a path or credentials");
const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.split(".")[0];
if (!/^[a-z]{20}$/.test(project)) throw new Error("Cannot determine the staging project ref");
if (process.env.LICENSE_ISSUER !== "declaut-staging") throw new Error("This helper configures staging only");
const workdir = mkdtempSync("/tmp/declaut-auth-config-");
try {
  const folder = join(workdir, "supabase");
  mkdirSync(folder);
  cpSync("supabase/templates", join(folder, "templates"), { recursive: true });
  const redirects = [`${origin.origin}/auth/callback`, `${origin.origin}/auth/callback?next=/reset-password`, `${origin.origin}/auth/confirm`, "http://localhost:3000/auth/callback", "http://localhost:3000/auth/callback?next=/reset-password", "http://127.0.0.1:3100/auth/callback", "http://127.0.0.1:3100/auth/callback?next=/reset-password"];
  // Only these explicit auth properties are pushed. SMTP is configured in the
  // Supabase dashboard; no SMTP password is copied into this temporary file.
  const templateConfig = includeTemplates ? `\n[auth.email.template.confirmation]\nsubject = "Confirmă adresa de email pentru Declaut"\ncontent_path = "./supabase/templates/confirmation.html"\n\n[auth.email.template.recovery]\nsubject = "Resetează parola contului Declaut"\ncontent_path = "./supabase/templates/recovery.html"\n` : "";
  writeFileSync(join(folder, "config.toml"), `project_id = "declaut-web"\n\n[auth]\nsite_url = ${JSON.stringify(origin.origin)}\nadditional_redirect_urls = ${JSON.stringify(redirects)}\nminimum_password_length = 12\n\n[auth.email]\nenable_confirmations = true\ndouble_confirm_changes = true\n${templateConfig}`);
  console.log(`Staging auth configuration: ${project}`);
  console.log(`Site URL: ${origin.origin}`);
  console.log(`Plan: exact callback allowlist, 12-character minimum password, required email confirmation${includeTemplates ? ", Romanian confirmation/recovery templates" : " (email templates deferred)"}.`);
  console.log("SMTP settings are not declared by this helper.");
  const command = ["--no-install", "supabase", "config", apply ? "push" : "diff", "--project-ref", project, "--workdir", workdir, "--output-format", "json"];
  if (apply) command.push("--yes");
  try {
    // CLI output can contain project configuration. Keep it in memory and do not
    // print raw config or any server-side values.
    const result = execFileSync("npx", command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 90_000 });
    let parsed;
    try { parsed = JSON.parse(result); } catch { /* Some CLI versions return human-readable output. */ }
    if (parsed?.counts) console.log(`Change counts: ${JSON.stringify(parsed.counts)}`);
    if (apply) console.log("Auth configuration applied successfully.");
    else console.log(`Configuration preview completed${parsed ? ` (${Object.keys(parsed).join(", ")})` : ""}. Run with --apply to save the plan.`);
  } catch (error) {
    let detail = String(error.stderr ?? "").split("\n").filter((line) => /error|failed|invalid|unsupported|missing|denied|required|not found/i.test(line) && !line.startsWith("npm ")).slice(-4).join(" ").slice(0, 650);
    try {
      const output = JSON.parse(String(error.stdout ?? ""));
      const message = output.error?.message ?? output.error ?? output.message;
      if (typeof message === "string") detail += ` ${message.slice(0, 650)}`;
      else detail += ` CLI result keys: ${Object.keys(output).join(", ")}`;
    } catch { /* Never print raw stdout, which may contain configuration values. */ }
    for (const [name, value] of Object.entries(process.env)) {
      if (/KEY|TOKEN|SECRET|PASSWORD/.test(name) && value && value.length > 8) detail = detail.replaceAll(value, "[redacted]");
    }
    detail = detail.replace(/(?:sbp_|sb_secret_|eyJ)[A-Za-z0-9_.-]+/g, "[redacted]");
    throw new Error(`Supabase config command failed (exit ${error.status ?? "unknown"})${detail ? `: ${detail}` : ". Check CLI login and project access."}`);
  }
} finally { rmSync(workdir, { recursive: true, force: true }); }
