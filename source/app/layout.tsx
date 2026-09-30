import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./pdf-editor.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GWL NEXO 2.0 | Ecossistema de Trabalho",
  description: "Portal integrado do GWL Flow, Ponto Dimivig e GWL Planner.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/gwl-nexo-logo.svg",
    shortcut: "/gwl-nexo-logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
