// Recuerda el ÚLTIMO producto seleccionado en las pestañas de Embudos (Bot por producto,
// Embudo, Media, IA) para que al cambiar de pestaña no se pierda y se autocargue. Se
// guarda en localStorage (por navegador). Envuelto en try/catch: en SSR o con storage
// bloqueado no debe romper nada.
const KEY = "embudos:ultimo-producto";

export function leerUltimoProducto(): string {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function guardarUltimoProducto(producto: string): void {
  try {
    if (producto) localStorage.setItem(KEY, producto);
    else localStorage.removeItem(KEY);
  } catch {
    /* localStorage no disponible: no pasa nada */
  }
}
