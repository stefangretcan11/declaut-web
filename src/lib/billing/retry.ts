import { timingSafeEqual } from "node:crypto";

type PendingInvoice = { id: string; user_id: string };
export function createFiscalRetryHandler(deps: { secret?: string; pending(): Promise<PendingInvoice[]>; retry(invoice: PendingInvoice): Promise<void> }) {
  return async (request: Request) => {
    const headers = { "Cache-Control": "private, no-store" };
    if (!deps.secret) return Response.json({ error: { code: "fiscal_retry_unavailable" } }, { status: 503, headers });
    const given = Buffer.from(request.headers.get("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${deps.secret}`);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return Response.json({ error: { code: "unauthorized" } }, { status: 401, headers });
    try {
      const invoices = await deps.pending();
      let processed = 0;
      for (const invoice of invoices) {
        try { await deps.retry(invoice); processed++; } catch { /* Remains pending for a later retry; never log buyer/provider details. */ }
      }
      const failed = invoices.length - processed;
      return Response.json({ processed, failed }, { status: failed ? 503 : 200, headers: { ...headers, ...(failed ? { "Retry-After": "300" } : {}) } });
    } catch { return Response.json({ error: { code: "fiscal_retry_unavailable" } }, { status: 503, headers }); }
  };
}
