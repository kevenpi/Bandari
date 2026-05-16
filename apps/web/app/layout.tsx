import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Shell } from "@/components/shell";
import { PersonaProvider } from "@/lib/persona";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Bandari — Cross-border payments",
  description: "Kenya → China payment corridor (sandbox prototype)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        <PersonaProvider>
          <Shell>{children}</Shell>
        </PersonaProvider>
      </body>
    </html>
  );
}
