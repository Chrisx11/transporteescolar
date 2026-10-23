import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { RegistrarServiceWorker } from "@/components/registrar-sw";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Transporte Universitário · Italva", template: "%s · Transporte Italva" },
  description: "Reservas e embarque do transporte universitário da Prefeitura de Italva/RJ.",
  applicationName: "Transporte Italva",
  appleWebApp: { capable: true, title: "Transporte Italva", statusBarStyle: "default" },
  icons: { icon: "/icones/icone-192.png", apple: "/icones/icone-180.png" },
};

export const viewport: Viewport = {
  themeColor: "#1d3bd8",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="min-h-dvh antialiased">
        {children}
        <Toaster position="top-right" richColors closeButton toastOptions={{ className: "font-sans" }} />
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
