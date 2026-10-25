import { type NextRequest, NextResponse } from "next/server";
import { sessionClient } from "@/lib/server/session";
import { requestOrigin, safeAuthDestination } from "@/lib/auth/validation";

export async function GET(request: NextRequest) {
  const baseUrl = requestOrigin(request.url, request.headers.get("host"));
  const code = request.nextUrl.searchParams.get("code");
  const next = safeAuthDestination(request.nextUrl.searchParams.get("next"));
  if (code && code.length < 2048) {
    try {
      const supabase = await sessionClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, baseUrl), { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
    } catch { /* Return a fresh-link prompt without exposing auth details. */ }
  }
  return NextResponse.redirect(new URL("/login?error=invalid_link", baseUrl), { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
