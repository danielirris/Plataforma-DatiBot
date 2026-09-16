// Identificador CANÓNICO del producto: la clave `producto` que va a las tablas de
// Supabase de embudos (config_bots, pasos_embudo, mensajes_rotador, media_bots) y a
// `numeros.producto_activo`, y con la que el motor de n8n las relaciona.
//
// Regla oficial (derivada del NOMBRE del producto, no del id de archivo ni del
// productoId tecleado a mano): MAYÚSCULAS · espacios y símbolos → `_` · sin tildes ni
// acentos · solo [A-Z0-9_]. Ejemplos: "Limpieza Facial" → LIMPIEZA_FACIAL, "Malvaviscos"
// → MALVAVISCOS, "Origami Mágico" → ORIGAMI_MAGICO, "Niño" → NINO.
//
// Es IDEMPOTENTE: toProductoId(toProductoId(x)) === toProductoId(x). Por eso se puede
// aplicar en el front Y otra vez en las rutas API (defensa en profundidad) sin romperse.
export function toProductoId(nombre: string): string {
  return String(nombre ?? "")
    .normalize("NFD") // separa cada letra de su acento (é → e + ´)
    .replace(/[̀-ͯ]/g, "") // quita los diacríticos (incluye ñ → n)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_") // espacios y cualquier símbolo → un solo _
    .replace(/^_+|_+$/g, ""); // sin _ al inicio ni al final
}

/** La clave de Supabase de un producto del catálogo = normalizar su NOMBRE. */
export function keyProducto(p: { nombre: string }): string {
  return toProductoId(p.nombre);
}
