import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { authMessages } from "@/lib/auth/messages";

export default async function ResendConfirmation({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <AuthShell title="Confirmă emailul." description="Introdu adresa folosită la înregistrare pentru a primi un link nou de confirmare." footer={<Link href="/login">Înapoi la autentificare</Link>}>
    <AuthForm kind="resend-confirmation" initialMessage={error ? authMessages[error] : undefined} />
  </AuthShell>;
}
