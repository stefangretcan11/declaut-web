import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { confirmSchema } from "@/lib/auth/validation";

export const dynamic = "force-dynamic";

export default async function Confirm({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string }> }) {
  const params = await searchParams;
  const parsed = confirmSchema.safeParse(params);
  const recovery = parsed.success && parsed.data.type === "recovery";
  return <AuthShell eyebrow="ÎNCĂ UN PAS" title={!parsed.success ? "Linkul nu este valid." : recovery ? "Resetează parola." : "Confirmă adresa de email."} description={!parsed.success ? "Solicită un email nou pentru a continua." : recovery ? "Continuă pentru a alege o parolă nouă pentru contul tău." : "Continuă pentru a confirma contul și a te autentifica."} footer={<Link href="/login">Înapoi la autentificare</Link>}>
    {parsed.success ? <AuthForm kind="confirm" tokenHash={parsed.data.token_hash} confirmationType={parsed.data.type} /> : <Link className="button button-primary" href="/resend-confirmation">Solicită un link nou</Link>}
  </AuthShell>;
}
