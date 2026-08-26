"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  crearProductoBorrador,
  MIN_BONOS,
  MAX_BONOS,
  ofertaVacia,
  activoVacio,
  bonoVacio,
  ebookVacio,
  anuncioReferenciaVacio,
  type VideoProducto,
  type AnuncioReferencia,
  type Oferta,
  type BonoOferta,
  type ActivoExistente,
  type Producto,
} from "@plataforma/products/schema";
import { cn } from "@plataforma/ui";
import { AutoTextarea } from "./AutoTextarea";
import { productoAMarkdown, nombreArchivoMd } from "@/lib/producto/markdown";
import { mensajeDeError, errorDeRed } from "@/lib/http/errores";
import { subirPorTrozos } from "@/lib/uploads/cliente";

const PASOS = [
  { key: "identidad", label: "1 · Identidad" },
  { key: "anuncios", label: "2 · Anuncios ganadores" },
  { key: "oferta", label: "3 · Oferta" },
  { key: "video", label: "4 · Video de embudo" },
  { key: "videos", label: "5 · Videos" },
] as const;

// Pasos ya implementados.
const DISPONIBLES = new Set(["identidad", "anuncios", "oferta", "video", "videos"]);

export function ProductoWizard({ producto }: { producto?: Producto }) {
  const router = useRouter();
  const [p, setP] = useState<Producto>(() => {
    const base = crearProductoBorrador();
    if (!producto) return base;
    // Rellena defaults por si el producto viene de antes de agregar campos nuevos.
    return {
      ...base,
      ...producto,
      anunciosReferencia: producto.anunciosReferencia ?? base.anunciosReferencia,
      oferta: producto.oferta ?? null,
      guionEmbudo: producto.guionEmbudo ?? null,
      ebook: { ...ebookVacio(), ...(producto.ebook ?? {}) },
      videos: producto.videos ?? [],
    };
  });
  const [paso, setPaso] = useState<string>("identidad");
  const [estado, setEstado] = useState<"idle" | "guardando" | "ok" | "error">("idle");
  const [ofertaEstado, setOfertaEstado] = useState<string>("");
  const [incluyeVideo, setIncluyeVideo] = useState<boolean>(
    producto?.oferta?.incluye_video ?? false,
  );
  const [videoEstado, setVideoEstado] = useState<string>("");
  const [subiendoVideo, setSubiendoVideo] = useState<boolean>(false);
  const [guionEstado, setGuionEstado] = useState<string>("");

  const esNuevo = !p.id;

  function setCampo(campo: keyof Producto, valor: unknown) {
    setP((prev) => ({ ...prev, [campo]: valor }));
    setEstado("idle");
  }
  // Descarga el dossier del producto (identidad + anuncios ganadores + oferta +
  // precios) en Markdown, para pasárselo a una IA y que redacte los guiones de
  // anuncios. Lee el estado vivo: lo que se acaba de teclear ya sale, sin guardar.
  function descargarMarkdown() {
    const md = productoAMarkdown(p);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nombreArchivoMd(p);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  function setIdentidad(campo: keyof Producto["identidad"], valor: string) {
    setP((prev) => ({ ...prev, identidad: { ...prev.identidad, [campo]: valor } }));
    setEstado("idle");
  }
  // ── Anuncios ganadores de referencia ──────────────────────────
  function setAnuncio(i: number, campo: keyof AnuncioReferencia, valor: string) {
    setP((prev) => {
      const lista = [...(prev.anunciosReferencia ?? [])];
      lista[i] = { ...lista[i], [campo]: valor };
      return { ...prev, anunciosReferencia: lista };
    });
    setEstado("idle");
  }
  function addAnuncio() {
    setP((prev) => ({
      ...prev,
      anunciosReferencia: [...(prev.anunciosReferencia ?? []), anuncioReferenciaVacio()],
    }));
  }
  function removeAnuncio(i: number) {
    setP((prev) => ({
      ...prev,
      anunciosReferencia: (prev.anunciosReferencia ?? []).filter((_, k) => k !== i),
    }));
  }

  // ── Oferta ──────────────────────────────────────────────────
  function updateOferta(fn: (o: Oferta) => Oferta) {
    setP((prev) => (prev.oferta ? { ...prev, oferta: fn(prev.oferta) } : prev));
  }
  function setOfertaCampo(campo: keyof Oferta, valor: string) {
    updateOferta((o) => ({ ...o, [campo]: valor }));
  }
  function setOfertaPP(campo: keyof Oferta["producto_principal"], valor: string) {
    updateOferta((o) => ({ ...o, producto_principal: { ...o.producto_principal, [campo]: valor } }));
  }
  function setOfertaPPCantidad(n: number) {
    updateOferta((o) => ({ ...o, producto_principal: { ...o.producto_principal, cantidad: n } }));
  }
  function setQueIncluye(i: number, valor: string) {
    updateOferta((o) => {
      const q = [...o.producto_principal.que_incluye];
      q[i] = valor;
      return { ...o, producto_principal: { ...o.producto_principal, que_incluye: q } };
    });
  }
  function addQueIncluye() {
    updateOferta((o) => ({
      ...o,
      producto_principal: {
        ...o.producto_principal,
        que_incluye: [...o.producto_principal.que_incluye, ""],
      },
    }));
  }
  function removeQueIncluye(i: number) {
    updateOferta((o) => ({
      ...o,
      producto_principal: {
        ...o.producto_principal,
        que_incluye: o.producto_principal.que_incluye.filter((_, k) => k !== i),
      },
    }));
  }
  function setBono(i: number, campo: keyof BonoOferta, valor: string) {
    updateOferta((o) => {
      const bonos = [...o.bonos];
      bonos[i] = { ...bonos[i], [campo]: valor };
      return { ...o, bonos };
    });
  }
  function addBono() {
    updateOferta((o) =>
      o.bonos.length >= MAX_BONOS ? o : { ...o, bonos: [...o.bonos, bonoVacio()] },
    );
  }
  function removeBono(i: number) {
    updateOferta((o) =>
      o.bonos.length <= MIN_BONOS ? o : { ...o, bonos: o.bonos.filter((_, k) => k !== i) },
    );
  }

  // ── Lo que ya tengo (activos existentes desde donde arranca la oferta) ──
  // Editable aun sin oferta: al añadir el primero se inicializa una oferta vacía
  // para que ``ya_tengo`` tenga dónde vivir; luego "Generar oferta" lo respeta.
  function addActivo() {
    setP((prev) => {
      const of = prev.oferta ?? ofertaVacia();
      return { ...prev, oferta: { ...of, ya_tengo: [...(of.ya_tengo ?? []), activoVacio()] } };
    });
  }
  function setActivo(i: number, campo: keyof ActivoExistente, valor: string) {
    setP((prev) => {
      const of = prev.oferta ?? ofertaVacia();
      const lista = [...(of.ya_tengo ?? [])];
      lista[i] = { ...lista[i], [campo]: valor } as ActivoExistente;
      return { ...prev, oferta: { ...of, ya_tengo: lista } };
    });
  }
  function removeActivo(i: number) {
    setP((prev) =>
      prev.oferta
        ? { ...prev, oferta: { ...prev.oferta, ya_tengo: (prev.oferta.ya_tengo ?? []).filter((_, k) => k !== i) } }
        : prev,
    );
  }

  async function generarOferta() {
    if (!p.id) {
      setOfertaEstado("⚠️ Guarda el producto primero (paso Identidad).");
      return;
    }
    setOfertaEstado("Generando oferta con IA…");
    try {
      const res = await fetch(`/api/productos/${p.id}/generar-oferta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ producto: p, incluye_video: incluyeVideo }),
      });
      if (!res.ok) {
        setOfertaEstado("⚠️ " + (await mensajeDeError(res)));
        return;
      }
      const data = await res.json();
      setP((prev) => ({ ...prev, oferta: data.oferta }));
      setOfertaEstado("✓ Oferta generada. Revisa y ajusta.");
    } catch (e) {
      setOfertaEstado("⚠️ " + errorDeRed(e));
    }
  }

  async function guardar(): Promise<Producto | null> {
    setEstado("guardando");
    try {
      const res = await fetch(
        esNuevo ? "/api/products" : `/api/products/${p.id}`,
        {
          method: esNuevo ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p),
        },
      );
      if (!res.ok) throw new Error();
      const guardado = (await res.json()) as Producto;
      setP(guardado);
      setEstado("ok");
      if (esNuevo) router.replace(`/productos/${guardado.id}`);
      return guardado;
    } catch {
      setEstado("error");
      return null;
    }
  }

  // Genera el GUIÓN del video de embudo con IA (a partir de los anuncios ganadores
  // + la oferta). El guión se guarda en producto.guionEmbudo.
  async function generarGuion() {
    if (!p.id) {
      setGuionEstado("⚠️ Guarda el producto primero (paso Identidad).");
      return;
    }
    setGuionEstado("Generando el guión del video de embudo… (puede tardar)");
    try {
      const res = await fetch(`/api/productos/${p.id}/generar-guion-embudo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ producto: p }),
      });
      if (!res.ok) {
        setGuionEstado("⚠️ " + (await mensajeDeError(res)));
        return;
      }
      const data = await res.json();
      setP((prev) => ({ ...prev, guionEmbudo: data.guionEmbudo }));
      setGuionEstado("✓ Guión generado. Revisa y ajusta antes de guardar.");
    } catch (e) {
      setGuionEstado("⚠️ " + errorDeRed(e));
    }
  }

  // ── Videos del producto (materia prima para editar los anuncios) ──
  // Subida POR TROZOS de 4 MB: el proxy no puede cortar archivos grandes porque
  // cada petición es pequeña (adiós al límite de ~23 MB del servidor).
  async function subirVideos(files: FileList | null) {
    if (!files?.length) return;
    if (!p.id) {
      setVideoEstado("⚠️ Guarda el producto primero (paso Identidad).");
      return;
    }
    setSubiendoVideo(true);
    const lista = Array.from(files);
    const fallos: string[] = [];
    let subidos = 0;
    for (let i = 0; i < lista.length; i++) {
      const file = lista[i];
      try {
        const data = await subirPorTrozos<{ video: VideoProducto; aviso?: string }>(
          `/api/productos/${p.id}/videos/chunk`,
          file,
          (pct) => setVideoEstado(`Subiendo ${i + 1}/${lista.length}: ${file.name} (${pct}%)…`),
        );
        setP((prev) => ({ ...prev, videos: [...(prev.videos ?? []), data.video] }));
        if (data.aviso) fallos.push(`${file.name}: ${data.aviso}`);
        subidos += 1;
      } catch (e) {
        // Un archivo que falla no tumba los demás.
        fallos.push(`${file.name}: ${e instanceof Error ? e.message : "error"}`);
      }
    }
    setVideoEstado(
      fallos.length
        ? `${subidos ? `✓ ${subidos} subido(s). ` : ""}⚠️ ${fallos.join(" · ")}`
        : "✓ Videos subidos. Guarda para conservarlos.",
    );
    setSubiendoVideo(false);
  }

  async function quitarVideo(url: string) {
    setP((prev) => ({ ...prev, videos: (prev.videos ?? []).filter((v) => v.url !== url) }));
    try {
      await fetch("/api/images/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
    } catch {
      /* aunque falle el borrado remoto, ya se quitó del producto */
    }
    setVideoEstado("✓ Video quitado. Guarda para conservar el cambio.");
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/productos" className="text-sm text-muted hover:text-text">
          ← Productos
        </Link>
        <h1 className="text-2xl font-semibold">
          {esNuevo ? "Nuevo producto" : p.nombre || "Producto"}
        </h1>
      </div>

      {/* Stepper */}
      <div className="mb-8 flex flex-wrap gap-2">
        {PASOS.map((s) => {
          const activo = s.key === paso;
          const disponible = DISPONIBLES.has(s.key);
          return (
            <button
              key={s.key}
              onClick={() => disponible && setPaso(s.key)}
              disabled={!disponible}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm",
                activo ? "border-accent bg-accent/15 text-text" : "border-[var(--hairline)] text-muted",
                !disponible && "opacity-50",
              )}
            >
              {s.label}
              {!disponible && <span className="ml-1 text-[10px]">pronto</span>}
            </button>
          );
        })}
      </div>

      {paso === "identidad" && (
        <section className="space-y-4 rounded-xl border border-[var(--hairline)] glass p-5">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Nombre del producto</span>
            <AutoTextarea
              value={p.nombre}
              onChange={(e) => setCampo("nombre", e.target.value)}
              rows={1}
              placeholder="chorizos para emprender desde casa"
              className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">
              productoId <span className="text-xs">(identificador propio, no el de pago)</span>
            </span>
            <input
              value={p.productoId}
              onChange={(e) => setCampo("productoId", e.target.value)}
              placeholder="CHZ-001"
              className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 font-mono text-text outline-none focus:border-accent"
            />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="text-muted">Promesa principal</span>
              <AutoTextarea
                value={p.identidad.promesa}
                onChange={(e) => setIdentidad("promesa", e.target.value)}
                rows={2}
                placeholder="qué resultado logra el cliente"
                className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">Posicionamiento</span>
              <AutoTextarea
                value={p.identidad.posicionamiento}
                onChange={(e) => setIdentidad("posicionamiento", e.target.value)}
                rows={2}
                placeholder="idea / ángulo del producto"
                className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">Dirigido a (general, sin avatar)</span>
              <AutoTextarea
                value={p.identidad.dirigidoA}
                onChange={(e) => setIdentidad("dirigidoA", e.target.value)}
                rows={2}
                placeholder="a quién va dirigido en términos generales"
                className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
              />
            </label>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={guardar}
              disabled={estado === "guardando" || !p.nombre.trim()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {estado === "guardando" ? "Guardando…" : "Guardar borrador"}
            </button>
            {estado === "ok" && <span className="text-sm text-accent-2">✓ Guardado</span>}
            {estado === "error" && <span className="text-sm text-red-400">Error al guardar</span>}
          </div>
        </section>
      )}


      {paso === "anuncios" && (
        <section className="space-y-5">
          <div className="rounded-xl border border-[var(--hairline)] glass p-4 text-sm text-muted">
            Pega aquí los <b>guiones de anuncios ganadores</b> de la competencia o del
            nicho con un avatar MUY similar al de tu producto (ej.: vendes neveras y
            encontraste un ganador de aires acondicionados; o vender pudines vs. vender
            paletas). Son la base creativa: de aquí salen el guión del video de embudo
            y el ángulo de tus anuncios.
          </div>

          {(p.anunciosReferencia ?? []).map((a, i) => (
            <div
              key={i}
              className="space-y-3 rounded-xl border border-[var(--hairline)] glass p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-text">Ganador #{i + 1}</span>
                <button
                  onClick={() => removeAnuncio(i)}
                  className="text-xs text-muted hover:text-red-400"
                >
                  Quitar
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">Título</span>
                  <input
                    value={a.titulo}
                    onChange={(e) => setAnuncio(i, "titulo", e.target.value)}
                    placeholder="Ganador aires acondicionados"
                    className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">Nicho / producto original</span>
                  <input
                    value={a.nicho}
                    onChange={(e) => setAnuncio(i, "nicho", e.target.value)}
                    placeholder="aires acondicionados"
                    className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Guión del anuncio ganador</span>
                <AutoTextarea
                  value={a.guion}
                  onChange={(e) => setAnuncio(i, "guion", e.target.value)}
                  rows={5}
                  placeholder="Pega aquí el guión/copy completo del anuncio ganador…"
                  className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
                />
              </label>
            </div>
          ))}

          <button
            onClick={addAnuncio}
            className="rounded-lg border border-accent/50 bg-accent/10 px-4 py-2 text-sm font-medium text-accent-2"
          >
            + Agregar anuncio ganador
          </button>

          {/* Dossier del producto (identidad + anuncios + oferta) para pasárselo a una IA. */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--hairline)] glass p-4">
            <button
              onClick={descargarMarkdown}
              className="rounded-lg border border-accent/50 bg-accent/10 px-4 py-2 text-sm font-medium text-accent-2"
            >
              ⬇️ Descargar dossier (.md)
            </button>
            <span className="text-xs text-muted">
              Baja <b>identidad + anuncios ganadores + oferta</b> en un <code>.md</code> para
              pasárselo a una IA y que te redacte los guiones de los anuncios.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--hairline)] glass p-4">
            <button
              onClick={guardar}
              disabled={estado === "guardando"}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {estado === "guardando" ? "Guardando…" : "Guardar anuncios"}
            </button>
            {estado === "ok" && <span className="text-sm text-accent-2">✓ Guardado</span>}
            {estado === "error" && <span className="text-sm text-red-400">Error al guardar</span>}
          </div>
        </section>
      )}

      {paso === "oferta" && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--hairline)] glass p-4">
            <button
              onClick={generarOferta}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              🎁 {p.oferta ? "Regenerar oferta" : "Generar oferta"}
            </button>
            {!p.oferta && (
              <button
                onClick={() => setP((prev) => ({ ...prev, oferta: ofertaVacia() }))}
                className="rounded-lg border border-[var(--hairline)] px-4 py-2 text-sm text-muted hover:text-text"
              >
                Empezar en blanco
              </button>
            )}
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={incluyeVideo}
                onChange={(e) => {
                  setIncluyeVideo(e.target.checked);
                  updateOferta((o) => ({ ...o, incluye_video: e.target.checked }));
                }}
              />
              ¿Se ofrece algo en video?
            </label>
            <span className="text-sm text-muted">{ofertaEstado}</span>
          </div>

          {/* Lo que ya tengo: arranca la oferta desde lo que el usuario ya posee. */}
          <div className="space-y-3 rounded-xl border border-[var(--hairline)] glass p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-sm font-medium">Lo que ya tengo</span>
                <p className="text-xs text-muted">
                  Lo que ya tienes para arrancar la oferta. Marca si es el producto
                  principal o un bono. La IA lo respeta al generar (no lo reinventa).
                </p>
              </div>
              <button
                onClick={addActivo}
                className="shrink-0 rounded border border-[var(--hairline)] px-2 py-1 text-xs text-muted hover:text-text"
              >
                + Añadir
              </button>
            </div>
            {(p.oferta?.ya_tengo ?? []).length === 0 && (
              <p className="text-xs text-muted">
                Opcional. Si ya tienes algo (el producto o un bono), ponlo aquí y la
                oferta partirá de ello.
              </p>
            )}
            {(p.oferta?.ya_tengo ?? []).map((a, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-[var(--hairline)] bg-[var(--field)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted">{i + 1}.</span>
                  <input
                    value={a.titulo}
                    onChange={(e) => setActivo(i, "titulo", e.target.value)}
                    placeholder="Título (qué es)"
                    className="min-w-0 flex-1 rounded border border-[var(--hairline)] bg-[var(--field)] px-2 py-1 text-sm text-text outline-none focus:border-accent"
                  />
                  <select
                    value={a.tipo}
                    onChange={(e) => setActivo(i, "tipo", e.target.value)}
                    className="rounded border border-[var(--hairline)] bg-[var(--field)] px-2 py-1 text-sm text-text outline-none focus:border-accent"
                  >
                    <option value="principal">Producto principal</option>
                    <option value="bono">Bono</option>
                  </select>
                  <button
                    onClick={() => removeActivo(i)}
                    className="shrink-0 rounded px-2 py-1 text-xs text-muted hover:text-red-400"
                    title="Quitar"
                  >
                    🗑️
                  </button>
                </div>
                <AutoTextarea
                  value={a.descripcion}
                  onChange={(e) => setActivo(i, "descripcion", e.target.value)}
                  rows={2}
                  placeholder="Descripción (qué es, para qué sirve)"
                  className="w-full rounded border border-[var(--hairline)] bg-[var(--field)] px-2 py-1 text-sm text-text outline-none focus:border-accent"
                />
              </div>
            ))}
          </div>

          {!p.oferta ? (
            <div className="rounded-xl border border-dashed border-[var(--hairline)] p-8 text-center text-muted">
              Aún no hay oferta. Genérala con IA (usa tus anuncios ganadores de
              referencia y la identidad) o empieza en blanco.
            </div>
          ) : (
            <>
              <div className="space-y-3 rounded-xl border border-[var(--hairline)] glass p-5">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">Nombre de la oferta</span>
                  <AutoTextarea
                    value={p.oferta!.nombre_oferta}
                    onChange={(e) => setOfertaCampo("nombre_oferta", e.target.value)}
                    rows={1}
                    className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">Promesa grande</span>
                  <AutoTextarea
                    value={p.oferta!.promesa_grande}
                    onChange={(e) => setOfertaCampo("promesa_grande", e.target.value)}
                    rows={2}
                    className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
                  />
                </label>
              </div>

              {/* Producto principal */}
              <div className="space-y-3 rounded-xl border border-accent/40 glass p-5">
                <h3 className="text-sm font-medium text-accent-2">Producto principal</h3>
                {/* Cantidad + Elemento: producto tipo "N ejemplos de X" (opcional). */}
                <div className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] p-3">
                  <p className="mb-2 text-xs text-muted">
                    ¿Es un producto por <b>cantidad</b> (ej. <i>25 ejemplos de mascarillas</i>)?
                    Pon el número y el elemento; el <b>ebook se redactará con esa cantidad exacta</b>.
                    Déjalo en 0 si no aplica.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={200}
                      value={p.oferta!.producto_principal.cantidad ?? 0}
                      onChange={(e) =>
                        setOfertaPPCantidad(Math.max(0, Math.min(200, Math.round(Number(e.target.value) || 0))))
                      }
                      className="w-20 rounded border border-[var(--hairline)] bg-[var(--field)] px-2 py-1 text-sm text-text outline-none focus:border-accent"
                    />
                    <input
                      value={p.oferta!.producto_principal.elemento ?? ""}
                      onChange={(e) => setOfertaPP("elemento", e.target.value)}
                      placeholder="elemento (ej. ejemplos de mascarillas, recetas, rutinas)"
                      className="min-w-0 flex-1 rounded border border-[var(--hairline)] bg-[var(--field)] px-2 py-1 text-sm text-text outline-none focus:border-accent"
                    />
                  </div>
                  {(p.oferta!.producto_principal.cantidad ?? 0) > 0 &&
                    (p.oferta!.producto_principal.elemento ?? "").trim() && (
                      <p className="mt-2 text-xs text-accent-2">
                        → Producto:{" "}
                        <b>
                          {p.oferta!.producto_principal.cantidad} {p.oferta!.producto_principal.elemento}
                        </b>
                      </p>
                    )}
                </div>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">Título (vestido para el embudo)</span>
                  <AutoTextarea
                    value={p.oferta!.producto_principal.titulo}
                    onChange={(e) => setOfertaPP("titulo", e.target.value)}
                    rows={1}
                    className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">Descripción corta</span>
                  <AutoTextarea
                    value={p.oferta!.producto_principal.descripcion_corta}
                    onChange={(e) => setOfertaPP("descripcion_corta", e.target.value)}
                    rows={2}
                    className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
                  />
                </label>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm text-muted">¿Qué incluye?</span>
                    <button
                      onClick={addQueIncluye}
                      className="rounded border border-[var(--hairline)] px-2 py-0.5 text-xs text-muted hover:text-text"
                    >
                      + Bullet
                    </button>
                  </div>
                  <div className="space-y-2">
                    {p.oferta!.producto_principal.que_incluye.map((b, i) => (
                      <div key={i} className="flex gap-2">
                        <AutoTextarea
                          value={b}
                          onChange={(e) => setQueIncluye(i, e.target.value)}
                          rows={1}
                          placeholder="bullet concreto"
                          className="flex-1 rounded border border-[var(--hairline)] bg-[var(--field)] px-2 py-1 text-sm text-text outline-none focus:border-accent"
                        />
                        <button
                          onClick={() => removeQueIncluye(i)}
                          className="rounded border border-[var(--hairline)] px-2 text-xs text-muted hover:text-red-400"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">Valor percibido (texto comparativo, no dinero)</span>
                  <AutoTextarea
                    value={p.oferta!.producto_principal.valor_percibido_texto}
                    onChange={(e) => setOfertaPP("valor_percibido_texto", e.target.value)}
                    rows={1}
                    placeholder="equivalente a 3 meses de suscripción premium"
                    className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
                  />
                </label>
              </div>

              {/* Bonos */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Bonos ({p.oferta!.bonos.length}/{MIN_BONOS}-{MAX_BONOS})
                  </span>
                  <button
                    onClick={addBono}
                    disabled={p.oferta!.bonos.length >= MAX_BONOS}
                    className="rounded border border-[var(--hairline)] px-2 py-1 text-xs text-muted hover:text-text disabled:opacity-40"
                  >
                    + Añadir bono
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {p.oferta!.bonos.map((bono, i) => (
                    <div key={i} className="space-y-2 rounded-xl border border-[var(--hairline)] glass p-4">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-accent/15 px-2 py-0.5 text-xs text-accent-2">
                          Bono {i + 1}
                        </span>
                        <AutoTextarea
                          value={bono.titulo}
                          onChange={(e) => setBono(i, "titulo", e.target.value)}
                          rows={1}
                          placeholder="Título memorable"
                          className="flex-1 rounded border border-[var(--hairline)] bg-[var(--field)] px-2 py-1 text-sm font-medium text-text outline-none focus:border-accent"
                        />
                        <button
                          onClick={() => removeBono(i)}
                          disabled={p.oferta!.bonos.length <= MIN_BONOS}
                          className="rounded border border-[var(--hairline)] px-2 text-xs text-muted hover:text-red-400 disabled:opacity-40"
                        >
                          ✕
                        </button>
                      </div>
                      {(
                        [
                          { k: "descripcion_corta", l: "Descripción corta" },
                          { k: "por_que_lo_incluyo", l: "Por qué lo incluyo" },
                          { k: "objecion_que_desactiva", l: "Objeción que desactiva (cítala del avatar)" },
                          { k: "valor_percibido_texto", l: "Valor percibido (texto, no dinero)" },
                        ] as const
                      ).map((f) => (
                        <label key={f.k} className="flex flex-col gap-1 text-xs">
                          <span className="text-muted">{f.l}</span>
                          <AutoTextarea
                            value={bono[f.k]}
                            onChange={(e) => setBono(i, f.k, e.target.value)}
                            rows={2}
                            className="w-full rounded border border-[var(--hairline)] bg-[var(--field)] px-2 py-1 text-sm text-text outline-none focus:border-accent"
                          />
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* Framing / urgencia / garantía */}
              <div className="space-y-3 rounded-xl border border-[var(--hairline)] glass p-5">
                {(
                  [
                    { k: "framing_del_stack", l: "Framing del stack (se usa literal en el mensaje del embudo)" },
                    { k: "razon_de_urgencia", l: "Razón de urgencia (sin fechas ni cifras concretas)" },
                  ] as const
                ).map((f) => (
                  <label key={f.k} className="flex flex-col gap-1 text-sm">
                    <span className="text-muted">{f.l}</span>
                    <AutoTextarea
                      value={p.oferta![f.k]}
                      onChange={(e) => setOfertaCampo(f.k, e.target.value)}
                      rows={2}
                      className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
                    />
                  </label>
                ))}
              </div>
            </>
          )}

          <div className="sticky bottom-0 flex items-center gap-3 border-t border-[var(--hairline)] bg-bg/80 py-4 backdrop-blur">
            <button
              onClick={guardar}
              disabled={estado === "guardando"}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {estado === "guardando" ? "Guardando…" : "Guardar oferta"}
            </button>
            {estado === "ok" && <span className="text-sm text-accent-2">✓ Guardado</span>}
            {estado === "error" && <span className="text-sm text-red-400">Error al guardar</span>}
          </div>
        </section>
      )}


      {paso === "video" && (
        <section className="space-y-5">
          <div className="rounded-xl border border-[var(--hairline)] glass p-4 text-sm text-muted">
            El <b>video de embudo</b> es el video de CIERRE que va DENTRO del WhatsApp
            (no el de captación). La IA redacta el <b>guión</b> a partir de tus anuncios
            ganadores + la oferta. Sale listo para grabar (tú lo grabas con tu cara/voz).
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--hairline)] glass p-4">
            <button
              onClick={generarGuion}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              {p.guionEmbudo ? "🔄 Regenerar guión" : "✨ Generar guión con IA"}
            </button>
            {guionEstado && <span className="text-sm text-muted">{guionEstado}</span>}
          </div>

          {p.guionEmbudo && (
            <div className="space-y-2 rounded-xl border border-[var(--hairline)] glass p-4">
              <div className="text-xs text-muted">
                Formato: <b>{p.guionEmbudo.formato || "—"}</b>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Guión (editable)</span>
                <AutoTextarea
                  value={p.guionEmbudo.guion}
                  onChange={(e) =>
                    setP((prev) => ({
                      ...prev,
                      guionEmbudo: prev.guionEmbudo
                        ? { ...prev.guionEmbudo, guion: e.target.value }
                        : prev.guionEmbudo,
                    }))
                  }
                  rows={12}
                  className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
                />
              </label>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--hairline)] glass p-4">
            <button
              onClick={guardar}
              disabled={estado === "guardando"}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {estado === "guardando" ? "Guardando…" : "Guardar guión"}
            </button>
            {estado === "ok" && <span className="text-sm text-accent-2">✓ Guardado</span>}
            {estado === "error" && <span className="text-sm text-red-400">Error al guardar</span>}
          </div>
        </section>
      )}

      {paso === "videos" && (
        <section className="space-y-5">
          <p className="text-xs text-muted">
            Adjunta aquí los <b>videos largos de TikTok</b> del producto. Más adelante,
            el <b>Editor de videos</b> los analiza y saca los mejores momentos para tus
            anuncios. Quedan guardados en el producto, junto con todo lo demás.
          </p>

          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--hairline)] glass p-4">
            <label className="cursor-pointer rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
              {subiendoVideo ? "Subiendo…" : "⬆️ Subir videos"}
              <input
                type="file"
                accept="video/*"
                multiple
                disabled={subiendoVideo}
                onChange={(e) => {
                  subirVideos(e.target.files);
                  e.target.value = "";
                }}
                className="hidden"
              />
            </label>
            <span className="text-sm text-muted">
              {videoEstado || `${p.videos?.length ?? 0} video(s) adjunto(s)`}
            </span>
          </div>

          {(p.videos?.length ?? 0) === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--hairline)] p-8 text-center text-muted">
              Aún no hay videos. Súbelos con el botón de arriba (se procesan al editar).
            </div>
          ) : (
            <div className="space-y-2">
              {p.videos.map((v) => (
                <div
                  key={v.url}
                  className="flex items-center gap-3 rounded-xl border border-[var(--hairline)] glass p-3"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[var(--hairline)] bg-[var(--field)] text-lg">
                    🎬
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-text">{v.original || v.nombre}</p>
                    <p className="text-xs text-muted">
                      {(v.bytes / (1024 * 1024)).toFixed(1)} MB
                    </p>
                  </div>
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded border border-[var(--hairline)] px-2 py-1 text-xs text-muted hover:text-text"
                  >
                    Ver
                  </a>
                  <button
                    onClick={() => quitarVideo(v.url)}
                    className="rounded border border-[var(--hairline)] px-2 py-1 text-xs text-muted hover:text-red-400"
                    title="Quitar video"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="sticky bottom-0 flex items-center gap-3 border-t border-[var(--hairline)] bg-bg/80 py-4 backdrop-blur">
            <button
              onClick={guardar}
              disabled={estado === "guardando" || subiendoVideo}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {estado === "guardando" ? "Guardando…" : "Guardar videos"}
            </button>
            {estado === "ok" && <span className="text-sm text-accent-2">✓ Guardado</span>}
            {estado === "error" && <span className="text-sm text-red-400">Error al guardar</span>}
          </div>
        </section>
      )}

    </div>
  );
}
