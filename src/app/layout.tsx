import type { Metadata, Viewport } from "next";
import "./globals.css";
import EtatConnexion from "@/components/EtatConnexion";

export const metadata: Metadata = {
  title: "EcoWatch SCG – Signalement environnemental",
  description:
    "Signalement environnemental sur le site de la SCG : les opérateurs scannent le QR Code et envoient leur observation sans compte, l'administration la reçoit en temps réel.",
  manifest: "/manifest.json",
  applicationName: "EcoWatch",
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#16a34a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="antialiased bg-gray-50 font-sans">
        <EtatConnexion />
        {children}
      </body>
    </html>
  );
}