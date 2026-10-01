import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scola · Espace école",
  description: "Un espace dédié aux élèves, aux familles et à la vie scolaire.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Scola", statusBarStyle: "default" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
