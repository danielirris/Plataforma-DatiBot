import { readConfig } from "@plataforma/config";
import { ConfigForm } from "./ConfigForm";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const initial = await readConfig();

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <h1 className="text-2xl font-semibold">Configuración</h1>
      <p className="mt-2 mb-8 text-muted">
        Todas las API keys de cada app en un solo lugar. Al guardar, se genera el{" "}
        <code>.env</code> de cada servicio automáticamente.
      </p>
      <ConfigForm initial={initial} />
    </div>
  );
}
