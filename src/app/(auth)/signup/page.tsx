import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { authMessages } from "@/lib/auth/messages";

export default async function Signup({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <AuthShell title="Un început simplu." description="Creează contul companiei tale. Confirmă emailul și ești gata să începi." footer={<p>Ai deja un cont? <Link href="/login">Autentifică-te</Link></p>}>
    <AuthForm kind="signup" initialMessage={error ? authMessages[error] : undefined} />
  </AuthShell>;
}
