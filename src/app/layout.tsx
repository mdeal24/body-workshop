import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Body Workshop",
  description: "Shared workout tracker for Chris & Maryam",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
