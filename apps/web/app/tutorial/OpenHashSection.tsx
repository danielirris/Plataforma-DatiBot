"use client";

import { useEffect } from "react";

// Abre automáticamente la tarjeta plegable (<details>) cuya id coincide con el
// #hash de la URL —al cargar y al pulsar un enlace del índice—. Sin esto, el
// navegador solo hace scroll hasta la sección y la deja CERRADA, obligando a un
// segundo clic. No renderiza nada.
export function OpenHashSection() {
  useEffect(() => {
    const abrir = () => {
      const id = decodeURIComponent(location.hash.replace(/^#/, ""));
      if (!id) return;
      const el = document.getElementById(id);
      if (el instanceof HTMLDetailsElement) {
        el.open = true;
        // Reencuadra tras expandir (el alto cambió al abrir la tarjeta).
        el.scrollIntoView({ block: "start" });
      }
    };
    abrir();
    window.addEventListener("hashchange", abrir);
    return () => window.removeEventListener("hashchange", abrir);
  }, []);
  return null;
}
