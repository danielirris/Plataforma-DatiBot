"use client";

import { useEffect, useState } from "react";
import { embudoVacio, type Producto, type EmbudoWhatsApp } from "@plataforma/products/schema";
import { PAISES_EMBUDO, paisEmbudo, RANURAS_EMBUDO } from "@/lib/embudo/paises";

type ProdLite = { id: string; nombre: string };

export default function MensajesPage() {
  const [productos, setProductos] = useState<ProdLite[]>([]);
  const [sel, setSel] = useState<string>("");
  const [p, setP] = useState<Producto | null>(null);
  const [emb, setEmb] = useState<EmbudoWhatsApp>(embudoVacio());
  const [pais, setPais] = useState<string>("CO");
  const [cargando, setCargando] = useState<boolean>(false);
  const [guardando, setGuardando] = useState<boolean>(false);
  const [okMsg, setOkMsg] = useState<string>("");
  // Precios globales (Configuración): sirven de valor por defecto de los montos.
  const [globalPrecios, setGlobalPrecios] = useState<Record<string, number[]>>({});

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((d: Producto[]) => setProductos(d.map((x) => ({ id: x.id, nombre: x.nombre }))))
      .catch(() => {});
    fetch("/api/precios")
      .then((r) => r.json())
      .then((d) => setGlobalPrecios(d.precios ?? {}))
      .catch(() => {});
  }, []);

  async function elegir(id: string) {
    setSel(id);
    setOkMsg("");
    if (!id) {
      setP(null);
      return;
    }
    setCargando(true);
    try {
      const r = await fetch(`/api/products/${id}`);
      const prod = (await r.json()) as Producto;
      setP(prod);
      setEmb(prod.embudo ?? embudoVacio());
    } catch {
      /* nada */
    }
    setCargando(false);
  }

  function setMensaje(codigo: string, clave: string, valor: string) {
    setEmb((prev) => ({
      ...prev,
      mensajesPorPais: {
        ...prev.mensajesPorPais,
        [codigo]: { ...(prev.mensajesPorPais[codigo] ?? {}), [clave]: valor },
      },
    }));
    setOkMsg("");
  }

  // Montos de la escalera (7 "fases") por país. Por defecto: los precios GLOBALES de
  // Configuración (o los de PAISES_EMBUDO si no hay); cada producto puede sobreescribirlos.
  function baseMontos(codigo: string): number[] {
    return globalPrecios[codigo] ?? paisEmbudo(codigo)?.montos ?? [];
  }
  function montosDe(codigo: string): number[] {
    return baseMontos(codigo).map((d, i) => emb.montosPorPais?.[codigo]?.[i] ?? d);
  }
  function setMonto(codigo: string, i: number, valor: string) {
    const n = Number(valor);
    setEmb((prev) => {
      const arr = baseMontos(codigo).map((d, k) => prev.montosPorPais?.[codigo]?.[k] ?? d);
      arr[i] = Number.isFinite(n) ? n : 0;
      return { ...prev, montosPorPais: { ...(prev.montosPorPais ?? {}), [codigo]: arr } };
    });
    setOkMsg("");
  }

  // Atajo: copia los mensajes del país activo a TODOS los países (suelen ser iguales).
  function copiarATodos() {
    if (!confirm(`¿Copiar los mensajes de ${paisActivo?.nombre ?? pais} a los otros 4 países? Sobrescribe lo que tengan.`))
      return;
    setEmb((prev) => {
      const base = prev.mensajesPorPais[pais] ?? {};
      const nuevo = { ...prev.mensajesPorPais };
      for (const pa of PAISES_EMBUDO) nuevo[pa.codigo] = { ...base };
      return { ...prev, mensajesPorPais: nuevo };
    });
    setOkMsg("✓ Copiado a los 5 países (recuerda guardar).");
  }

  async function guardar() {
    if (!p?.id) return;
    setGuardando(true);
    setOkMsg("");
    try {
      const r = await fetch(`/api/products/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...p, embudo: emb }),
      });
      if (!r.ok) throw new Error();
      const guardado = (await r.json()) as Producto;
      setP(guardado);
      setOkMsg("✓ Guardado");
    } catch {
      setOkMsg("⚠️ Error al guardar");
    }
    setGuardando(false);
  }

  const paisActivo = paisEmbudo(pais);
  const msgs = emb.mensajesPorPais[pais] ?? {};
  const inputCls =
    "w-full rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-sm text-text outline-none focus:border-accent";

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-text">💬 Mensajes del embudo (COD)</h1>
      <p className="mt-2 text-sm text-muted">
        Pega aquí tus mensajes del embudo de WhatsApp, por país. Elige un producto, pega los
        mensajes en cada espacio y guarda. Puedes escribir uno y copiarlo a los 5 países.
      </p>

      {/* Selector de producto */}
      <div className="mt-6">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Producto</span>
          <select value={sel} onChange={(e) => elegir(e.target.value)} className={inputCls}>
            <option value="">— elige un producto —</option>
            {productos.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nombre || "(sin nombre)"}
              </option>
            ))}
          </select>
        </label>
      </div>

      {cargando && <p className="mt-4 text-sm text-muted">Cargando…</p>}

      {p && (
        <>
          {/* Pestañas por país */}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {PAISES_EMBUDO.map((pa) => {
              const tiene = Object.values(emb.mensajesPorPais[pa.codigo] ?? {}).some((v) =>
                String(v ?? "").trim(),
              );
              return (
                <button
                  key={pa.codigo}
                  onClick={() => setPais(pa.codigo)}
                  className={
                    "rounded-lg border px-3 py-1.5 text-sm " +
                    (pais === pa.codigo
                      ? "border-accent bg-accent/10 text-accent-2"
                      : "border-[var(--hairline)] text-muted hover:border-accent/40")
                  }
                >
                  {pa.bandera} {pa.nombre}
                  {tiene ? " ✓" : ""}
                </button>
              );
            })}
            <button
              onClick={copiarATodos}
              className="ml-auto rounded-lg border border-[var(--hairline)] px-3 py-1.5 text-xs text-muted hover:text-text"
            >
              ⧉ Copiar a los 5 países
            </button>
          </div>

          {/* Montos de la escalera (7 fases), editables por país. Se usan como referencia
              al escribir los mensajes (msg_cobro / datos de pago). */}
          {paisActivo && (
            <div className="mt-3 space-y-2 rounded-xl border border-[var(--hairline)] glass p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-text">
                  Montos de la escalera — {paisActivo.moneda} ({paisActivo.simbolo})
                </span>
                <span className="text-[11px] text-muted">Fase 1 = base · Fase 7 = tope</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {montosDe(pais).map((m, i) => (
                  <label key={i} className="flex flex-col gap-0.5 text-[11px] text-muted">
                    <span>Fase {i + 1}</span>
                    <div className="flex items-center gap-1">
                      <span>{paisActivo.simbolo}</span>
                      <input
                        type="number"
                        value={m}
                        onChange={(e) => setMonto(pais, i, e.target.value)}
                        className="w-full rounded border border-[var(--hairline)] bg-[var(--field)] px-2 py-1 text-sm text-text outline-none focus:border-accent"
                      />
                    </div>
                  </label>
                ))}
              </div>
              {paisActivo.identificacion && (
                <p className="text-[11px] text-muted">{paisActivo.identificacion}</p>
              )}
            </div>
          )}

          {/* Los espacios de mensajes (siempre visibles, para pegar) */}
          <div className="mt-4 space-y-4">
            {RANURAS_EMBUDO.map((r) => (
              <div key={r.key} className="space-y-1 rounded-xl border border-[var(--hairline)] glass p-3">
                <div className="text-xs font-medium text-text">{r.label}</div>
                <textarea
                  value={msgs[r.key] ?? ""}
                  onChange={(e) => setMensaje(pais, r.key, e.target.value)}
                  rows={r.key === "msg_cobro" || r.key === "msg_imagen_caption" ? 8 : 4}
                  placeholder={r.descripcion}
                  className="w-full rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-sm text-text outline-none focus:border-accent"
                />
              </div>
            ))}
          </div>

          {/* Guardar */}
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--hairline)] glass p-4">
            <button
              onClick={guardar}
              disabled={guardando}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Guardar mensajes"}
            </button>
            {okMsg && (
              <span className={"text-sm " + (okMsg.startsWith("✓") ? "text-accent-2" : "text-red-400")}>
                {okMsg}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
