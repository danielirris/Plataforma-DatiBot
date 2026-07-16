// Modo "solo editor": el MISMO contenedor, desplegado como un segundo servicio
// con su propio dominio (p. ej. editor.datibot.lat) y SOLO_EDITOR=1, solo sirve
// el editor de videos. Todo lo demás —productos, ebooks, flujos, dashboard,
// configuración y sus APIs— queda bloqueado.
//
// Sirve para dar el editor a alguien de fuera sin darle la plataforma entera.
//
// OJO: se lee SIEMPRE en servidor (middleware o Server Component) y se pasa
// como prop a los componentes de cliente. NO puede ser NEXT_PUBLIC_: con
// `output: "standalone"` esas se inlinean al construir la imagen, y entonces el
// mismo contenedor no podría cambiar de modo con una env var de EasyPanel.

// Lista BLANCA: lo que no esté aquí, no existe en este servicio. Se enumera una
// a una a propósito, y NO como "/api/editor" entero, porque hay rutas del editor
// que no puede tocar quien entra por el subdominio:
//
//   · /api/editor/galeria → los anuncios del extractor son de TODOS los que lo
//     usan (es el mismo servicio): devolvería los del dueño.
//   · /api/editor/cola → el extractor es compartido; su cola lista los ids, los
//     nombres de archivo y el estado de los trabajos del DUEÑO. Ver esa cola es
//     un oráculo de ids ajenos, y su POST además cancela renders del dueño. Se
//     bloquea entera: en el subdominio no se muestra la cola compartida.
//
// Un "/api/editor" a secas dejaría ambas abiertas.
const RUTAS_EDITOR = [
  "/extractor",
  "/api/editor/jobs",
  "/api/editor/hooks",
  "/api/editor/voz",
  "/api/editor/videos",
  "/api/editor/descargar", // proxy acotado de salidas del extractor (render, .zip, miniaturas)
  "/api/img",
  "/icon.svg",
];

export function esSoloEditor(): boolean {
  const v = (process.env.SOLO_EDITOR ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "si" || v === "sí";
}

/** ¿Esta petición está permitida en modo solo editor? */
export function permitidaEnEditor(pathname: string): boolean {
  return RUTAS_EDITOR.some((r) => pathname === r || pathname.startsWith(r + "/"));
}
