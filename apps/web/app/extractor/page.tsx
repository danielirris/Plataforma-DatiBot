// Editor de videos — página NATIVA de Datibot (ya no es un iframe).
// Eliges un PRODUCTO, marcas cuáles de sus videos (subidos en Productos → paso
// Videos) entran a la edición, configuras y generas. El motor del extractor
// procesa esos videos por debajo (server-side, red interna).
//
// En modo solo editor (SOLO_EDITOR=1, el subdominio para gente de fuera) no hay
// productos: los videos se suben aquí mismo.

import { listProducts } from "@plataforma/products";
import { esSoloEditor } from "@/lib/modo";
import { EditorVideos } from "./EditorVideos";

export const metadata = { title: "Editor de videos · Datibot" };
export const dynamic = "force-dynamic";

export default async function ExtractorPage() {
  const soloEditor = esSoloEditor();
  // Ni se leen los productos en modo solo editor: si el servicio compartiera el
  // volumen de datos, listarlos filtraría el catálogo del dueño a quien entra
  // por el subdominio.
  const productos = soloEditor ? [] : await listProducts();
  // Se listan TODOS los productos: los anuncios necesitan videos subidos, pero
  // los B-rolls de Veo se generan sin videos (solo con los datos del producto).
  const items = productos.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    videos: p.videos ?? [],
  }));
  return <EditorVideos productos={items} soloEditor={soloEditor} />;
}
