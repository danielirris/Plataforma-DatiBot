"use client";

// Flujos SIMPLIFICADO — el emisor. Ya no pide credenciales ni datos por país
// (viven en /configuracion) ni redacción manual (viene del producto). Solo:
// producto × país × tipo → genera el JSON de n8n con el motor (lib/flujos/engine).

import { useEffect, useState } from "react";
import Link from "next/link";
import { PAISES, type Producto } from "@plataforma/products/schema";

const TIPOS = [
  { key: "largo", label: "LARGO — pago anticipado" },
  { key: "corto", label: "CORTO — hook + video" },
  { key: "cod", label: "COD — contraentrega" },
] as const;

interface Resultado {
  ok: boolean;
  warnings: string[];
  unresolved: string[];
  secretsMissing?: string[];
  sinConfigPais?: boolean;
  workflow: unknown;
  error?: string;
}

export default function FlujosPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [productoId, setProductoId] = useState("");
  const [pais, setPais] = useState("PE");
  const [tipo, setTipo] = useState<string>("largo");
  const [usarOrderbump, setUsarOrderbump] = useState(false);
  const [emitiendo, setEmitiendo] = useState(false);
  const [res, setRes] = useState<Resultado | null>(null);

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((list: Producto[]) => {
        setProductos(list);
        const pre = new URLSearchParams(window.location.search).get("producto");
        if (pre && list.some((p) => p.id === pre)) setProductoId(pre);
        else if (list[0]) setProductoId(list[0].id);
      });
  }, []);

  const producto = productos.find((p) => p.id === productoId);

  async function emitir() {
    setEmitiendo(true);
    setRes(null);
    try {
      const r = await fetch("/api/emit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productoId,
          pais,
          tipo,
          usarOrderbump,
          registrarHistorial: true,
        }),
      });
      const data = await r.json();
      if (!r.ok) setRes({ ...data, ok: false, warnings: [], unresolved: [], workflow: null });
      else setRes(data);
    } catch {
      setRes({ ok: false, error: "No se pudo emitir.", warnings: [], unresolved: [], workflow: null });
    } finally {
      setEmitiendo(false);
    }
  }

  function descargar() {
    if (!res?.workflow) return;
    const blob = new Blob([JSON.stringify(res.workflow, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `SUBW_${producto?.productoId || productoId}_${pais}_${tipo}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function copiar() {
    if (res?.workflow) navigator.clipboard.writeText(JSON.stringify(res.workflow, null, 2));
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-2xl font-semibold">Emitir flujo</h1>
      <p className="mt-1 mb-8 text-muted">
        Producto × País → JSON de n8n. Lo fijo por país sale de{" "}
        <Link href="/configuracion" className="text-accent-2 hover:underline">
          Configuración
        </Link>
        .
      </p>

      {productos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-muted">
          No hay productos.{" "}
          <Link href="/productos/nuevo" className="text-accent-2 hover:underline">
            Crea uno primero
          </Link>
          .
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-white/10 glass p-5 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="text-muted">Producto</span>
              <select
                value={productoId}
                onChange={(e) => setProductoId(e.target.value)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-text outline-none focus:border-accent"
              >
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} {p.productoId ? `(${p.productoId})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">País</span>
              <select
                value={pais}
                onChange={(e) => setPais(e.target.value)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-text outline-none focus:border-accent"
              >
                {PAISES.map((p) => (
                  <option key={p.codigo} value={p.codigo}>
                    {p.nombre} ({p.codigo})
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">Tipo de embudo</span>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-text outline-none focus:border-accent"
              >
                {TIPOS.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={usarOrderbump}
                onChange={(e) => setUsarOrderbump(e.target.checked)}
              />
              <span>¿Usar Orderbump? {usarOrderbump ? "Sí" : "No"}</span>
            </label>
          </div>

          {producto && Object.keys(producto.precios ?? {}).length > 0 &&
            !producto.precios[pais] && (
              <p className="text-xs text-amber-400">
                ⚠️ Este producto no tiene precios para {pais}. Se emitirá sin
                precio (revisa tokens sin resolver).
              </p>
            )}

          <button
            onClick={emitir}
            disabled={emitiendo || !productoId}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {emitiendo ? "Emitiendo…" : "Emitir → generar JSON de n8n"}
          </button>

          {res && (
            <div className="space-y-3 rounded-xl border border-white/10 glass p-5">
              {res.error ? (
                <p className="text-red-400">⚠️ {res.error}</p>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className={res.ok ? "text-accent-2" : "text-amber-400"}>
                      {res.ok ? "✓ Workflow generado" : "⚠️ Generado con pendientes"}
                    </span>
                  </div>
                  {res.sinConfigPais && (
                    <p className="text-xs text-amber-400">
                      No hay config para {pais} en /configuracion (tokens/píxel
                      quedarán sin resolver).
                    </p>
                  )}
                  {res.unresolved?.length > 0 && (
                    <details className="text-xs text-muted">
                      <summary>{res.unresolved.length} tokens sin resolver</summary>
                      <div className="mt-1 font-mono">{res.unresolved.join(", ")}</div>
                    </details>
                  )}
                  {res.warnings?.length > 0 && (
                    <details className="text-xs text-muted">
                      <summary>{res.warnings.length} avisos</summary>
                      <ul className="mt-1 list-disc pl-4">
                        {res.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={descargar}
                      className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
                    >
                      Descargar JSON
                    </button>
                    <button
                      onClick={copiar}
                      className="rounded-lg border border-white/10 px-4 py-2 text-sm text-muted hover:text-text"
                    >
                      Copiar
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
