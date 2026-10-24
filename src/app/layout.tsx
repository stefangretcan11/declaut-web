import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Declaut",
  description: "Declaut — aplicația desktop pentru lucrul cu declarațiile ANAF.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ro"><body>{children}</body></html>;
}
