"use client";

import { useEffect, useState } from "react";
import { PAISES_EMBUDO_BOT, NOMBRE_PAIS } from "@/lib/embudos/types";
import { keyProducto, toProductoId } from "@/lib/producto/id";
import { leerUltimoProducto, guardarUltimoProducto } from "@/lib/embudos/ultimo-producto";

type ProductoLite = { id: string; nombre: string; productoId?: string };
type Fila = Record<string, string>; // producto, pais + los 2 prompts (como string)

// Solo estas 2 columnas de config_bots gestiona esta pestaña. El resto (mensajes, pago…)
// lo maneja "Bot por producto": el guardado parcial del backend no las toca.
const CLAVES_IA = ["system_prompt_convencer", "system_prompt_cobrar"];
const CAMPOS_IA: { k: string; label: string; hint: string }[] = [
  {
    k: "system_prompt_convencer",
    label: "IA Convencer",
    hint: "Persuade al cliente a recibir el paquete (antes de entregar).",
  },
  {
    k: "system_prompt_cobrar",
    label: "IA Cobradora",
    hint: "Motiva la contribución (después de entregar).",
  },
];

// Capacita las 2 IAs (OpenAI) del bot por PRODUCTO y PAÍS. Se guardan en config_bots
// (system_prompt_convencer, system_prompt_cobrar), una fila por país. El prompt suele ser
// el mismo entre países (cambia por producto), por eso hay "copiar a todos los países".
export function IAManager() {
  const [productos, setProductos] = useState<ProductoLite[]>([]);
  const [productoKey, setProductoKey] = useState<string>("");
  const [otro, setOtro] = useState<boolean>(false);
  const [otroText, setOtroText] = useState<string>("");
  const [filas, setFilas] = useState<Record<string, Fila>>({});
  // Snapshot CRUDO de Supabase (para el diff del guardado; solo se manda lo que cambió).
  const [originales, setOriginales] = useState<Record<string, Fila>>({});
  const [pais, setPais] = useState<string>("CO");
  const [cargando, setCargando] = useState<boolean>(false);
  const [guardando, setGuardando] = useState<boolean>(false);
  const [estado, setEstado] = useState<string>("");
  const cargado = Object.keys(filas).length > 0;

  useEffect(() => {
    fetch("/api/products?slim=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((l: ProductoLite[]) => setProductos(Array.isArray(l) ? l : []))
      .catch(() => {});
  }, []);

  // Autocarga el último producto trabajado al entrar a la pestaña (se recuerda entre pestañas).
  useEffect(() => {
    const ultimo = leerUltimoProducto();
    if (ultimo) cargar(ultimo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargar(key: string) {
    setProductoKey(key);
    guardarUltimoProducto(key);
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
      for (const pa of PAISES_EMBUDO_BOT) porPais[pa] = { producto: key, pais: pa };
      for (const f of (data.filas ?? []) as Record<string, unknown>[]) {
        const pa = String(f.pais ?? "");
        if (pa && porPais[pa]) {
          for (const k of CLAVES_IA) {
            const v = f[k];
            porPais[pa][k] = v === null || v === undefined ? "" : String(v);
          }
        }
      }
      // Snapshot crudo = lo que hay en Supabase (para el diff del guardado).
      const snap: Record<string, Fila> = {};
      for (const pa of PAISES_EMBUDO_BOT) snap[pa] = { ...porPais[pa] };
      setOriginales(snap);
      setFilas(porPais);
      if (data.error) setEstado("⚠️ " + data.error);
    } catch (e) {
      setEstado("⚠️ " + (e instanceof Error ? e.message : "Error de red"));
    }
    setCargando(false);
  }

  const fp = filas[pais] ?? {};

  // Escribe un prompt solo en el país activo.
  function setPorPais(k: string, v: string) {
    setFilas((prev) => ({ ...prev, [pais]: { ...(prev[pais] ?? {}), [k]: v } }));
    setEstado("");
  }

  // Copia los 2 prompts del país activo a TODOS los países (siguen guardándose 1 fila/país).
  function copiarATodos() {
    setFilas((prev) => {
      const origen = prev[pais] ?? {};
      const out: Record<string, Fila> = {};
      for (const [pa, fila] of Object.entries(prev)) {
        out[pa] = { ...fila };
        for (const k of CLAVES_IA) out[pa][k] = String(origen[k] ?? "");
      }
      return out;
    });
    setEstado(`Copiado a los ${PAISES_EMBUDO_BOT.length} países (recuerda guardar).`);
  }

  async function guardar() {
    if (!productoKey) return;
    setGuardando(true);
    setEstado("Guardando…");
    // Diff por país: manda la clave + SOLO los prompts que cambiaron. Los países sin
    // cambios NO se mandan (evita crear filas vacías en config_bots).
    const filasPayload = Object.values(filas)
      .map((fila) => {
        const base = originales[fila.pais] ?? {};
        const out: Record<string, string> = { producto: fila.producto, pais: fila.pais };
        for (const k of CLAVES_IA) {
          const actual = String(fila[k] ?? "");
          if (actual !== String(base[k] ?? "")) out[k] = actual;
        }
        return out;
      })
      .filter((out) => Object.keys(out).length > 2); // algo más que producto+pais
    if (!filasPayload.length) {
      setEstado("No hay cambios que guardar.");
      setGuardando(false);
      return;
    }
    try {
      const r = await fetch("/api/embudos/productos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filas: filasPayload }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        setEstado("✓ Guardado en Supabase.");
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
        <h2 className="text-lg font-medium">IA (capacitación por producto y país)</h2>
        <p className="text-xs text-muted">
          Los prompts de las 2 IAs del bot (OpenAI). Se guardan en Supabase (tabla{" "}
          <code>config_bots</code>), una versión por país.
        </p>
      </div>

      {/* Selector de producto */}
      <label className="flex max-w-md flex-col gap-1 text-sm">
        <span className="text-muted">Producto</span>
        {otro ? (
          <input
            value={otroText}
            placeholder="clave del producto (Enter para cargar)"
            onChange={(e) => setOtroText(e.target.value)}
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
            {productos.map((p) => (
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
        <div className="space-y-3 rounded-xl border border-[var(--hairline)] glass p-5">
          {/* Selector de país */}
          <div className="flex flex-wrap items-center gap-2">
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
            <button
              onClick={copiarATodos}
              className="ml-auto rounded-lg border border-[var(--hairline)] px-3 py-1.5 text-xs text-muted hover:border-accent/50 hover:text-text"
              title="Copia los 2 prompts de este país a los demás"
            >
              Copiar este prompt a todos los países
            </button>
          </div>

          {/* Aviso */}
          <p className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] p-3 text-xs text-muted">
            No escribas datos de pago ni precios inventados aquí. Escribe solo el carácter e
            instrucciones de la IA.
          </p>

          {/* Los 2 prompts, por país */}
          {CAMPOS_IA.map(({ k, label, hint }) => (
            <label key={k} className="flex flex-col gap-1 text-sm">
              <span className="text-muted">
                {label} · {NOMBRE_PAIS[pais]} ({pais})
              </span>
              <textarea
                value={fp[k] ?? ""}
                onChange={(e) => setPorPais(k, e.target.value)}
                rows={8}
                className={inputCls + " font-mono text-xs"}
              />
              <span className="text-[11px] text-muted">{hint}</span>
            </label>
          ))}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              onClick={guardar}
              disabled={guardando}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Guardar prompts"}
            </button>
            {estado && (
              <span className={"text-sm " + (estado.startsWith("✓") ? "text-accent-2" : "text-muted")}>
                {estado}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
