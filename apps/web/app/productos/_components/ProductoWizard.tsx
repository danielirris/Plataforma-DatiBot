"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  crearProductoBorrador,
  AVATAR_SECCIONES,
  CATEGORIAS_OBJECION_COMPRA,
  CATEGORIAS_OBJECION_USO,
  RANURAS_MENSAJE,
  TIPOS_IMAGEN,
  TIPOS_ANGULO,
  MECANISMOS_GANCHO,
  MIN_BONOS,
  MAX_BONOS,
  ofertaVacia,
  bonoVacio,
  type Angulo,
  type Gancho,
  type Avatar,
  type Oferta,
  type BonoOferta,
  type ObjecionCompra,
  type ObjecionUso,
  type Producto,
  type TipoImagen,
} from "@plataforma/products/schema";
import { cn } from "@plataforma/ui";
import { AutoTextarea } from "./AutoTextarea";

const PASOS = [
  { key: "identidad", label: "1 · Identidad" },
  { key: "avatar", label: "2 · Avatar" },
  { key: "angulos", label: "3 · Ángulos" },
  { key: "oferta", label: "4 · Oferta" },
  { key: "mensajes", label: "5 · Mensajes" },
  { key: "imagenes", label: "6 · Imágenes" },
  { key: "ebook", label: "7 · Ebook" },
] as const;

// Pasos ya implementados.
const DISPONIBLES = new Set([
  "identidad",
  "avatar",
  "angulos",
  "oferta",
  "mensajes",
  "imagenes",
  "ebook",
]);

// Temas disponibles en el servicio de ebooks (carpetas en themes/).
const TEMAS_EBOOK = ["amigurumi", "arcade", "capital", "impulso", "sabores", "sereno"];

// Extrae un mensaje legible de una respuesta fallida: usa {error} si vino JSON,
// si no, muestra el código de estado y el texto crudo (401, 504, HTML, etc.).
// Así el usuario ve la causa REAL en vez de un "no se pudo contactar" genérico.
async function mensajeDeError(res: Response): Promise<string> {
  const raw = await res.text().catch(() => "");
  try {
    const d = JSON.parse(raw);
    if (d?.error) return String(d.error);
  } catch {
    /* la respuesta no era JSON (401 de login, 504 del proxy, HTML de error…) */
  }
  return `Error ${res.status}${raw ? `: ${raw.slice(0, 160)}` : ""}`;
}

function errorDeRed(e: unknown): string {
  return "Fallo de red: " + (e instanceof Error ? e.message : "desconocido");
}

// Campos de texto largos de cada ángulo (nombre y tipo van aparte en el header).
const CAMPOS_ANGULO: { key: keyof Angulo; label: string; rows: number }[] = [
  { key: "promesa_central", label: "Promesa central", rows: 2 },
  { key: "gran_idea", label: "Gran idea (titular)", rows: 2 },
  { key: "publico_objetivo_del_angulo", label: "Público del ángulo", rows: 2 },
  { key: "emocion_dominante", label: "Emoción dominante", rows: 1 },
  { key: "dolor_o_deseo_atacado", label: "Dolor/deseo atacado", rows: 2 },
  { key: "prueba_o_evidencia", label: "Prueba/evidencia", rows: 2 },
];

