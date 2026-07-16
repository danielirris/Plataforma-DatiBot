"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, cn } from "@plataforma/ui";
import { ThemeToggle } from "./ThemeToggle";
import { Logo } from "./Logo";

export function Sidebar() {
  const pathname = usePathname();

  // Modo solo editor: el middleware lo marca con una cookie legible (el layout
  // es estático y no puede leer el modo en servidor). Se lee tras montar; hay un
  // parpadeo mínimo la primera vez, aceptable para una cáscara.
  const [soloEditor, setSoloEditor] = useState(false);
  useEffect(() => {
    setSoloEditor(/(?:^|;\s*)datibot_solo_editor=1(?:;|$)/.test(document.cookie));
  }, []);

  // En el subdominio del editor solo existe el editor; el menú lo refleja. El
  // bloqueo de verdad está en middleware.ts, esto es solo la cara visible.
  const items = soloEditor ? NAV_ITEMS.filter((i) => i.href === "/extractor") : NAV_ITEMS;
  const inicio = soloEditor ? "/extractor" : "/";

  return (
    <aside className="glass flex w-60 shrink-0 flex-col border-r border-[var(--hairline)]">
      {/* Marca */}
      <Link href={inicio} className="flex items-center gap-2.5 px-5 py-6">
        <Logo size={34} />
        <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-lg font-bold tracking-tight text-transparent">
          Datibot
        </span>
      </Link>

      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {items.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.description}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
                active
                  ? "bg-[var(--hover)] text-text ring-1 ring-[var(--hairline)]"
                  : "text-muted hover:bg-[var(--hover)] hover:text-text",
              )}
            >
              {/* barra de sección activa */}
              <span
                className={cn(
                  "absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-gradient-to-b from-accent to-accent-2 transition-opacity",
                  active ? "opacity-100" : "opacity-0",
                )}
              />
              <span className="text-base">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.comingSoon && (
                <span className="rounded bg-[var(--field)] px-1.5 py-0.5 text-[10px] text-muted">
                  pronto
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-3 px-3 py-4">
        <ThemeToggle />
        <span className="px-2 text-xs text-muted/70">Datibot · v0.1</span>
      </div>
    </aside>
  );
}
