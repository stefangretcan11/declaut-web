import type { MetadataRoute } from "next";
import { getSiteConfig } from "@/lib/site-config";
import production from "../../docs/track-b-production-config.json";

export default function sitemap(): MetadataRoute.Sitemap {
  if (getSiteConfig().isStaging) return [];
  return ["", "/preturi", "/descarcare", "/noutati", "/intrebari-frecvente", "/contact", "/termeni-si-conditii", "/politica-de-confidentialitate"].map((path) => ({ url: `${production.websiteUrl}${path}` }));
}
