import { NumerosManager } from "./_components/NumerosManager";

export const dynamic = "force-dynamic";

export default function EmbudosPage() {
  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <h1 className="text-2xl font-semibold">Embudos</h1>
      <p className="mt-2 mb-8 max-w-2xl text-muted">
        Configura los bots de WhatsApp. Todo se guarda en Supabase y el motor lo lee en
        vivo: editar aquí cambia el bot al instante, sin redesplegar nada.
      </p>

      {/* Fase 1: Números (la config técnica de cada número + qué producto vende hoy). */}
      <NumerosManager />
    </div>
  );
}
