export type Subscription = {
  id: string;
  status: string;
  price_id: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  is_pro?: boolean;
};

export function proDeadline(subscription: Subscription, now = Date.now()): number | null {
  if (subscription.is_pro === false) return null;
  const start = Date.parse(subscription.current_period_start);
  const end = Date.parse(subscription.current_period_end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > now || end <= now || end <= start) return null;
  if (subscription.status === "active" || subscription.status === "trialing") return end;
  if (subscription.status === "past_due") {
    const deadline = Math.min(end, start + 72 * 3_600_000);
    return deadline > now ? deadline : null;
  }
  return null;
}

export function accountEntitlement(subscriptions: Subscription[], now = Date.now()) {
  const eligible = subscriptions.map((subscription) => ({ subscription, deadline: proDeadline(subscription, now) }))
    .filter((item): item is { subscription: Subscription; deadline: number } => item.deadline !== null)
    .sort((a, b) => b.deadline - a.deadline);
  const selected = eligible[0];
  const recent = [...subscriptions].sort((a, b) => Date.parse(b.current_period_end) - Date.parse(a.current_period_end))[0] ?? null;
  return {
    plan: selected ? "pro" as const : "free" as const,
    subscription: selected?.subscription ?? recent,
    proUntil: selected ? new Date(selected.deadline).toISOString() : null,
    grace: selected?.subscription.status === "past_due",
  };
}

export function formatDate(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Intl.DateTimeFormat("ro-RO", { dateStyle: "long", timeZone: "Europe/Bucharest" }).format(new Date(value));
}

export function documentUrl(value: unknown, stripe = false): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (stripe && url.hostname !== "stripe.com" && !url.hostname.endsWith(".stripe.com")) return null;
    return url.href;
  } catch { return null; }
}
