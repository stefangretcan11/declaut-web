import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { sessionClient } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export default async function Account() {
  const supabase = await sessionClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email_confirmed_at || data.user.is_anonymous) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("company_name,cui").eq("id", data.user.id).maybeSingle();
  return <AuthShell title="Contul tău." description="Ești autentificat. Poți folosi aceleași date de conectare în aplicația Declaut." footer={<Link href="/">Înapoi la pagina principală</Link>}>
    <dl className="account-details"><div><dt>Email</dt><dd>{data.user.email}</dd></div>{profile?.company_name && <div><dt>Companie</dt><dd>{profile.company_name}</dd></div>}{profile?.cui && <div><dt>CUI</dt><dd>{profile.cui}</dd></div>}</dl>
    <div className="account-actions"><Link href="/forgot-password">Schimbă parola</Link><AuthForm kind="logout" /></div>
  </AuthShell>;
}
