import {
  AVATAR_SECCIONES,
  CAMPOS_PRECIO,
  PAISES,
  type Avatar,
  type Angulo,
  type Oferta,
  type PreciosPais,
  type Producto,
} from "@plataforma/products/schema";

// Exporta TODO lo investigado del producto (identidad, avatar, ángulos, oferta y
// precios) a un Markdown legible, pensado para pegárselo a una IA y que redacte
// guiones de anuncios. Solo lectura: no toca nada del producto.

function bloque(titulo: string, cuerpo: string): string {
  const c = (cuerpo ?? "").trim();
  return c ? `### ${titulo}\n\n${c}\n` : "";
}

function campo(label: string, valor: unknown): string {
  const v = String(valor ?? "").trim();
  return v ? `- **${label}:** ${v}\n` : "";
}

function seccionAvatar(a: Avatar): string {
  if (!a) return "";
  let md = "## 2. Avatar (investigación del público)\n\n";
  for (const s of AVATAR_SECCIONES) {
    md += bloque(s.label, String((a as unknown as Record<string, unknown>)[s.key] ?? ""));
  }

  const compra = a.objeciones_compra ?? [];
  if (compra.length) {
    md += "### Objeciones de COMPRA (frenan el pago)\n\n";
    compra.forEach((o, i) => {
      md += `${i + 1}. **«${o.objecion}»** _(${o.categoria})_\n`;
      if (o.respuesta_sugerida) md += `   - Respuesta sugerida: ${o.respuesta_sugerida}\n`;
    });
    md += "\n";
  }

  const uso = a.objeciones_uso ?? [];
  if (uso.length) {
    md += "### Objeciones de USO (frenan después de comprar)\n\n";
    uso.forEach((o, i) => {
      md += `${i + 1}. **«${o.objecion}»** _(${o.categoria})_\n`;
      if (o.respuesta_sugerida) md += `   - Respuesta sugerida: ${o.respuesta_sugerida}\n`;
    });
    md += "\n";
  }

  const fuentes = a.fuentes ?? [];
  if (fuentes.length) {
    md += "### Fuentes de la investigación\n\n";
    for (const f of fuentes) md += `- [${f.titulo || f.url}](${f.url})\n`;
    md += "\n";
  }
  return md;
}

function seccionAngulos(angulos: Angulo[]): string {
  if (!angulos?.length) return "";
  let md = "## 3. Ángulos publicitarios\n\n";
  angulos.forEach((g, i) => {
    md += `### Ángulo ${i + 1}: ${g.nombre || "(sin nombre)"}${g.tipo ? ` — _${g.tipo}_` : ""}\n\n`;
    md += campo("Promesa central", g.promesa_central);
    md += campo("Gran idea (titular)", g.gran_idea);
    md += campo("Público del ángulo", g.publico_objetivo_del_angulo);
    md += campo("Emoción dominante", g.emocion_dominante);
    md += campo("Dolor/deseo atacado", g.dolor_o_deseo_atacado);
    md += campo("Prueba/evidencia", g.prueba_o_evidencia);
    const hooks = g.hooks ?? [];
    if (hooks.length) {
      md += `\n**Ganchos:**\n\n`;
      hooks.forEach((h, k) => {
        md += `${k + 1}. «${h.texto}»${h.mecanismo ? ` — _${h.mecanismo}_` : ""}\n`;
        if (h.por_que_funciona) md += `   - Por qué funciona: ${h.por_que_funciona}\n`;
      });
    }
    md += "\n";
  });
  return md;
}

function seccionOferta(o: Oferta | null): string {
  if (!o) return "";
  let md = "## 4. Oferta\n\n";
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

  let md = "## 5. Precios por país\n\n";
  md += `| País | ${CAMPOS_PRECIO.map((c) => c.label).join(" | ")} |\n`;
  md += `| --- | ${CAMPOS_PRECIO.map(() => "---:").join(" | ")} |\n`;
  for (const pa of conPrecio) {
    const fila = CAMPOS_PRECIO.map(
      (c) => String(precios?.[pa.codigo]?.[c.key] ?? "").trim() || "—",
    );
    md += `| ${pa.nombre} (${pa.codigo}) | ${fila.join(" | ")} |\n`;
  }
  md +=
    "\n> Cifras sin moneda, tal como se cargaron. El combo, los regateos y los pisos\n" +
    "> los deriva el motor a partir de estos precios: no se guardan aquí.\n";
  return md;
}

export function productoAMarkdown(p: Producto): string {
  let md = `# ${p.nombre || "Producto"}\n\n`;
  md +=
    "> Dossier del producto (identidad, avatar, ángulos, oferta y precios) para redactar guiones de anuncios.\n\n";

  md += "## 1. Identidad del producto\n\n";
  md += campo("Nombre", p.nombre);
  md += campo("Promesa", p.identidad?.promesa);
  md += campo("Posicionamiento", p.identidad?.posicionamiento);
  md += campo("Dirigido a", p.identidad?.dirigidoA);
  md += "\n";

  md += seccionAvatar(p.avatar);
  md += seccionAngulos(p.angulos ?? []);
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
