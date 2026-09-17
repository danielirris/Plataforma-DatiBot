"use client";

import { useEffect, useState } from "react";
import {
  PAISES_EMBUDO_BOT,
  NOMBRE_PAIS,
  type ProductoBot,
} from "@/lib/embudos/types";
import { PAISES_EMBUDO } from "@/lib/embudo/paises";
import { keyProducto, toProductoId } from "@/lib/producto/id";

type ProductoLite = { id: string; nombre: string; productoId?: string };
type Fila = Record<string, string>; // producto, pais + campos (todos como string)

// Datos de pago FIJOS por país (siempre los mismos). Se usan para PRECARGAR los campos
// vacíos; lo que guarde el usuario manda. `precios` son los precios globales de
// Configuración (por país); si hay uno, precarga el precio base con él.
function defaultsPago(pais: string, precios: Record<string, number[]>): Record<string, string> {
  const p = PAISES_EMBUDO.find((x) => x.codigo === pais);
  if (!p) return {};
  const base = precios[pais]?.[0] ?? p.montos[0];
  return {
    titular_cuenta: p.titular,
    numero_cuenta: p.cuenta,
    metodo_pago: p.metodos,
    metodos_pago_texto: p.metodos,
    brec_alias: p.alias,
    moneda: p.moneda,
    moneda_simbolo: p.simbolo,
    precio_base: String(base ?? ""),
    validacion_titular: p.titular,
    validacion_cuenta_hint: p.hint,
    validacion_alias: p.alias,
  };
}

// Campos COMPARTIDOS entre países (se escriben en las 5 filas).
// Mensajes COMPARTIDOS (iguales para los 5 países). El Cobro #1/#2 NO van aquí: cambian
// por país → ver MSG_COBRO_PAIS.
const MENSAJES: { k: string; label: string }[] = [
  { k: "msg_bienvenida", label: "Bienvenida" },
  { k: "msg_bonos_intro", label: "Intro de bonos (link)" },
];
// Los prompts de IA (system_prompt_convencer/cobrar) se editan en la pestaña «IA»
// (IAManager), por país. Ya no se gestionan aquí.
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
// Mensajes de cobro POR PAÍS (los valores/cuenta van escritos en el texto y cambian por país).
const MSG_COBRO_PAIS: { k: string; label: string }[] = [
  { k: "msg_cobro", label: "Cobro #1 — escalera de precios (con los valores del país)" },
  { k: "msg_datos_pago", label: "Cobro #2 — datos de pago (cuenta del país)" },
];

// Claves que se persisten en `config_bots` (coincide con CAMPOS_TEXTO + precio_base del
// backend). El guardado hace un diff contra el snapshot CRUDO de Supabase y manda, por
// país, la clave (producto, pais) + SOLO estas que cambiaron.
const CLAVES_PATCH_PROD = [
  "pixel_id",
  "page_id",
  "msg_bienvenida",
  "msg_cobro",
  "msg_bonos_intro",
  "msg_datos_pago",
  "titular_cuenta",
  "numero_cuenta",
  "metodo_pago",
  "metodos_pago_texto",
  "brec_alias",
  "moneda",
  "moneda_simbolo",
  "precio_base",
  "validacion_titular",
  "validacion_cuenta_hint",
  "validacion_alias",
];

function filaVacia(producto: string, pais: string): Fila {
  return { producto, pais };
}

