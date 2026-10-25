"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function PaymentStatus({ pro }: { pro: boolean }) {
  const router = useRouter();
  const [waiting, setWaiting] = useState(true);
  useEffect(() => {
    if (pro) return;
    const timer = setInterval(() => router.refresh(), 2500);
    const stop = setTimeout(() => { clearInterval(timer); setWaiting(false); }, 30_000);
    return () => { clearInterval(timer); clearTimeout(stop); };
  }, [pro, router]);
  return <div className="form-message success-message" role="status">{pro ? "Abonamentul Pro este activ." : <><p>Confirmăm plata. Abonamentul se actualizează după verificarea plății.</p>{!waiting && <button className="text-button" type="button" onClick={() => router.refresh()}>Verifică din nou</button>}</>}</div>;
}
