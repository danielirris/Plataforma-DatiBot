"use client";

import { useState } from "react";
import Link from "next/link";
import type { VideoProducto } from "@plataforma/products";

interface BrollClip {
  index: number;
  file: string;
  url: string;
  prompt: string;
  duration_s: number;
  source: string;
}
interface BrollJob {
  status: string;
  progress?: number;
  message?: string;
  error?: string;
  cost_usd?: number;
  clips?: BrollClip[];
}

interface ProductoItem {
  id: string;
  nombre: string;
  videos: VideoProducto[];
}

// Los 5 estilos de edición (ver extractor: app/pipeline/styles.py).
const ESTILOS: { id: string; nombre: string; desc: string }[] = [
  { id: "modo_bestia", nombre: "Modo Bestia", desc: "Hype puro, máxima energía. Fitness, ofertas, retos." },
  { id: "editorial_mono", nombre: "Editorial Mono", desc: "Minimalista, sobrio. B2B, consultoría, salud seria." },
  { id: "premium_noir", nombre: "Premium Noir", desc: "Lujo oscuro, cinematográfico. Belleza, joyería, high-ticket." },
  { id: "afiche_retro", nombre: "Afiche Retro", desc: "Cartel bold, tipografía protagonista. Moda, comida, eventos." },
  { id: "relato_doc", nombre: "Relato Doc", desc: "Storytelling documental. Testimonios, historias, casos." },
];

// Tipo de subtítulo (título/texto). "" = automático según el estilo elegido.
const SUBTITULOS: { id: string; nombre: string }[] = [
  { id: "", nombre: "Automático (según el estilo)" },
  { id: "pop", nombre: "Pop (rebote)" },
  { id: "karaoke", nombre: "Karaoke (se pinta con la voz)" },
  { id: "box", nombre: "Box (etiqueta de color)" },
  { id: "punch", nombre: "Punch (golpe de escala)" },
  { id: "color", nombre: "Color (solo cambia de color)" },
];

// Tipografías (módulos de @remotion/google-fonts).
const FUENTES: { id: string; nombre: string }[] = [
  { id: "Anton", nombre: "Anton (condensada, por defecto)" },
  { id: "BebasNeue", nombre: "Bebas Neue" },
  { id: "Oswald", nombre: "Oswald" },
  { id: "Montserrat", nombre: "Montserrat" },
  { id: "Poppins", nombre: "Poppins" },
  { id: "ArchivoBlack", nombre: "Archivo Black" },
];

const ESTADO_TXT: Record<string, string> = {
  queued: "En cola…",
  extracting: "Descargando y extrayendo audio…",
  transcribing: "Transcribiendo…",
  analyzing: "Analizando (IA)…",
  rendering: "Recortando y editando…",
  done: "¡Listo!",
  error: "Error",
};

interface HookCandidato {
  i: number;
  video_idx: number;
  start: number;
  end: number;
  dur: number;
  score: number;
  razon: string;
  thumb: string | null;
}

interface JobState {
  status: string;
  progress: number;
  message?: string;
  error?: string;
  clips?: string[];
  download_url?: string | null;
  preview_url?: string | null;
  project_url?: string | null;
}

