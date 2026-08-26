import {
  CAMPOS_PRECIO,
  PAISES,
  type AnuncioReferencia,
  type Oferta,
  type PreciosPais,
  type Producto,
} from "@plataforma/products/schema";

// Exporta el dossier del producto (identidad, anuncios ganadores de referencia,
// oferta y precios) a un Markdown legible, pensado para pegárselo a una IA y que
// redacte guiones de anuncios. Solo lectura: no toca nada del producto.

function bloque(titulo: string, cuerpo: string): string {
  const c = (cuerpo ?? "").trim();
  return c ? `### ${titulo}\n\n${c}\n` : "";
}

function campo(label: string, valor: unknown): string {
  const v = String(valor ?? "").trim();
  return v ? `- **${label}:** ${v}\n` : "";
}

function seccionAnunciosReferencia(refs: AnuncioReferencia[]): string {
  const conGuion = (refs ?? []).filter((a) => a.guion?.trim());
  if (!conGuion.length) return "";
  let md = "## 2. Anuncios ganadores de referencia (avatar similar)\n\n";
  conGuion.forEach((a, i) => {
    md += `### Ganador ${i + 1}${a.titulo ? `: ${a.titulo}` : ""}${a.nicho ? ` — _nicho: ${a.nicho}_` : ""}\n\n`;
    md += `${a.guion.trim()}\n\n`;
  });
  return md;
}

function seccionOferta(o: Oferta | null): string {
  if (!o) return "";
  let md = "## 3. Oferta\n\n";
  md += campo("Nombre de la oferta", o.nombre_oferta);
  md += campo("Promesa grande", o.promesa_grande);
  md += campo("¿Incluye video?", o.incluye_video ? "Sí" : "No");
  md += "\n";

  const pp = o.producto_principal;
  if (pp) {
    md += "### Producto principal\n\n";
    md += campo("Título", pp.titulo);
    md += campo("Descripción", pp.descripcion_corta);
    const incluye = (pp.que_incluye ?? []).filter((x) => String(x).trim());
    if (incluye.length) {
      md += `- **Qué incluye:**\n`;
      for (const i of incluye) md += `  - ${i}\n`;
    }
    md += campo("Valor percibido", pp.valor_percibido_texto);
    md += "\n";
  }

  const bonos = (o.bonos ?? []).filter((b) => String(b?.titulo ?? "").trim());
  if (bonos.length) {
    md += "### Bonos\n\n";
    bonos.forEach((b, i) => {
      md += `#### Bono ${i + 1}: ${b.titulo}\n\n`;
      md += campo("Descripción", b.descripcion_corta);
      md += campo("Por qué lo incluyo", b.por_que_lo_incluyo);
      md += campo("Objeción que desactiva", b.objecion_que_desactiva);
      md += campo("Valor percibido", b.valor_percibido_texto);
      md += "\n";
    });
  }

  md += bloque("Framing del stack", o.framing_del_stack);
  md += bloque("Razón de urgencia", o.razon_de_urgencia);
  return md;
}

function seccionPrecios(precios: Record<string, PreciosPais> | undefined): string {
  // Solo los países que tienen algún precio puesto: el wizard deja en blanco los
  // que no se usan, y una fila vacía solo despista a la IA que lee el dossier.
  const conPrecio = PAISES.filter((pa) =>
    CAMPOS_PRECIO.some((c) => String(precios?.[pa.codigo]?.[c.key] ?? "").trim()),
  );
  if (!conPrecio.length) return "";

  let md = "## 4. Precios por país\n\n";
  md += `| País | ${CAMPOS_PRECIO.map((c) => c.label).join(" | ")} |\n`;
  md += `| --- | ${CAMPOS_PRECIO.map(() => "---:").join(" | ")} |\n`;
  for (const pa of conPrecio) {
    const fila = CAMPOS_PRECIO.map(
      (c) => String(precios?.[pa.codigo]?.[c.key] ?? "").trim() || "—",
    );
    md += `| ${pa.nombre} (${pa.codigo}) | ${fila.join(" | ")} |\n`;
  }
  return md;
}

export function productoAMarkdown(p: Producto): string {
  let md = `# ${p.nombre || "Producto"}\n\n`;
  md +=
    "> Dossier del producto (identidad, anuncios ganadores, oferta y precios) para redactar guiones de anuncios.\n\n";

  md += "## 1. Identidad del producto\n\n";
  md += campo("Nombre", p.nombre);
  md += campo("Promesa", p.identidad?.promesa);
  md += campo("Posicionamiento", p.identidad?.posicionamiento);
  md += campo("Dirigido a", p.identidad?.dirigidoA);
  md += "\n";

  md += seccionAnunciosReferencia(p.anunciosReferencia ?? []);
  md += seccionOferta(p.oferta);
  md += seccionPrecios(p.precios);

  return md.replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/** Nombre de archivo seguro para el .md */
export function nombreArchivoMd(p: Producto): string {
  const base =
    (p.nombre || "producto")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "producto";
  return `${base}.md`;
}
