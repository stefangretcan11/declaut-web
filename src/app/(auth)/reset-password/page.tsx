import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { sessionClient } from "@/lib/server/session";
import { authMessages } from "@/lib/auth/messages";

export const dynamic = "force-dynamic";

export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await sessionClient();
  const { data } = await supabase.auth.getUser();
  const authenticated = Boolean(data.user?.email_confirmed_at && !data.user.is_anonymous);
  return <AuthShell title="Alege o parolă nouă." description={authenticated ? "Folosește o parolă unică, pe care nu o folosești pentru alte conturi." : "Deschide linkul primit prin email pentru a continua."} footer={<Link href="/login">Înapoi la autentificare</Link>}>
    {authenticated ? <AuthForm kind="reset-password" initialMessage={error ? authMessages[error] : undefined} /> : <Link className="button button-primary" href="/forgot-password">Solicită un link nou</Link>}
  </AuthShell>;
}
