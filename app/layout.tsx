// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forja de Cordel — Tradução Oral Performática da Bíblia",
  description:
    "Tradução oral performática da Bíblia em sextilhas de redondilha maior, com análise métrica e fidelidade semântica.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Bitter:wght@400;600;700&family=Lora:ital,wght@0,400;0,600;1,400&family=JetBrains+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-preto text-preto antialiased">
        {children}
      </body>
    </html>
  );
}
