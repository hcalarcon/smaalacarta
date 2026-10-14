import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "SMA a la Carta · Panel",
    template: "%s · SMA a la Carta",
  },
  description: "Panel de administración de SMA a la Carta",
  // Cómo se llama y se ve instalada en iPhone (el manifest lo leen Android y escritorio).
  appleWebApp: { capable: true, title: "SMA Panel", statusBarStyle: "default" },
};

// El color de la barra del navegador y de la app instalada: el de la marca (`--color-brand`).
export const viewport: Viewport = {
  themeColor: "#5a4a3a",
  // Para que la barra de abajo del repartidor pueda respetar el área segura del iPhone.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
