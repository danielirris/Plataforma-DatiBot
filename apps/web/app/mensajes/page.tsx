"use client";

import { useEffect, useState } from "react";
import {
  embudoVacio,
  type Producto,
  type EmbudoWhatsApp,
  type Orderbump,
} from "@plataforma/products/schema";
import { PAISES_EMBUDO, paisEmbudo, fmtMonto, RANURAS_EMBUDO } from "@/lib/embudo/paises";
import { mensajeDeError, errorDeRed } from "@/lib/http/errores";

type ProdLite = { id: string; nombre: string };

export default function MensajesPage() {
  const [productos, setProductos] = useState<ProdLite[]>([]);
  const [sel, setSel] = useState<string>("");
  const [p, setP] = useState<Producto | null>(null);
  const [emb, setEmb] = useState<EmbudoWhatsApp>(embudoVacio());
  const [pais, setPais] = useState<string>("CO");
  const [cargando, setCargando] = useState<boolean>(false);
  const [genEstado, setGenEstado] = useState<string>("");
  const [guardando, setGuardando] = useState<boolean>(false);
  const [okMsg, setOkMsg] = useState<string>("");

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((d: Producto[]) => setProductos(d.map((x) => ({ id: x.id, nombre: x.nombre }))))
      .catch(() => {});
  }, []);

  async function elegir(id: string) {
    setSel(id);
    setOkMsg("");
    setGenEstado("");
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

  function setVendedor(campo: keyof EmbudoWhatsApp["vendedor"], valor: string) {
    setEmb((prev) => ({ ...prev, vendedor: { ...prev.vendedor, [campo]: valor } }));
  }
  function setOrderbump(i: number, campo: keyof Orderbump, valor: string) {
    setEmb((prev) => {
      const obs = [...prev.orderbumps];
      obs[i] = { ...obs[i], [campo]: valor };
      return { ...prev, orderbumps: obs };
    });
  }
  function setMensaje(codigo: string, clave: string, valor: string) {
    setEmb((prev) => ({
      ...prev,
      mensajesPorPais: {
        ...prev.mensajesPorPais,
        [codigo]: { ...(prev.mensajesPorPais[codigo] ?? {}), [clave]: valor },
      },
    }));
  }

  async function generar() {
    if (!p?.id) return;
    setGenEstado("Generando los 10 mensajes en los 5 países… (puede tardar 1-2 min)");
    setOkMsg("");
    try {
      // Mandamos el producto con el embudo actual (vendedor + orderbumps) que se está editando.
      const productoConEmbudo = { ...p, embudo: emb };
      const r = await fetch(`/api/productos/${p.id}/generar-embudo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ producto: productoConEmbudo }),
      });
      if (!r.ok) {
        setGenEstado("⚠️ " + (await mensajeDeError(r)));
        return;
      }
      const data = (await r.json()) as {
        mensajesPorPais: Record<string, Record<string, string>>;
        fallidos?: string[];
      };
      setEmb((prev) => ({ ...prev, mensajesPorPais: data.mensajesPorPais }));
      setGenEstado(
        data.fallidos?.length
          ? `✓ Listos. Fallaron: ${data.fallidos.join(", ")} (reintenta).`
          : "✓ Mensajes generados en los 5 países. Revisa por pestaña y guarda.",
      );
    } catch (e) {
      setGenEstado("⚠️ " + errorDeRed(e));
    }
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
  const hayMensajes = Object.keys(emb.mensajesPorPais).length > 0;
  const inputCls =
    "w-full rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-sm text-text outline-none focus:border-accent";

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-text">💬 Mensajes del embudo (COD)</h1>
      <p className="mt-2 text-sm text-muted">
        Los 10 mensajes del embudo de WhatsApp por país (pago por confianza), con la
        oferta y los 6 orderbumps. Elige un producto, define los orderbumps y genera.
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
          {/* Vendedor */}
          <div className="mt-6 space-y-3 rounded-2xl border border-[var(--hairline)] glass p-5">
            <p className="text-sm font-medium text-text">Vendedor (quién habla en los mensajes)</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                value={emb.vendedor.nombre}
                onChange={(e) => setVendedor("nombre", e.target.value)}
                placeholder="Nombre (ej. Vanessa)"
                className={inputCls}
              />
              <input
                value={emb.vendedor.oficio}
                onChange={(e) => setVendedor("oficio", e.target.value)}
                placeholder="Oficio (ej. esteticista)"
                className={inputCls}
              />
              <select
                value={emb.vendedor.genero}
                onChange={(e) => setVendedor("genero", e.target.value)}
                className={inputCls}
              >
                <option value="F">Mujer</option>
                <option value="M">Hombre</option>
                <option value="N">Neutro</option>
              </select>
            </div>
          </div>

          {/* Orderbumps: base (nivel 1) + 6 */}
          <div className="mt-4 space-y-3 rounded-2xl border border-[var(--hairline)] glass p-5">
            <p className="text-sm font-medium text-text">
              Oferta: base + 6 orderbumps (la escalera de 7 niveles)
            </p>
            <p className="text-xs text-muted">
              El <b>nivel 1</b> es el producto base + certificado. Los <b>6 orderbumps</b> (niveles
              2-7) suman un bono cada uno. Los montos son fijos por país (se muestran en cada
              pestaña abajo). Aquí defines QUÉ bono agrega cada nivel.
            </p>
            <div className="space-y-2">
              {emb.orderbumps.map((ob, i) => (
                <div
                  key={ob.nivel}
                  className="grid gap-2 rounded-lg border border-[var(--hairline)] bg-[var(--field)] p-2.5 sm:grid-cols-[auto_1fr_1fr]"
                >
                  <span className="self-center text-xs font-medium text-accent-2">Nivel {ob.nivel}</span>
                  <input
                    value={ob.nombre_bono}
                    onChange={(e) => setOrderbump(i, "nombre_bono", e.target.value)}
                    placeholder="Bono que agrega (ej. Curso de Cejas)"
                    className="rounded border border-[var(--hairline)] bg-[var(--bg)] px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
                  />
                  <input
                    value={ob.descripcion}
                    onChange={(e) => setOrderbump(i, "descripcion", e.target.value)}
                    placeholder="Por qué le sirve (paréntesis)"
                    className="rounded border border-[var(--hairline)] bg-[var(--bg)] px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Generar */}
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--hairline)] glass p-4">
            <button
              onClick={generar}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              {hayMensajes ? "🔄 Regenerar mensajes" : "✨ Generar mensajes (5 países)"}
            </button>
            {genEstado && <span className="text-sm text-muted">{genEstado}</span>}
          </div>

          {/* Pestañas por país + los 10 mensajes */}
          {hayMensajes && (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap gap-2">
                {PAISES_EMBUDO.map((pa) => (
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
                    {emb.mensajesPorPais[pa.codigo] ? "" : " ·"}
                  </button>
                ))}
              </div>

              {paisActivo && (
                <p className="text-xs text-muted">
                  Montos {paisActivo.moneda}:{" "}
                  {paisActivo.montos.map((m) => `${paisActivo.simbolo}${fmtMonto(m)}`).join(" · ")}
                  {paisActivo.identificacion ? ` · ${paisActivo.identificacion}` : ""}
                </p>
              )}

              {RANURAS_EMBUDO.map((r) => (
                <div key={r.key} className="space-y-1 rounded-xl border border-[var(--hairline)] glass p-3">
                  <div className="text-xs font-medium text-text">{r.label}</div>
                  <textarea
                    value={msgs[r.key] ?? ""}
                    onChange={(e) => setMensaje(pais, r.key, e.target.value)}
                    rows={r.key === "msg_cobro" || r.key === "msg_imagen_caption" ? 10 : 5}
                    placeholder={r.descripcion}
                    className="w-full rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-sm text-text outline-none focus:border-accent"
                  />
                </div>
              ))}
            </div>
          )}

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
