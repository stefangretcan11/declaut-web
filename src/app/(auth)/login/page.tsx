import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { authMessages } from "@/lib/auth/messages";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; status?: string }> }) {
  const params = await searchParams;
  return <AuthShell title="Bine ai revenit." description="Autentifică-te pentru a continua cu Declaut." footer={<><p>Nu ai încă un cont? <Link href="/signup">Creează un cont</Link></p><Link className="quiet-link" href="/resend-confirmation">Retrimite emailul de confirmare</Link></>}>
    {params.status && authMessages[params.status] && <p className="form-message success-message" role="status">{authMessages[params.status]}</p>}
    <AuthForm kind="login" initialMessage={params.error ? authMessages[params.error] : undefined} />
  </AuthShell>;
}
