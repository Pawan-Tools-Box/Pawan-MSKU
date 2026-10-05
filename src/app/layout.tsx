import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Oakcraft Master SKU CRM", template: "%s · Oakcraft SKU CRM" },
  description: "Universal Master SKU management for every e-commerce platform Oakcraft sells on.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
