import { z } from "zod";
import type { Entitlement, ReleaseInfo } from "./types";

const requestSchema = z.object({
  device_id: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  device_name: z.string().trim().min(1).max(120).regex(/^[^\u0000-\u001f\u007f]+$/),
}).strict();

export class LicenseError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}

type Dependencies = {
  authenticate: (accessToken: string) => Promise<{ id: string }>;
  resolve: (userId: string, deviceId: string, deviceName: string) => Promise<Entitlement>;
  sign: (userId: string, deviceId: string, entitlement: Entitlement) => Promise<{ token: string; expires_at: string }>;
  release: () => Promise<ReleaseInfo>;
};

const headers = { "Cache-Control": "no-store", "Vary": "Authorization" };

async function readJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new LicenseError(415, "unsupported_media_type");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new LicenseError(400, "invalid_request");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4096) {
        await reader.cancel();
        throw new LicenseError(413, "request_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)); }
  catch { throw new LicenseError(400, "invalid_request"); }
}

export function createLicenseHandler(deps: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    try {
      const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get("authorization") ?? "");
      if (!match) throw new LicenseError(401, "unauthorized");
      const parsed = requestSchema.safeParse(await readJson(request));
      if (!parsed.success) throw new LicenseError(400, "invalid_request");
      const user = await deps.authenticate(match[1]);
      const { device_id, device_name } = parsed.data;
      const entitlement = await deps.resolve(user.id, device_id, device_name);
      const signed = await deps.sign(user.id, device_id, entitlement);
      // Update metadata is optional; it must never prevent valid license issuance.
      const release = await deps.release().catch(() => ({ latest_version: null, download_url: null }));
      return Response.json({ ...signed, plan: entitlement.plan, device_limit_reached: entitlement.device_limit_reached, ...release }, { headers });
    } catch (error) {
      const known = error instanceof LicenseError;
      return Response.json({ error: { code: known ? error.code : "license_unavailable" } }, {
        status: known ? error.status : 503,
        headers: { ...headers, ...((known ? error.status : 503) === 503 ? { "Retry-After": "30" } : {}) },
      });
    }
  };
}
