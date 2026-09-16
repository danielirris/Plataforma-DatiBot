"use client";

import { useEffect, useState } from "react";

// Embebe el panel de anuncios y le PASA el tema actual de Datibot por la URL
// (?theme=light|dark). Si cambias el tema (toggle del menú → data-theme en <html>),
// recarga el iframe con el tema nuevo para que el panel lo siga. Así se sienten una
// sola app.
export function AnunciosFrame({
  baseSrc,
  title,
  className,
}: {
  baseSrc: string;
  title: string;
  className?: string;
}) {
  const [theme, setTheme] = useState<string | null>(null);

  useEffect(() => {
    const leer = () =>
      document.documentElement.getAttribute("data-theme") || "light";
    setTheme(leer());
    const obs = new MutationObserver(() => setTheme(leer()));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, []);

  // Hasta conocer el tema no montamos el iframe (evita un parpadeo con el tema
  // equivocado). data-theme lo fija el script inline del layout, así que es inmediato.
  if (theme === null) return <div className={className} />;

  const sep = baseSrc.includes("?") ? "&" : "?";
  const src = `${baseSrc}${sep}theme=${encodeURIComponent(theme)}`;
  return (
    <iframe
      key={theme} // cambiar el tema re-monta el iframe -> recarga con el tema nuevo
      src={src}
      title={title}
      className={className}
      allow="clipboard-read; clipboard-write; fullscreen"
    />
  );
}
