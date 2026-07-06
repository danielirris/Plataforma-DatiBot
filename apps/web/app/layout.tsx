import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "./_components/Sidebar";
import { Fondo } from "./_components/Fondo";

export const metadata: Metadata = {
  title: "Datibot",
  description:
    "Datibot — tu centro de mando: Productos, Ebooks, Flujos, Dashboard de ads y Editor de videos en un solo lugar.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('datibot-theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}",
          }}
        />
      </head>
      <body>
        <Fondo />
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
