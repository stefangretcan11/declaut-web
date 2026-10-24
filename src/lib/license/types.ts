export type Plan = "free" | "pro";

export type Entitlement = {
  plan: Plan;
  device_limit_reached: boolean;
  pro_until: string | null;
};

export type ReleaseInfo = {
  latest_version: string | null;
  download_url: string | null;
};

export type LicenseResponse = ReleaseInfo & {
  token: string;
  plan: Plan;
  expires_at: string;
  device_limit_reached: boolean;
};
