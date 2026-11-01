"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/account/entitlements";

export type AccountDevice = { id: string; device_id: string; device_name: string; created_at: string; last_seen_at: string };

export function DeviceList({ devices, pro }: { devices: AccountDevice[]; pro: boolean }) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const router = useRouter();
  const messageRef = useRef<HTMLParagraphElement>(null);
  async function remove(device: AccountDevice) {
    if (pending) return;
    setPending(device.id); setError(undefined); setMessage(undefined);
    try {
      const response = await fetch(`/api/devices/${encodeURIComponent(device.id)}`, { method: "DELETE", credentials: "same-origin" });
      if (!response.ok) throw new Error();
      setConfirmId(null);
      setMessage(`Dispozitivul „${device.device_name}” a fost eliminat.`);
      router.refresh();
      requestAnimationFrame(() => messageRef.current?.focus());
    } catch { setError("Nu am putut elimina dispozitivul. Încearcă din nou."); }
    setPending(null);
  }
  return <div className="device-list">
    {message && <p ref={messageRef} tabIndex={-1} className="form-message success-message" role="status">{message}</p>}
    {error && <p className="form-message error-message" role="alert">{error}</p>}
    {!devices.length ? <div className="account-empty"><p>Încă nu ai dispozitive înregistrate.</p><p>Ele apar aici când te autentifici în aplicația desktop și soliciți o licență.</p></div> :
      <ul className="device-rows">{devices.map((device) => <li key={device.id} data-device-id={device.id}>
        <div className="device-info"><div className="device-title"><strong>{device.device_name}</strong><span className={`plan-badge ${pro ? "is-pro" : ""}`}>{pro ? "Pro" : "Free"}</span></div><p>Ultima utilizare: {formatDate(device.last_seen_at)}</p><code>{device.device_id}</code></div>
        <div className="device-controls">{confirmId === device.id ? <><p>Elimini acest dispozitiv?</p><div className="device-confirm-actions"><button className="button button-secondary" type="button" onClick={() => setConfirmId(null)} disabled={Boolean(pending)}>Păstrează</button><button className="button button-danger" type="button" disabled={Boolean(pending)} onClick={() => remove(device)}>{pending === device.id ? "Se elimină…" : "Confirmă eliminarea"}</button></div></> : <button className="button button-secondary" type="button" aria-label={`Elimină ${device.device_name}`} disabled={Boolean(pending)} onClick={() => { setConfirmId(device.id); setError(undefined); }}>Elimină</button>}</div>
      </li>)}</ul>}
    <p className="account-explainer">Pro este disponibil pe toate dispozitivele contului, fără limită de dispozitive. Eliminarea șterge înregistrarea din cont; aplicația o poate crea din nou la următoarea solicitare de licență. O licență deja emisă rămâne valabilă până la expirare, cel mult 24 de ore.</p>
  </div>;
}
