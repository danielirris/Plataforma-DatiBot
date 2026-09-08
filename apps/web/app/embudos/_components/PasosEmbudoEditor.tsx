"use client";

import { useEffect, useState } from "react";
import {
  ESTADOS_EMBUDO,
  ESTADO_INFO,
  type PasoEmbudo,
  type RotadorRow,
} from "@/lib/embudos/types";

type ProductoLite = { id: string; nombre: string; productoId?: string };
const keyProducto = (p: ProductoLite) => (p.productoId?.trim() || p.id);

// ── Constructor en línea ──────────────────────────────────────────────
// Cada "bloque" es un paso del embudo con su contenido AHÍ MISMO. Por debajo se
// guarda en las MISMAS tablas (pasos_embudo + mensajes_rotador + media_bots), así
// el motor de n8n no cambia.
type BloqueTipo = "mensaje" | "producto" | "archivo" | "boton" | "etiqueta";

interface Bloque {
  id: string;
  tipo: BloqueTipo;
  texto: string; // mensaje simple / etiqueta (nombre)
  usaVariaciones: boolean;
  variaciones: string[]; // mensaje con varias versiones (rotador)
  productoMsg: string; // "mensaje del producto": columna de productos (config)
  mediaSlot: string; // archivo: video | pdf_1..6
  caption: string; // archivo: caption
  botonBody: string;
  botonTitulo: string;
  botonId: string;
  delay: number; // segundos DESPUÉS del bloque
}

const TIPO_LABEL: Record<BloqueTipo, string> = {
  mensaje: "💬 Mensaje",
  producto: "🧩 Mensaje del producto",
  archivo: "📎 Archivo (video/PDF)",
  boton: "🔘 Botón",
  etiqueta: "🏷️ Etiqueta",
};

// "Mensaje del producto": mensajes que el motor rellena con datos del país.
const MSG_PRODUCTO: { k: string; label: string }[] = [
  { k: "msg_cobro", label: "Cobro (con la escalera de precios del país)" },
  { k: "msg_datos_pago", label: "Datos de pago (cuenta del país)" },
  { k: "msg_bienvenida", label: "Bienvenida (fijo)" },
  { k: "msg_bonos_intro", label: "Intro de bonos" },
  { k: "msg_felicitacion", label: "Felicitación" },
];

const MEDIA_SLOTS: { slot: string; label: string }[] = [
  { slot: "video", label: "Video del embudo" },
  { slot: "pdf_1", label: "PDF 1" },
  { slot: "pdf_2", label: "PDF 2" },
  { slot: "pdf_3", label: "PDF 3" },
  { slot: "pdf_4", label: "PDF 4" },
  { slot: "pdf_5", label: "PDF 5" },
  { slot: "pdf_6", label: "PDF 6" },
];

function mediaCols(slot: string): { tipo: "video" | "pdf"; media_id: string; caption: string } {
  if (slot === "video")
    return { tipo: "video", media_id: "video_media_id", caption: "video_caption" };
  const n = slot.slice(4);
  return { tipo: "pdf", media_id: `pdf_${n}_media_id`, caption: `pdf_${n}_caption` };
}
function slotDeMediaId(col: string): string {
  if (col === "video_media_id") return "video";
  const m = /^pdf_([1-6])_media_id$/.exec(col);
  return m ? `pdf_${m[1]}` : "video";
}

function nuevoId(): string {
  return "b" + Math.random().toString(36).slice(2, 10);
}
function nuevoBloque(tipo: BloqueTipo = "mensaje"): Bloque {
  return {
    id: nuevoId(),
    tipo,
    texto: "",
    usaVariaciones: false,
    variaciones: [""],
    productoMsg: "msg_cobro",
    mediaSlot: tipo === "archivo" ? "video" : "",
    caption: "",
    botonBody: "",
    botonTitulo: "",
    botonId: "recibir_material",
    delay: tipo === "etiqueta" ? 0 : 2,
  };
}

function parseBoton(contenido: string): { body: string; titulo: string; id: string } {
  try {
    const o = JSON.parse(contenido) as {
      body?: string;
      rotador_campo?: string;
      buttons?: { id?: string; title?: string }[];
    };
    const b = o.buttons?.[0] ?? {};
    return { body: o.body ?? o.rotador_campo ?? "", titulo: b.title ?? "", id: b.id ?? "" };
  } catch {
    return { body: "", titulo: "", id: "" };
  }
}

