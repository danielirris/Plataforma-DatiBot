import type { Bloque } from "./generarEbook";

// Convierte los bloques del ebook a un texto legible/editable (y de vuelta), para
// que el usuario lea y CORRIJA la redacción de cada módulo en un cuadro.
//
// Mini-formato:
//   # Título de sección            → section
//   párrafo normal (**negrita**)   → paragraph
//   - ítem                         → list
//   > Etiqueta: texto              → callout
//   chips: a, b, c                 → chips
//   ---                            → divider
// Las imágenes NO van aquí: se manejan aparte (fotos del capítulo).

function strongAmd(s: unknown): string {
  return String(s ?? "").replace(/<strong>(.*?)<\/strong>/gi, "**$1**");
}
function mdAstrong(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}
function txt(b: Bloque, k: string): string {
  return String((b as Record<string, unknown>)[k] ?? "");
}
function items(b: Bloque): string[] {
  const v = (b as Record<string, unknown>).items;
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

export function bloquesATexto(bloques: Bloque[]): string {
  const out: string[] = [];
  for (const b of bloques ?? []) {
    const t = txt(b, "type");
    if (t === "section") out.push(`# ${txt(b, "title")}`);
    else if (t === "paragraph") out.push(strongAmd(txt(b, "text")));
    else if (t === "list") out.push(items(b).map((i) => `- ${i}`).join("\n"));
    else if (t === "callout")
      out.push(`> ${txt(b, "tag") ? txt(b, "tag") + ": " : ""}${strongAmd(txt(b, "text"))}`);
    else if (t === "chips") out.push(`chips: ${items(b).join(", ")}`);
    else if (t === "divider") out.push("---");
    else if (t === "image") continue; // las fotos se manejan aparte
    else if (txt(b, "text")) out.push(strongAmd(txt(b, "text")));
  }
  return out.join("\n\n").trim();
}

export function textoABloques(texto: string): Bloque[] {
  const bloques: Bloque[] = [];
  const parrafos = String(texto ?? "").replace(/\r\n/g, "\n").split(/\n{2,}/);
  for (const raw of parrafos) {
    const p = raw.trim();
    if (!p) continue;
    if (p === "---") {
      bloques.push({ type: "divider" });
      continue;
    }
    if (p.startsWith("# ")) {
      bloques.push({ type: "section", title: p.slice(2).trim() });
      continue;
    }
    if (/^chips:/i.test(p)) {
      const its = p.replace(/^chips:/i, "").split(",").map((s) => s.trim()).filter(Boolean);
      if (its.length) bloques.push({ type: "chips", items: its });
      continue;
    }
    if (p.startsWith(">")) {
      const cuerpo = p.split("\n").map((l) => l.replace(/^>\s?/, "")).join(" ").trim();
      const m = cuerpo.match(/^([^:]{1,24}):\s*([\s\S]+)$/);
      bloques.push(
        m
          ? { type: "callout", kind: "note", tag: m[1].trim(), text: mdAstrong(m[2].trim()) }
          : { type: "callout", kind: "note", text: mdAstrong(cuerpo) },
      );
      continue;
    }
    const lineas = p.split("\n").map((l) => l.trim());
    if (lineas.length > 0 && lineas.every((l) => l.startsWith("- "))) {
      bloques.push({ type: "list", items: lineas.map((l) => l.slice(2).trim()) });
      continue;
    }
    bloques.push({ type: "paragraph", text: mdAstrong(p.replace(/\n/g, " ")) });
  }
  return bloques;
}