export function ProductoWizard({ producto }: { producto?: Producto }) {
  const router = useRouter();
  const [p, setP] = useState<Producto>(() => {
    const base = crearProductoBorrador();
    if (!producto) return base;
    // Rellena defaults por si el producto viene de antes de agregar campos nuevos.
    return {
      ...base,
      ...producto,
      avatar: { ...base.avatar, ...(producto.avatar ?? {}) },
      angulos: producto.angulos ?? base.angulos,
      oferta: producto.oferta ?? null,
      overlays: { ...base.overlays, ...(producto.overlays ?? {}) },
      imagenes: { ...base.imagenes, ...(producto.imagenes ?? {}) },
    };
  });
  const [paso, setPaso] = useState<string>("identidad");
  const [estado, setEstado] = useState<"idle" | "guardando" | "ok" | "error">("idle");
  const [genEstado, setGenEstado] = useState<string>("");
  const [imgEstado, setImgEstado] = useState<string>("");
  const [avatarEstado, setAvatarEstado] = useState<string>("");
  const [angulosEstado, setAngulosEstado] = useState<string>("");
  const [ganchosEstado, setGanchosEstado] = useState<Record<string, string>>({});
  const [ofertaEstado, setOfertaEstado] = useState<string>("");
  const [incluyeVideo, setIncluyeVideo] = useState<boolean>(
    producto?.oferta?.incluye_video ?? false,
  );
  const [ebookTema, setEbookTema] = useState<string>("amigurumi");
  const [ebookPages, setEbookPages] = useState<number>(40);
  const [ebookEstado, setEbookEstado] = useState<string>("");

  const esNuevo = !p.id;

  function setCampo(campo: keyof Producto, valor: unknown) {
    setP((prev) => ({ ...prev, [campo]: valor }));
    setEstado("idle");
  }
  function setIdentidad(campo: keyof Producto["identidad"], valor: string) {
    setP((prev) => ({ ...prev, identidad: { ...prev.identidad, [campo]: valor } }));
    setEstado("idle");
  }
  function setMensaje(key: string, valor: string) {
    setP((prev) => ({ ...prev, mensajes: { ...prev.mensajes, [key]: valor } }));
  }
  function setOverlay(key: TipoImagen, valor: string) {
    setP((prev) => ({ ...prev, overlays: { ...prev.overlays, [key]: valor } }));
  }
  function setImagen(key: TipoImagen, valor: string) {
    setP((prev) => ({ ...prev, imagenes: { ...prev.imagenes, [key]: valor } }));
  }

  // Elimina la imagen de un tipo: la quita del producto y borra el archivo del VPS.
  async function eliminarImagenTipo(tipo: TipoImagen) {
    const url = p.imagenes[tipo];
    if (!url) return;
    setImagen(tipo, ""); // se quita del UI de inmediato
    setImgEstado(`Eliminando ${tipo}…`);
    try {
      const res = await fetch("/api/images/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      setImgEstado(
        res.ok
          ? `✓ ${tipo} eliminada. Guarda para conservar el cambio.`
          : `⚠️ Quitada del producto, pero el borrado en el VPS falló: ${data.error ?? res.status}`,
      );
    } catch {
      setImgEstado(`⚠️ ${tipo} quitada del producto (no se pudo confirmar el borrado en el VPS).`);
    }
  }
  function setAvatarSeccion(key: keyof Avatar, valor: string) {
    setP((prev) => ({ ...prev, avatar: { ...prev.avatar, [key]: valor } }));
  }

  type BloqueObj = "objeciones_compra" | "objeciones_uso";
  function setObjecion(
    bloque: BloqueObj,
    index: number,
    campo: "objecion" | "categoria" | "respuesta_sugerida",
    valor: string,
  ) {
    setP((prev) => {
      const lista = [...(prev.avatar[bloque] as (ObjecionCompra | ObjecionUso)[])];
      lista[index] = { ...lista[index], [campo]: valor };
      return { ...prev, avatar: { ...prev.avatar, [bloque]: lista } };
    });
  }
  function addObjecion(bloque: BloqueObj) {
    setP((prev) => {
      const vacia = { objecion: "", categoria: "otro", respuesta_sugerida: "" };
      const lista = [...(prev.avatar[bloque] as (ObjecionCompra | ObjecionUso)[]), vacia];
      return { ...prev, avatar: { ...prev.avatar, [bloque]: lista } };
    });
  }
  function removeObjecion(bloque: BloqueObj, index: number) {
    setP((prev) => {
      const lista = (prev.avatar[bloque] as (ObjecionCompra | ObjecionUso)[]).filter(
        (_, i) => i !== index,
      );
      return { ...prev, avatar: { ...prev.avatar, [bloque]: lista } };
    });
  }

  function setAngulo(index: number, campo: keyof Angulo, valor: string) {
    setP((prev) => {
      const lista = [...prev.angulos];
      lista[index] = { ...lista[index], [campo]: valor };
      return { ...prev, angulos: lista };
    });
  }

  // Regenera todos (soloIndice undefined) o solo un ángulo (reemplaza ese índice).
  async function generarAngulos(soloIndice?: number) {
    if (!p.id) {
      setAngulosEstado("⚠️ Guarda el producto primero (paso Identidad).");
      return;
    }
    setAngulosEstado(
      soloIndice == null ? "Generando 6 ángulos con IA…" : `Regenerando ángulo ${soloIndice + 1}…`,
    );
    try {
      const res = await fetch(`/api/productos/${p.id}/generar-angulos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ producto: p }),
      });
      if (!res.ok) {
        setAngulosEstado("⚠️ " + (await mensajeDeError(res)));
        return;
      }
      const data = await res.json();
      const nuevos = data.angulos as Angulo[];
      if (soloIndice == null) {
        setP((prev) => ({ ...prev, angulos: nuevos }));
        setAngulosEstado("✓ 6 ángulos generados. Revisa y ajusta.");
      } else {
        setP((prev) => {
          const lista = [...prev.angulos];
          lista[soloIndice] = nuevos[soloIndice] ?? nuevos[0];
          return { ...prev, angulos: lista };
        });
        setAngulosEstado(`✓ Ángulo ${soloIndice + 1} regenerado.`);
      }
    } catch (e) {
      setAngulosEstado("⚠️ " + errorDeRed(e));
    }
  }

  function setGancho(
    ai: number,
    hi: number,
    campo: keyof Gancho,
    valor: string,
  ) {
    setP((prev) => {
      const angulos = [...prev.angulos];
      const hooks = [...(angulos[ai].hooks ?? [])];
      hooks[hi] = { ...hooks[hi], [campo]: valor };
      angulos[ai] = { ...angulos[ai], hooks };
      return { ...prev, angulos };
    });
  }

  async function generarGanchos(anguloId: string) {
    if (!p.id) {
      setGanchosEstado((s) => ({ ...s, [anguloId]: "⚠️ Guarda el producto primero." }));
      return;
    }
    setGanchosEstado((s) => ({ ...s, [anguloId]: "Generando 3 ganchos…" }));
    try {
      const res = await fetch(`/api/productos/${p.id}/generar-ganchos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ producto: p, angulo_id: anguloId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGanchosEstado((s) => ({ ...s, [anguloId]: "⚠️ " + (data.error ?? "Error") }));
        return;
      }
      setP((prev) => ({ ...prev, angulos: data.angulos }));
      const err = data.errores?.[anguloId];
      setGanchosEstado((s) => ({
        ...s,
        [anguloId]: err ? "⚠️ " + err : "✓ 3 ganchos generados.",
      }));
    } catch {
      setGanchosEstado((s) => ({ ...s, [anguloId]: "⚠️ No se pudo generar." }));
    }
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

  async function investigarAvatar() {
    setAvatarEstado("Investigando en la web (Gemini + Google Search)… puede tardar.");
    try {
      const res = await fetch("/api/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ producto: p }),
      });
      if (!res.ok) {
        setAvatarEstado("⚠️ " + (await mensajeDeError(res)));
        return;
      }
      const data = await res.json();
      setP((prev) => ({ ...prev, avatar: data.avatar }));
      setAvatarEstado(
        `✓ Investigación lista (${data.avatar.fuentes?.length ?? 0} fuentes). Revisa y ajusta.`,
      );
    } catch (e) {
      setAvatarEstado("⚠️ " + errorDeRed(e));
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

  async function generar(soloRanuras?: string[]) {
    setGenEstado(soloRanuras ? "Regenerando…" : "Generando mensajes…");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ producto: p, soloRanuras }),
      });
      if (!res.ok) {
        setGenEstado("⚠️ " + (await mensajeDeError(res)));
        return;
      }
      const data = await res.json();
      setP((prev) => ({
        ...prev,
        mensajes: { ...prev.mensajes, ...(data.mensajes ?? {}) },
        overlays: { ...prev.overlays, ...(data.overlays ?? {}) },
      }));
      setGenEstado("✓ Listo. Revisa y ajusta antes de guardar.");
    } catch (e) {
      setGenEstado("⚠️ " + errorDeRed(e));
    }
  }

  async function generarImagenes(tipos?: TipoImagen[]) {
    setImgEstado(tipos ? `Regenerando ${tipos.join(", ")}…` : "Generando 5 imágenes… (puede tardar)");
    try {
      const res = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ producto: p, tipos }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImgEstado("⚠️ " + (data.error ?? "Error al generar imágenes"));
        return;
      }
      setP((prev) => ({ ...prev, imagenes: { ...prev.imagenes, ...(data.imagenes ?? {}) } }));
      const errs = Object.entries(data.errores ?? {});
      setImgEstado(
        errs.length
          ? "⚠️ Fallaron: " + errs.map(([t, m]) => `${t} (${m})`).join("; ")
          : "✓ Imágenes generadas y subidas. Guarda para conservar los links.",
      );
    } catch {
      setImgEstado("⚠️ No se pudo generar.");
    }
  }

  async function generarEbook() {
    if (!p.id) {
      setEbookEstado("⚠️ Guarda el producto primero (paso Identidad).");
      return;
    }
    if (!p.nombre.trim()) {
      setEbookEstado("⚠️ El producto necesita nombre/promesa (paso Identidad).");
      return;
    }
    setEbookEstado("Generando ebook con IA (índice + módulos)… puede tardar 1-2 min.");
    try {
      const res = await fetch(`/api/productos/${p.id}/generar-ebook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ producto: p, tema: ebookTema, pages: ebookPages }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setEbookEstado("⚠️ " + (data.error ?? `Error ${res.status}`));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(p.nombre || "ebook").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setEbookEstado("✓ Ebook generado y descargado.");
    } catch {
      setEbookEstado("⚠️ No se pudo generar el ebook.");
    }
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

      {paso === "avatar" && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--hairline)] glass p-4">
            <button
              onClick={investigarAvatar}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              🔎 Investigar avatar (búsqueda web)
            </button>
            <span className="text-sm text-muted">{avatarEstado}</span>
          </div>
          <p className="text-xs text-muted">
            La IA investiga en la web (Gemini + Google Search) al público de este
            producto y responde cada sección. Revisa y ajusta antes de guardar.
          </p>

          <div className="space-y-3">
            {AVATAR_SECCIONES.map((s) => (
              <div key={s.key} className="rounded-xl border border-[var(--hairline)] glass p-4">
                <div className="mb-1">
                  <span className="text-sm font-medium">{s.label}</span>
                  <p className="text-xs text-muted">{s.pregunta}</p>
                </div>
                <AutoTextarea
                  value={(p.avatar[s.key as keyof Avatar] as string) ?? ""}
                  onChange={(e) => setAvatarSeccion(s.key as keyof Avatar, e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-sm text-text outline-none focus:border-accent"
                />
              </div>
            ))}
          </div>

          {(
            [
              {
                bloque: "objeciones_compra",
                titulo: "Objeciones de COMPRA",
                ayuda: "qué frena al cliente al momento de pagar",
                cats: CATEGORIAS_OBJECION_COMPRA,
              },
              {
                bloque: "objeciones_uso",
                titulo: "Objeciones de USO",
                ayuda: "qué frena al cliente al usar/mantener, ya con el producto",
                cats: CATEGORIAS_OBJECION_USO,
              },
            ] as const
          ).map((b) => {
            const lista = p.avatar[b.bloque] as (ObjecionCompra | ObjecionUso)[];
            return (
              <div key={b.bloque} className="rounded-xl border border-[var(--hairline)] glass p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-medium">{b.titulo}</span>
                    <p className="text-xs text-muted">{b.ayuda}</p>
                  </div>
                  <button
                    onClick={() => addObjecion(b.bloque)}
                    className="shrink-0 rounded border border-[var(--hairline)] px-2 py-1 text-xs text-muted hover:text-text"
                  >
                    + Añadir
                  </button>
                </div>
                <div className="space-y-3">
                  {lista.length === 0 && (
                    <p className="text-xs text-muted">
                      Aún no hay objeciones. Genera con IA o añade a mano.
                    </p>
                  )}
                  {lista.map((o, i) => (
                    <div key={i} className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-muted">{i + 1}.</span>
                        <AutoTextarea
                          value={o.objecion}
                          onChange={(e) => setObjecion(b.bloque, i, "objecion", e.target.value)}
                          rows={1}
                          placeholder="objeción en primera persona"
                          className="min-w-[10rem] flex-1 rounded border border-[var(--hairline)] glass px-2 py-1 text-sm text-text outline-none focus:border-accent"
                        />
                        <select
                          value={o.categoria}
                          onChange={(e) => setObjecion(b.bloque, i, "categoria", e.target.value)}
                          className="rounded border border-[var(--hairline)] glass px-2 py-1 text-xs text-text outline-none focus:border-accent"
                        >
                          {b.cats.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => removeObjecion(b.bloque, i)}
                          className="rounded border border-[var(--hairline)] px-2 text-xs text-muted hover:text-red-400"
                          title="Eliminar"
                        >
                          ✕
                        </button>
                      </div>
                      <AutoTextarea
                        value={o.respuesta_sugerida}
                        onChange={(e) => setObjecion(b.bloque, i, "respuesta_sugerida", e.target.value)}
                        rows={2}
                        placeholder="respuesta sugerida para desactivarla (accionable, sin inventar datos)"
                        className="mt-2 w-full rounded border border-[var(--hairline)] glass px-2 py-1 text-sm text-text outline-none focus:border-accent"
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {p.avatar.fuentes?.length > 0 && (
            <div className="rounded-xl border border-[var(--hairline)] glass p-4">
              <h3 className="mb-2 text-sm font-medium">
                Fuentes ({p.avatar.fuentes.length})
              </h3>
              <ul className="space-y-1 text-xs">
                {p.avatar.fuentes.map((f, i) => (
                  <li key={i}>
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent-2 hover:underline"
                    >
                      {f.titulo || f.url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="sticky bottom-0 flex items-center gap-3 border-t border-[var(--hairline)] bg-bg/80 py-4 backdrop-blur">
            <button
              onClick={guardar}
              disabled={estado === "guardando"}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {estado === "guardando" ? "Guardando…" : "Guardar avatar"}
            </button>
            {estado === "ok" && <span className="text-sm text-accent-2">✓ Guardado</span>}
            {estado === "error" && <span className="text-sm text-red-400">Error al guardar</span>}
          </div>
        </section>
      )}

      {paso === "angulos" && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--hairline)] glass p-4">
            <button
              onClick={() => generarAngulos()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              🎯 Generar 6 ángulos
            </button>
            {p.angulos.length > 0 && (
              <button
                onClick={() => generarAngulos()}
                className="rounded-lg border border-[var(--hairline)] px-4 py-2 text-sm text-muted hover:text-text"
              >
                Regenerar todos
              </button>
            )}
            <span className="text-sm text-muted">{angulosEstado}</span>
          </div>
          <p className="text-xs text-muted">
            Un ángulo es la entrada emocional al deseo/dolor del cliente (no una
            feature). Cada uno produce un anuncio distinto. Usa el avatar; edita
            libremente y regenera todos o uno a uno.
          </p>

          {p.angulos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--hairline)] p-8 text-center text-muted">
              Aún no hay ángulos. Pulsa “Generar 6 ángulos”.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {p.angulos.map((ang, i) => (
                <div key={i} className="space-y-3 rounded-xl border border-[var(--hairline)] glass p-4">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-accent/15 px-2 py-0.5 text-xs text-accent-2">
                      {i + 1}
                    </span>
                    <AutoTextarea
                      value={ang.nombre}
                      onChange={(e) => setAngulo(i, "nombre", e.target.value)}
                      rows={1}
                      placeholder="Nombre del ángulo"
                      className="flex-1 rounded border border-[var(--hairline)] bg-[var(--field)] px-2 py-1 text-sm font-medium text-text outline-none focus:border-accent"
                    />
                    <button
                      onClick={() => generarAngulos(i)}
                      className="shrink-0 rounded border border-[var(--hairline)] px-2 py-1 text-xs text-muted hover:text-text"
                    >
                      Regenerar
                    </button>
                  </div>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted">Tipo</span>
                    <select
                      value={ang.tipo}
                      onChange={(e) => setAngulo(i, "tipo", e.target.value)}
                      className="rounded border border-[var(--hairline)] bg-[var(--field)] px-2 py-1 text-sm text-text outline-none focus:border-accent"
                    >
                      {TIPOS_ANGULO.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                  {CAMPOS_ANGULO.map((c) => (
                    <label key={c.key} className="flex flex-col gap-1 text-xs">
                      <span className="text-muted">{c.label}</span>
                      <AutoTextarea
                        value={(ang[c.key] as string) ?? ""}
                        onChange={(e) => setAngulo(i, c.key, e.target.value)}
                        rows={c.rows}
                        className="w-full rounded border border-[var(--hairline)] bg-[var(--field)] px-2 py-1 text-sm text-text outline-none focus:border-accent"
                      />
                    </label>
                  ))}

                  {/* Ganchos del ángulo */}
                  <div className="mt-2 border-t border-[var(--hairline)] pt-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">
                        Ganchos ({ang.hooks?.length ?? 0}/3)
                      </span>
                      <button
                        onClick={() => generarGanchos(ang.id)}
                        className="shrink-0 rounded border border-[var(--hairline)] px-2 py-1 text-xs text-muted hover:text-text"
                      >
                        Regenerar los 3 ganchos
                      </button>
                    </div>
                    {ganchosEstado[ang.id] && (
                      <p className="mb-2 text-xs text-muted">{ganchosEstado[ang.id]}</p>
                    )}
                    {(!ang.hooks || ang.hooks.length === 0) && (
                      <p className="text-xs text-muted">
                        Aún no hay ganchos. Pulsa “Regenerar los 3 ganchos”.
                      </p>
                    )}
                    <div className="space-y-2">
                      {(ang.hooks ?? []).map((g, hi) => (
                        <div key={hi} className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] p-2">
                          <AutoTextarea
                            value={g.texto}
                            onChange={(e) => setGancho(i, hi, "texto", e.target.value)}
                            rows={2}
                            placeholder="gancho (≤ 20 palabras)"
                            className="w-full rounded border border-[var(--hairline)] glass px-2 py-1 text-sm text-text outline-none focus:border-accent"
                          />
                          <div className="mt-1 flex gap-2">
                            <select
                              value={g.mecanismo}
                              onChange={(e) => setGancho(i, hi, "mecanismo", e.target.value)}
                              className="rounded border border-[var(--hairline)] glass px-1 py-0.5 text-[11px] text-text outline-none focus:border-accent"
                            >
                              {MECANISMOS_GANCHO.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                            <AutoTextarea
                              value={g.por_que_funciona}
                              onChange={(e) => setGancho(i, hi, "por_que_funciona", e.target.value)}
                              rows={1}
                              placeholder="por qué funciona"
                              className="flex-1 rounded border border-[var(--hairline)] glass px-2 py-0.5 text-xs text-text outline-none focus:border-accent"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="sticky bottom-0 flex items-center gap-3 border-t border-[var(--hairline)] bg-bg/80 py-4 backdrop-blur">
            <button
              onClick={guardar}
              disabled={estado === "guardando"}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {estado === "guardando" ? "Guardando…" : "Guardar ángulos"}
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

          {!p.oferta ? (
            <div className="rounded-xl border border-dashed border-[var(--hairline)] p-8 text-center text-muted">
              Aún no hay oferta. Genérala con IA (usa avatar, objeciones y ángulos)
              o empieza en blanco. Los precios NO van aquí: se rellenan por país al
              emitir; usa tokens como <code>[PRECIO_BASE]</code> si el copy los necesita.
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

      {paso === "mensajes" && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--hairline)] glass p-4">
            <button
              onClick={() => generar()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              ✨ Generar mensajes con IA
            </button>
            <span className="text-sm text-muted">{genEstado}</span>
          </div>
          <p className="text-xs text-muted">
            El copy usa <b>los 6 ángulos</b> (distintos mensajes se apoyan en
            distintos ángulos){p.oferta ? " y la oferta (mensaje_3 = qué incluye, mensaje_4 = bonos)" : ""}.
          </p>

          <div className="space-y-3">
            {RANURAS_MENSAJE.map((r) => (
              <div key={r.key} className="rounded-xl border border-[var(--hairline)] glass p-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs text-accent-2">{r.key}</span>
                    <p className="text-xs text-muted">{r.descripcion}</p>
                  </div>
                  <button
                    onClick={() => generar([r.key])}
                    className="shrink-0 rounded border border-[var(--hairline)] px-2 py-1 text-xs text-muted hover:text-text"
                  >
                    Regenerar
                  </button>
                </div>
                <AutoTextarea
                  value={p.mensajes[r.key] ?? ""}
                  onChange={(e) => setMensaje(r.key, e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-sm text-text outline-none focus:border-accent"
                />
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-[var(--hairline)] glass p-4">
            <h3 className="mb-3 text-sm font-medium">Overlays (texto sobre las imágenes)</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {TIPOS_IMAGEN.map((t) => (
                <label key={t} className="flex flex-col gap-1 text-sm">
                  <span className="font-mono text-xs text-muted">{t}</span>
                  <AutoTextarea
                    value={p.overlays[t] ?? ""}
                    onChange={(e) => setOverlay(t, e.target.value)}
                    rows={1}
                    className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="sticky bottom-0 flex items-center gap-3 border-t border-[var(--hairline)] bg-bg/80 py-4 backdrop-blur">
            <button
              onClick={guardar}
              disabled={estado === "guardando"}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {estado === "guardando" ? "Guardando…" : "Guardar mensajes"}
            </button>
            {estado === "ok" && <span className="text-sm text-accent-2">✓ Guardado</span>}
            {estado === "error" && <span className="text-sm text-red-400">Error al guardar</span>}
          </div>
        </section>
      )}

      {paso === "imagenes" && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--hairline)] glass p-4">
            <button
              onClick={() => generarImagenes()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              🖼️ Generar 5 imágenes
            </button>
            <span className="text-sm text-muted">{imgEstado}</span>
          </div>
          <p className="text-xs text-muted">
            Gemini genera la escena (sin texto) y el servidor superpone el overlay
            del Paso 2. Las imágenes se suben a tu VPS; se guardan solo los links.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TIPOS_IMAGEN.map((t) => (
              <div key={t} className="overflow-hidden rounded-xl border border-[var(--hairline)] glass">
                <div className="flex aspect-square items-center justify-center bg-bg">
                  {p.imagenes[t] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imagenes[t]} alt={t} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-2xl opacity-30">🖼️</span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 p-3">
                  <span className="font-mono text-xs text-muted">{t}</span>
                  <div className="flex gap-1">
                    {p.imagenes[t] && (
                      <button
                        onClick={() => eliminarImagenTipo(t)}
                        className="rounded border border-[var(--hairline)] px-2 py-1 text-xs text-muted hover:border-red-400 hover:text-red-400"
                        title="Eliminar esta imagen"
                      >
                        🗑 Eliminar
                      </button>
                    )}
                    <button
                      onClick={() => generarImagenes([t])}
                      className="rounded border border-[var(--hairline)] px-2 py-1 text-xs text-muted hover:text-text"
                    >
                      Regenerar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="sticky bottom-0 flex items-center gap-3 border-t border-[var(--hairline)] bg-bg/80 py-4 backdrop-blur">
            <button
              onClick={guardar}
              disabled={estado === "guardando"}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {estado === "guardando" ? "Guardando…" : "Guardar imágenes"}
            </button>
            {estado === "ok" && <span className="text-sm text-accent-2">✓ Guardado</span>}
            {estado === "error" && <span className="text-sm text-red-400">Error al guardar</span>}
          </div>
        </section>
      )}

      {paso === "ebook" && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--hairline)] glass p-4">
            <button
              onClick={generarEbook}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              📕 Generar ebook
            </button>
            <label className="flex items-center gap-2 text-sm text-muted">
              Tema:
              <select
                value={ebookTema}
                onChange={(e) => setEbookTema(e.target.value)}
                className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-2 py-1 text-text outline-none focus:border-accent"
              >
                {TEMAS_EBOOK.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-muted">
              Páginas:
              <input
                type="number"
                min={8}
                max={80}
                value={ebookPages}
                onChange={(e) => setEbookPages(Number(e.target.value))}
                className="w-20 rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-2 py-1 text-text outline-none focus:border-accent"
              />
            </label>
            <span className="text-sm text-muted">{ebookEstado}</span>
          </div>
          <p className="text-xs text-muted">
            Genera un ebook (PDF) sobre el <b>tema del producto</b> (nombre + promesa +
            público) con la IA del shell, y lo maqueta con el tema elegido. El contenido
            se crea módulo a módulo, así que tarda un poco; al terminar se descarga.
          </p>
        </section>
      )}
    </div>
  );
}
