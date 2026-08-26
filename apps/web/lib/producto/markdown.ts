import {
  type AnalisisAnuncios,
  type AnuncioReferencia,
  type GuionAnuncio,
  type Oferta,
  type Producto,
} from "@plataforma/products/schema";

// Exporta el dossier del producto (identidad, anuncios ganadores de referencia y
// oferta) a un Markdown legible, pensado para pegárselo a una IA y que redacte
// guiones de anuncios. Solo lectura: no toca nada del producto.

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

function seccionAnalisis(a: AnalisisAnuncios | null): string {
  if (!a) return "";
  const hayAlgo = [a.angulo, a.dolor, a.avatar, a.notas].some((x) => String(x ?? "").trim());
  if (!hayAlgo) return "";
  let md = "## 2.1 Análisis del material (ángulo · dolor · avatar)\n\n";
  md += bloque("Ángulo", a.angulo);
  md += bloque("Dolor / deseo central", a.dolor);
  md += bloque("Avatar al que apuntamos", a.avatar);
  md += bloque("Notas / insights", a.notas);
  return md;
}

function seccionGuionesAnuncios(guiones: GuionAnuncio[]): string {
  const conGuion = (guiones ?? []).filter((g) => g.guion?.trim());
  if (!conGuion.length) return "";
  let md = "## 4. Guiones de anuncios\n\n";
  conGuion.forEach((g, i) => {
    md += `### Anuncio ${i + 1}${g.titulo ? `: ${g.titulo}` : ""}${g.angulo ? ` — _ángulo: ${g.angulo}_` : ""}\n\n`;
    md += `${g.guion.trim()}\n\n`;
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

export function productoAMarkdown(p: Producto): string {
  let md = `# ${p.nombre || "Producto"}\n\n`;
  md +=
    "> Dossier del producto (identidad, anuncios ganadores, oferta y precios) para redactar guiones de anuncios.\n\n";

  md += "## 1. Identidad del producto\n\n";
  md += campo("Nombre", p.nombre);
  md += campo("Promesa", p.identidad?.promesa);
  md += campo("Posicionamiento", p.identidad?.posicionamiento);
  md += campo("Dirigido a", p.identidad?.dirigidoA);
  md += campo("Qué vendemos realmente", p.queVendemos);
  md += "\n";

  md += seccionAnunciosReferencia(p.anunciosReferencia ?? []);
  md += seccionAnalisis(p.analisisAnuncios);
  md += seccionOferta(p.oferta);
  md += seccionGuionesAnuncios(p.guionesAnuncios ?? []);

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
