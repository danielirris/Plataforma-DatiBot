"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

// Los anuncios ya creados viven en el servicio de video (galería del extractor).
// Aquí se listan para verlos y descargarlos sin volver a generarlos.

interface Item {
  id: string;
  created_at: string;
  mode: string;
  n_clips: number;
  title: string;
  n_videos: number;
  clips: string[];
  thumb: string | null;
  project_url: string | null;
  preview_url: string | null;
}

function fecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || "";
  return d.toLocaleString("es", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MisAnuncios() {
  const [items, setItems] = useState<Item[]>([]);
  const [base, setBase] = useState<string>("");
  const [estado, setEstado] = useState<string>("Cargando…");

  const cargar = useCallback(async () => {
    setEstado("Cargando…");
    try {
      const r = await fetch("/api/editor/galeria", { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setEstado("⚠️ " + (d.error ?? `Error ${r.status}`));
        return;
      }
      setBase(d.publicBase ?? "");
      setItems((d.items ?? []) as Item[]);
      setEstado("");
    } catch (e) {
      setEstado("⚠️ Fallo de red: " + (e instanceof Error ? e.message : "?"));
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const abs = (u: string) => `${base}${u}`;

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">🎞️ Mis anuncios</h1>
        <button
          onClick={cargar}
          className="rounded border border-[var(--hairline)] px-3 py-1.5 text-xs text-muted hover:text-text"
        >
          🔄 Actualizar
        </button>
      </div>
      <p className="mt-2 mb-8 text-sm text-muted">
        Los anuncios que ya creaste, listos para ver y descargar. Se crean en{" "}
        <Link href="/extractor" className="text-accent-2 hover:underline">
          Editor de videos
        </Link>
        .
      </p>

      {estado && <p className="text-sm text-muted">{estado}</p>}

      {!estado && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--hairline)] p-8 text-center text-muted">
          Aún no hay anuncios creados. Ve a{" "}
          <Link href="/extractor" className="text-accent-2 hover:underline">
            Editor de videos
          </Link>
          , elige un producto y dale a <b>Crear anuncios</b>.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <div
            key={it.id}
            className="flex flex-col gap-3 rounded-2xl border border-[var(--hairline)] glass p-4"
          >
            <div className="flex items-start gap-3">
              {it.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={abs(it.thumb)}
                  alt={it.title}
                  className="h-24 w-16 shrink-0 rounded-lg border border-[var(--hairline)] bg-black object-cover"
                />
              ) : (
                <span className="grid h-24 w-16 shrink-0 place-items-center rounded-lg border border-[var(--hairline)] bg-[var(--field)] text-2xl">
                  🎬
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text" title={it.title}>
                  {it.title}
                </p>
                <p className="mt-0.5 text-xs text-muted">{fecha(it.created_at)}</p>
                <p className="mt-1 text-xs text-muted">
                  {it.n_clips > 0 ? (
                    <>
                      {it.n_clips} video{it.n_clips === 1 ? "" : "s"} · de {it.n_videos}{" "}
                      fuente{it.n_videos === 1 ? "" : "s"}
                    </>
                  ) : (
                    <span className="text-amber-400">Sin renderizar todavía</span>
                  )}
                </p>
              </div>
            </div>

            {it.clips.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {it.clips.map((c, i) => (
                  <a
                    key={i}
                    href={abs(c)}
                    className="rounded border border-[var(--hairline)] px-2 py-1 text-xs text-muted hover:text-text"
                  >
                    ⬇️ {i + 1}
                  </a>
                ))}
              </div>
            )}

            <div className="mt-auto flex flex-wrap gap-2 pt-1">
              {it.preview_url && (
                <a
                  href={abs(it.preview_url)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white"
                >
                  {it.n_clips > 0 ? "👁️ Ver / editar" : "👁️ Previsualizar y renderizar"}
                </a>
              )}
              {it.project_url && (
                <a
                  href={abs(it.project_url)}
                  className="rounded border border-[var(--hairline)] px-2 py-1.5 text-xs text-muted hover:text-text"
                  title="Proyecto Remotion editable (.zip)"
                >
                  🛠️ Proyecto
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {items.length > 0 && (
        <p className="mt-6 text-xs text-muted">
          Se conservan los <b>últimos 25</b> trabajos. Para que no se pierdan al
          reimplementar, el servicio de video necesita un volumen persistente en su
          almacenamiento.
        </p>
      )}
    </div>
  );
}
