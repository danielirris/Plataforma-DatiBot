"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, cn } from "@plataforma/ui";
import { ThemeToggle } from "./ThemeToggle";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="glass flex w-60 shrink-0 flex-col border-r border-[var(--hairline)]">
      {/* Marca */}
      <Link href="/" className="flex items-center gap-2.5 px-5 py-6">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-base font-bold text-white shadow-lg shadow-accent/30 ring-1 ring-white/20">
          D
        </span>
        <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-lg font-bold tracking-tight text-transparent">
          Datibot
        </span>
      </Link>

      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {NAV_ITEMS.map((item) => {
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
