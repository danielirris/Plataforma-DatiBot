"use client";

import { useState } from "react";
import Link from "next/link";
import type { VideoProducto } from "@plataforma/products";

interface ProductoItem {
  id: string;
  nombre: string;
  videos: VideoProducto[];
}

const ESTADO_TXT: Record<string, string> = {
  queued: "En cola…",
  extracting: "Descargando y extrayendo audio…",
  transcribing: "Transcribiendo…",
  analyzing: "Analizando (IA)…",
  rendering: "Recortando y editando…",
  done: "¡Listo!",
  error: "Error",
};

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
  const [useMusic, setUseMusic] = useState<boolean>(false);
  const [useIntro, setUseIntro] = useState<boolean>(false);

  const [estado, setEstado] = useState<string>("");
  const [job, setJob] = useState<JobState | null>(null);
  const [publicBase, setPublicBase] = useState<string>("");
  const [trabajando, setTrabajando] = useState<boolean>(false);

  function cambiarProducto(id: string) {
    setProductoId(id);
    const p = productos.find((x) => x.id === id);
    setSeleccion(new Set(p?.videos.map((v) => v.url) ?? []));
    setJob(null);
    setEstado("");
  }

  function toggleVideo(url: string) {
    setSeleccion((prev) => {
      const s = new Set(prev);
      if (s.has(url)) s.delete(url);
      else s.add(url);
      return s;
    });
  }

  async function generar() {
    const urls = (producto?.videos ?? []).filter((v) => seleccion.has(v.url)).map((v) => v.url);
    if (!urls.length) {
      setEstado("⚠️ Marca al menos un video del producto.");
      return;
    }
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
          use_music: useMusic,
          use_intro: useIntro,
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
          Aún no hay productos con videos. Primero ve a{" "}
          <Link href="/productos" className="text-accent-2 hover:underline">
            Productos
          </Link>{" "}
          y en el paso <b>Videos</b> sube los videos largos del producto. Aquí
          eliges el producto y generas los anuncios.
        </p>
      </div>
    );
  }

  const abs = (u?: string | null) => (u ? `${publicBase}${u}` : "#");

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
