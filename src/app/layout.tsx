import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GalgoChef | Cocina con lo que tienes",
  description:
    "Encuentra recetas rápidas y prácticas con los ingredientes de tu despensa.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
