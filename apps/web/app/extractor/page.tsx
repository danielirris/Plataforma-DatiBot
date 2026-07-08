// Editor de videos — página NATIVA de Datibot (ya no es un iframe).
// Eliges un PRODUCTO, marcas cuáles de sus videos (subidos en Productos → paso
// Videos) entran a la edición, configuras y generas. El motor del extractor
// procesa esos videos por debajo (server-side, red interna).

import { listProducts } from "@plataforma/products";
import { EditorVideos } from "./EditorVideos";

export const metadata = { title: "Editor de videos · Datibot" };
export const dynamic = "force-dynamic";

export default async function ExtractorPage() {
  const productos = await listProducts();
  const items = productos
    .filter((p) => (p.videos?.length ?? 0) > 0)
    .map((p) => ({ id: p.id, nombre: p.nombre, videos: p.videos }));
  return <EditorVideos productos={items} />;
}
