import { readConfig, redactSecrets } from "@plataforma/config";
import { ConfigForm } from "./ConfigForm";
import { anunciosUrl } from "@/lib/anuncios";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  // Redactamos los secretos ANTES de pasarlos al cliente: el formulario solo edita
  // instrucciones y precios; las API keys/credenciales se gestionan en EasyPanel y
  // no deben incrustarse en el HTML que llega al navegador.
  const initial = redactSecrets(await readConfig());
  const anunciosConfig = anunciosUrl("configuracion");

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <h1 className="text-2xl font-semibold">Configuración</h1>
      <p className="mt-2 mb-8 text-muted">
        Ajustes de la plataforma, en pestañas: <b>instrucciones para la IA</b> y{" "}
        <b>precios por país</b>. Las API keys de cada servicio se gestionan en el{" "}
        <b>Environment de EasyPanel</b>. <span className="text-muted">(Los tutoriales están
        en <b>Tutorial</b>, abajo en el menú.)</span>
      </p>
      <ConfigForm initial={initial} />

      {/* Acceso separado a la config de la app de anuncios (conexiones FB, Supabase,
          tasas). Vive en la app de anuncios; se abre con la misma sesión. */}
      <div className="mt-10 rounded-2xl border border-[var(--hairline)] glass p-5">
        <h2 className="text-lg font-medium">Configuración de anuncios</h2>
        <p className="mt-1 text-sm text-muted">
          Los ajustes del <b className="font-medium text-text">Reporte de anuncios</b>
          {" "}(conexiones de Facebook, Supabase y tasas de cambio) viven en su propia app.
          Se abre con tu misma sesión.
        </p>
        <a
          href={anunciosConfig}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-[#111]"
        >
          ⚙ Abrir configuración de anuncios
        </a>
      </div>
    </div>
  );
}
