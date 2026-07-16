"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@plataforma/ui";
import {
  ebookVacio,
  type Producto,
  type EbookProducto,
  type EbookCapitulo,
} from "@plataforma/products/schema";
import { AutoTextarea } from "../productos/_components/AutoTextarea";
import { bloquesATexto, textoABloques } from "@/lib/ebook/bloquesTexto";

// Temas de diseño del motor de ebooks (carpetas en themes/).
const TEMAS_EBOOK = ["amigurumi", "arcade", "capital", "impulso", "sabores", "sereno"];

// Mensaje legible de una respuesta fallida (usa {error} si vino JSON).
async function mensajeDeError(res: Response): Promise<string> {
  const raw = await res.text().catch(() => "");
  try {
    const d = JSON.parse(raw);
    if (d?.error) return String(d.error);
  } catch {
    /* la respuesta no era JSON (401, 504, HTML de error…) */
  }
  // Página HTML del proxy (502/504 de EasyPanel): mensaje legible, no el churro.
  const t = raw.trimStart().toLowerCase();
  if (t.startsWith("<!doctype") || t.startsWith("<html")) {
    return `Error ${res.status}: el servidor tardó demasiado o se reinició (respuesta del proxy). Vuelve a intentarlo en unos segundos.`;
  }
  return `Error ${res.status}${raw ? `: ${raw.slice(0, 160)}` : ""}`;
}
function errorDeRed(e: unknown): string {
  return "Fallo de red: " + (e instanceof Error ? e.message : "desconocido");
}

// Rellena defaults del ebook por si el producto es anterior a esos campos.
function conEbook(prod: Producto): Producto {
  return { ...prod, ebook: { ...ebookVacio(), ...(prod.ebook ?? {}) } };
}

