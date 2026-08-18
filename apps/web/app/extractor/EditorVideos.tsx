"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { VideoProducto } from "@plataforma/products";
import { subirPorTrozos } from "@/lib/uploads/cliente";

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
  { id: "elegante_fem", nombre: "Elegante · Mujer", desc: "Cálido, aspiracional, suave. Belleza, bienestar, moda femenina." },
  { id: "impacto_masc", nombre: "Impacto · Hombre", desc: "Directo, potente, alto contraste. Fitness, autos, negocios, retos." },
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

// Tipografías (módulos de @remotion/google-fonts). "" = la del estilo elegido.
const FUENTES: { id: string; nombre: string }[] = [
  { id: "", nombre: "Automático (según el estilo)" },
  { id: "Anton", nombre: "Anton (condensada)" },
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

/** Gancho elegido y GUARDADO (sobrevive a nuevas búsquedas). Uno por anuncio. */
interface HookElegido {
  key: string; // estable entre búsquedas: `${video_idx}:${start*100}`
  video_idx: number;
  start: number;
  dur: number;
  razon: string;
  thumb: string | null; // URL ya resuelta, para seguir mostrándola tras re-buscar
}

interface ColaItem {
  id: string;
  estado: string;
  modo: string;
  creado: string;
  mensaje?: string;
  videos: number;
}
interface ColaInfo {
  en_cola: ColaItem[];
  en_proceso: ColaItem[];
  total_en_cola: number;
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

export function EditorVideos({
  productos,
  soloEditor = false,
}: {
  productos: ProductoItem[];
  /** subdominio del editor: no hay productos, los videos se suben aquí */
  soloEditor?: boolean;
}) {
  const [productoId, setProductoId] = useState<string>(productos[0]?.id ?? "");
  const producto = productos.find((p) => p.id === productoId);
  const [seleccion, setSeleccion] = useState<Set<string>>(
    () => new Set(productos[0]?.videos.map((v) => v.url) ?? []),
  );

  // Videos sueltos, subidos aquí mismo (modo solo editor).
  const [subidos, setSubidos] = useState<VideoProducto[]>([]);
  const [subiendoVideo, setSubiendoVideo] = useState<boolean>(false);
  const [videoEstado, setVideoEstado] = useState<string>("");

  // La materia prima: o los videos del producto, o los que se acaban de subir.
  const videosDisponibles: VideoProducto[] = soloEditor ? subidos : (producto?.videos ?? []);
  const [numClips, setNumClips] = useState<number>(5);
  const [estilo, setEstilo] = useState<string>("modo_bestia");
  const [subtitulo, setSubtitulo] = useState<string>("");
  const [resaltado, setResaltado] = useState<string>("#10b981");
  const [usarResaltado, setUsarResaltado] = useState<boolean>(false);
  // "" = automática: cada estilo pone su tipografía (Parte B). El usuario puede
  // forzar otra en el selector.
  const [fuente, setFuente] = useState<string>("");
  // Música de fondo y golpe de inicio: por defecto ENCENDIDOS. Son de biblioteca
  // local (no cuestan API), y un anuncio casi siempre los quiere. Se pueden
  // apagar con su interruptor.
  const [useMusic, setUseMusic] = useState<boolean>(true);
  const [useIntro, setUseIntro] = useState<boolean>(true);
  // Quitar el silencio de cabeza/cola de cada locución: anuncios más compactos.
  // Por defecto ON (mejora casi siempre); nunca corta voz, solo el aire muerto.
  const [trimSilence, setTrimSilence] = useState<boolean>(true);

  // Llamada a la acción (CTA) del cierre y píldora de oferta a mitad.
  const [useCta, setUseCta] = useState<boolean>(true);
  const [ctaTexto, setCtaTexto] = useState<string>("Haz clic para conseguir el tuyo");
  const [ctaTipo, setCtaTipo] = useState<"whatsapp" | "otro">("whatsapp");
  const [ctaBoton, setCtaBoton] = useState<string>("Pídelo ahora →");
  const [ofertaPill, setOfertaPill] = useState<string>("");

  // Fase 4 — Hook visual: candidatos (marco de referencia) y el elegido.
  const [hookCands, setHookCands] = useState<HookCandidato[]>([]);
  const [hookBase, setHookBase] = useState<string>("");
  // Ganchos GUARDADOS (uno por anuncio). Persisten al pulsar "Buscar más ganchos".
  const [hookElegidos, setHookElegidos] = useState<HookElegido[]>([]);
  const [buscandoHook, setBuscandoHook] = useState<boolean>(false);
  const [hookMsg, setHookMsg] = useState<string>("");
  // Ronda de búsqueda de ganchos: sube en cada "Volver a buscar" para pedir variedad.
  const [hookRonda, setHookRonda] = useState<number>(0);
  // Gancho SUBIDO por anuncio (opcional): video propio (por índice de anuncio) +
  // cuántos segundos usar. Si un anuncio tiene video subido, ese manda sobre el
  // fragmento elegido / automático. Se sube por su propio endpoint (como la voz).
  const [hookVids, setHookVids] = useState<Record<number, { nombre: string; original: string }>>({});
  const [hookSecs, setHookSecs] = useState<Record<number, number>>({});
  const [subiendoHookAd, setSubiendoHookAd] = useState<number | null>(null);
  const [hookUpMsg, setHookUpMsg] = useState<string>("");
  // Video-GUÍA (opcional): se SOBREPONE (PiP) al anuncio. Una sola, se usa en todos.
  const [guiaVid, setGuiaVid] = useState<{ nombre: string; original: string } | null>(null);
  const [subiendoGuia, setSubiendoGuia] = useState<boolean>(false);
  const [guiaMsg, setGuiaMsg] = useState<string>("");

  // Locución: UNA por anuncio (en orden). Manda sobre la duración de su anuncio y
  // de ella salen los subtítulos (el motor la transcribe). Deben ser tantas como
  // anuncios (numClips).
  const [voces, setVoces] = useState<{ nombre: string; original: string }[]>([]);
  const [vozEstado, setVozEstado] = useState<string>("");
  const [subiendoVoz, setSubiendoVoz] = useState<boolean>(false);

  const [estado, setEstado] = useState<string>("");
  const [job, setJob] = useState<JobState | null>(null);
  const [publicBase, setPublicBase] = useState<string>("");
  const [trabajando, setTrabajando] = useState<boolean>(false);

  // Cola del editor: hay UN worker, los trabajos se hacen de uno en uno. Si se
  // acumulan (p. ej. reanudados tras un redeploy), el tuyo espera detrás.
  const [cola, setCola] = useState<ColaInfo | null>(null);
  const [colaMsg, setColaMsg] = useState<string>("");

  // Los candidatos Y los ganchos guardados van atados al orden/selección de videos;
  // si cambia la selección, hay que descartarlos (el video_idx ya no coincidiría).
  function limpiarGanchos() {
    setHookCands([]);
    setHookElegidos([]);
    setHookRonda(0);
    setHookMsg("");
  }

  // URLs de los videos elegidos, en el mismo orden que ve el extractor. El
  // video_idx de cada gancho apunta a esta lista.
  function urlsSeleccionadas() {
    return videosDisponibles.filter((v) => seleccion.has(v.url)).map((v) => v.url);
  }

  // ── Subida de videos sueltos (modo solo editor) ──
  // Van al mismo almacén que los de producto: el job los busca en disco por su
  // nombre y el Hook visual necesita que tengan URL.
  async function subirVideos(files: FileList | null) {
    if (!files?.length) return;
    setSubiendoVideo(true);
    const lista = Array.from(files);
    const fallos: string[] = [];
    let subidosOk = 0;
    for (let i = 0; i < lista.length; i++) {
      const file = lista[i];
      try {
        const data = await subirPorTrozos<{ video: VideoProducto }>(
          "/api/editor/videos/chunk",
          file,
          (pct) => setVideoEstado(`Subiendo ${i + 1}/${lista.length}: ${file.name} (${pct}%)…`),
        );
        setSubidos((prev) => [...prev.filter((v) => v.url !== data.video.url), data.video]);
        setSeleccion((prev) => new Set([...prev, data.video.url]));
        subidosOk += 1;
      } catch (e) {
        fallos.push(`${file.name}: ${e instanceof Error ? e.message : "error"}`);
      }
    }
    limpiarGanchos(); // cambió la lista: los video_idx de los ganchos ya no valen
    setVideoEstado(
      fallos.length
        ? `${subidosOk ? `✓ ${subidosOk} subido(s). ` : ""}⚠️ ${fallos.join(" · ")}`
        : `✓ ${subidosOk} video(s) listos.`,
    );
    setSubiendoVideo(false);
  }

  function quitarVideoSubido(url: string) {
    setSubidos((prev) => prev.filter((v) => v.url !== url));
    setSeleccion((prev) => {
      const s = new Set(prev);
      s.delete(url);
      return s;
    });
    limpiarGanchos();
  }

  function cambiarProducto(id: string) {
    setProductoId(id);
    const p = productos.find((x) => x.id === id);
    setSeleccion(new Set(p?.videos.map((v) => v.url) ?? []));
    setJob(null);
    setEstado("");
    limpiarGanchos();
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


  // ── Cola del editor ──
  async function verCola() {
    try {
      const r = await fetch("/api/editor/cola", { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setColaMsg("⚠️ " + (d.error ?? `Error ${r.status}`));
        return;
      }
      setCola(d as ColaInfo);
      setColaMsg("");
    } catch {
      /* silencioso: es informativo */
    }
  }

  async function vaciarCola() {
    setColaMsg("Vaciando la cola…");
    try {
      const r = await fetch("/api/editor/cola", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setColaMsg("⚠️ " + (d.error ?? `Error ${r.status}`));
        return;
      }
      const enCurso = (d.en_curso ?? []).length;
      setColaMsg(
        `✓ ${d.cancelados ?? 0} trabajo(s) cancelado(s).` +
          (enCurso ? " El que ya se estaba procesando termina solo." : ""),
      );
      verCola();
    } catch (e) {
      setColaMsg("⚠️ Fallo de red: " + (e instanceof Error ? e.message : "?"));
    }
  }

  // Al abrir el editor, mira la cola: si hay atasco, se ve de inmediato. En el
  // subdominio no: la cola es del extractor compartido y su API está bloqueada.
  useEffect(() => {
    if (!soloEditor) verCola();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sube una o varias locuciones (cuerpo crudo: el proxy no lo corta). Se
  // acumulan EN ORDEN: la 1ª es para el anuncio 1, etc.
  async function subirVoces(files: FileList | null) {
    if (!files?.length) return;
    setSubiendoVoz(true);
    const lista = Array.from(files);
    let ok = 0;
    for (let i = 0; i < lista.length; i++) {
      const file = lista[i];
      setVozEstado(`Subiendo audio ${i + 1}/${lista.length}: ${file.name}…`);
      try {
        const res = await fetch(`/api/editor/voz?name=${encodeURIComponent(file.name)}`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: file,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setVozEstado("⚠️ " + (data.error ?? `Error ${res.status}`));
          continue;
        }
        setVoces((prev) => [...prev, { nombre: data.voz as string, original: data.original as string }]);
        ok += 1;
      } catch (e) {
        setVozEstado("⚠️ Fallo de red: " + (e instanceof Error ? e.message : "?"));
      }
    }
    if (ok) setVozEstado(`✓ ${ok} audio(s) subido(s).`);
    setSubiendoVoz(false);
  }
  function quitarVoz(idx: number) {
    setVoces((prev) => prev.filter((_, i) => i !== idx));
    setVozEstado("");
  }

  // Sube el VIDEO-GANCHO de UN anuncio (cuerpo crudo, como la voz). Opcional.
  async function subirGanchoVideo(ad: number, file: File | null) {
    if (!file) return;
    setSubiendoHookAd(ad);
    setHookUpMsg(`Subiendo gancho del anuncio ${ad + 1}: ${file.name}…`);
    try {
      const res = await fetch(`/api/editor/hook-video?name=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHookUpMsg("⚠️ " + (data.error ?? `Error ${res.status}`));
        setSubiendoHookAd(null);
        return;
      }
      setHookVids((prev) => ({
        ...prev,
        [ad]: { nombre: data.hook as string, original: data.original as string },
      }));
      setHookSecs((prev) => (prev[ad] ? prev : { ...prev, [ad]: 2 }));
      setHookUpMsg(`✓ Gancho del anuncio ${ad + 1} subido.`);
    } catch (e) {
      setHookUpMsg("⚠️ Fallo de red: " + (e instanceof Error ? e.message : "?"));
    }
    setSubiendoHookAd(null);
  }
  function quitarGanchoVideo(ad: number) {
    setHookVids((prev) => {
      const next = { ...prev };
      delete next[ad];
      return next;
    });
    setHookUpMsg("");
  }
  function cambiarHookSecs(ad: number, valor: string) {
    const n = Math.min(6, Math.max(0.6, Number(valor) || 2));
    setHookSecs((prev) => ({ ...prev, [ad]: n }));
  }

  // Sube el VIDEO-GUÍA (cuerpo crudo, como la voz). Se sobrepone (PiP) al anuncio.
  async function subirGuia(file: File | null) {
    if (!file) return;
    setSubiendoGuia(true);
    setGuiaMsg(`Subiendo guía: ${file.name}…`);
    try {
      const res = await fetch(`/api/editor/guia?name=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGuiaMsg("⚠️ " + (data.error ?? `Error ${res.status}`));
        setSubiendoGuia(false);
        return;
      }
      setGuiaVid({ nombre: data.guia as string, original: data.original as string });
      setGuiaMsg("✓ Guía subida; se sobrepondrá al anuncio.");
    } catch (e) {
      setGuiaMsg("⚠️ Fallo de red: " + (e instanceof Error ? e.message : "?"));
    }
    setSubiendoGuia(false);
  }
  function quitarGuia() {
    setGuiaVid(null);
    setGuiaMsg("");
  }

  async function buscarGanchos() {
    const urls = urlsSeleccionadas();
    if (!urls.length) {
      setHookMsg("⚠️ Marca al menos un video del producto.");
      return;
    }
    // Ronda actual: hookRonda arranca en 0 (1ª búsqueda) y SOLO avanza cuando una
    // búsqueda trae candidatos (más abajo). Así un fallo/vacío no reinicia la variedad.
    const ronda = hookRonda;
    setBuscandoHook(true);
    setHookMsg(
      ronda
        ? "Buscando MÁS ganchos con ángulos distintos…"
        : "Analizando los videos para proponer ganchos…",
    );
    // NO tocamos hookElegidos: los ganchos ya guardados persisten entre búsquedas.
    setHookCands([]);
    try {
      const res = await fetch("/api/editor/hooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_urls: urls, variant: ronda }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHookMsg("⚠️ " + (data.error ?? `Error ${res.status}`));
        setBuscandoHook(false);
        return;
      }
      setHookBase(data.publicBase ?? "");
      setHookCands((data.candidates ?? []) as HookCandidato[]);
      const n = (data.candidates ?? []).length as number;
      // Solo avanzamos de ronda si HUBO resultados (así el próximo clic pide variedad
      // nueva; un vacío/fallo no consume la ronda).
      if (n) setHookRonda(ronda + 1);
      setHookMsg(
        n
          ? `${n} opciones. Elige ${numClips} gancho(s) (uno por anuncio); los ya elegidos se guardan aunque vuelvas a buscar.`
          : "No se encontraron ganchos claros.",
      );
    } catch (e) {
      setHookMsg("⚠️ Fallo de red: " + (e instanceof Error ? e.message : "?"));
    }
    setBuscandoHook(false);
  }

  // Clave estable de un gancho (igual en cualquier ronda): mismo video + mismo inicio.
  const hookKey = (c: { video_idx: number; start: number }) =>
    `${c.video_idx}:${Math.round(c.start * 100)}`;
  const indiceElegido = (c: HookCandidato) =>
    hookElegidos.findIndex((h) => h.key === hookKey(c));

  // Marca/desmarca un candidato. Se guarda como objeto propio (sobrevive a re-buscar).
  function toggleGancho(c: HookCandidato) {
    const k = hookKey(c);
    if (hookElegidos.some((h) => h.key === k)) {
      setHookElegidos((prev) => prev.filter((h) => h.key !== k)); // ya estaba: quitar
      return;
    }
    if (hookElegidos.length >= numClips) {
      setHookMsg(`Ya elegiste ${numClips} gancho(s) (uno por anuncio). Quita uno para cambiarlo.`);
      return; // lleno: no añadir más de numClips
    }
    const nuevo: HookElegido = {
      key: k,
      video_idx: c.video_idx,
      start: c.start,
      dur: c.dur,
      razon: c.razon,
      thumb: c.thumb ? thumbSrc(c.thumb) : null,
    };
    setHookElegidos((prev) => (prev.some((h) => h.key === k) ? prev : [...prev, nuevo]));
  }
  function quitarGancho(k: string) {
    setHookElegidos((prev) => prev.filter((h) => h.key !== k));
  }
  // Nº de anuncios: SIEMPRE 1..20 (vaciar el campo daba 0 -> estado inválido). Al
  // reducirlo, recorta los ganchos guardados que ya no tienen anuncio.
  function cambiarNumClips(valor: string) {
    const n = Math.min(20, Math.max(1, Math.trunc(Number(valor) || 1)));
    setNumClips(n);
    setHookElegidos((prev) => (prev.length > n ? prev.slice(0, n) : prev));
    // Los ganchos subidos van por índice de anuncio: descarta los de anuncios que
    // ya no existen (ad >= n).
    setHookVids((prev) => {
      const next: Record<number, { nombre: string; original: string }> = {};
      for (const [ad, v] of Object.entries(prev)) if (Number(ad) < n) next[Number(ad)] = v;
      return next;
    });
  }

  async function generar() {
    const urls = urlsSeleccionadas();
    if (!urls.length) {
      setEstado("⚠️ Marca al menos un video del producto.");
      return;
    }
    // Un audio por anuncio: exactamente numClips.
    if (voces.length !== numClips) {
      setEstado(
        `⚠️ Necesitas ${numClips} audio(s), uno por anuncio. ` +
          (voces.length < numClips
            ? `Faltan ${numClips - voces.length}.`
            : `Sobran ${voces.length - numClips}, quita alguno.`),
      );
      return;
    }
    // Un gancho por anuncio, EN ORDEN (recortado a numClips). Los anuncios sin
    // gancho elegido abren en automático. Lista vacía = todo automático.
    const hooks = hookElegidos
      .slice(0, numClips)
      .map((h) => ({ video_idx: h.video_idx, start: h.start, dur: h.dur }));
    // Ganchos SUBIDOS por anuncio (video propio + segundos). Solo los de anuncios
    // válidos; en el backend mandan sobre el fragmento elegido de ese anuncio.
    const hook_uploads = Object.entries(hookVids)
      .map(([ad, v]) => ({ ad: Number(ad), nombre: v.nombre, secs: hookSecs[Number(ad)] ?? 2 }))
      .filter((h) => h.ad >= 0 && h.ad < numClips);
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
          trim_silence: trimSilence,
          use_cta: useCta,
          cta_texto: ctaTexto,
          cta_wa: ctaTipo === "whatsapp",
          cta_boton: ctaTipo === "whatsapp" ? "WhatsApp →" : ctaBoton,
          oferta_pill: ofertaPill,
          hooks,
          hook_uploads,
          guia: guiaVid?.nombre ?? "",
          voces: voces.map((v) => v.nombre),
          // El server lee el avatar/oferta de este producto para el brief del cerebro.
          producto_id: productoId,
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

  // En el subdominio del editor no hay productos y es lo esperado: los videos
  // se suben abajo.
  if (!soloEditor && !productos.length) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-16 text-center">
        <h1 className="text-2xl font-semibold">Editor de videos</h1>
        <p className="mt-3 text-muted">
          Aún no hay productos. Primero crea uno en{" "}
          <Link href="/productos" className="text-accent-2 hover:underline">
            Productos
          </Link>{" "}
          (y en el paso <b>Videos</b> sube los videos largos). Aquí eliges el
          producto y creas los anuncios a partir de esos videos.
        </p>
      </div>
    );
  }

  // Base de las SALIDAS (render, .zip, miniaturas). El dueño las abre en el
  // dominio público del extractor. El editor suelto no tiene sus credenciales,
  // así que van por un proxy del propio dominio (/api/editor/descargar).
  const abs = (u?: string | null) => {
    if (!u) return "#";
    return soloEditor ? `/api/editor/descargar${u}` : `${publicBase}${u}`;
  };
  const thumbSrc = (u: string) => (soloEditor ? `/api/editor/descargar${u}` : `${hookBase}${u}`);
  const mmss = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-2xl font-semibold">🎬 Editor de videos</h1>
      <p className="mt-2 mb-8 text-sm text-muted">
        {soloEditor ? (
          <>
            Sube tus videos largos y el editor
            <b> recorta extractos y arma un video nuevo</b> de ~45s, con subtítulos,
            animaciones y CTA. Si le pones una locución, ella manda: el video dura lo
            que dure el audio. Antes de renderizar puedes previsualizar.
          </>
        ) : (
          <>
            Elige un producto y sus videos (los que subiste en Productos). El editor
            <b> recorta extractos de esos videos y arma un video nuevo</b> de ~45s, con
            subtítulos, animaciones y CTA. Antes de renderizar puedes previsualizar. Los
            que ya creaste están en{" "}
            <Link href="/anuncios" className="text-accent-2 hover:underline">
              Mis anuncios
            </Link>
            .
          </>
        )}
      </p>

      {/* Materia prima: los videos del producto, o los que se suban aquí. */}
      <div className="space-y-4 rounded-2xl border border-[var(--hairline)] glass p-5">
        {soloEditor ? (
          <div>
            <p className="text-sm text-muted">Tus videos</p>
            <p className="mt-1 text-xs text-muted">
              De aquí salen los recortes. Sube uno o varios (mp4, mov, webm). Se
              suben por partes, así que el tamaño no es problema.
            </p>
            <input
              type="file"
              accept="video/*"
              multiple
              disabled={subiendoVideo}
              onChange={(e) => {
                subirVideos(e.target.files);
                e.target.value = ""; // permite volver a elegir el mismo archivo
              }}
              className="mt-3 block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-medium file:text-white disabled:opacity-60"
            />
            {videoEstado && <p className="mt-2 text-xs text-muted">{videoEstado}</p>}
          </div>
        ) : (
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
        )}

        <div>
          <p className="mb-2 text-sm text-muted">
            Videos a usar ({seleccion.size}/{videosDisponibles.length})
          </p>
          <div className="space-y-2">
            {videosDisponibles.map((v) => (
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
                {soloEditor && (
                  <button
                    type="button"
                    onClick={() => quitarVideoSubido(v.url)}
                    title="Quitar de la lista"
                    className="shrink-0 rounded px-1.5 text-xs text-muted hover:text-red-400"
                  >
                    ✕
                  </button>
                )}
              </label>
            ))}
            {soloEditor && !videosDisponibles.length && !subiendoVideo && (
              <p className="rounded-lg border border-dashed border-[var(--hairline)] p-4 text-center text-xs text-muted">
                Todavía no has subido ningún video.
              </p>
            )}
          </div>
        </div>
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
            onChange={(e) => cambiarNumClips(e.target.value)}
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
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={trimSilence}
            onChange={(e) => setTrimSilence(e.target.checked)}
          />
          ✂️ Quitar silencios de la locución — recorta el aire muerto del principio
          y del final para que el anuncio no arranque lento (no corta la voz).
        </label>
      </div>

      {/* Cierre (CTA) + oferta */}
      <div className="mt-4 space-y-4 rounded-2xl border border-[var(--hairline)] glass p-5">
        <label className="flex items-center gap-2 text-sm font-medium text-text">
          <input type="checkbox" checked={useCta} onChange={(e) => setUseCta(e.target.checked)} />
          🎯 Poner llamada a la acción (CTA) al final
        </label>

        {useCta && (
          <div className="space-y-3 pl-6">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">Título del CTA</span>
              <input
                type="text"
                value={ctaTexto}
                onChange={(e) => setCtaTexto(e.target.value)}
                placeholder="Haz clic para conseguir el tuyo"
                maxLength={80}
                className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
              />
            </label>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Botón</span>
                <select
                  value={ctaTipo}
                  onChange={(e) => setCtaTipo(e.target.value as "whatsapp" | "otro")}
                  className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
                >
                  <option value="whatsapp">WhatsApp (botón verde)</option>
                  <option value="otro">Otro (personalizado)</option>
                </select>
              </label>
              {ctaTipo === "otro" && (
                <label className="flex flex-1 flex-col gap-1 text-sm">
                  <span className="text-muted">Texto del botón</span>
                  <input
                    type="text"
                    value={ctaBoton}
                    onChange={(e) => setCtaBoton(e.target.value)}
                    placeholder="Pídelo ahora →"
                    maxLength={24}
                    className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
                  />
                </label>
              )}
            </div>
          </div>
        )}

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">
            🔥 Oferta a destacar (opcional) — aparece como píldora antes del cierre
          </span>
          <input
            type="text"
            value={ofertaPill}
            onChange={(e) => setOfertaPill(e.target.value)}
            placeholder="Ej: 2x1 solo hoy · Envío gratis · 40% OFF"
            maxLength={60}
            className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
          />
        </label>
      </div>

      {/* Locución: UNA por anuncio (obligatorio, tantas como numClips). */}
      <div className="mt-4 space-y-3 rounded-2xl border border-[var(--hairline)] glass p-5">
        <div>
          <p className="text-sm font-medium text-text">
            🎙️ Audios — uno por anuncio ({voces.length}/{numClips})
          </p>
          <p className="mt-1 text-xs text-muted">
            Cada anuncio lleva <b>su propia locución</b>: no se repite el mismo audio. Sube{" "}
            <b>{numClips} audio(s)</b>, uno por anuncio. Cada anuncio <b>dura lo que dura su
            audio</b> y sus subtítulos salen de él. Puedes seleccionar varios de golpe.
          </p>
        </div>

        {/* Ranura por anuncio, en orden. */}
        <div className="space-y-2">
          {Array.from({ length: numClips }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border border-[var(--hairline)] bg-[var(--field)] p-2.5 text-sm"
            >
              <span className="shrink-0 text-muted">Anuncio {i + 1}</span>
              {voces[i] ? (
                <>
                  <span className="min-w-0 flex-1 truncate text-text">🎧 {voces[i].original}</span>
                  <button
                    type="button"
                    onClick={() => quitarVoz(i)}
                    title="Quitar este audio"
                    className="shrink-0 rounded px-1.5 text-xs text-muted hover:text-red-400"
                  >
                    ✕
                  </button>
                </>
              ) : (
                <span className="flex-1 text-xs text-amber-400">— falta el audio —</span>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-lg border border-accent/50 bg-accent/10 px-4 py-2 text-sm font-medium text-accent-2">
            {subiendoVoz ? "Subiendo…" : "⬆️ Subir audios"}
            <input
              type="file"
              accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg"
              multiple
              disabled={subiendoVoz}
              onChange={(e) => {
                subirVoces(e.target.files);
                e.target.value = "";
              }}
              className="hidden"
            />
          </label>
          <span className="text-sm text-muted">{vozEstado}</span>
        </div>

        {voces.length !== numClips && (
          <p className="text-xs text-amber-400">
            {voces.length < numClips
              ? `Faltan ${numClips - voces.length} audio(s) para poder generar.`
              : `Sobran ${voces.length - numClips}; quita alguno (deben ser ${numClips}).`}
          </p>
        )}
        <p className="text-[11px] text-muted">Formatos: mp3, m4a, wav, aac, ogg.</p>
      </div>

      {/* Fase 4 — Hook visual (marco de referencia) */}
      <div className="mt-4 space-y-3 rounded-2xl border border-[var(--hairline)] glass p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-text">🎯 Hook visual (uno por anuncio)</p>
            <p className="text-xs text-muted">
              Elige el fragmento que abre CADA anuncio: hasta {numClips} ganchos (uno
              por anuncio). Puedes pulsar «Buscar más ganchos» varias veces; los que
              ya elegiste se guardan. Los anuncios sin gancho abren en automático.
            </p>
          </div>
          <button
            onClick={buscarGanchos}
            disabled={buscandoHook || seleccion.size === 0}
            className="rounded-lg border border-accent/50 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent-2 disabled:opacity-50"
          >
            {buscandoHook ? "Analizando…" : hookCands.length ? "🔄 Buscar más ganchos" : "🔎 Buscar ganchos"}
          </button>
        </div>

        {hookMsg && <p className="text-xs text-muted">{hookMsg}</p>}

        {/* Contador + ganchos GUARDADOS (persisten al re-buscar). Uno por anuncio. */}
        {(hookElegidos.length > 0 || hookCands.length > 0) && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-text">
              Ganchos elegidos: {Math.min(hookElegidos.length, numClips)}/{numClips}
              {hookElegidos.length > numClips && (
                <span className="text-amber-400">
                  {" "}
                  (sobran {hookElegidos.length - numClips}, se usarán los primeros {numClips})
                </span>
              )}
            </p>
            {hookElegidos.length > 0 && (
              <button
                onClick={() => setHookElegidos([])}
                className="text-xs text-muted underline hover:text-text"
              >
                Limpiar
              </button>
            )}
          </div>
        )}

        {hookElegidos.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {hookElegidos.map((h, k) => (
              <div
                key={h.key}
                className={
                  "relative w-[92px] shrink-0 overflow-hidden rounded-xl border " +
                  (k < numClips ? "border-accent ring-2 ring-accent/50" : "border-amber-400/60")
                }
              >
                {h.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={h.thumb} alt={`Anuncio ${k + 1}`} className="h-[132px] w-[92px] object-cover" />
                ) : (
                  <div className="flex h-[132px] w-[92px] items-center justify-center bg-[var(--field)] text-2xl">
                    🎬
                  </div>
                )}
                <span className="absolute left-1 top-1 rounded bg-accent px-1 text-[10px] font-semibold text-white">
                  Anuncio {k + 1}
                </span>
                <button
                  onClick={() => quitarGancho(h.key)}
                  title="Quitar"
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-[11px] text-white hover:bg-black"
                >
                  ×
                </button>
                <span className="absolute bottom-0 inset-x-0 truncate bg-black/60 px-1 py-0.5 text-[9px] text-white">
                  {mmss(h.start)} · V{h.video_idx + 1}
                </span>
              </div>
            ))}
          </div>
        )}

        {hookCands.length > 0 && (
          <>
            <p className="text-[11px] text-muted">
              Toca para {hookElegidos.length >= numClips ? "cambiar (primero quita uno)" : "elegir"}:
            </p>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {hookCands.map((c) => {
                const pos = indiceElegido(c);
                const activo = pos >= 0;
                const lleno = hookElegidos.length >= numClips && !activo;
                return (
                  <button
                    key={c.i}
                    onClick={() => toggleGancho(c)}
                    title={c.razon}
                    className={
                      "relative w-[92px] shrink-0 overflow-hidden rounded-xl border text-left transition-all " +
                      (activo
                        ? "border-accent ring-2 ring-accent/50"
                        : lleno
                          ? "border-[var(--hairline)] opacity-40"
                          : "border-[var(--hairline)] hover:border-accent/40")
                    }
                  >
                    {c.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbSrc(c.thumb)}
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
                        Anuncio {pos + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Gancho SUBIDO por anuncio (opcional) — video propio + segundos */}
      <div className="mt-4 space-y-3 rounded-2xl border border-[var(--hairline)] glass p-5">
        <div>
          <p className="text-sm font-medium text-text">🎬 Sube tu propio gancho por anuncio (opcional)</p>
          <p className="mt-1 text-xs text-muted">
            Para cada anuncio puedes subir <b>tu propio video de apertura</b> y decir{" "}
            <b>cuántos segundos</b> usar. Va <b>sin sonido</b> (manda el audio del anuncio) y{" "}
            <b>manda sobre</b> el fragmento elegido arriba. Si no subes nada, se usa lo de arriba
            (o automático).
          </p>
        </div>

        <div className="space-y-2">
          {Array.from({ length: numClips }).map((_, i) => {
            const sub = hookVids[i];
            return (
              <div
                key={i}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--hairline)] bg-[var(--field)] p-2.5 text-sm"
              >
                <span className="shrink-0 text-muted">Anuncio {i + 1}</span>
                {sub ? (
                  <>
                    <span className="min-w-0 flex-1 truncate text-text">🎬 {sub.original}</span>
                    <label className="flex shrink-0 items-center gap-1 text-xs text-muted">
                      <input
                        type="number"
                        min={0.6}
                        max={6}
                        step={0.5}
                        value={hookSecs[i] ?? 2}
                        onChange={(e) => cambiarHookSecs(i, e.target.value)}
                        className="w-16 rounded border border-[var(--hairline)] bg-[var(--bg)] px-1.5 py-1 text-text outline-none focus:border-accent"
                      />
                      seg
                    </label>
                    <button
                      type="button"
                      onClick={() => quitarGanchoVideo(i)}
                      title="Quitar este gancho"
                      className="shrink-0 rounded px-1.5 text-xs text-muted hover:text-red-400"
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-xs text-muted">— sin gancho propio (usa lo de arriba) —</span>
                    <label className="shrink-0 cursor-pointer rounded-lg border border-accent/50 bg-accent/10 px-3 py-1 text-xs font-medium text-accent-2">
                      {subiendoHookAd === i ? "Subiendo…" : "⬆️ Subir gancho"}
                      <input
                        type="file"
                        accept="video/*,.mp4,.mov,.mkv"
                        disabled={subiendoHookAd !== null}
                        onChange={(e) => {
                          subirGanchoVideo(i, e.target.files?.[0] ?? null);
                          e.target.value = "";
                        }}
                        className="hidden"
                      />
                    </label>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {hookUpMsg && <p className="text-xs text-muted">{hookUpMsg}</p>}
        <p className="text-[11px] text-muted">Formatos: mp4, mov, mkv · máx 120 MB por gancho.</p>
      </div>

      {/* Video-GUÍA sobrepuesta (PiP) — opcional */}
      <div className="mt-4 space-y-3 rounded-2xl border border-[var(--hairline)] glass p-5">
        <div>
          <p className="text-sm font-medium text-text">📘 Guía sobrepuesta (opcional)</p>
          <p className="mt-1 text-xs text-muted">
            Sube un <b>video-guía</b> y saldrá <b>sobrepuesto</b> (encima) del anuncio, como
            una tarjeta de video. Se usa en <b>todos</b> los anuncios. Si tu locución ofrece un
            recurso descargable, aparece en ese momento; si no, se muestra igual una vez.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--hairline)] bg-[var(--field)] p-2.5 text-sm">
          {guiaVid ? (
            <>
              <span className="min-w-0 flex-1 truncate text-text">📘 {guiaVid.original}</span>
              <button
                type="button"
                onClick={quitarGuia}
                title="Quitar la guía"
                className="shrink-0 rounded px-1.5 text-xs text-muted hover:text-red-400"
              >
                ✕
              </button>
            </>
          ) : (
            <>
              <span className="flex-1 text-xs text-muted">— sin guía sobrepuesta —</span>
              <label className="shrink-0 cursor-pointer rounded-lg border border-accent/50 bg-accent/10 px-3 py-1 text-xs font-medium text-accent-2">
                {subiendoGuia ? "Subiendo…" : "⬆️ Subir guía"}
                <input
                  type="file"
                  accept="video/*,.mp4,.mov,.webm,.m4v,.mkv"
                  disabled={subiendoGuia}
                  onChange={(e) => {
                    subirGuia(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                  className="hidden"
                />
              </label>
            </>
          )}
        </div>
        {guiaMsg && <p className="text-xs text-muted">{guiaMsg}</p>}
        <p className="text-[11px] text-muted">Formatos: mp4, mov, webm, m4v, mkv · máx 120 MB.</p>
      </div>

      {/* Acción + estado */}
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--hairline)] glass p-4">
        <button
          onClick={generar}
          disabled={trabajando || seleccion.size === 0 || voces.length !== numClips}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          title={voces.length !== numClips ? `Sube ${numClips} audios (uno por anuncio)` : ""}
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

      {/* Cola: hay UN worker, así que todo se procesa de uno en uno. La cola es
          del extractor COMPARTIDO (lista trabajos del dueño): en el subdominio
          no se muestra, y su API está bloqueada. */}
      {!soloEditor && (
      <div className="mt-4 space-y-2 rounded-2xl border border-[var(--hairline)] glass p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-text">🚦 Cola del editor</span>
          <button
            onClick={verCola}
            className="rounded border border-[var(--hairline)] px-2 py-1 text-xs text-muted hover:text-text"
          >
            🔄 Actualizar
          </button>
          {(cola?.total_en_cola ?? 0) > 0 && (
            <button
              onClick={vaciarCola}
              className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-300 hover:text-red-200"
              title="Cancela los trabajos pendientes (el que ya corre termina solo)"
            >
              🧹 Vaciar cola ({cola?.total_en_cola})
            </button>
          )}
          <span className="text-xs text-muted">{colaMsg}</span>
        </div>
        {cola && (
          <p className="text-xs text-muted">
            {cola.en_proceso.length > 0 ? (
              <>
                Procesando <b>1</b> ({cola.en_proceso[0].mensaje || cola.en_proceso[0].estado})
                {cola.total_en_cola > 0 && <> · <b>{cola.total_en_cola}</b> esperando detrás</>}
              </>
            ) : cola.total_en_cola > 0 ? (
              <>
                <b>{cola.total_en_cola}</b> trabajo(s) esperando. Se procesan{" "}
                <b>de uno en uno</b>: si se acumularon de intentos anteriores, vacía la cola.
              </>
            ) : (
              <>Vacía: tu anuncio empieza al instante.</>
            )}
          </p>
        )}
      </div>
      )}

      {/* Resultado */}
      {job?.status === "done" && (
        <div className="mt-4 space-y-3 rounded-2xl border border-[var(--hairline)] glass p-5">
          <h2 className="text-sm font-semibold">✅ Anuncios listos</h2>
          {/* La página de "previsualizar y renderizar" vive en el extractor, tras
              su propio login: en el subdominio no se ofrece (allí el anuncio se
              renderiza solo y se descarga directo). */}
          {!soloEditor && job.preview_url && (
            <a
              href={abs(job.preview_url)}
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              👁️ Previsualizar y renderizar
            </a>
          )}
          {(job.clips ?? []).length > 0 ? (
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
          ) : (
            soloEditor && (
              <p className="text-xs text-muted">
                El anuncio se generó pero este servidor de video no pudo renderizar
                el mp4. Descarga el proyecto y ábrelo, o avísale al dueño.
              </p>
            )
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
