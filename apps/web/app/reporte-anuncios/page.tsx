// Reporte de anuncios — embebe la app de atribución (anuncios.datibot.lat) DENTRO de
// Datibot, a pantalla completa y con UN SOLO inicio de sesión (token en la URL). La
// Configuración y el Tutorial de anuncios NO van aquí: viven en las secciones propias
// de Datibot (Configuración → «Configuración de anuncios» y Tutorial → «Reporte de
// anuncios»), para no duplicar accesos ni robarle espacio al panel.
import { anunciosUrl } from "@/lib/anuncios";

export const metadata = { title: "Reporte de anuncios · Datibot" };
export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // token calculado con el entorno vigente

export default function ReporteAnunciosPage() {
  return (
    <iframe
      src={anunciosUrl()}
      title="Reporte de anuncios"
      className="block h-full w-full border-0 bg-white"
      allow="clipboard-read; clipboard-write; fullscreen"
    />
  );
}
