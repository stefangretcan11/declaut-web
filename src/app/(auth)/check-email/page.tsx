import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { authMessages } from "@/lib/auth/messages";

export default async function CheckEmail({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const allowed = ["confirmation_sent", "reset_sent", "confirmation_resent"];
  const message = status && allowed.includes(status) ? authMessages[status] : "Deschide emailul de la Declaut pentru a continua.";
  return <AuthShell eyebrow="URMĂTORUL PAS" title="Verifică emailul." description={message} footer={<Link href="/login">Înapoi la autentificare</Link>}>
    <div className="info-block"><p>Nu îl găsești? Verifică și dosarul Spam. Linkurile pot fi folosite o singură dată.</p><Link href={status === "reset_sent" ? "/forgot-password" : "/resend-confirmation"}>Solicită un email nou</Link></div>
  </AuthShell>;
}
