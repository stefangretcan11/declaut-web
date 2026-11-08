export function productionAuthConfig(origin, { confirmation, recovery, smtp } = {}) {
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Use an HTTPS production origin");
  const redirects = [`${url.origin}/auth/callback`, `${url.origin}/auth/callback?next=/reset-password`, `${url.origin}/auth/confirm`];
  return {
    site_url: url.origin, uri_allow_list: redirects.join(","), password_min_length: 12,
    mailer_autoconfirm: false, mailer_secure_email_change_enabled: true,
    ...(confirmation ? { mailer_subjects_confirmation: "Confirmă adresa de email pentru Declaut", mailer_templates_confirmation_content: confirmation } : {}),
    ...(recovery ? { mailer_subjects_recovery: "Resetează parola contului Declaut", mailer_templates_recovery_content: recovery } : {}),
    ...(smtp ?? {}),
  };
}
