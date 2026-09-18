"use client";

import { useEffect, useState } from "react";
import {
  ESTADOS_EMBUDO,
  ESTADO_INFO,
  type PasoEmbudo,
  type RotadorRow,
} from "@/lib/embudos/types";
import { keyProducto, toProductoId } from "@/lib/producto/id";
import { leerUltimoProducto, guardarUltimoProducto } from "@/lib/embudos/ultimo-producto";

type ProductoLite = { id: string; nombre: string; productoId?: string };

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
  variaciones: string[]; // mensaje con varias versiones (rotador) · también el body del botón
  rotadorCampo: string; // campo SEMÁNTICO del rotador (ej. bienvenida, compromiso_1) — mensaje-variaciones y botón
  productoMsg: string; // "mensaje del producto": columna de config_bots (config)
  mediaSlot: string; // archivo: video | pdf_1..6
  caption: string; // archivo: caption
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
    rotadorCampo: "",
    productoMsg: "msg_cobro",
    mediaSlot: tipo === "archivo" ? "video" : "",
    caption: "",
    botonTitulo: "",
    botonId: "recibir_material",
    delay: tipo === "etiqueta" ? 0 : 2,
  };
}

function parseBoton(contenido: string): { campo: string; bodyLiteral: string; titulo: string; id: string } {
  try {
    const o = JSON.parse(contenido) as {
      body?: string;
      rotador_campo?: string;
      buttons?: { id?: string; title?: string }[];
    };
    const b = o.buttons?.[0] ?? {};
    return { campo: o.rotador_campo ?? "", bodyLiteral: o.body ?? "", titulo: b.title ?? "", id: b.id ?? "" };
  } catch {
    return { campo: "", bodyLiteral: "", titulo: "", id: "" };
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
    // 1) Primer contacto (sin etiqueta): bienvenida rotada → video → botón (rota) → etiqueta.
    bienvenida: [
      b("mensaje", {
        usaVariaciones: true,
        rotadorCampo: "bienvenida",
        variaciones: [
          "¡Hola {nombre}! 👋 Soy Laura. Me encanta que me escribas 💛",
          "¡Hey {nombre}! 😃 Soy Laura. Qué bueno tenerte por aquí.",
        ],
        delay: 2,
      }),
      b("archivo", { mediaSlot: "video", delay: 2 }), // caption ("qué incluye") se edita en Media
      b("boton", {
        rotadorCampo: "compromiso_1",
        variaciones: ["¿Te envío TODO el material ahora, {nombre}?"],
        botonTitulo: "Recibir material",
        botonId: "recibir_material",
        delay: 0,
      }),
      b("etiqueta", { texto: "bienvenida", delay: 0 }),
    ],
    // 2) Ya tiene «bienvenida»: botón de compromiso #2 (rota) → etiqueta.
    contenido_solicitado: [
      b("boton", {
        rotadorCampo: "compromiso_2",
        variaciones: ["¡Perfecto {nombre}! Toca aquí y te lo envío 👇"],
        botonTitulo: "Quiero recibirlo",
        botonId: "quiero_recibirlo",
        delay: 0,
      }),
      b("etiqueta", { texto: "contenido_solicitado", delay: 0 }),
    ],
    // 3) Entrega: etiqueta PRIMERO (candado anti-reenvío) → PDFs → bonos → cobro → datos pago.
    contenido_enviado: [
      b("etiqueta", { texto: "contenido_enviado", delay: 0 }),
      b("archivo", { mediaSlot: "pdf_1", delay: 3 }),
      b("producto", { productoMsg: "msg_bonos_intro", delay: 3 }),
      b("producto", { productoMsg: "msg_cobro", delay: 3 }),
      b("producto", { productoMsg: "msg_datos_pago", delay: 0 }),
    ],
  };
}

