"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, cn } from "@plataforma/ui";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-panel">
      <div className="px-5 py-5">
        <span className="text-lg font-semibold tracking-tight">Mi Plataforma</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-accent/15 text-text"
                  : "text-muted hover:bg-white/5 hover:text-text",
              )}
            >
              <span className="text-base">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.comingSoon && (
                <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted">
                  pronto
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-4 text-xs text-muted">v0.1 · monorepo</div>
    </aside>
  );
}
