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
    let guardado: string | null = null;
    try {
      guardado = localStorage.getItem(LS_COLAPSADO);
    } catch {
      /* sin localStorage */
    }
    // Respeta la preferencia guardada; si no hay, arranca COLAPSADO en móvil (el menú
    // fijo de 240px se comería la pantalla), y visible en escritorio.
    if (guardado === "1") setColapsado(true);
    else if (guardado === "0") setColapsado(false);
    else setColapsado(typeof window !== "undefined" && window.innerWidth < 768);
  }, []);

  function setColapso(v: boolean) {
    setColapsado(v);
    try {
      localStorage.setItem(LS_COLAPSADO, v ? "1" : "0");
    } catch {
      /* no-op */
    }
  }

  // En móvil, al navegar cerramos el drawer (queda encima del contenido); en escritorio
  // no se toca (el menú es estático). No persiste la preferencia (solo cierra la vista).
  function cerrarSiMovil() {
    if (typeof window !== "undefined" && window.innerWidth < 768) setColapsado(true);
  }

  // La pantalla de login no lleva menú (es pantalla completa).
  if (pathname === "/login") return null;

  // En el subdominio del editor solo existe el editor; el menú lo refleja.
  const items = soloEditor ? NAV_ITEMS.filter((i) => i.href === "/extractor") : NAV_ITEMS;
  const inicio = soloEditor ? "/extractor" : "/";

  // Navegación limpia: el verde (acento) es SOLO para el ítem activo; el resto es texto
  // sobrio con hover sutil. Menos "muro verde", mejor jerarquía y lectura.
  const pill = (active: boolean) =>
    cn(
      "flex items-center gap-3 rounded-full px-3 py-2.5 text-sm transition-colors",
      active
        ? "bg-[var(--accent)] font-semibold text-[#111]"
        : "text-muted hover:bg-[var(--hover)] hover:text-text",
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
    <>
      {/* Backdrop: solo en móvil, cuando el menú está abierto ENCIMA del contenido.
          Tocarlo lo cierra. En escritorio el aside es estático (no hace falta). */}
      <button
        aria-label="Cerrar menú"
        onClick={() => setColapso(true)}
        className="fixed inset-0 z-30 bg-black/30 md:hidden"
      />
      <aside className="fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--sidebar)] md:static md:z-auto">
      {/* Marca + botón para ocultar */}
      <div className="flex items-center justify-between gap-2 px-5 py-6">
        <Link href={inicio} className="flex items-center gap-2.5">
          <Logo size={34} />
          <span className="text-xl font-semibold uppercase tracking-tight text-text">Datibot</span>
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
              onClick={cerrarSiMovil}
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
                  onClick={cerrarSiMovil}
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
        <a
          href="/api/logout"
          className="flex items-center gap-3 rounded-full px-3 py-2 text-sm text-muted transition-colors hover:bg-[var(--hover)] hover:text-text"
        >
          <span className="text-base">🚪</span>
          <span className="flex-1">Salir</span>
        </a>
        <span className="px-2 text-xs text-muted/70">Datibot · versión #1</span>
      </div>
      </aside>
    </>
  );
}
