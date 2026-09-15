import { readConfig, redactSecrets } from "@plataforma/config";
import { ConfigForm } from "./ConfigForm";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  // Redactamos los secretos ANTES de pasarlos al cliente: el formulario solo edita
  // instrucciones y precios; las API keys/credenciales se gestionan en EasyPanel y
  // no deben incrustarse en el HTML que llega al navegador.
  const initial = redactSecrets(await readConfig());

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
    </div>
  );
}
