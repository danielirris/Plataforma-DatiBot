"use client";

import { useEffect, useState } from "react";
import {
  ESTADOS_EMBUDO,
  ESTADO_INFO,
  TIPOS_PASO,
  FUENTES_PASO,
  type PasoEmbudo,
} from "@/lib/embudos/types";

type ProductoLite = { id: string; nombre: string; productoId?: string };
type Paso = { tipo: string; contenido: string; fuente: string; delay_segundos: number };
type PorEstado = Record<string, Paso[]>;

const keyProducto = (p: ProductoLite) => (p.productoId?.trim() || p.id);

// Plantilla por defecto (secuencia estándar del embudo). Punto de partida editable.
const PLANTILLA: PorEstado = {
  MENU: [
    { tipo: "mensaje", fuente: "rotador", contenido: "menu", delay_segundos: 2 },
    { tipo: "etiqueta", fuente: "directo", contenido: "menu_enviado", delay_segundos: 0 },
  ],
  VIDEO: [
    { tipo: "video", fuente: "media", contenido: "video_media_id", delay_segundos: 2 },
    {
      tipo: "boton",
      fuente: "directo",
      contenido: JSON.stringify({
        body: "¿Quieres que te envíe todo el material?",
        buttons: [{ id: "recibir_material", title: "Recibir material" }],
      }),
      delay_segundos: 0,
    },
    { tipo: "etiqueta", fuente: "directo", contenido: "bienvenida", delay_segundos: 0 },
  ],
  CONFIRMACION: [
    { tipo: "mensaje", fuente: "directo", contenido: "Escríbeme *SI RECIBIR* y te paso todo ahora mismo.", delay_segundos: 2 },
    { tipo: "etiqueta", fuente: "directo", contenido: "contenido_solicitado", delay_segundos: 0 },
  ],
  ENTREGA: [
    { tipo: "etiqueta", fuente: "directo", contenido: "contenido_enviado", delay_segundos: 0 },
    { tipo: "pdf", fuente: "media", contenido: "pdf_1_media_id", delay_segundos: 3 },
    { tipo: "pdf", fuente: "media", contenido: "pdf_2_media_id", delay_segundos: 3 },
    { tipo: "mensaje", fuente: "config", contenido: "msg_bonos_intro", delay_segundos: 3 },
    { tipo: "mensaje", fuente: "config", contenido: "msg_cobro", delay_segundos: 3 },
    { tipo: "mensaje", fuente: "config", contenido: "msg_datos_pago", delay_segundos: 0 },
  ],
  STOP: [
    { tipo: "mensaje", fuente: "directo", contenido: "Listo, no te escribo más. Cuando quieras, aquí estoy. 🙌", delay_segundos: 0 },
    { tipo: "etiqueta", fuente: "directo", contenido: "stop", delay_segundos: 0 },
  ],
};

const FUENTE_HINT: Record<string, string> = {
  config: "nombre de columna en config/productos (ej. msg_cobro)",
  media: "nombre de columna en media (ej. pdf_1_media_id)",
  rotador: "nombre del campo del rotador (ej. menu)",
  directo: "el texto/valor literal a enviar",
};

function parseBoton(contenido: string): { body: string; title: string; id: string } {
  try {
    const o = JSON.parse(contenido) as {
      body?: string;
      rotador_campo?: string;
      buttons?: { id?: string; title?: string }[];
    };
    const b = o.buttons?.[0] ?? {};
    return { body: o.body ?? o.rotador_campo ?? "", title: b.title ?? "", id: b.id ?? "" };
  } catch {
    return { body: "", title: "", id: "" };
  }
}
function buildBoton(body: string, title: string, id: string): string {
  return JSON.stringify({ body, buttons: [{ id: id || "opcion", title }] });
}

function vacio(): PorEstado {
  const o: PorEstado = {};
  for (const e of ESTADOS_EMBUDO) o[e] = [];
  return o;
}

