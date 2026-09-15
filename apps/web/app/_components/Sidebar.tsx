"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, NAV_FOOTER, cn } from "@plataforma/ui";
import { ThemeToggle } from "./ThemeToggle";
import { Logo } from "./Logo";

const LS_COLAPSADO = "datibot-sidebar-collapsed";

export function Sidebar() {
  const pathname = usePathname();

  // Modo solo editor: el middleware lo marca con una cookie legible (el layout
  // es estático y no puede leer el modo en servidor). Se lee tras montar.
  const [soloEditor, setSoloEditor] = useState(false);
  // Colapsar/ocultar la columna del menú (preferencia por navegador).
  const [colapsado, setColapsado] = useState(false);

  useEffect(() => {
    setSoloEditor(/(?:^|;\s*)datibot_solo_editor=1(?:;|$)/.test(document.cookie));
    try {
      setColapsado(localStorage.getItem(LS_COLAPSADO) === "1");
    } catch {
      /* sin localStorage: queda visible */
    }
  }, []);

  function setColapso(v: boolean) {
    setColapsado(v);
    try {
      localStorage.setItem(LS_COLAPSADO, v ? "1" : "0");
    } catch {
      /* no-op */
    }
  }

  // En el subdominio del editor solo existe el editor; el menú lo refleja.
  const items = soloEditor ? NAV_ITEMS.filter((i) => i.href === "/extractor") : NAV_ITEMS;
  const inicio = soloEditor ? "/extractor" : "/";

  // Pill de navegación: verde neón relleno, texto negro (misma vibra que anuncios).
  const pill = (active: boolean) =>
    cn(
      "flex items-center gap-2.5 rounded-full border px-3 py-2.5 text-xs font-bold uppercase tracking-tight text-[#111] transition-all",
      "bg-[var(--accent)] border-[#111]/80 hover:-translate-y-[1px]",
      active
        ? "ring-2 ring-[#111] shadow-[0_6px_16px_-9px_rgba(17,17,17,0.55)]"
        : "opacity-90 hover:opacity-100",
    );

  // Colapsado: solo un botón flotante para volver a mostrar el menú.
  if (colapsado) {
    return (
      <button
        onClick={() => setColapso(false)}
        title="Mostrar menú"
        aria-label="Mostrar menú"
        className="fixed left-3 top-3 z-50 rounded-full border border-[#111]/80 bg-[var(--accent)] px-3 py-2 text-sm text-[#111] shadow-[0_6px_16px_-9px_rgba(17,17,17,0.55)] transition-all hover:-translate-y-[1px]"
      >
        ☰
      </button>
    );
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--sidebar)]">
      {/* Marca + botón para ocultar */}
      <div className="flex items-center justify-between gap-2 px-5 py-6">
        <Link href={inicio} className="flex items-center gap-2.5">
          <Logo size={34} />
          <span className="text-xl font-bold uppercase tracking-tight text-text">Datibot</span>
        </Link>
        <button
          onClick={() => setColapso(true)}
          title="Ocultar menú"
          aria-label="Ocultar menú"
          className="rounded-full p-1.5 text-muted transition-colors hover:bg-[var(--hover)] hover:text-text"
        >
          «
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-3">
        {items.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.description}
              className={pill(active)}
            >
              <span className="text-base">{item.icon}</span>
              <span className="flex-1 leading-tight">{item.label}</span>
              {item.comingSoon && (
                <span className="rounded bg-[var(--field)] px-1.5 py-0.5 text-[10px] normal-case text-muted">
                  pronto
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-2 border-t border-[var(--border)] px-3 py-4">
        {!soloEditor && (
          <nav className="flex flex-col gap-1.5">
            {NAV_FOOTER.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.description}
                  className={pill(active)}
                >
                  <span className="text-base">{item.icon}</span>
                  <span className="flex-1 leading-tight">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        )}
        <ThemeToggle />
        <span className="px-2 text-xs text-muted/70">Datibot · versión #1</span>
      </div>
    </aside>
  );
}
