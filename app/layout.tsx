import type { Metadata } from "next";
import "./design-tokens.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "Super Admin · Project control",
  description: "A private workspace for managing connected projects.",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
