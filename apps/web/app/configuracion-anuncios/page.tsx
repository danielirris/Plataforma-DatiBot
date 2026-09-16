// Configuración de anuncios — embebe la pantalla de Configuración de la app de
// anuncios (conexiones de Facebook, Supabase, tasas) DENTRO de Datibot, a pantalla
// completa y con la misma sesión (token en la URL + ?pagina=configuracion). Así no
// se abre en otra pestaña: se navega aquí desde Configuración → «Configuración de
// anuncios».
import Link from "next/link";
import { anunciosUrl } from "@/lib/anuncios";
import { AnunciosFrame } from "../_components/AnunciosFrame";

export const metadata = { title: "Configuración de anuncios · Datibot" };
export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // token calculado con el entorno vigente

export default function ConfiguracionAnunciosPage() {
  return (
    <div className="flex h-full flex-col">
      {/* Barra slim para volver (el panel de anuncios no tiene menú a Datibot). */}
      <div className="flex items-center gap-2 border-b border-[var(--hairline)] px-4 py-2">
        <Link
          href="/configuracion"
          className="rounded-lg border border-[var(--hairline)] px-3 py-1.5 text-xs text-muted hover:border-accent/50 hover:text-text"
        >
          ← Configuración
        </Link>
        <span className="text-xs text-muted">Configuración de anuncios</span>
      </div>

      <AnunciosFrame
        baseSrc={anunciosUrl("configuracion")}
        title="Configuración de anuncios"
        className="block w-full flex-1 border-0"
      />
    </div>
  );
}
