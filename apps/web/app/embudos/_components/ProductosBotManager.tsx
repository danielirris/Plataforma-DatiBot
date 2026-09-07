"use client";

import { useEffect, useState } from "react";
import {
  PAISES_EMBUDO_BOT,
  NOMBRE_PAIS,
  type ProductoBot,
} from "@/lib/embudos/types";
import { RotadorEditor } from "./RotadorEditor";

type ProductoLite = { id: string; nombre: string; productoId?: string };
type Fila = Record<string, string>; // producto, pais + campos (todos como string)

const keyProducto = (p: ProductoLite) => (p.productoId?.trim() || p.id);

// Campos COMPARTIDOS entre países (se escriben en las 5 filas).
const MENSAJES: { k: string; label: string }[] = [
  { k: "msg_bienvenida", label: "Bienvenida" },
  { k: "msg_cobro", label: "Cobro" },
  { k: "msg_bonos_intro", label: "Intro de bonos" },
  { k: "msg_datos_pago", label: "Datos de pago" },
  { k: "msg_felicitacion", label: "Felicitación" },
];
const PROMPTS: { k: string; label: string }[] = [
  { k: "system_prompt_convencer", label: "Prompt IA — Convencer" },
  { k: "system_prompt_cobrar", label: "Prompt IA — Cobrar" },
];
const PIXEL: { k: string; label: string }[] = [
  { k: "pixel_id", label: "Pixel ID" },
  { k: "page_id", label: "Page ID" },
];
// Campos POR PAÍS.
const PAGO: { k: string; label: string; area?: boolean; num?: boolean }[] = [
  { k: "titular_cuenta", label: "Titular de la cuenta" },
  { k: "numero_cuenta", label: "Número de cuenta" },
  { k: "metodo_pago", label: "Método de pago" },
  { k: "metodos_pago_texto", label: "Métodos de pago (texto largo)", area: true },
  { k: "brec_alias", label: "Bre-B / alias" },
  { k: "moneda", label: "Moneda (ej. COP)" },
  { k: "moneda_simbolo", label: "Símbolo (ej. $)" },
  { k: "precio_base", label: "Precio base", num: true },
];
const VALIDACION: { k: string; label: string }[] = [
  { k: "validacion_titular", label: "Titular esperado" },
  { k: "validacion_cuenta_hint", label: "Pista de cuenta" },
  { k: "validacion_alias", label: "Alias" },
];

function filaVacia(producto: string, pais: string): Fila {
  return { producto, pais };
}