export function ProductosBotManager() {
  const [productosDatibot, setProductosDatibot] = useState<ProductoLite[]>([]);
  const [productoKey, setProductoKey] = useState<string>("");
  const [otro, setOtro] = useState<boolean>(false);
  const [otroText, setOtroText] = useState<string>(""); // texto del input "otro" (no dispara carga)
  const [filas, setFilas] = useState<Record<string, Fila>>({});
  // Snapshot CRUDO de Supabase (antes de la precarga). El guardado diffea contra esto.
  const [originales, setOriginales] = useState<Record<string, Fila>>({});
  const [pais, setPais] = useState<string>("CO");
  // Precios globales (Configuración → Precios): precargan el precio base por país.
  const [globalPrecios, setGlobalPrecios] = useState<Record<string, number[]>>({});
  const [cargando, setCargando] = useState<boolean>(false);
  const [guardando, setGuardando] = useState<boolean>(false);
  const [estado, setEstado] = useState<string>("");
  const cargado = Object.keys(filas).length > 0;

  useEffect(() => {
    fetch("/api/products?slim=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((lista: ProductoLite[]) =>
        setProductosDatibot(Array.isArray(lista) ? lista : []),
      )
      .catch(() => {});
    fetch("/api/precios", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setGlobalPrecios(d.precios ?? {}))
      .catch(() => {});
  }, []);

  async function cargar(key: string) {
    setProductoKey(key);
    setEstado("");
    if (!key) {
      setFilas({});
      setOriginales({});
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
      // Snapshot CRUDO (lo que hay en Supabase), ANTES de la precarga. El guardado diffea
      // contra esto: así la precarga se sigue guardando (difiere del crudo vacío) y solo
      // se protegen los campos genuinamente vacíos e intactos.
      const snap: Record<string, Fila> = {};
      for (const pa of PAISES_EMBUDO_BOT) snap[pa] = { ...porPais[pa] };
      setOriginales(snap);
      // Precarga de datos de pago: rellena SOLO los campos vacíos con los fijos del país
      // (el precio base sale de los precios globales de Configuración si están definidos).
      for (const pa of PAISES_EMBUDO_BOT) {
        for (const [k, v] of Object.entries(defaultsPago(pa, globalPrecios))) {
          if (!String(porPais[pa][k] ?? "").trim()) porPais[pa][k] = v;
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
    // PATCH PARCIAL por país: por cada fila mandamos la clave (producto, pais) + SOLO los
    // campos que cambiaron respecto al snapshot crudo de Supabase. Intacto → no viaja (se
    // conserva). Vaciado a propósito → viaja como "" (se borra). El backend upserta país
    // por país, así cada fila puede llevar un set de columnas distinto.
    const filasPayload = Object.values(filas).map((fila) => {
      const base = originales[fila.pais] ?? {};
      const out: Record<string, string> = { producto: fila.producto, pais: fila.pais };
      for (const k of CLAVES_PATCH_PROD) {
        const actual = String(fila[k] ?? "");
        const previo = String(base[k] ?? "");
        if (actual !== previo) out[k] = actual;
      }
      return out;
    });
    try {
      const r = await fetch("/api/embudos/productos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filas: filasPayload }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        setEstado("✓ Guardado en Supabase.");
        // El snapshot pasa a ser lo recién guardado: un segundo guardado en la misma
        // sesión vuelve a mandar solo lo nuevo (y nunca re-pisa con "" lo intacto).
        const snap: Record<string, Fila> = {};
        for (const [pa, fila] of Object.entries(filas)) snap[pa] = { ...fila };
        setOriginales(snap);
      } else {
        setEstado("⚠️ " + (data.error ?? `Error ${r.status}`));
      }
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
          guardan en Supabase (tabla <code>config_bots</code>).
        </p>
      </div>

      {/* Selector de producto */}
      <label className="flex max-w-md flex-col gap-1 text-sm">
        <span className="text-muted">Producto</span>
        {otro ? (
          <input
            value={otroText}
            placeholder="clave del producto (ej. masmellos) — Enter para cargar"
            // M3: cargar solo al salir del campo o con Enter, no en cada tecla.
            onChange={(e) => setOtroText(e.target.value)}
            // Solo recargar si la clave cambió (no pisar lo que haya en pantalla).
            onBlur={() => {
              const k = toProductoId(otroText);
              if (k !== productoKey) cargar(k);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const k = toProductoId(otroText);
                if (k !== productoKey) cargar(k);
              }
            }}
            className={inputCls}
          />
        ) : (
          <select
            value={productoKey}
            onChange={(e) => {
              if (e.target.value === "__otro__") {
                setOtro(true);
                setOtroText("");
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

          {/* Los prompts de IA se editan ahora en la pestaña «IA» (por país). */}

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

            <p className="pt-1 text-xs font-medium text-muted">
              Mensajes de cobro ({NOMBRE_PAIS[pais]}) — cambian por país
            </p>
            <div className="grid grid-cols-1 gap-3">
              {MSG_COBRO_PAIS.map(({ k, label }) => (
                <label key={k} className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">{label}</span>
                  <textarea
                    value={fp[k] ?? ""}
                    onChange={(e) => setPorPais(k, e.target.value)}
                    rows={4}
                    className={inputCls}
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Las variaciones de mensajes (rotador) ahora se editan en el constructor
              del Embudo (pestaña "Embudo (constructor)"), inline en cada bloque. */}

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
