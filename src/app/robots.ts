import type { MetadataRoute } from "next";
import { getSiteConfig } from "@/lib/site-config";
import production from "../../docs/track-b-production-config.json";

export default function robots(): MetadataRoute.Robots {
  if (getSiteConfig().isStaging) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/account", "/auth/", "/login", "/signup", "/reset-password", "/forgot-password", "/resend-confirmation", "/check-email"] }, sitemap: `${production.websiteUrl}/sitemap.xml` };
}