export function ProductosBotManager() {
  const [productosDatibot, setProductosDatibot] = useState<ProductoLite[]>([]);
  const [productoKey, setProductoKey] = useState<string>("");
  const [otro, setOtro] = useState<boolean>(false);
  const [filas, setFilas] = useState<Record<string, Fila>>({});
  const [pais, setPais] = useState<string>("CO");
  const [cargando, setCargando] = useState<boolean>(false);
  const [guardando, setGuardando] = useState<boolean>(false);
  const [estado, setEstado] = useState<string>("");
  const cargado = Object.keys(filas).length > 0;

  useEffect(() => {
    fetch("/api/products", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((lista: ProductoLite[]) =>
        setProductosDatibot(Array.isArray(lista) ? lista : []),
      )
      .catch(() => {});
  }, []);

  async function cargar(key: string) {
    setProductoKey(key);
    setEstado("");
    if (!key) {
      setFilas({});
      return;
    }
    setCargando(true);
    try {
      const r = await fetch(
        `/api/embudos/productos?producto=${encodeURIComponent(key)}`,
        { cache: "no-store" },
      );
      const data = await r.json();
      const porPais: Record<string, Fila> = {};
      for (const pa of PAISES_EMBUDO_BOT) porPais[pa] = filaVacia(key, pa);
      for (const f of (data.filas ?? []) as ProductoBot[]) {
        if (f.pais && porPais[f.pais]) {
          const fila: Fila = { producto: key, pais: f.pais };
          for (const [k, v] of Object.entries(f)) {
            if (k === "actualizado_at") continue;
            fila[k] = v === null || v === undefined ? "" : String(v);
          }
          porPais[f.pais] = fila;
        }
      }
      setFilas(porPais);
      if (data.error) setEstado("⚠️ " + data.error);
    } catch (e) {
      setEstado("⚠️ " + (e instanceof Error ? e.message : "Error de red"));
    }
    setCargando(false);
  }

  // Compartido: escribe el campo en TODAS las filas (país-agnóstico).
  function setCompartido(k: string, v: string) {
    setFilas((prev) => {
      const out: Record<string, Fila> = {};
      for (const [pa, fila] of Object.entries(prev)) out[pa] = { ...fila, [k]: v };
      return out;
    });
    setEstado("");
  }
  // Por país: escribe el campo solo en la fila del país activo.
  function setPorPais(k: string, v: string) {
    setFilas((prev) => ({ ...prev, [pais]: { ...(prev[pais] ?? {}), [k]: v } }));
    setEstado("");
  }

  const fp = filas[pais] ?? {};
  const compartido = (k: string) => filas[PAISES_EMBUDO_BOT[0]]?.[k] ?? "";

  async function guardar() {
    if (!productoKey) return;
    setGuardando(true);
    setEstado("Guardando…");
    try {
      const r = await fetch("/api/embudos/productos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filas: Object.values(filas) }),
      });
      const data = await r.json().catch(() => ({}));
      setEstado(r.ok ? "✓ Guardado en Supabase." : "⚠️ " + (data.error ?? `Error ${r.status}`));
    } catch (e) {
      setEstado("⚠️ " + (e instanceof Error ? e.message : "Error de red"));
    }
    setGuardando(false);
  }

  const inputCls =
    "w-full rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-sm text-text outline-none focus:border-accent";

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-medium">Bot por producto</h2>
        <p className="text-xs text-muted">
          Los mensajes, prompts y datos de pago que el bot lee para este producto. Se
          guardan en Supabase (tabla <code>productos</code>).
        </p>
      </div>

      {/* Selector de producto */}
      <label className="flex max-w-md flex-col gap-1 text-sm">
        <span className="text-muted">Producto</span>
        {otro ? (
          <input
            value={productoKey}
            placeholder="clave del producto (ej. masmellos)"
            onChange={(e) => cargar(e.target.value)}
            className={inputCls}
          />
        ) : (
          <select
            value={productoKey}
            onChange={(e) => {
              if (e.target.value === "__otro__") {
                setOtro(true);
                cargar("");
              } else cargar(e.target.value);
            }}
            className={inputCls}
          >
            <option value="">— elige un producto —</option>
            {productosDatibot.map((p) => (
              <option key={p.id} value={keyProducto(p)}>
                {p.nombre}
              </option>
            ))}
            <option value="__otro__">Otro (escribir clave a mano)…</option>
          </select>
        )}
      </label>

      {cargando && <p className="text-sm text-muted">Cargando…</p>}

      {cargado && (
        <>
          {/* Mensajes fijos (compartidos) */}
          <div className="space-y-3 rounded-xl border border-[var(--hairline)] glass p-5">
            <p className="text-sm font-medium text-text">Mensajes fijos</p>
            <p className="text-xs text-muted">
              Iguales para los 5 países. Usa <code>{"{nombre}"}</code> para el nombre del
              cliente, <code>*negrita*</code> y saltos de línea.
            </p>
            {MENSAJES.map(({ k, label }) => (
              <label key={k} className="flex flex-col gap-1 text-sm">
                <span className="text-muted">{label}</span>
                <textarea
                  value={compartido(k)}
                  onChange={(e) => setCompartido(k, e.target.value)}
                  rows={3}
                  className={inputCls}
                />
              </label>
            ))}
          </div>

          {/* Prompts IA (compartidos) */}
          <div className="space-y-3 rounded-xl border border-[var(--hairline)] glass p-5">
            <p className="text-sm font-medium text-text">Prompts de las IAs</p>
            {PROMPTS.map(({ k, label }) => (
              <label key={k} className="flex flex-col gap-1 text-sm">
                <span className="text-muted">{label}</span>
                <textarea
                  value={compartido(k)}
                  onChange={(e) => setCompartido(k, e.target.value)}
                  rows={6}
                  className={inputCls + " font-mono text-xs"}
                />
              </label>
            ))}
          </div>

          {/* Pixel (compartido) */}
          <div className="space-y-3 rounded-xl border border-[var(--hairline)] glass p-5">
            <p className="text-sm font-medium text-text">Pixel / campaña</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {PIXEL.map(({ k, label }) => (
                <label key={k} className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">{label}</span>
                  <input
                    value={compartido(k)}
                    onChange={(e) => setCompartido(k, e.target.value)}
                    className={inputCls}
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Datos de pago + validación (POR PAÍS) */}
          <div className="space-y-3 rounded-xl border border-[var(--hairline)] glass p-5">
            <p className="text-sm font-medium text-text">Datos de pago (por país)</p>
            <div className="flex flex-wrap gap-2">
              {PAISES_EMBUDO_BOT.map((pa) => (
                <button
                  key={pa}
                  onClick={() => setPais(pa)}
                  className={
                    "rounded-lg border px-3 py-1.5 text-sm " +
                    (pais === pa
                      ? "border-accent bg-accent/10 text-accent-2"
                      : "border-[var(--hairline)] text-muted hover:border-accent/40")
                  }
                >
                  {NOMBRE_PAIS[pa]} ({pa})
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {PAGO.map(({ k, label, area, num }) => (
                <label
                  key={k}
                  className={"flex flex-col gap-1 text-sm" + (area ? " sm:col-span-2" : "")}
                >
                  <span className="text-muted">{label}</span>
                  {area ? (
                    <textarea
                      value={fp[k] ?? ""}
                      onChange={(e) => setPorPais(k, e.target.value)}
                      rows={3}
                      className={inputCls}
                    />
                  ) : (
                    <input
                      type={num ? "number" : "text"}
                      value={fp[k] ?? ""}
                      onChange={(e) => setPorPais(k, e.target.value)}
                      className={inputCls}
                    />
                  )}
                </label>
              ))}
            </div>

            <p className="pt-1 text-xs font-medium text-muted">
              Validación del comprobante ({NOMBRE_PAIS[pais]})
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {VALIDACION.map(({ k, label }) => (
                <label key={k} className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">{label}</span>
                  <input
                    value={fp[k] ?? ""}
                    onChange={(e) => setPorPais(k, e.target.value)}
                    className={inputCls}
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Mensajes con variantes (rotador), por producto. Tiene su propio guardado. */}
          <RotadorEditor producto={productoKey} />

          {/* Guardar (mensajes fijos + prompts + pixel + pago) */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--hairline)] glass p-4">
            <button
              onClick={guardar}
              disabled={guardando}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Guardar mensajes, prompts y pago"}
            </button>
            {estado && (
              <span className={"text-sm " + (estado.startsWith("✓") ? "text-accent-2" : "text-muted")}>
                {estado}
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
