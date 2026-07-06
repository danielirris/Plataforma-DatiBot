"use client";

import { useEffect, useState } from "react";

// Alterna tema claro/oscuro. Aplica data-theme en <html> y lo guarda en
// localStorage. El script anti-parpadeo del layout lo lee antes de pintar.
export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const actual =
      (document.documentElement.getAttribute("data-theme") as "dark" | "light" | null) ??
      "dark";
    setTheme(actual);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("datibot-theme", next);
    } catch {
      /* modo privado: se queda en la sesión */
    }
  }

  return (
    <button
      onClick={toggle}
      className="flex w-full items-center justify-between rounded-xl border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-xs text-muted transition-colors hover:text-text"
      aria-label="Cambiar tema"
    >
      <span>{theme === "dark" ? "Tema oscuro" : "Tema claro"}</span>
      <span className="text-sm">{theme === "dark" ? "🌙" : "☀️"}</span>
    </button>
  );
}
