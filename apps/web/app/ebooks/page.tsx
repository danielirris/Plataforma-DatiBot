// Ebooks — convierte un producto en un ebook (idea → índice → redacción → PDF).
// Nativo (con el tema de Datibot); ya no es un iframe al motor externo.

import { listProducts } from "@plataforma/products";
import { EbooksCreator } from "./EbooksCreator";

export const metadata = { title: "Ebooks · Datibot" };
export const dynamic = "force-dynamic";

export default async function EbooksPage() {
  const productos = await listProducts();
  return <EbooksCreator productos={productos} />;
}