export function PasosEmbudoEditor() {
  const [productosDatibot, setProductosDatibot] = useState<ProductoLite[]>([]);
  const [productoKey, setProductoKey] = useState<string>("");
  const [otro, setOtro] = useState<boolean>(false);
  const [pasos, setPasos] = useState<PorEstado>(vacio());
  const [cargando, setCargando] = useState<boolean>(false);
  const [guardando, setGuardando] = useState<boolean>(false);
  const [estado, setEstado] = useState<string>("");
  const [cargado, setCargado] = useState<boolean>(false);

  useEffect(() => {
    fetch("/api/products", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((l: ProductoLite[]) => setProductosDatibot(Array.isArray(l) ? l : []))
      .catch(() => {});
  }, []);

  async function cargar(key: string) {
    setProductoKey(key);
    setEstado("");
    setCargado(false);
    if (!key) {
      setPasos(vacio());
      return;
    }
    setCargando(true);
    try {
      const r = await fetch(`/api/embudos/pasos?producto=${encodeURIComponent(key)}`, {
        cache: "no-store",
      });
      const data = await r.json();
      const porEstado = vacio();
      for (const f of (data.filas ?? []) as PasoEmbudo[]) {
        if (!porEstado[f.estado]) porEstado[f.estado] = [];
        porEstado[f.estado].push({
          tipo: f.tipo,
          contenido: f.contenido ?? "",
          fuente: f.fuente ?? "",
          delay_segundos: Number(f.delay_segundos) || 0,
        });
      }
      setPasos(porEstado);
      setCargado(true);
      if (data.error) setEstado("⚠️ " + data.error);
    } catch (e) {
      setEstado("⚠️ " + (e instanceof Error ? e.message : "Error de red"));
    }
    setCargando(false);
  }

  function setPaso(est: string, i: number, campo: keyof Paso, valor: string | number) {
    setPasos((prev) => ({
      ...prev,
      [est]: prev[est].map((p, j) => (j === i ? { ...p, [campo]: valor } : p)),
    }));
    setEstado("");
  }
  function addPaso(est: string) {
    setPasos((prev) => ({
      ...prev,
      [est]: [...prev[est], { tipo: "mensaje", contenido: "", fuente: "config", delay_segundos: 2 }],
    }));
  }
  function removePaso(est: string, i: number) {
    setPasos((prev) => ({ ...prev, [est]: prev[est].filter((_, j) => j !== i) }));
  }
  function movePaso(est: string, i: number, dir: -1 | 1) {
    setPasos((prev) => {
      const arr = [...prev[est]];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return prev;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...prev, [est]: arr };
    });
  }
  function cargarPlantilla() {
    const hay = ESTADOS_EMBUDO.some((e) => (pasos[e] ?? []).length);
    if (hay && !confirm("Esto reemplaza los pasos actuales por la plantilla. ¿Continuar?"))
      return;
    setPasos(JSON.parse(JSON.stringify(PLANTILLA)));
    setEstado("Plantilla cargada (recuerda guardar).");
  }

  async function guardar() {
    if (!productoKey) return;
    setGuardando(true);
    setEstado("Guardando…");
    const filas: PasoEmbudo[] = [];
    for (const est of ESTADOS_EMBUDO) {
      (pasos[est] ?? []).forEach((p, idx) => {
        if (!p.tipo) return;
        filas.push({
          producto: productoKey,
          estado: est,
          orden: idx + 1,
          tipo: p.tipo,
          contenido: p.contenido,
          fuente: p.fuente,
          delay_segundos: p.delay_segundos,
        });
      });
    }
    try {
      const r = await fetch("/api/embudos/pasos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ producto: productoKey, filas }),
      });
      const data = await r.json().catch(() => ({}));
      setEstado(r.ok ? "✓ Embudo guardado en Supabase." : "⚠️ " + (data.error ?? `Error ${r.status}`));
    } catch (e) {
      setEstado("⚠️ " + (e instanceof Error ? e.message : "Error de red"));
    }
    setGuardando(false);
  }

  const inputCls =
    "rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-2 py-1.5 text-sm text-text outline-none focus:border-accent";

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-medium">Embudo (pasos)</h2>
        <p className="text-xs text-muted">
          La secuencia que ejecuta el bot, por estado. Reordena, ajusta el tipo, el
          contenido y el <b>delay</b> (segundos de espera después de cada paso, anti-baneo).
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
          {ESTADOS_EMBUDO.every((e) => (pasos[e] ?? []).length === 0) && (
            <div className="rounded-lg border border-dashed border-[var(--hairline)] p-4 text-center text-sm text-muted">
              Este embudo está vacío.{" "}
              <button onClick={cargarPlantilla} className="font-medium text-accent-2 hover:underline">
                Cargar plantilla por defecto
              </button>{" "}
              para empezar.
            </div>
          )}

          {ESTADOS_EMBUDO.map((est) => (
            <div key={est} className="space-y-2 rounded-xl border border-[var(--hairline)] glass p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold text-text">{est}</span>
                <span className="text-[11px] text-muted">{ESTADO_INFO[est]}</span>
              </div>

              {(pasos[est] ?? []).map((p, i) => (
                <div key={i} className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-muted">#{i + 1}</span>
                    <div className="flex gap-0.5">
                      <button
                        onClick={() => movePaso(est, i, -1)}
                        disabled={i === 0}
                        className="rounded border border-[var(--hairline)] px-1.5 text-xs text-muted hover:text-text disabled:opacity-30"
                        title="Subir"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => movePaso(est, i, 1)}
                        disabled={i === (pasos[est]?.length ?? 0) - 1}
                        className="rounded border border-[var(--hairline)] px-1.5 text-xs text-muted hover:text-text disabled:opacity-30"
                        title="Bajar"
                      >
                        ↓
                      </button>
                    </div>
                    <select
                      value={p.tipo}
                      onChange={(e) => {
                        const t = e.target.value;
                        setPaso(est, i, "tipo", t);
                        if (t === "boton" || t === "etiqueta") setPaso(est, i, "fuente", "directo");
                      }}
                      className={inputCls}
                    >
                      {TIPOS_PASO.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>

                    {p.tipo !== "boton" && p.tipo !== "etiqueta" && (
                      <select
                        value={p.fuente}
                        onChange={(e) => setPaso(est, i, "fuente", e.target.value)}
                        className={inputCls}
                        title="De dónde sale el contenido"
                      >
                        {FUENTES_PASO.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    )}

                    <label className="ml-auto flex items-center gap-1 text-xs text-muted">
                      delay
                      <input
                        type="number"
                        min={0}
                        max={30}
                        value={p.delay_segundos}
                        onChange={(e) => setPaso(est, i, "delay_segundos", Number(e.target.value) || 0)}
                        className={inputCls + " w-16"}
                      />
                      s
                    </label>
                    <button
                      onClick={() => removePaso(est, i)}
                      className="text-xs text-muted hover:text-red-400"
                    >
                      Quitar
                    </button>
                  </div>

                  {/* Editor de contenido según el tipo */}
                  <div className="mt-2">
                    {p.tipo === "boton" ? (
                      (() => {
                        const b = parseBoton(p.contenido);
                        return (
                          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                            <input
                              value={b.body}
                              placeholder="Texto del mensaje del botón"
                              onChange={(e) => setPaso(est, i, "contenido", buildBoton(e.target.value, b.title, b.id))}
                              className={inputCls}
                            />
                            <input
                              value={b.title}
                              maxLength={20}
                              placeholder="Título botón (máx 20)"
                              onChange={(e) => setPaso(est, i, "contenido", buildBoton(b.body, e.target.value, b.id))}
                              className={inputCls}
                            />
                            <input
                              value={b.id}
                              placeholder="id"
                              onChange={(e) => setPaso(est, i, "contenido", buildBoton(b.body, b.title, e.target.value))}
                              className={inputCls + " w-24"}
                            />
                          </div>
                        );
                      })()
                    ) : p.tipo === "etiqueta" ? (
                      <input
                        value={p.contenido}
                        placeholder="nombre de la etiqueta (mecánica del embudo)"
                        onChange={(e) => setPaso(est, i, "contenido", e.target.value)}
                        className={inputCls + " w-full"}
                      />
                    ) : (
                      <input
                        value={p.contenido}
                        placeholder={FUENTE_HINT[p.fuente] ?? "contenido"}
                        onChange={(e) => setPaso(est, i, "contenido", e.target.value)}
                        className={inputCls + " w-full"}
                      />
                    )}
                  </div>
                </div>
              ))}

              <button
                onClick={() => addPaso(est)}
                className="text-xs text-accent-2 hover:underline"
              >
                + agregar paso a {est}
              </button>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--hairline)] glass p-4">
            <button
              onClick={guardar}
              disabled={guardando}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Guardar embudo"}
            </button>
            <button
              onClick={cargarPlantilla}
              className="rounded-lg border border-[var(--hairline)] px-3 py-2 text-xs text-muted hover:text-text"
            >
              Cargar plantilla por defecto
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
