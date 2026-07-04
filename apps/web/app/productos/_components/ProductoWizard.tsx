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
  type Avatar,
  type ObjecionCompra,
  type ObjecionUso,
  type Producto,
  type TipoImagen,
} from "@plataforma/products/schema";
import { cn } from "@plataforma/ui";

const PASOS = [
  { key: "identidad", label: "1 · Identidad" },
  { key: "avatar", label: "2 · Avatar" },
  { key: "mensajes", label: "3 · Mensajes" },
  { key: "imagenes", label: "4 · Imágenes" },
] as const;

// Pasos ya implementados.
const DISPONIBLES = new Set(["identidad", "avatar", "mensajes", "imagenes"]);

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
      overlays: { ...base.overlays, ...(producto.overlays ?? {}) },
      imagenes: { ...base.imagenes, ...(producto.imagenes ?? {}) },
    };
  });
  const [paso, setPaso] = useState<string>("identidad");
  const [estado, setEstado] = useState<"idle" | "guardando" | "ok" | "error">("idle");
  const [genEstado, setGenEstado] = useState<string>("");
  const [imgEstado, setImgEstado] = useState<string>("");
  const [avatarEstado, setAvatarEstado] = useState<string>("");

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

  async function investigarAvatar() {
    setAvatarEstado("Investigando en la web (Gemini + Google Search)… puede tardar.");
    try {
      const res = await fetch("/api/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ producto: p }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAvatarEstado("⚠️ " + (data.error ?? "Error en la investigación"));
        return;
      }
      setP((prev) => ({ ...prev, avatar: data.avatar }));
      setAvatarEstado(
        `✓ Investigación lista (${data.avatar.fuentes?.length ?? 0} fuentes). Revisa y ajusta.`,
      );
    } catch {
      setAvatarEstado("⚠️ No se pudo contactar al proveedor.");
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
      const data = await res.json();
      if (!res.ok) {
        setGenEstado("⚠️ " + (data.error ?? "Error al generar"));
        return;
      }
      setP((prev) => ({
        ...prev,
        mensajes: { ...prev.mensajes, ...(data.mensajes ?? {}) },
        overlays: { ...prev.overlays, ...(data.overlays ?? {}) },
      }));
      setGenEstado("✓ Listo. Revisa y ajusta antes de guardar.");
    } catch {
      setGenEstado("⚠️ No se pudo contactar al proveedor.");
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
                activo ? "border-accent bg-accent/15 text-text" : "border-border text-muted",
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
        <section className="space-y-4 rounded-xl border border-border bg-panel p-5">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Nombre del producto</span>
            <input
              value={p.nombre}
              onChange={(e) => setCampo("nombre", e.target.value)}
              placeholder="chorizos para emprender desde casa"
              className="rounded-lg border border-border bg-bg px-3 py-2 text-text outline-none focus:border-accent"
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
              className="rounded-lg border border-border bg-bg px-3 py-2 font-mono text-text outline-none focus:border-accent"
            />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="text-muted">Promesa principal</span>
              <textarea
                value={p.identidad.promesa}
                onChange={(e) => setIdentidad("promesa", e.target.value)}
                rows={2}
                placeholder="qué resultado logra el cliente"
                className="rounded-lg border border-border bg-bg px-3 py-2 text-text outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">Posicionamiento</span>
              <textarea
                value={p.identidad.posicionamiento}
                onChange={(e) => setIdentidad("posicionamiento", e.target.value)}
                rows={2}
                placeholder="idea / ángulo del producto"
                className="rounded-lg border border-border bg-bg px-3 py-2 text-text outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">Dirigido a (general, sin avatar)</span>
              <textarea
                value={p.identidad.dirigidoA}
                onChange={(e) => setIdentidad("dirigidoA", e.target.value)}
                rows={2}
                placeholder="a quién va dirigido en términos generales"
                className="rounded-lg border border-border bg-bg px-3 py-2 text-text outline-none focus:border-accent"
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
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-panel p-4">
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
              <div key={s.key} className="rounded-xl border border-border bg-panel p-4">
                <div className="mb-1">
                  <span className="text-sm font-medium">{s.label}</span>
                  <p className="text-xs text-muted">{s.pregunta}</p>
                </div>
                <textarea
                  value={(p.avatar[s.key as keyof Avatar] as string) ?? ""}
                  onChange={(e) => setAvatarSeccion(s.key as keyof Avatar, e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
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
              <div key={b.bloque} className="rounded-xl border border-border bg-panel p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-medium">{b.titulo}</span>
                    <p className="text-xs text-muted">{b.ayuda}</p>
                  </div>
                  <button
                    onClick={() => addObjecion(b.bloque)}
                    className="shrink-0 rounded border border-border px-2 py-1 text-xs text-muted hover:text-text"
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
                    <div key={i} className="rounded-lg border border-border bg-bg p-3">
                      <div className="flex flex-wrap gap-2">
                        <input
                          value={o.objecion}
                          onChange={(e) => setObjecion(b.bloque, i, "objecion", e.target.value)}
                          placeholder="objeción en primera persona"
                          className="min-w-[10rem] flex-1 rounded border border-border bg-panel px-2 py-1 text-sm text-text outline-none focus:border-accent"
                        />
                        <select
                          value={o.categoria}
                          onChange={(e) => setObjecion(b.bloque, i, "categoria", e.target.value)}
                          className="rounded border border-border bg-panel px-2 py-1 text-xs text-text outline-none focus:border-accent"
                        >
                          {b.cats.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => removeObjecion(b.bloque, i)}
                          className="rounded border border-border px-2 text-xs text-muted hover:text-red-400"
                          title="Eliminar"
                        >
                          ✕
                        </button>
                      </div>
                      <textarea
                        value={o.respuesta_sugerida}
                        onChange={(e) => setObjecion(b.bloque, i, "respuesta_sugerida", e.target.value)}
                        rows={2}
                        placeholder="respuesta sugerida para desactivarla (accionable, sin inventar datos)"
                        className="mt-2 w-full rounded border border-border bg-panel px-2 py-1 text-sm text-text outline-none focus:border-accent"
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {p.avatar.fuentes?.length > 0 && (
            <div className="rounded-xl border border-border bg-panel p-4">
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

          <div className="sticky bottom-0 flex items-center gap-3 border-t border-border bg-bg/80 py-4 backdrop-blur">
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

      {paso === "mensajes" && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-panel p-4">
            <button
              onClick={() => generar()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              ✨ Generar mensajes con IA
            </button>
            <span className="text-sm text-muted">{genEstado}</span>
          </div>

          <div className="space-y-3">
            {RANURAS_MENSAJE.map((r) => (
              <div key={r.key} className="rounded-xl border border-border bg-panel p-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs text-accent-2">{r.key}</span>
                    <p className="text-xs text-muted">{r.descripcion}</p>
                  </div>
                  <button
                    onClick={() => generar([r.key])}
                    className="shrink-0 rounded border border-border px-2 py-1 text-xs text-muted hover:text-text"
                  >
                    Regenerar
                  </button>
                </div>
                <textarea
                  value={p.mensajes[r.key] ?? ""}
                  onChange={(e) => setMensaje(r.key, e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
                />
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-panel p-4">
            <h3 className="mb-3 text-sm font-medium">Overlays (texto sobre las imágenes)</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {TIPOS_IMAGEN.map((t) => (
                <label key={t} className="flex flex-col gap-1 text-sm">
                  <span className="font-mono text-xs text-muted">{t}</span>
                  <input
                    value={p.overlays[t] ?? ""}
                    onChange={(e) => setOverlay(t, e.target.value)}
                    className="rounded-lg border border-border bg-bg px-3 py-2 text-text outline-none focus:border-accent"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="sticky bottom-0 flex items-center gap-3 border-t border-border bg-bg/80 py-4 backdrop-blur">
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
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-panel p-4">
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
              <div key={t} className="overflow-hidden rounded-xl border border-border bg-panel">
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
                  <button
                    onClick={() => generarImagenes([t])}
                    className="rounded border border-border px-2 py-1 text-xs text-muted hover:text-text"
                  >
                    Regenerar
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="sticky bottom-0 flex items-center gap-3 border-t border-border bg-bg/80 py-4 backdrop-blur">
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
    </div>
  );
}