export function EbooksCreator({ productos }: { productos: Producto[] }) {
  const inicial = productos.find((x) => x.oferta) ?? productos[0];
  const [productoId, setProductoId] = useState<string>(inicial?.id ?? "");
  const [p, setP] = useState<Producto | null>(inicial ? conEbook(inicial) : null);

  const [ideaEstado, setIdeaEstado] = useState<string>("");
  const [indiceEstado, setIndiceEstado] = useState<string>("");
  const [numCapitulos, setNumCapitulos] = useState<number>(10);
  const [capEstado, setCapEstado] = useState<Record<number, string>>({});
  const [fotosEstado, setFotosEstado] = useState<Record<string, string>>({});
  const [renderEstado, setRenderEstado] = useState<string>("");
  const [guardando, setGuardando] = useState<"idle" | "guardando" | "ok" | "error">("idle");
  // Buffer editable de la redacción por capítulo (texto legible ↔ bloques).
  const [redaccion, setRedaccion] = useState<Record<number, string>>(() => {
    const r: Record<number, string> = {};
    (inicial?.ebook?.capitulos ?? []).forEach((c, i) => {
      if (c.bloques?.length) r[i] = bloquesATexto(c.bloques);
    });
    return r;
  });
  // Vista previa de un módulo (HTML del tema) en un panel.
  const [previewCap, setPreviewCap] = useState<number | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewEstado, setPreviewEstado] = useState<string>("");

  function cambiarProducto(id: string) {
    const prod = productos.find((x) => x.id === id);
    setProductoId(id);
    setP(prod ? conEbook(prod) : null);
    setIdeaEstado("");
    setIndiceEstado("");
    setCapEstado({});
    setFotosEstado({});
    setRenderEstado("");
    setGuardando("idle");
    // Precarga los cuadros de redacción desde los bloques ya guardados.
    const caps = prod?.ebook?.capitulos ?? [];
    const r: Record<number, string> = {};
    caps.forEach((c, i) => {
      if (c.bloques?.length) r[i] = bloquesATexto(c.bloques);
    });
    setRedaccion(r);
    setPreviewCap(null);
    setPreviewHtml("");
    setPreviewEstado("");
  }

  // Texto editado → bloques (preservando el eyebrow "Capítulo 0X" del módulo).
  function onRedaccionChange(i: number, valor: string) {
    setRedaccion((prev) => ({ ...prev, [i]: valor }));
    const bloques = textoABloques(valor);
    const primero = bloques[0] as { type?: string; eyebrow?: string } | undefined;
    if (primero?.type === "section" && !primero.eyebrow)
      primero.eyebrow = `Capítulo ${String(i + 1).padStart(2, "0")}`;
    setCapitulo(i, "bloques", bloques);
  }

  // ── Helpers de estado del ebook ──
  function setEbook(fn: (e: EbookProducto) => EbookProducto) {
    setP((prev) => (prev ? { ...prev, ebook: fn(prev.ebook) } : prev));
    setGuardando("idle");
  }
  function setIdeaCampo(campo: string, valor: string) {
    setEbook((e) => (e.idea ? { ...e, idea: { ...e.idea, [campo]: valor } } : e));
  }
  function setCapitulo(i: number, campo: keyof EbookCapitulo, valor: unknown) {
    setEbook((e) => {
      const capitulos = [...e.capitulos];
      capitulos[i] = { ...capitulos[i], [campo]: valor };
      return { ...e, capitulos };
    });
  }
  function removeCapitulo(i: number) {
    setEbook((e) => ({ ...e, capitulos: e.capitulos.filter((_, k) => k !== i) }));
  }

  async function generarIdeaEbook() {
    if (!p) return;
    if (!p.oferta) {
      setIdeaEstado("⚠️ El ebook nace de la oferta: genera la oferta del producto primero.");
      return;
    }
    setIdeaEstado("Generando la idea desde la oferta…");
    try {
      const res = await fetch(`/api/productos/${p.id}/ebook/idea`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ producto: p }),
      });
      if (!res.ok) {
        setIdeaEstado("⚠️ " + (await mensajeDeError(res)));
        return;
      }
      const data = await res.json();
      setEbook((e) => ({ ...e, idea: data.idea }));
      setIdeaEstado("✓ Idea lista. Ajústala a tu gusto y pasa a la Fase 2.");
    } catch (e) {
      setIdeaEstado("⚠️ " + errorDeRed(e));
    }
  }

  async function generarIndiceEbook() {
    if (!p) return;
    if (!p.ebook.idea?.titulo) {
      setIndiceEstado("⚠️ Genera la idea primero (Fase 1).");
      return;
    }
    setIndiceEstado(`Generando índice de ${numCapitulos} capítulos…`);
    try {
      const res = await fetch(`/api/productos/${p.id}/ebook/indice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ producto: p, capitulos: numCapitulos }),
      });
      if (!res.ok) {
        setIndiceEstado("⚠️ " + (await mensajeDeError(res)));
        return;
      }
      const data = await res.json();
      setEbook((e) => ({ ...e, capitulos: data.capitulos }));
      setIndiceEstado("✓ Índice listo. Edítalo y redacta capítulo a capítulo (Fase 3).");
    } catch (e) {
      setIndiceEstado("⚠️ " + errorDeRed(e));
    }
  }

  async function redactarCapitulo(i: number) {
    if (!p) return;
    setCapEstado((s) => ({ ...s, [i]: "Redactando…" }));
    try {
      const res = await fetch(`/api/productos/${p.id}/ebook/capitulo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ producto: p, index: i }),
      });
      if (!res.ok) {
        const msg = await mensajeDeError(res);
        setCapEstado((s) => ({ ...s, [i]: "⚠️ " + msg }));
        return;
      }
      const data = await res.json();
      setCapitulo(i, "bloques", data.bloques);
      setRedaccion((prev) => ({ ...prev, [i]: bloquesATexto(data.bloques) }));
      setCapEstado((s) => ({ ...s, [i]: "✓ Redactado. Lee y corrige; míralo en el visor." }));
      // Recién redactado: se muestra solo en el visor de al lado. Se le pasa el
      // producto YA con los bloques nuevos (el estado aún no se ha refrescado).
      previsualizarModulo(i, {
        ...p,
        ebook: {
          ...p.ebook,
          capitulos: p.ebook.capitulos.map((c, k) =>
            k === i ? { ...c, bloques: data.bloques } : c,
          ),
        },
      });
    } catch (e) {
      setCapEstado((s) => ({ ...s, [i]: "⚠️ " + errorDeRed(e) }));
    }
  }

  // Vista previa de UN módulo con el tema del ebook (HTML renderizado por el motor).
  // `prod`: producto ya actualizado. Hace falta al redactar, porque el estado de
  // React aún no se ha re-renderizado y `p` iría sin los bloques nuevos.
  async function previsualizarModulo(i: number, prod?: Producto) {
    const base = prod ?? p;
    if (!base) return;
    setPreviewCap(i);
    setPreviewHtml("");
    setPreviewEstado("Maquetando el módulo…");
    try {
      const res = await fetch(`/api/productos/${base.id}/ebook/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ producto: base, index: i }),
      });
      if (!res.ok) {
        setPreviewEstado("⚠️ " + (await mensajeDeError(res)));
        return;
      }
      setPreviewHtml(await res.text());
      setPreviewEstado("");
    } catch (e) {
      setPreviewEstado("⚠️ " + errorDeRed(e));
    }
  }

  // i === -1 → foto de portada; si no, fotos del capítulo i (según num_fotos).
  async function generarFotosEbook(i: number) {
    if (!p) return;
    const key = i === -1 ? "portada" : String(i);
    setFotosEstado((s) => ({ ...s, [key]: "Generando foto(s) realistas…" }));
    try {
      const res = await fetch(`/api/productos/${p.id}/ebook/fotos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ producto: p, index: i }),
      });
      if (!res.ok) {
        const msg = await mensajeDeError(res);
        setFotosEstado((s) => ({ ...s, [key]: "⚠️ " + msg }));
        return;
      }
      const data = await res.json();
      if (i === -1) setEbook((e) => ({ ...e, foto_portada: data.fotos[0] ?? null }));
      else setCapitulo(i, "fotos", data.fotos);
      setFotosEstado((s) => ({
        ...s,
        [key]:
          (data.errores?.length ? "⚠️ Algunas fallaron. " : "✓ ") +
          "Foto(s) lista(s). Guarda para conservarlas.",
      }));
    } catch (e) {
      setFotosEstado((s) => ({ ...s, [key]: "⚠️ " + errorDeRed(e) }));
    }
  }

  async function descargarEbook() {
    if (!p) return;
    setRenderEstado("Ensamblando capítulos y fotos… maquetando el PDF.");
    try {
      const res = await fetch(`/api/productos/${p.id}/ebook/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ producto: p }),
      });
      if (!res.ok) {
        setRenderEstado("⚠️ " + (await mensajeDeError(res)));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(p.ebook.idea?.titulo || p.nombre || "ebook").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setRenderEstado("✓ Ebook generado y descargado.");
    } catch (e) {
      setRenderEstado("⚠️ " + errorDeRed(e));
    }
  }

  async function guardar() {
    if (!p) return;
    setGuardando("guardando");
    try {
      const res = await fetch(`/api/products/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      if (!res.ok) throw new Error();
      const guardado = (await res.json()) as Producto;
      setP(conEbook(guardado));
      setGuardando("ok");
    } catch {
      setGuardando("error");
    }
  }

  // El capítulo que se está viendo en el visor de la derecha.
  const capPreview = previewCap != null ? p?.ebook?.capitulos?.[previewCap] : undefined;

  // ── Sin productos ──
  if (!productos.length) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-16 text-center">
        <h1 className="text-2xl font-semibold">📕 Ebooks</h1>
        <p className="mt-3 text-muted">
          El ebook nace de un <b>producto</b> y su oferta. Primero crea un producto en{" "}
          <Link href="/productos" className="text-accent-2 hover:underline">
            Productos
          </Link>{" "}
          (con su oferta), y aquí lo conviertes en un ebook para vender.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] px-6 py-10">
      <h1 className="text-2xl font-semibold">📕 Ebooks</h1>
      <p className="mt-2 mb-8 text-sm text-muted">
        Convierte un producto en un ebook para vender. El libro nace de la{" "}
        <b>oferta</b> del producto y se crea en tres fases: idea → índice → redacción
        capítulo a capítulo, con fotos realistas generadas con IA. Ve creando{" "}
        <b>módulo a módulo</b> y míralo maquetado en el visor de la derecha.
      </p>

      {/* Izquierda: creación · Derecha: visor del módulo (pegado al scroll). */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
        <div className="min-w-0">

      {/* Producto */}
      <div className="space-y-2 rounded-2xl border border-[var(--hairline)] glass p-5">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Producto</span>
          <select
            value={productoId}
            onChange={(e) => cambiarProducto(e.target.value)}
            className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
          >
            {productos.map((prod) => (
              <option key={prod.id} value={prod.id}>
                {prod.nombre || "(sin nombre)"}
                {prod.oferta ? "" : "  · sin oferta"}
              </option>
            ))}
          </select>
        </label>
        {p && !p.oferta && (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            Este producto aún no tiene <b>oferta</b>. El ebook nace de ella:{" "}
            <Link href={`/productos/${p.id}`} className="underline">
              genera la oferta en el producto
            </Link>{" "}
            y vuelve aquí.
          </p>
        )}
      </div>

      {p && (
        <section className="mt-4 space-y-5">
          {/* ── Órdenes para la IA: mandan sobre la oferta en las 3 fases ── */}
          <div className="space-y-2 rounded-2xl border border-[var(--hairline)] glass p-5">
            <div>
              <p className="text-sm font-medium text-text">🎯 Órdenes para la IA</p>
              <p className="mt-1 text-xs text-muted">
                Dile de qué va el libro y <b>mandan sobre la oferta</b>. Sin esto, la IA
                escribe sobre el negocio (captar clientes, fidelizar) en vez del tema.
                Pídele también <b>cantidad</b>: es lo que hace el libro largo y con
                contenido puro.
              </p>
            </div>
            <AutoTextarea
              value={p.ebook.instrucciones ?? ""}
              onChange={(e) => setEbook((eb) => ({ ...eb, instrucciones: e.target.value }))}
              rows={3}
              placeholder={
                "Ej.: Céntrate SOLO en la limpieza facial: nada de captar clientes, marketing ni fidelización.\n" +
                "Cubre los 5 tipos de piel y, para cada uno, 8 sesiones distintas paso a paso (40 en total).\n" +
                "Incluye para cada sesión: productos, tiempos y contraindicaciones."
              }
              className="w-full rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
            <p className="text-[11px] text-muted">
              Se aplican al generar la <b>idea</b>, el <b>índice</b> y cada <b>módulo</b>. Si
              cambias las órdenes, regenera el índice para que se noten.
            </p>
          </div>

          {/* ── Fase 1: Idea ── */}
          <div className="space-y-3 rounded-2xl border border-[var(--hairline)] glass p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent-2">
                Fase 1 · Idea
              </span>
              <button
                onClick={generarIdeaEbook}
                disabled={!p.oferta}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                💡 {p.ebook.idea ? "Regenerar idea" : "Generar idea (desde la oferta)"}
              </button>
              <span className="text-sm text-muted">{ideaEstado}</span>
            </div>
            {p.ebook.idea && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(
                  [
                    { k: "titulo", l: "Título del libro" },
                    { k: "subtitulo", l: "Subtítulo" },
                    { k: "concepto", l: "Concepto (guía toda la redacción)" },
                    { k: "publico", l: "Público" },
                  ] as const
                ).map((f) => (
                  <label
                    key={f.k}
                    className={cn("flex flex-col gap-1 text-sm", f.k === "concepto" && "sm:col-span-2")}
                  >
                    <span className="text-muted">{f.l}</span>
                    <AutoTextarea
                      value={p.ebook.idea?.[f.k] ?? ""}
                      onChange={(e) => setIdeaCampo(f.k, e.target.value)}
                      rows={f.k === "concepto" ? 2 : 1}
                      className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
                    />
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* ── Fase 2: Índice ── */}
          <div className="space-y-3 rounded-2xl border border-[var(--hairline)] glass p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent-2">
                Fase 2 · Índice
              </span>
              <button
                onClick={generarIndiceEbook}
                disabled={!p.ebook.idea}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                📑 {p.ebook.capitulos.length ? "Regenerar índice" : "Generar índice"}
              </button>
              <label className="flex items-center gap-2 text-sm text-muted">
                Capítulos:
                <input
                  type="number"
                  min={4}
                  max={20}
                  value={numCapitulos}
                  onChange={(e) => setNumCapitulos(Number(e.target.value))}
                  className="w-16 rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-2 py-1 text-text outline-none focus:border-accent"
                />
              </label>
              <span className="text-sm text-muted">{indiceEstado}</span>
            </div>
            {p.ebook.capitulos.length > 0 && (
              <p className="text-xs text-muted">
                Edita títulos y resúmenes antes de redactar. Regenerar el índice
                descarta los capítulos ya redactados.
              </p>
            )}
          </div>

          {/* ── Fase 3: Redacción + fotos ── */}
          {p.ebook.capitulos.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--hairline)] glass p-4">
                <span className="rounded bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent-2">
                  Fase 3 · Redacción
                </span>
                <span className="text-sm text-muted">
                  {p.ebook.capitulos.filter((c) => c.bloques?.length).length}/
                  {p.ebook.capitulos.length} capítulos redactados
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => generarFotosEbook(-1)}
                    className="rounded border border-[var(--hairline)] px-3 py-1.5 text-xs text-muted hover:text-text"
                  >
                    {p.ebook.foto_portada ? "🖼 Regenerar portada" : "🖼 Foto de portada"}
                  </button>
                  {fotosEstado["portada"] && (
                    <span className="text-xs text-muted">{fotosEstado["portada"]}</span>
                  )}
                </div>
              </div>
              {p.ebook.foto_portada && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.ebook.foto_portada.url}
                  alt="portada"
                  className="h-32 w-32 rounded-xl border border-[var(--hairline)] object-cover"
                />
              )}

              {p.ebook.capitulos.map((cap, i) => (
                <div
                  key={i}
                  className="space-y-2 rounded-2xl border border-[var(--hairline)] glass p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 text-xs",
                        cap.bloques?.length
                          ? "bg-accent/20 text-accent-2"
                          : "bg-[var(--field)] text-muted",
                      )}
                    >
                      {i + 1} {cap.bloques?.length ? "✓" : "· pendiente"}
                    </span>
                    <AutoTextarea
                      value={cap.titulo}
                      onChange={(e) => setCapitulo(i, "titulo", e.target.value)}
                      rows={1}
                      placeholder="Título del capítulo"
                      className="min-w-[12rem] flex-1 rounded border border-[var(--hairline)] bg-[var(--field)] px-2 py-1 text-sm font-medium text-text outline-none focus:border-accent"
                    />
                    <button
                      onClick={() => redactarCapitulo(i)}
                      className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white"
                    >
                      {cap.bloques?.length ? "Re-redactar" : "✍️ Redactar"}
                    </button>
                    <button
                      onClick={() => removeCapitulo(i)}
                      className="rounded border border-[var(--hairline)] px-2 py-1 text-xs text-muted hover:text-red-400"
                      title="Quitar capítulo"
                    >
                      ✕
                    </button>
                  </div>
                  <AutoTextarea
                    value={cap.resumen}
                    onChange={(e) => setCapitulo(i, "resumen", e.target.value)}
                    rows={1}
                    placeholder="Resumen: qué cubre este capítulo"
                    className="w-full rounded border border-[var(--hairline)] bg-[var(--field)] px-2 py-1 text-sm text-text outline-none focus:border-accent"
                  />

                  {/* Redacción del módulo: editable + vista previa con el tema. */}
                  {cap.bloques?.length ? (
                    <div className="space-y-2 rounded-lg border border-[var(--hairline)] bg-[var(--field)]/40 p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-medium text-muted">
                          📝 Redacción del módulo — léela y corrígela
                        </span>
                        <button
                          onClick={() => previsualizarModulo(i)}
                          className={cn(
                            "rounded border px-2 py-1 text-xs font-medium",
                            previewCap === i
                              ? "border-accent bg-accent text-white"
                              : "border-accent/50 bg-accent/10 text-accent-2",
                          )}
                        >
                          {previewCap === i ? "👁 Viéndose al lado" : "👁 Ver al lado"}
                        </button>
                      </div>
                      <textarea
                        value={redaccion[i] ?? ""}
                        onChange={(e) => onRedaccionChange(i, e.target.value)}
                        rows={12}
                        spellCheck
                        className="w-full resize-y rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 font-mono text-xs leading-relaxed text-text outline-none focus:border-accent"
                      />
                      <p className="text-[11px] text-muted">
                        Formato: <code># Título</code>, párrafos normales,{" "}
                        <code>- lista</code>, <code>&gt; Tip: …</code>,{" "}
                        <code>**negrita**</code>. Guarda el ebook para conservar los cambios.
                      </p>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-muted">
                      Fotos:
                      <select
                        value={cap.num_fotos}
                        onChange={(e) => setCapitulo(i, "num_fotos", Number(e.target.value))}
                        className="rounded border border-[var(--hairline)] bg-[var(--field)] px-1.5 py-0.5 text-xs text-text outline-none focus:border-accent"
                      >
                        {[0, 1, 2, 3, 4].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                    {cap.num_fotos > 0 && (
                      <button
                        onClick={() => generarFotosEbook(i)}
                        className="rounded border border-[var(--hairline)] px-2 py-1 text-xs text-muted hover:text-text"
                      >
                        📷 {cap.fotos?.length ? "Regenerar fotos" : "Generar fotos"}
                      </button>
                    )}
                    {capEstado[i] && <span className="text-xs text-muted">{capEstado[i]}</span>}
                    {fotosEstado[String(i)] && (
                      <span className="text-xs text-muted">{fotosEstado[String(i)]}</span>
                    )}
                  </div>
                  {(cap.fotos?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {cap.fotos.map((f, k) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={k}
                          src={f.url}
                          alt={f.nombre}
                          className="h-20 w-20 rounded-lg border border-[var(--hairline)] object-cover"
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── PDF final ── */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--hairline)] glass p-4">
            <button
              onClick={descargarEbook}
              disabled={
                !p.ebook.capitulos.length ||
                p.ebook.capitulos.some((c) => !c.bloques?.length)
              }
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              📕 Generar PDF
            </button>
            <label className="flex items-center gap-2 text-sm text-muted">
              Tema de diseño:
              <select
                value={p.ebook.tema}
                onChange={(e) => setEbook((eb) => ({ ...eb, tema: e.target.value }))}
                className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-2 py-1 text-text outline-none focus:border-accent"
              >
                {TEMAS_EBOOK.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-sm text-muted">{renderEstado}</span>
          </div>

          {/* Guardar */}
          <div className="sticky bottom-0 flex items-center gap-3 border-t border-[var(--hairline)] bg-bg/80 py-4 backdrop-blur">
            <button
              onClick={guardar}
              disabled={guardando === "guardando"}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {guardando === "guardando" ? "Guardando…" : "Guardar ebook"}
            </button>
            {guardando === "ok" && <span className="text-sm text-accent-2">✓ Guardado</span>}
            {guardando === "error" && <span className="text-sm text-red-400">Error al guardar</span>}
          </div>
        </section>
      )}
        </div>

        {/* ── Visor: el módulo maquetado, al lado y siempre a la vista ── */}
        <aside className="xl:sticky xl:top-6 xl:self-start">
          <div className="flex h-[calc(100vh-8rem)] min-h-[520px] flex-col overflow-hidden rounded-2xl border border-[var(--hairline)] glass">
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--hairline)] px-4 py-3">
              <span className="text-sm font-medium text-text">👁 Visor del módulo</span>
              {capPreview && (
                <span className="rounded bg-accent/15 px-2 py-0.5 text-xs text-accent-2">
                  {(previewCap ?? 0) + 1}. {capPreview.titulo || "sin título"}
                </span>
              )}
              {previewCap != null && (
                <button
                  onClick={() => previsualizarModulo(previewCap)}
                  className="ml-auto rounded border border-[var(--hairline)] px-2 py-1 text-xs text-muted hover:text-text"
                  title="Vuelve a maquetar con lo que acabas de escribir"
                >
                  🔄 Actualizar
                </button>
              )}
            </div>

            {previewCap == null ? (
              <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted">
                <span>
                  Redacta un módulo y pulsa <b>👁 Ver al lado</b> para verlo aquí
                  maquetado con el tema, mientras lo corriges.
                </span>
              </div>
            ) : previewEstado ? (
              <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted">
                <span>{previewEstado}</span>
              </div>
            ) : (
              <iframe
                title="visor-modulo"
                srcDoc={previewHtml}
                className="flex-1 w-full bg-white"
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
