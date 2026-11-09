import type { Metadata } from "next";
import { getSiteConfig } from "@/lib/site-config";
import "./globals.css";
import "./motion.css";

export function generateMetadata(): Metadata {
  const staging = getSiteConfig().isStaging;
  return {
    title: "Declaut",
    description: "Declaut — import Excel, declarații ANAF, rectificative și arhivarea recipiselor într-o aplicație pentru Windows.",
    robots: { index: !staging, follow: !staging },
    referrer: "no-referrer",
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ro"><body>{children}</body></html>;
}
