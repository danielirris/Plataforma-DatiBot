import { notFound } from "next/navigation";
import { getProduct } from "@plataforma/products";
import { ProductoWizard } from "../_components/ProductoWizard";

export const dynamic = "force-dynamic";

export default async function EditarProductoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const producto = await getProduct(id);
  if (!producto) notFound();
  return <ProductoWizard producto={producto} />;
}
