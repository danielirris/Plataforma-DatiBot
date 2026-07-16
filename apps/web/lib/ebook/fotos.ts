import type { EbookFoto } from "@plataforma/products/schema";
import type { Bloque } from "./generarEbook";

// Reparte las fotos de un capítulo ENTRE sus textos (no todas al final), y les
// da variedad: la primera abre grande tras el título y el resto se alternan
// (difuminada / normal) a lo largo del capítulo.

type Variante = "big" | "soft" | undefined;

function varianteDe(i: number): Variante {
  if (i === 0) return "big"; // la que abre el capítulo: grande
  return i % 2 === 1 ? "soft" : undefined; // alterna difuminada y normal
}

/**
 * Devuelve los bloques del capítulo con las fotos intercaladas.
 *
 * - La 1ª foto va justo después del título (bloque `section`), a lo grande.
 * - Las demás se reparten de forma uniforme entre los bloques de texto.
 * - Si no hay fotos, devuelve los bloques tal cual.
 */
export function intercalarFotos(bloques: Bloque[], fotos: EbookFoto[]): Bloque[] {
  const out = [...(bloques ?? [])];
  const lista = (fotos ?? []).filter((f) => f?.nombre);
  if (!lista.length) return out;

  // El título del capítulo manda: la primera foto entra justo debajo.
  const inicio = out.length && (out[0] as { type?: string }).type === "section" ? 1 : 0;
  const cuerpo = Math.max(0, out.length - inicio); // bloques de texto disponibles
  const n = lista.length;

  // Posiciones equiespaciadas (ascendentes) dentro del cuerpo del capítulo.
  const posiciones = lista.map((_, i) =>
    i === 0 ? inicio : inicio + Math.min(cuerpo, Math.round((cuerpo * i) / n)),
  );

  // De atrás hacia delante: así insertar no desplaza las posiciones anteriores.
  for (let i = n - 1; i >= 0; i--) {
    const f = lista[i];
    const bloque: Bloque = { type: "image", src: f.nombre, caption: f.caption ?? "" };
    const v = varianteDe(i);
    if (v) bloque.variant = v;
    out.splice(posiciones[i], 0, bloque);
  }
  return out;
}
