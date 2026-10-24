import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { authMessages } from "@/lib/auth/messages";

export default async function ForgotPassword({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <AuthShell title="O parolă nouă." description="Introdu adresa de email a contului. Îți trimitem un link pentru resetarea parolei." footer={<Link href="/login">Înapoi la autentificare</Link>}>
    <AuthForm kind="forgot-password" initialMessage={error ? authMessages[error] : undefined} />
  </AuthShell>;
}