export function PasosEmbudoEditor() {
  const [productos, setProductos] = useState<ProductoLite[]>([]);
  const [productoKey, setProductoKey] = useState<string>("");
  const [otro, setOtro] = useState<boolean>(false);
  const [otroText, setOtroText] = useState<string>(""); // texto del input "otro" (no dispara carga)
  const [bloques, setBloques] = useState<PorEstado>(vacio());
  // Fila de media del producto (para validar que un bloque "archivo" tenga media_id subido).
  const [mediaRow, setMediaRow] = useState<Record<string, string | null>>({});
  // Pasos en estados fuera del modelo (no editables aquí): se conservan tal cual para
  // que el guardado no los borre por diff (B2).
  const [pasosExtra, setPasosExtra] = useState<PasoEmbudo[]>([]);
  // Variantes de rotador que pertenecen a esos pasos extra: se reenvían al guardar para
  // que el borrado-por-diff del rotador no las elimine (B2).
  const [rotadorExtra, setRotadorExtra] = useState<
    { campo: string; variante: number; texto: string }[]
  >([]);
  const [cargando, setCargando] = useState<boolean>(false);
  const [guardando, setGuardando] = useState<boolean>(false);
  const [estado, setEstado] = useState<string>("");
  const [cargado, setCargado] = useState<boolean>(false);

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

      // ⛔ SEGURIDAD DE DATOS: si CUALQUIER lectura falla (Supabase caído un instante,
      // timeout…), NO entramos en modo edición. Si lo hiciéramos, el editor se vería
      // vacío y al Guardar el borrado-por-diff arrasaría todos los pasos y variantes
      // del producto. Mejor mostrar el error y pedir reintento (regla: NADA se borra).
      if (!rp.ok || !rr.ok || !rm.ok) {
        const fallo = !rp.ok ? rp : !rr.ok ? rr : rm;
        const cual = !rp.ok ? "los pasos" : !rr.ok ? "el rotador" : "la media";
        let detalle = `Error ${fallo.status}`;
        try {
          const d = await fallo.json();
          if (d?.error) detalle = String(d.error);
        } catch {
          /* sin cuerpo JSON */
        }
        setBloques(vacio());
        setCargado(false);
        setEstado(
          `⚠️ No se pudo leer ${cual} del embudo (${detalle}). NO edites ni guardes: ` +
            `vuelve a elegir el producto para reintentar. No se ha tocado nada en la base.`,
        );
        setCargando(false);
        return;
      }

      const dp = await rp.json();
      const dr = await rr.json();
      const dm = await rm.json();

      // Variantes por campo (rotador).
      const rot: Record<string, string[]> = {};
      for (const f of (dr.filas ?? []) as RotadorRow[]) {
        (rot[f.campo] ??= []).push(f.texto);
      }
      // Captions/estado de media (se guarda para validar los bloques "archivo" al guardar).
      const media = (dm.media ?? {}) as Record<string, string | null>;
      setMediaRow(media);

      const ESTADOS_OK = new Set<string>(ESTADOS_EMBUDO);
      const porEstado = vacio();
      const extra: PasoEmbudo[] = [];
      for (const f of (dp.filas ?? []) as PasoEmbudo[]) {
        if (ESTADOS_OK.has(f.estado)) {
          porEstado[f.estado].push(pasoABloque(f, rot, media));
        } else {
          // B2: estado fuera del modelo del constructor → se conserva verbatim para que
          // el guardado (borrado-por-diff) no lo elimine.
          extra.push(f);
        }
      }
      // B2: variantes de rotador de esos pasos extra (para no borrarlas al guardar).
      const rotExtra: { campo: string; variante: number; texto: string }[] = [];
      for (const p of extra) {
        if (p.fuente === "rotador") {
          (rot[p.contenido] ?? []).forEach((t, i) =>
            rotExtra.push({ campo: p.contenido, variante: i + 1, texto: t }),
          );
        }
      }
      setRotadorExtra(rotExtra);
      setPasosExtra(extra);
      setBloques(porEstado);
      setCargado(true);
      const err = dp.error || dr.error || dm.error;
      if (err) setEstado("⚠️ " + err);
    } catch (e) {
      // Fallo de red/parse: no dejamos el editor "cargado" con datos a medias.
      setBloques(vacio());
      setCargado(false);
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
      // El body del botón rota: las variantes salen del rotador (campo = rotador_campo).
      // Si es un botón antiguo con body literal, lo tomamos como una única variante.
      const vars = b.campo ? rot[b.campo] ?? [] : b.bodyLiteral ? [b.bodyLiteral] : [];
      return {
        ...base,
        tipo: "boton",
        rotadorCampo: b.campo,
        variaciones: vars.length ? vars : [""],
        botonTitulo: b.titulo,
        botonId: b.id,
      };
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
      return { ...base, tipo: "mensaje", usaVariaciones: true, rotadorCampo: f.contenido, variaciones: vars.length ? vars : [""] };
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

  // ── validación (M2): bloques que el motor NO podría ejecutar. Devuelve la lista de
  // problemas legibles (vacía = todo ok). Evita publicar un embudo que falla en runtime.
  function validar(): string[] {
    const errs: string[] = [];
    // Los campos de rotador deben ser ÚNICOS entre bloques: dos bloques con el mismo campo
    // colisionarían en (producto,campo,variante) y uno pisaría al otro al guardar.
    const camposUsados = new Map<string, string>();
    const chequearCampo = (campo: string, donde: string) => {
      if (!campo) {
        errs.push(`${donde}: falta el «campo del rotador».`);
        return;
      }
      const prev = camposUsados.get(campo);
      if (prev) errs.push(`${donde}: el campo de rotador «${campo}» ya se usa en ${prev} (deben ser únicos).`);
      else camposUsados.set(campo, donde);
    };
    for (const est of ESTADOS_EMBUDO) {
      (bloques[est] ?? []).forEach((b, idx) => {
        const donde = `${est} #${idx + 1}`;
        if (b.tipo === "etiqueta") {
          if (!b.texto.trim()) errs.push(`${donde}: la etiqueta está vacía.`);
        } else if (b.tipo === "boton") {
          const t = b.botonTitulo.trim();
          if (!t) errs.push(`${donde}: el botón no tiene título.`);
          else if (t.length > 20) errs.push(`${donde}: el título del botón supera 20 caracteres.`);
          if (!b.variaciones.some((v) => v.trim()))
            errs.push(`${donde}: el botón no tiene ningún texto de mensaje.`);
          chequearCampo(b.rotadorCampo.trim(), donde);
        } else if (b.tipo === "mensaje") {
          if (b.usaVariaciones) {
            if (!b.variaciones.some((v) => v.trim()))
              errs.push(`${donde}: mensaje con variaciones pero todas están vacías.`);
            chequearCampo(b.rotadorCampo.trim(), donde);
          } else if (!b.texto.trim()) {
            errs.push(`${donde}: el mensaje está vacío.`);
          }
        }
      });
    }
    return errs;
  }

  // Bloques "archivo" cuyo slot aún NO tiene media_id subido. NO bloquea el guardado
  // (el flujo del tutorial es: armar el embudo primero, subir la media después); solo
  // se avisa al terminar para recordar subirlos en Media.
  function slotsPendientes(): string[] {
    const out: string[] = [];
    for (const est of ESTADOS_EMBUDO)
      for (const b of bloques[est] ?? [])
        if (b.tipo === "archivo") {
          const c = mediaCols(b.mediaSlot);
          if (!String(mediaRow[c.media_id] ?? "").trim() && !out.includes(b.mediaSlot))
            out.push(b.mediaSlot);
        }
    return out;
  }

  // ── guardado: reparte en pasos_embudo + mensajes_rotador + media_bots ──
  async function guardar() {
    // Solo se guarda si el embudo se cargó BIEN (cargado=true). Así un guardado nunca
    // parte de un estado a medias por un fallo de lectura. El botón ya solo aparece con
    // `cargado`, pero lo reforzamos aquí.
    if (!productoKey || !cargado) return;

    // M2: no publicar bloques que el motor no puede ejecutar.
    const problemas = validar();
    if (problemas.length) {
      setEstado(
        `⚠️ Revisa ${problemas.length} bloque(s) antes de guardar — ${problemas[0]}` +
          (problemas.length > 1 ? ` (y ${problemas.length - 1} más)` : ""),
      );
      return;
    }

    setGuardando(true);
    setEstado("Guardando…");

    const pasos: PasoEmbudo[] = [];
    const rotador: { campo: string; variante: number; texto: string }[] = [];

    for (const est of ESTADOS_EMBUDO) {
      (bloques[est] ?? []).forEach((b, idx) => {
        const orden = idx + 1;
        const base = { producto: productoKey, estado: est, orden, delay_segundos: b.delay };
        if (b.tipo === "boton") {
          // El body del botón ROTA: el paso guarda una referencia al campo del rotador
          // (rotador_campo) + el botón fijo; las variantes del body van a mensajes_rotador.
          const campo = b.rotadorCampo.trim();
          pasos.push({
            ...base,
            tipo: "boton",
            fuente: "directo",
            contenido: JSON.stringify({
              rotador_campo: campo,
              buttons: [{ id: b.botonId || "opcion", title: b.botonTitulo }],
            }),
          });
          let n = 0;
          for (const t of b.variaciones) {
            if (!t.trim()) continue;
            n += 1;
            rotador.push({ campo, variante: n, texto: t });
          }
        } else if (b.tipo === "etiqueta") {
          pasos.push({ ...base, tipo: "etiqueta", fuente: "directo", contenido: b.texto.trim() });
        } else if (b.tipo === "archivo") {
          const c = mediaCols(b.mediaSlot);
          // El caption vive SOLO en Media (no lo escribe el constructor).
          pasos.push({ ...base, tipo: c.tipo, fuente: "media", contenido: c.media_id });
        } else if (b.tipo === "producto") {
          pasos.push({ ...base, tipo: "mensaje", fuente: "config", contenido: b.productoMsg });
        } else if (b.usaVariaciones) {
          // Mensaje con variaciones → rotador (campo = nombre SEMÁNTICO estable del bloque).
          const campo = b.rotadorCampo.trim();
          pasos.push({ ...base, tipo: "mensaje", fuente: "rotador", contenido: campo });
          let n = 0;
          for (const t of b.variaciones) {
            if (!t.trim()) continue;
            n += 1;
            rotador.push({ campo, variante: n, texto: t });
          }
        } else {
          pasos.push({ ...base, tipo: "mensaje", fuente: "directo", contenido: b.texto });
        }
      });
    }

    // B2: reañade los pasos de estados fuera del modelo tal cual (para no borrarlos)
    // y sus variantes de rotador (si no, el borrado-por-diff del rotador las eliminaría).
    for (const p of pasosExtra) pasos.push(p);
    for (const r of rotadorExtra) rotador.push(r);

    // 🔎 DIAGNÓSTICO (temporal): cuántos bloques hay por estado en el estado del front y
    // cuántas filas se van a enviar. Si "bloques por estado" dice 1 y en pantalla ves 4,
    // el navegador está corriendo un bundle viejo (haz hard refresh).
    console.log(
      "[embudo:guardar] bloques por estado →",
      ESTADOS_EMBUDO.map((e) => `${e}=${(bloques[e] ?? []).length}`).join("  "),
      "| pasosExtra=" + pasosExtra.length,
      "| FILAS A ENVIAR=" + pasos.length,
    );

    // M1 (orden seguro, atomicidad best-effort): escribimos PRIMERO el rotador, porque
    // los pasos con fuente:'rotador' lo referencian. Si el rotador falla, abortamos ANTES
    // de escribir los pasos: así nunca queda un paso apuntando a variantes inexistentes.
    try {
      const rRot = await fetch("/api/embudos/rotador", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ producto: productoKey, filas: rotador, vaciar: true }),
      });
      if (!rRot.ok) {
        const d = await rRot.json().catch(() => ({}));
        setEstado(
          "⚠️ No se guardaron las variantes (" +
            (d.error ?? `Error ${rRot.status}`) +
            "). No se tocaron los pasos; reintenta.",
        );
        setGuardando(false);
        return;
      }

      const rPas = await fetch("/api/embudos/pasos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // vaciar:true = guardado intencional del estado completo (aunque quede vacío).
        body: JSON.stringify({ producto: productoKey, filas: pasos, vaciar: true }),
      });
      if (!rPas.ok) {
        const d = await rPas.json().catch(() => ({}));
        setEstado("⚠️ " + (d.error ?? `Error ${rPas.status}`));
      } else {
        // Aviso no bloqueante: bloques archivo cuyo media aún no se subió.
        const pend = slotsPendientes();
        const notaMedia = pend.length ? ` · falta subir en Media: ${pend.join(", ")}` : "";
        setEstado("✓ Embudo guardado." + notaMedia);
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
      {/* Sugerencias de campos de rotador semánticos (el usuario puede escribir otros). */}
      <datalist id="rotador-campos">
        <option value="bienvenida" />
        <option value="compromiso_1" />
        <option value="compromiso_2" />
      </datalist>
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
            value={otroText}
            placeholder="clave del producto (Enter para cargar)"
            // M3: NO cargamos en cada tecla (dispararía 3 fetch por pulsación y pisaría
            // el editor). Solo al salir del campo (blur) o con Enter.
            onChange={(e) => setOtroText(e.target.value)}
            // Solo recargar si la clave cambió (evita pisar ediciones no guardadas al
            // refocar y salir sin cambiar nada).
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
                            <label className="flex flex-col gap-1 text-xs text-muted">
                              Campo del rotador (nombre estable que lee el motor)
                              <input list="rotador-campos" value={b.rotadorCampo} placeholder="ej. bienvenida" onChange={(e) => upd(est, b.id, { rotadorCampo: e.target.value })} className={inputCls} />
                            </label>
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
                      <label className="flex max-w-xs flex-col gap-1 text-xs text-muted">
                        Archivo (se sube en Media)
                        <select value={b.mediaSlot} onChange={(e) => upd(est, b.id, { mediaSlot: e.target.value })} className={inputCls}>
                          {MEDIA_SLOTS.map((m) => (<option key={m.slot} value={m.slot}>{m.label}</option>))}
                        </select>
                        <span className="text-[11px] text-muted">
                          El texto que acompaña (caption) se edita en la pestaña <b>Media</b>.
                        </span>
                      </label>
                    )}

                    {b.tipo === "boton" && (
                      <div className="space-y-2">
                        <label className="flex flex-col gap-1 text-xs text-muted">
                          Campo del rotador (el body rota; nombre estable)
                          <input list="rotador-campos" value={b.rotadorCampo} placeholder="ej. compromiso_1" onChange={(e) => upd(est, b.id, { rotadorCampo: e.target.value })} className={inputCls} />
                        </label>
                        <div className="space-y-1.5">
                          <span className="text-[11px] text-muted">Texto del botón (variantes anti-spam; el bot elige una):</span>
                          {b.variaciones.map((v, vi) => (
                            <div key={vi} className="flex items-start gap-2">
                              <span className="mt-2 w-5 shrink-0 text-right text-[11px] text-muted">{vi + 1}</span>
                              <textarea value={v} rows={2} placeholder="Variante del mensaje del botón…" onChange={(e) => setVar(est, b.id, vi, e.target.value)} className={inputCls + " w-full bg-[var(--bg)]"} />
                              <button onClick={() => delVar(est, b.id, vi)} className="mt-1.5 shrink-0 text-xs text-muted hover:text-red-400" title="Quitar variante">✕</button>
                            </div>
                          ))}
                          <button onClick={() => addVar(est, b.id)} className="text-xs text-accent-2 hover:underline">+ agregar variante</button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                          <input value={b.botonTitulo} maxLength={20} placeholder="Título del botón (≤20)" onChange={(e) => upd(est, b.id, { botonTitulo: e.target.value })} className={inputCls} />
                          <input value={b.botonId} placeholder="id" onChange={(e) => upd(est, b.id, { botonId: e.target.value })} className={inputCls + " w-28"} />
                        </div>
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