type PorEstado = Record<string, Bloque[]>;
function vacio(): PorEstado {
  const o: PorEstado = {};
  for (const e of ESTADOS_EMBUDO) o[e] = [];
  return o;
}

// Plantilla por defecto, en forma de bloques.
function plantilla(): PorEstado {
  const b = (t: BloqueTipo, extra: Partial<Bloque>): Bloque => ({ ...nuevoBloque(t), ...extra });
  return {
    MENU: [
      b("mensaje", {
        usaVariaciones: true,
        variaciones: [
          "¡Hola! 👋 Soy Laura. ¿Qué es lo que más te gustaría lograr? Escríbeme el número:\n1️⃣ …\n2️⃣ …\n3️⃣ …\n4️⃣ …",
          "¡Hey! 😃 Soy Laura. Cuéntame qué buscas y te ayudo. Escribe el número:\n1️⃣ …\n2️⃣ …\n3️⃣ …\n4️⃣ …",
        ],
        delay: 2,
      }),
      b("etiqueta", { texto: "menu_enviado", delay: 0 }),
    ],
    VIDEO: [
      b("archivo", { mediaSlot: "video", caption: "Mira esto 👀", delay: 2 }),
      b("boton", {
        botonBody: "¿Te envío TODO el material ahora?",
        botonTitulo: "Recibir material",
        botonId: "recibir_material",
        delay: 0,
      }),
      b("etiqueta", { texto: "bienvenida", delay: 0 }),
    ],
    CONFIRMACION: [
      b("mensaje", { texto: "Escríbeme *SÍ RECIBIR* y te paso todo en un momento 🙌", delay: 2 }),
      b("etiqueta", { texto: "contenido_solicitado", delay: 0 }),
    ],
    ENTREGA: [
      b("etiqueta", { texto: "contenido_enviado", delay: 0 }),
      b("archivo", { mediaSlot: "pdf_1", delay: 3 }),
      b("archivo", { mediaSlot: "pdf_2", delay: 3 }),
      b("producto", { productoMsg: "msg_bonos_intro", delay: 3 }),
      b("producto", { productoMsg: "msg_cobro", delay: 3 }),
      b("producto", { productoMsg: "msg_datos_pago", delay: 0 }),
    ],
    STOP: [
      b("mensaje", { texto: "Listo, no te escribo más. Cuando quieras, aquí estoy 🙌", delay: 0 }),
      b("etiqueta", { texto: "stop", delay: 0 }),
    ],
  };
}

