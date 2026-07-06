"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Producto } from "@plataforma/products/schema";

export default function ProductosPage() {
  const [productos, setProductos] = useState<Producto[] | null>(null);

  async function cargar() {
    const res = await fetch("/api/products");
    setProductos(res.ok ? await res.json() : []);
  }
  useEffect(() => {
    cargar();
  }, []);

  async function borrar(id: string, nombre: string) {
    if (!confirm(`¿Borrar "${nombre}"? Esto no se puede deshacer.`)) return;
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    cargar();
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Productos</h1>
          <p className="mt-1 text-muted">
            Cada producto es portátil: se relanza en cualquier país.
          </p>
        </div>
        <Link
          href="/productos/nuevo"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
        >
          + Nuevo producto
        </Link>
      </div>

      {productos === null ? (
        <p className="text-muted">Cargando…</p>
      ) : productos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-10 text-center text-muted">
          Aún no hay productos. Crea el primero con “+ Nuevo producto”.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {productos.map((p) => (
            <div
              key={p.id}
              className="flex flex-col overflow-hidden rounded-xl border border-white/10 glass"
            >
              <Link href={`/productos/${p.id}`} className="block">
                <div className="flex aspect-video items-center justify-center bg-bg">
                  {p.imagenes?.contenido ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imagenes.contenido}
                      alt={p.nombre}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-3xl opacity-40">📦</span>
                  )}
                </div>
                <div className="p-4">
                  <div className="truncate font-medium">
                    {p.nombre || "(sin nombre)"}
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {p.productoId || "—"} ·{" "}
                    {p.actualizadoEn
                      ? new Date(p.actualizadoEn).toLocaleDateString("es")
                      : ""}
                  </div>
                  {p.historialEmisiones?.length > 0 && (
                    <div className="mt-1 text-xs text-accent-2">
                      Emitido:{" "}
                      {[...new Set(p.historialEmisiones.map((e) => e.pais))].join(", ")}
                    </div>
                  )}
                </div>
              </Link>
              <div className="mt-auto flex items-center gap-2 border-t border-white/10 px-4 py-2 text-sm">
                <Link
                  href={`/flujos?producto=${p.id}`}
                  className="text-accent-2 hover:underline"
                >
                  Emitir flujo
                </Link>
                <Link
                  href={`/productos/${p.id}`}
                  className="text-muted hover:text-text"
                >
                  Editar
                </Link>
                <button
                  onClick={() => borrar(p.id, p.nombre)}
                  className="ml-auto text-muted hover:text-red-400"
                >
                  Borrar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
