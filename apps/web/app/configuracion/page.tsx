import { readConfig } from "@plataforma/config";
import { ConfigForm } from "./ConfigForm";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const initial = await readConfig();

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <h1 className="text-2xl font-semibold">Configuración</h1>
      <p className="mt-2 mb-8 text-muted">
        Ajustes de la plataforma, en pestañas: <b>instrucciones para la IA</b>,{" "}
        <b>precios por país</b> y el <b>tutorial</b> para dar de alta un número nuevo. Las
        API keys de cada servicio se gestionan en el <b>Environment de EasyPanel</b>.
      </p>
      <ConfigForm initial={initial} />
    </div>
  );
}
