// Mis anuncios — los que ya creaste, listos para ver y descargar.
// La lista sale de la galería del servicio de video (extractor).

import { MisAnuncios } from "./MisAnuncios";

export const metadata = { title: "Mis anuncios · Datibot" };
export const dynamic = "force-dynamic";

export default function AnunciosPage() {
  return <MisAnuncios />;
}