export function PasosEmbudoEditor() {
  const [productos, setProductos] = useState<ProductoLite[]>([]);
  const [productoKey, setProductoKey] = useState<string>("");
  const [otro, setOtro] = useState<boolean>(false);
  const [bloques, setBloques] = useState<PorEstado>(vacio());
  const [cargando, setCargando] = useState<boolean>(false);
  const [guardando, setGuardando] = useState<boolean>(false);
  const [estado, setEstado] = useState<string>("");
  const [cargado, setCargado] = useState<boolean>(false);

  useEffect(() => {
    fetch("/api/products", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((l: ProductoLite[]) => setProductos(Array.isArray(l) ? l : []))
      .catch(() => {});
  }, []);

  async function cargar(key: string) {
    setProductoKey(key);
    setEstado("");
    setCargado(false);
    if (!key) {
      setBloques(vacio());
      return;
    }
    setCargando(true);
    try {
      const [rp, rr, rm] = await Promise.all([
        fetch(`/api/embudos/pasos?producto=${encodeURIComponent(key)}`, { cache: "no-store" }),
        fetch(`/api/embudos/rotador?producto=${encodeURIComponent(key)}`, { cache: "no-store" }),
        fetch(`/api/embudos/media?producto=${encodeURIComponent(key)}`, { cache: "no-store" }),
      ]);
      const dp = await rp.json();
      const dr = await rr.json();
      const dm = await rm.json();

      // Variantes por campo (rotador).
      const rot: Record<string, string[]> = {};
      for (const f of (dr.filas ?? []) as RotadorRow[]) {
        (rot[f.campo] ??= []).push(f.texto);
      }
      // Captions de media.
      const media = (dm.media ?? {}) as Record<string, string | null>;

      const porEstado = vacio();
      for (const f of (dp.filas ?? []) as PasoEmbudo[]) {
        if (!porEstado[f.estado]) porEstado[f.estado] = [];
        porEstado[f.estado].push(pasoABloque(f, rot, media));
      }
      setBloques(porEstado);
      setCargado(true);
      if (dp.error) setEstado("⚠️ " + dp.error);
    } catch (e) {
      setEstado("⚠️ " + (e instanceof Error ? e.message : "Error de red"));
    }
    setCargando(false);
  }

  function pasoABloque(
    f: PasoEmbudo,
    rot: Record<string, string[]>,
    media: Record<string, string | null>,
  ): Bloque {
    const base = nuevoBloque("mensaje");
    base.delay = Number(f.delay_segundos) || 0;
    if (f.tipo === "boton") {
      const b = parseBoton(f.contenido);
      return { ...base, tipo: "boton", botonBody: b.body, botonTitulo: b.titulo, botonId: b.id };
    }
    if (f.tipo === "etiqueta") {
      return { ...base, tipo: "etiqueta", texto: f.contenido };
    }
    if (f.fuente === "media" || f.tipo === "video" || f.tipo === "pdf") {
      const slot = slotDeMediaId(f.contenido);
      return { ...base, tipo: "archivo", mediaSlot: slot, caption: String(media[mediaCols(slot).caption] ?? "") };
    }
    if (f.fuente === "config") {
      return { ...base, tipo: "producto", productoMsg: f.contenido };
    }
    if (f.fuente === "rotador") {
      const vars = rot[f.contenido] ?? [];
      return { ...base, id: f.contenido, tipo: "mensaje", usaVariaciones: true, variaciones: vars.length ? vars : [""] };
    }
    // directo (mensaje simple)
    return { ...base, tipo: "mensaje", texto: f.contenido };
  }

  // ── edición ──
  function upd(est: string, id: string, cambio: Partial<Bloque>) {
    setBloques((prev) => ({
      ...prev,
      [est]: prev[est].map((b) => (b.id === id ? { ...b, ...cambio } : b)),
    }));
    setEstado("");
  }
  function add(est: string) {
    setBloques((prev) => ({ ...prev, [est]: [...prev[est], nuevoBloque("mensaje")] }));
  }
  function del(est: string, id: string) {
    setBloques((prev) => ({ ...prev, [est]: prev[est].filter((b) => b.id !== id) }));
  }
  function mover(est: string, i: number, dir: -1 | 1) {
    setBloques((prev) => {
      const arr = [...prev[est]];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return prev;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...prev, [est]: arr };
    });
  }
  function setVar(est: string, id: string, vi: number, v: string) {
    setBloques((prev) => ({
      ...prev,
      [est]: prev[est].map((b) =>
        b.id === id ? { ...b, variaciones: b.variaciones.map((x, k) => (k === vi ? v : x)) } : b,
      ),
    }));
  }
  function addVar(est: string, id: string) {
    setBloques((prev) => ({
      ...prev,
      [est]: prev[est].map((b) => (b.id === id ? { ...b, variaciones: [...b.variaciones, ""] } : b)),
    }));
  }
  function delVar(est: string, id: string, vi: number) {
    setBloques((prev) => ({
      ...prev,
      [est]: prev[est].map((b) =>
        b.id === id ? { ...b, variaciones: b.variaciones.filter((_, k) => k !== vi) } : b,
      ),
    }));
  }
  function cargarPlantilla() {
    const hay = ESTADOS_EMBUDO.some((e) => (bloques[e] ?? []).length);
    if (hay && !confirm("Reemplaza los bloques actuales por la plantilla. ¿Seguir?")) return;
    setBloques(plantilla());
    setEstado("Plantilla cargada (recuerda guardar).");
  }

  // ── guardado: reparte en pasos_embudo + mensajes_rotador + media_bots ──
  async function guardar() {
    if (!productoKey) return;
    setGuardando(true);
    setEstado("Guardando…");

    const pasos: PasoEmbudo[] = [];
    const rotador: { campo: string; variante: number; texto: string }[] = [];
    const captions: Record<string, string> = {};

    for (const est of ESTADOS_EMBUDO) {
      (bloques[est] ?? []).forEach((b, idx) => {
        const orden = idx + 1;
        const base = { producto: productoKey, estado: est, orden, delay_segundos: b.delay };
        if (b.tipo === "boton") {
          pasos.push({
            ...base,
            tipo: "boton",
            fuente: "directo",
            contenido: JSON.stringify({
              body: b.botonBody,
              buttons: [{ id: b.botonId || "opcion", title: b.botonTitulo }],
            }),
          });
        } else if (b.tipo === "etiqueta") {
          pasos.push({ ...base, tipo: "etiqueta", fuente: "directo", contenido: b.texto.trim() });
        } else if (b.tipo === "archivo") {
          const c = mediaCols(b.mediaSlot);
          pasos.push({ ...base, tipo: c.tipo, fuente: "media", contenido: c.media_id });
          captions[c.caption] = b.caption;
        } else if (b.tipo === "producto") {
          pasos.push({ ...base, tipo: "mensaje", fuente: "config", contenido: b.productoMsg });
        } else if (b.usaVariaciones) {
          // Mensaje con variaciones → rotador (campo = id estable del bloque).
          pasos.push({ ...base, tipo: "mensaje", fuente: "rotador", contenido: b.id });
          let n = 0;
          for (const t of b.variaciones) {
            if (!t.trim()) continue;
            n += 1;
            rotador.push({ campo: b.id, variante: n, texto: t });
          }
        } else {
          pasos.push({ ...base, tipo: "mensaje", fuente: "directo", contenido: b.texto });
        }
      });
    }

    try {
      const reqs: Promise<Response>[] = [
        fetch("/api/embudos/pasos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ producto: productoKey, filas: pasos }),
        }),
        fetch("/api/embudos/rotador", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ producto: productoKey, filas: rotador }),
        }),
      ];
      if (Object.keys(captions).length)
        reqs.push(
          fetch("/api/embudos/media", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ producto: productoKey, campos: captions }),
          }),
        );
      const res = await Promise.all(reqs);
      const malo = res.find((r) => !r.ok);
      if (malo) {
        const d = await malo.json().catch(() => ({}));
        setEstado("⚠️ " + (d.error ?? `Error ${malo.status}`));
      } else {
        setEstado("✓ Embudo guardado.");
      }
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
        <h2 className="text-lg font-medium">Embudo (constructor)</h2>
        <p className="text-xs text-muted">
          Arma el flujo bloque por bloque, en orden y por estado. Cada bloque es lo que el
          bot hace: un mensaje (con o sin variaciones), un archivo con su caption, un botón o
          una etiqueta. El <b>delay</b> es cuánto espera después (anti-baneo).
        </p>
      </div>

      {/* Producto */}
      <label className="flex max-w-md flex-col gap-1 text-sm">
        <span className="text-muted">Producto</span>
        {otro ? (
          <input
            value={productoKey}
            placeholder="clave del producto"
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
        <>
          {ESTADOS_EMBUDO.every((e) => (bloques[e] ?? []).length === 0) && (
            <div className="rounded-lg border border-dashed border-[var(--hairline)] p-4 text-center text-sm text-muted">
              Embudo vacío.{" "}
              <button onClick={cargarPlantilla} className="font-medium text-accent-2 hover:underline">
                Cargar plantilla por defecto
              </button>
            </div>
          )}

          {ESTADOS_EMBUDO.map((est) => (
            <div key={est} className="space-y-2 rounded-xl border border-[var(--hairline)] glass p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold text-text">{est}</span>
                <span className="text-[11px] text-muted">{ESTADO_INFO[est]}</span>
              </div>

              {(bloques[est] ?? []).map((b, i) => (
                <div key={b.id} className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-muted">#{i + 1}</span>
                    <div className="flex gap-0.5">
                      <button onClick={() => mover(est, i, -1)} disabled={i === 0} className="rounded border border-[var(--hairline)] px-1.5 text-xs text-muted hover:text-text disabled:opacity-30">↑</button>
                      <button onClick={() => mover(est, i, 1)} disabled={i === (bloques[est]?.length ?? 0) - 1} className="rounded border border-[var(--hairline)] px-1.5 text-xs text-muted hover:text-text disabled:opacity-30">↓</button>
                    </div>
                    <select value={b.tipo} onChange={(e) => upd(est, b.id, { tipo: e.target.value as BloqueTipo })} className={inputCls}>
                      {(Object.keys(TIPO_LABEL) as BloqueTipo[]).map((t) => (
                        <option key={t} value={t}>{TIPO_LABEL[t]}</option>
                      ))}
                    </select>
                    <label className="ml-auto flex items-center gap-1 text-xs text-muted">
                      delay
                      <input type="number" min={0} max={30} value={b.delay} onChange={(e) => upd(est, b.id, { delay: Number(e.target.value) || 0 })} className={inputCls + " w-16"} />s
                    </label>
                    <button onClick={() => del(est, b.id)} className="text-xs text-muted hover:text-red-400">Quitar</button>
                  </div>

                  <div className="mt-2 space-y-2">
                    {b.tipo === "mensaje" && (
                      <>
                        {!b.usaVariaciones ? (
                          <textarea value={b.texto} rows={2} placeholder="Texto del mensaje…" onChange={(e) => upd(est, b.id, { texto: e.target.value })} className={inputCls + " w-full"} />
                        ) : (
                          <div className="space-y-1.5">
                            {b.variaciones.map((v, vi) => (
                              <div key={vi} className="flex items-start gap-2">
                                <span className="mt-2 w-5 shrink-0 text-right text-[11px] text-muted">{vi + 1}</span>
                                <textarea value={v} rows={2} placeholder="Variante…" onChange={(e) => setVar(est, b.id, vi, e.target.value)} className={inputCls + " w-full bg-[var(--bg)]"} />
                                <button onClick={() => delVar(est, b.id, vi)} className="mt-1.5 shrink-0 text-xs text-muted hover:text-red-400" title="Quitar variante">✕</button>
                              </div>
                            ))}
                            <button onClick={() => addVar(est, b.id)} className="text-xs text-accent-2 hover:underline">+ agregar variante</button>
                          </div>
                        )}
                        <label className="flex items-center gap-2 text-xs text-muted">
                          <input type="checkbox" checked={b.usaVariaciones} onChange={(e) => upd(est, b.id, { usaVariaciones: e.target.checked })} />
                          Varias versiones (anti-spam) — el bot elige una al azar
                        </label>
                      </>
                    )}

                    {b.tipo === "producto" && (
                      <label className="flex flex-col gap-1 text-xs text-muted">
                        Mensaje del producto (usa los datos del país)
                        <select value={b.productoMsg} onChange={(e) => upd(est, b.id, { productoMsg: e.target.value })} className={inputCls}>
                          {MSG_PRODUCTO.map((m) => (<option key={m.k} value={m.k}>{m.label}</option>))}
                        </select>
                      </label>
                    )}

                    {b.tipo === "archivo" && (
                      <div className="grid gap-2 sm:grid-cols-[220px_1fr]">
                        <label className="flex flex-col gap-1 text-xs text-muted">
                          Archivo (se sube en Media)
                          <select value={b.mediaSlot} onChange={(e) => upd(est, b.id, { mediaSlot: e.target.value })} className={inputCls}>
                            {MEDIA_SLOTS.map((m) => (<option key={m.slot} value={m.slot}>{m.label}</option>))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-muted">
                          Caption (texto que acompaña)
                          <input value={b.caption} placeholder="opcional" onChange={(e) => upd(est, b.id, { caption: e.target.value })} className={inputCls} />
                        </label>
                      </div>
                    )}

                    {b.tipo === "boton" && (
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                        <input value={b.botonBody} placeholder="Texto del mensaje del botón" onChange={(e) => upd(est, b.id, { botonBody: e.target.value })} className={inputCls} />
                        <input value={b.botonTitulo} maxLength={20} placeholder="Título botón (≤20)" onChange={(e) => upd(est, b.id, { botonTitulo: e.target.value })} className={inputCls} />
                        <input value={b.botonId} placeholder="id" onChange={(e) => upd(est, b.id, { botonId: e.target.value })} className={inputCls + " w-24"} />
                      </div>
                    )}

                    {b.tipo === "etiqueta" && (
                      <input value={b.texto} placeholder="nombre de la etiqueta (mecánica del embudo)" onChange={(e) => upd(est, b.id, { texto: e.target.value })} className={inputCls + " w-full"} />
                    )}
                  </div>
                </div>
              ))}

              <button onClick={() => add(est)} className="text-xs text-accent-2 hover:underline">+ agregar bloque a {est}</button>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--hairline)] glass p-4">
            <button onClick={guardar} disabled={guardando} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {guardando ? "Guardando…" : "Guardar embudo"}
            </button>
            <button onClick={cargarPlantilla} className="rounded-lg border border-[var(--hairline)] px-3 py-2 text-xs text-muted hover:text-text">Cargar plantilla por defecto</button>
            {estado && <span className={"text-sm " + (estado.startsWith("✓") ? "text-accent-2" : "text-muted")}>{estado}</span>}
          </div>
        </>
      )}
    </section>
  );
}
