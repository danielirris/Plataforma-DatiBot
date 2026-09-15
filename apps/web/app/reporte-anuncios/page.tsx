// Reporte de anuncios — embebe la app de atribución de Facebook Ads
// (anuncios.datibot.lat) DENTRO de Datibot, como un panel más. La app trae TODAS
// sus características (es la misma app, solo mostrada aquí). Tiene su propio login:
// se inicia sesión dentro del panel. La URL se puede cambiar con la variable de
// entorno NEXT_PUBLIC_ANUNCIOS_URL (por defecto, el subdominio conocido).

export const metadata = { title: "Reporte de anuncios · Datibot" };

const ANUNCIOS_URL =
  process.env.NEXT_PUBLIC_ANUNCIOS_URL || "https://anuncios.datibot.lat";

export default function ReporteAnunciosPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] px-6 py-3">
        <div className="min-w-0">
          <h1 className="text-lg font-medium text-text">📊 Reporte de anuncios</h1>
          <p className="text-xs text-muted">
            Atribución de Facebook Ads. Inicia sesión dentro del panel con tu usuario y
            contraseña.
          </p>
        </div>
        <a
          href={ANUNCIOS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-lg border border-[var(--hairline)] px-3 py-1.5 text-xs text-muted hover:text-text"
          title="Si el panel de abajo sale en blanco, ábrelo en una pestaña aparte"
        >
          ↗ Abrir en pestaña nueva
        </a>
      </div>

      <iframe
        src={ANUNCIOS_URL}
        title="Reporte de anuncios"
        className="w-full flex-1 border-0 bg-white"
        allow="clipboard-read; clipboard-write; fullscreen"
      />
    </div>
  );
}
