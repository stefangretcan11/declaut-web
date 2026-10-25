function priceRon(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const amount = Number(value.trim());
  return Number.isFinite(amount) && amount > 0 ? amount : fallback;
}

function contactEmail(value: string | undefined): string | null {
  const email = value?.trim();
  return email && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? email : null;
}

function optionalText(value: string | undefined): string | null {
  return value?.trim() || null;
}

export function getSiteConfig() {
  return {
    contactEmail: contactEmail(process.env.CONTACT_EMAIL),
    // Prices explicitly supplied by the owner: 300 RON / six months, 500 RON / year.
    proSemiannualPriceRon: priceRon(process.env.NEXT_PUBLIC_PRO_SEMIANNUAL_PRICE_RON, 300),
    proYearlyPriceRon: priceRon(process.env.NEXT_PUBLIC_PRO_YEARLY_PRICE_RON, 500),
    isStaging: process.env.LICENSE_ISSUER !== "declaut-production",
    operator: {
      legalName: optionalText(process.env.COMPANY_LEGAL_NAME),
      cui: optionalText(process.env.COMPANY_CUI),
      registrationNumber: optionalText(process.env.COMPANY_REGISTRATION_NUMBER),
      address: optionalText(process.env.COMPANY_ADDRESS),
    },
  };
}

export function formatRon(amount: number): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "RON",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