export function EditorVideos({ productos }: { productos: ProductoItem[] }) {
  const [productoId, setProductoId] = useState<string>(productos[0]?.id ?? "");
  const producto = productos.find((p) => p.id === productoId);
  const [seleccion, setSeleccion] = useState<Set<string>>(
    () => new Set(productos[0]?.videos.map((v) => v.url) ?? []),
  );
  const [numClips, setNumClips] = useState<number>(5);
  const [estilo, setEstilo] = useState<string>("modo_bestia");
  const [subtitulo, setSubtitulo] = useState<string>("");
  const [resaltado, setResaltado] = useState<string>("#10b981");
  const [usarResaltado, setUsarResaltado] = useState<boolean>(false);
  const [fuente, setFuente] = useState<string>("Anton");
  const [useMusic, setUseMusic] = useState<boolean>(false);
  const [useIntro, setUseIntro] = useState<boolean>(false);

  // Fase 4 — Hook visual: candidatos (marco de referencia) y el elegido.
  const [hookCands, setHookCands] = useState<HookCandidato[]>([]);
  const [hookBase, setHookBase] = useState<string>("");
  const [hookSel, setHookSel] = useState<number | null>(null);
  const [buscandoHook, setBuscandoHook] = useState<boolean>(false);
  const [hookMsg, setHookMsg] = useState<string>("");

  const [estado, setEstado] = useState<string>("");
  const [job, setJob] = useState<JobState | null>(null);
  const [publicBase, setPublicBase] = useState<string>("");
  const [trabajando, setTrabajando] = useState<boolean>(false);

  // B-rolls (clips de fondo): se generan aquí, con los videos que subiste al producto.
  // Por defecto: recortar los videos del producto (gratis). Veo cuesta dinero.
  const [brollSource, setBrollSource] = useState<"veo" | "uploaded">("uploaded");
  const [brollCantidad, setBrollCantidad] = useState<number>(10);
  const [brollEstado, setBrollEstado] = useState<string>("");
  const [brollJob, setBrollJob] = useState<BrollJob | null>(null);
  const [brollBase, setBrollBase] = useState<string>("");
  const [generandoBrolls, setGenerandoBrolls] = useState<boolean>(false);

  // Los candidatos de gancho van atados al orden/selección de videos; si cambia
  // la selección, hay que descartarlos (el video_idx ya no coincidiría).
  function limpiarGanchos() {
    setHookCands([]);
    setHookSel(null);
    setHookMsg("");
  }

  // URLs de los videos elegidos, en el mismo orden que ve el extractor. El
  // video_idx de cada gancho apunta a esta lista.
  function urlsSeleccionadas() {
    return (producto?.videos ?? []).filter((v) => seleccion.has(v.url)).map((v) => v.url);
  }

  function cambiarProducto(id: string) {
    setProductoId(id);
    const p = productos.find((x) => x.id === id);
    setSeleccion(new Set(p?.videos.map((v) => v.url) ?? []));
    setJob(null);
    setEstado("");
    limpiarGanchos();
    setBrollJob(null);
    setBrollEstado("");
    setGenerandoBrolls(false);
  }

  function toggleVideo(url: string) {
    setSeleccion((prev) => {
      const s = new Set(prev);
      if (s.has(url)) s.delete(url);
      else s.add(url);
      return s;
    });
    limpiarGanchos();
  }

  // ── B-rolls del producto elegido (Veo de cero, o recorte de sus videos) ──
  async function generarBrolls() {
    if (!producto) return;
    if (brollSource === "uploaded" && (producto.videos?.length ?? 0) === 0) {
      setBrollEstado("⚠️ Este producto no tiene videos subidos. Súbelos en Productos o usa Veo.");
      return;
    }
    setGenerandoBrolls(true);
    setBrollJob(null);
    setBrollEstado(
      brollSource === "veo"
        ? "Enviando a Veo… (cada clip tarda 1-3 min)"
        : "Recortando de los videos del producto…",
    );
    try {
      const res = await fetch(`/api/productos/${producto.id}/brolls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: brollSource, config: { n_brolls: brollCantidad } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBrollEstado("⚠️ " + (data.error ?? `Error ${res.status}`));
        setGenerandoBrolls(false);
        return;
      }
      setBrollBase(data.publicBase ?? "");
      pollBrolls(producto.id, data.job_id as string);
    } catch (e) {
      setBrollEstado("⚠️ Fallo de red: " + (e instanceof Error ? e.message : "?"));
      setGenerandoBrolls(false);
    }
  }

  function pollBrolls(pid: string, jobId: string) {
    const timer = setInterval(async () => {
      try {
        const r = await fetch(`/api/productos/${pid}/brolls/${jobId}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as BrollJob;
        setBrollJob(j);
        setBrollEstado(j.message ?? "Procesando…");
        if (j.status === "done" || j.status === "error") {
          clearInterval(timer);
          setGenerandoBrolls(false);
        }
      } catch {
        /* corte de red: reintenta en el próximo tick */
      }
    }, 3000);
  }

  async function buscarGanchos() {
    const urls = urlsSeleccionadas();
    if (!urls.length) {
      setHookMsg("⚠️ Marca al menos un video del producto.");
      return;
    }
    setBuscandoHook(true);
    setHookMsg("Analizando los videos para proponer ganchos…");
    setHookCands([]);
    setHookSel(null);
    try {
      const res = await fetch("/api/editor/hooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_urls: urls }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHookMsg("⚠️ " + (data.error ?? `Error ${res.status}`));
        setBuscandoHook(false);
        return;
      }
      setHookBase(data.publicBase ?? "");
      setHookCands((data.candidates ?? []) as HookCandidato[]);
      setHookMsg(
        (data.candidates ?? []).length
          ? "Elige el fragmento que abrirá tus anuncios (o deja Automático)."
          : "No se encontraron ganchos claros.",
      );
    } catch (e) {
      setHookMsg("⚠️ Fallo de red: " + (e instanceof Error ? e.message : "?"));
    }
    setBuscandoHook(false);
  }

  async function generar() {
    const urls = urlsSeleccionadas();
    if (!urls.length) {
      setEstado("⚠️ Marca al menos un video del producto.");
      return;
    }
    const cand = hookSel != null ? hookCands.find((c) => c.i === hookSel) : null;
    const hook = cand ? { video_idx: cand.video_idx, start: cand.start, dur: cand.dur } : null;
    setTrabajando(true);
    setJob(null);
    setEstado("Enviando al editor…");
    try {
      const res = await fetch("/api/editor/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_urls: urls,
          num_clips: numClips,
          style: estilo,
          subtitle_style: subtitulo,
          highlight: usarResaltado ? resaltado : "",
          font: fuente,
          use_music: useMusic,
          use_intro: useIntro,
          hook,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEstado("⚠️ " + (data.error ?? `Error ${res.status}`));
        setTrabajando(false);
        return;
      }
      setPublicBase(data.publicBase ?? "");
      poll(data.job_id as string);
    } catch (e) {
      setEstado("⚠️ Fallo de red: " + (e instanceof Error ? e.message : "?"));
      setTrabajando(false);
    }
  }

  function poll(jobId: string) {
    setEstado("En cola…");
    const timer = setInterval(async () => {
      try {
        const r = await fetch(`/api/editor/jobs/${jobId}`, { cache: "no-store" });
        if (!r.ok) return; // sigue intentando
        const j = (await r.json()) as JobState;
        setJob(j);
        setEstado(ESTADO_TXT[j.status] ?? "Procesando…");
        if (j.status === "done" || j.status === "error") {
          clearInterval(timer);
          setTrabajando(false);
        }
      } catch {
        /* corte de red: reintentar en el próximo tick */
      }
    }, 2500);
  }

  if (!productos.length) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-16 text-center">
        <h1 className="text-2xl font-semibold">Editor de videos</h1>
        <p className="mt-3 text-muted">
          Aún no hay productos. Primero crea uno en{" "}
          <Link href="/productos" className="text-accent-2 hover:underline">
            Productos
          </Link>{" "}
          (y en el paso <b>Videos</b> sube los videos largos). Aquí eliges el
          producto, generas sus <b>B-rolls</b> y creas los anuncios.
        </p>
      </div>
    );
  }

  const abs = (u?: string | null) => (u ? `${publicBase}${u}` : "#");
  const mmss = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-2xl font-semibold">🎬 Editor de videos</h1>
      <p className="mt-2 mb-8 text-sm text-muted">
        Elige un producto y sus videos (los que subiste en Productos). El editor
        recorta los mejores momentos y los deja como anuncios: subtítulos,
        animaciones y CTA. Antes de renderizar puedes previsualizar.
      </p>

      {/* Producto + videos */}
      <div className="space-y-4 rounded-2xl border border-[var(--hairline)] glass p-5">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Producto</span>
          <select
            value={productoId}
            onChange={(e) => cambiarProducto(e.target.value)}
            className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
          >
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} ({p.videos.length} video{p.videos.length === 1 ? "" : "s"})
              </option>
            ))}
          </select>
        </label>

        <div>
          <p className="mb-2 text-sm text-muted">
            Videos a usar ({seleccion.size}/{producto?.videos.length ?? 0})
          </p>
          <div className="space-y-2">
            {(producto?.videos ?? []).map((v) => (
              <label
                key={v.url}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--hairline)] bg-[var(--field)] p-2.5 text-sm"
              >
                <input
                  type="checkbox"
                  checked={seleccion.has(v.url)}
                  onChange={() => toggleVideo(v.url)}
                />
                <span className="text-base">🎬</span>
                <span className="min-w-0 flex-1 truncate text-text">
                  {v.original || v.nombre}
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {(v.bytes / (1024 * 1024)).toFixed(1)} MB
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* B-rolls: clips de fondo del producto (Veo de cero, o recorte de sus videos). */}
      <div className="mt-4 space-y-4 rounded-2xl border border-[var(--hairline)] glass p-5">
        <div>
          <p className="text-sm font-medium text-text">🎥 B-rolls (clips de fondo)</p>
          <p className="mt-1 text-xs text-muted">
            Clips cortos <b>sin personas</b> para usar de fondo en los anuncios de{" "}
            <b>{producto?.nombre ?? "este producto"}</b>. Se generan con todo lo que
            guardaste del producto.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            onClick={() => setBrollSource("veo")}
            className={
              "rounded-xl border p-3 text-left transition-all " +
              (brollSource === "veo"
                ? "border-accent bg-accent/10 ring-1 ring-accent/40"
                : "border-[var(--hairline)] bg-[var(--field)] hover:border-accent/40")
            }
          >
            <span className="text-sm font-medium text-text">✨ Crear de cero (Veo)</span>
            <p className="mt-1 text-xs text-muted">
              Clips de 4s en 9:16 con cámara dinámica, generados por IA desde los datos
              del producto. ~$0.20 c/u.
            </p>
          </button>
          <button
            onClick={() => setBrollSource("uploaded")}
            className={
              "rounded-xl border p-3 text-left transition-all " +
              (brollSource === "uploaded"
                ? "border-accent bg-accent/10 ring-1 ring-accent/40"
                : "border-[var(--hairline)] bg-[var(--field)] hover:border-accent/40")
            }
          >
            <span className="text-sm font-medium text-text">
              ✂️ Usar los videos del producto <span className="text-accent-2">· recomendado</span>
            </span>
            <p className="mt-1 text-xs text-muted">
              Arma un video de <b>~45s</b> encadenando <b>muchos extractos</b> de los videos
              que subiste en Productos. Sin coste.
            </p>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            ¿Cuántos?
            <input
              type="number"
              min={1}
              max={20}
              value={brollCantidad}
              onChange={(e) =>
                setBrollCantidad(Math.max(1, Math.min(20, Number(e.target.value) || 1)))
              }
              className="w-16 rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-2 py-1 text-text outline-none focus:border-accent"
            />
          </label>
          <button
            onClick={() => setBrollCantidad(1)}
            className="rounded border border-[var(--hairline)] px-2 py-1 text-xs text-muted hover:text-text"
            title="Genera solo 1 para probar sin gastar"
          >
            🧪 Solo 1 (prueba)
          </button>
          <button
            onClick={generarBrolls}
            disabled={generandoBrolls || !producto}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {generandoBrolls
              ? "Generando…"
              : `🎬 Generar ${brollCantidad} broll${brollCantidad === 1 ? "" : "s"}`}
          </button>
          {brollSource === "veo" && (
            <span className="text-xs text-muted">≈ ${(brollCantidad * 0.2).toFixed(2)}</span>
          )}
          <span className="text-sm text-muted">
            {brollEstado}
            {brollJob && brollJob.status !== "done" && brollJob.status !== "error"
              ? ` (${brollJob.progress ?? 0}%)`
              : ""}
          </span>
        </div>

        {brollJob?.status === "done" && (brollJob.clips?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted">
              ✅ {brollJob.clips!.length} brolls listos
              {brollJob.cost_usd != null ? ` · coste estimado $${brollJob.cost_usd.toFixed(2)}` : ""}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {brollJob.clips!.map((c) => (
                <video
                  key={c.index}
                  src={`${brollBase}${c.url}`}
                  controls
                  muted
                  playsInline
                  className="aspect-[9/16] w-full rounded-lg border border-[var(--hairline)] bg-black object-cover"
                />
              ))}
            </div>
          </div>
        )}
        {brollJob?.status === "error" && (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
            ⚠️ {brollJob.error || "Error generando los brolls"}
          </p>
        )}
      </div>

      {/* Estilo de edición */}
      <div className="mt-4 space-y-3 rounded-2xl border border-[var(--hairline)] glass p-5">
        <p className="text-sm text-muted">Estilo de edición</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ESTILOS.map((s) => {
            const activo = estilo === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setEstilo(s.id)}
                className={
                  "rounded-xl border p-3 text-left transition-all " +
                  (activo
                    ? "border-accent bg-accent/10 ring-1 ring-accent/40"
                    : "border-[var(--hairline)] bg-[var(--field)] hover:border-accent/40")
                }
              >
                <div className="flex items-center gap-2">
                  <span
                    className={
                      "h-2 w-2 rounded-full " + (activo ? "bg-accent-2" : "bg-muted/40")
                    }
                  />
                  <span className="text-sm font-medium text-text">{s.nombre}</span>
                </div>
                <p className="mt-1 text-xs text-muted">{s.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Parámetros de los subtítulos */}
      <div className="mt-4 grid grid-cols-1 gap-4 rounded-2xl border border-[var(--hairline)] glass p-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Tipo de subtítulo</span>
          <select
            value={subtitulo}
            onChange={(e) => setSubtitulo(e.target.value)}
            className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
          >
            {SUBTITULOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Tipografía de subtítulos</span>
          <select
            value={fuente}
            onChange={(e) => setFuente(e.target.value)}
            className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
          >
            {FUENTES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nombre}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-muted">Color de resaltado de subtítulos</span>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={usarResaltado}
                onChange={(e) => setUsarResaltado(e.target.checked)}
              />
              Fijar color
            </label>
            <input
              type="color"
              value={resaltado}
              disabled={!usarResaltado}
              onChange={(e) => setResaltado(e.target.value)}
              className="h-8 w-14 cursor-pointer rounded border border-[var(--hairline)] bg-[var(--field)] disabled:opacity-40"
            />
            <span className="text-xs text-muted">
              {usarResaltado ? resaltado : "Automático (según el estilo)"}
            </span>
          </div>
        </div>
      </div>

      {/* Opciones */}
      <div className="mt-4 space-y-3 rounded-2xl border border-[var(--hairline)] glass p-5">
        <label className="flex items-center gap-3 text-sm text-muted">
          🔢 ¿Cuántos anuncios?
          <input
            type="number"
            min={1}
            max={20}
            value={numClips}
            onChange={(e) => setNumClips(Number(e.target.value))}
            className="w-20 rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-2 py-1 text-text outline-none focus:border-accent"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={useMusic} onChange={(e) => setUseMusic(e.target.checked)} />
          🎵 Música de fondo (opcional) — biblioteca libre de derechos, con ducking.
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={useIntro} onChange={(e) => setUseIntro(e.target.checked)} />
          🔔 Sonido de inicio (opcional) — un golpe de apertura al arrancar.
        </label>
      </div>

      {/* Fase 4 — Hook visual (marco de referencia) */}
      <div className="mt-4 space-y-3 rounded-2xl border border-[var(--hairline)] glass p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-text">🎯 Hook visual (marco de referencia)</p>
            <p className="text-xs text-muted">
              Elige, antes de renderizar, qué fragmento abre tus anuncios. Si no
              eliges, el editor decide automáticamente.
            </p>
          </div>
          <button
            onClick={buscarGanchos}
            disabled={buscandoHook || seleccion.size === 0}
            className="rounded-lg border border-accent/50 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent-2 disabled:opacity-50"
          >
            {buscandoHook ? "Analizando…" : hookCands.length ? "🔄 Volver a buscar" : "🔎 Buscar ganchos"}
          </button>
        </div>

        {hookMsg && <p className="text-xs text-muted">{hookMsg}</p>}

        {hookCands.length > 0 && (
          <>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {/* Opción automática */}
              <button
                onClick={() => setHookSel(null)}
                className={
                  "flex h-[132px] w-[92px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border text-center transition-all " +
                  (hookSel == null
                    ? "border-accent bg-accent/10 ring-1 ring-accent/40"
                    : "border-[var(--hairline)] bg-[var(--field)] hover:border-accent/40")
                }
              >
                <span className="text-2xl">🎲</span>
                <span className="px-1 text-[11px] leading-tight text-muted">Automático</span>
              </button>

              {hookCands.map((c) => {
                const activo = hookSel === c.i;
                return (
                  <button
                    key={c.i}
                    onClick={() => setHookSel(c.i)}
                    title={c.razon}
                    className={
                      "relative w-[92px] shrink-0 overflow-hidden rounded-xl border text-left transition-all " +
                      (activo
                        ? "border-accent ring-2 ring-accent/50"
                        : "border-[var(--hairline)] hover:border-accent/40")
                    }
                  >
                    {c.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`${hookBase}${c.thumb}`}
                        alt={`Gancho ${c.i + 1}`}
                        className="h-[132px] w-[92px] object-cover"
                      />
                    ) : (
                      <div className="flex h-[132px] w-[92px] items-center justify-center bg-[var(--field)] text-2xl">
                        🎬
                      </div>
                    )}
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">
                      {mmss(c.start)}
                    </span>
                    <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] text-white">
                      V{c.video_idx + 1}
                    </span>
                    {activo && (
                      <span className="absolute inset-x-0 bottom-0 bg-accent/90 py-0.5 text-center text-[10px] font-semibold text-white">
                        Elegido
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {hookSel != null && (
              <p className="rounded-lg bg-[var(--field)] px-3 py-2 text-xs text-muted">
                Abrirá con:{" "}
                <span className="text-text">
                  «{hookCands.find((c) => c.i === hookSel)?.razon || "fragmento elegido"}»
                </span>
              </p>
            )}
          </>
        )}
      </div>

      {/* Acción + estado */}
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--hairline)] glass p-4">
        <button
          onClick={generar}
          disabled={trabajando || seleccion.size === 0}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {trabajando ? "Procesando…" : "✨ Crear anuncios"}
        </button>
        <span className="text-sm text-muted">
          {estado}
          {job && job.status !== "done" && job.status !== "error" && job.progress != null
            ? ` (${job.progress}%)`
            : ""}
        </span>
      </div>

      {/* Resultado */}
      {job?.status === "done" && (
        <div className="mt-4 space-y-3 rounded-2xl border border-[var(--hairline)] glass p-5">
          <h2 className="text-sm font-semibold">✅ Anuncios listos</h2>
          {job.preview_url && (
            <a
              href={abs(job.preview_url)}
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              👁️ Previsualizar y renderizar
            </a>
          )}
          {(job.clips ?? []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {(job.clips ?? []).map((c, i) => (
                <a
                  key={i}
                  href={abs(c)}
                  className="rounded border border-[var(--hairline)] px-3 py-1.5 text-xs text-muted hover:text-text"
                >
                  ⬇️ Anuncio {i + 1}
                </a>
              ))}
            </div>
          )}
          {job.project_url && (
            <a
              href={abs(job.project_url)}
              className="block text-xs text-accent-2 hover:underline"
            >
              🛠️ Descargar proyecto Remotion editable (.zip)
            </a>
          )}
        </div>
      )}
      {job?.status === "error" && (
        <p className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          ⚠️ {job.error || "Error en el procesamiento"}
        </p>
      )}
    </div>
  );
}
