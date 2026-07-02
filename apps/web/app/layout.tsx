import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "./_components/Sidebar";

export const metadata: Metadata = {
  title: "Mi Plataforma",
  description: "Shell unificado — Flujos, Dashboard ads y Extractor",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
