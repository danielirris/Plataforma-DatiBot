// ─────────────────────────────────────────────────────────────
// Modelo de datos "PRODUCTO".
//
// Principio: PRODUCTO (portátil) × PAÍS (config fija) = Lanzamiento.
// El producto guarda SOLO lo reutilizable entre países: identidad, mensajes
// (redactados por IA en español neutral, con los tokens del motor [PRECIO_BASE]…
// intactos para que se llenen por país), overlays y links de imágenes.
//
// Excepción deliberada: `precios` va POR PAÍS dentro del producto, porque el
// precio es una decisión COMERCIAL por mercado (en Chile ≠ en Ecuador), no
// infraestructura fija por país. La moneda/símbolo sí sale de la config del país.
// ─────────────────────────────────────────────────────────────

/** Los 5 creativos que se generan por producto. */
export type TipoImagen =
  | "contenido"
  | "bonos"
  | "bono_accion_rapida"
  | "remarketing_60"
  | "remarketing_180";

export const TIPOS_IMAGEN: TipoImagen[] = [
  "contenido",
  "bonos",
  "bono_accion_rapida",
  "remarketing_60",
  "remarketing_180",
];

/** Países con los que se puede emitir (deben tener config por país para emitir). */
export const PAISES: { codigo: string; nombre: string }[] = [
  { codigo: "PE", nombre: "Perú" },
  { codigo: "CL", nombre: "Chile" },
  { codigo: "CO", nombre: "Colombia" },
  { codigo: "EC", nombre: "Ecuador" },
  { codigo: "MX", nombre: "México" },
  { codigo: "VE", nombre: "Venezuela" },
];

export interface IdentidadProducto {
  promesa: string;
  posicionamiento: string;
  dirigidoA: string;
}

/**
 * Precios por producto y país. Son los que el motor mapea a sus tokens
 * ([PRECIO_BASE], [PRECIO_TACHADO], [PRECIO_ADICIONAL_OB], [PRECIO_RMK_*]).
 * El combo y el regateo los DERIVA el motor; no se guardan aquí.
 */
export interface PreciosPais {
  base: string;
  tachado: string;
  adicional_ob: string;
  rmk_15m: string;
  rmk_60m: string;
  rmk_180m: string;
}

export interface EmisionRegistro {
  pais: string;
  fecha: string;
}

export interface Producto {
  id: string;
  nombre: string;
  identidad: IdentidadProducto;
  /** identificador propio del producto (NO el ID de pago/checkout, que es por país) */
  productoId: string;
  /** ranuras del motor (mensaje_1..8, mensaje_rmk_*, ob_mensaje_*, …) en español neutral */
  mensajes: Record<string, string>;
  /** líneas cortas de texto que el servidor superpone en cada imagen */
  overlays: Record<TipoImagen, string>;
  /** links públicos (VPS) de cada creativo */
  imagenes: Record<TipoImagen, string>;
  /** precios por país: { PE: {...}, CL: {...}, EC: {...} } */
  precios: Record<string, PreciosPais>;
  orderbumpPorDefecto: boolean;
  historialEmisiones: EmisionRegistro[];
  creadoEn: string;
  actualizadoEn: string;
}

function overlaysVacios(): Record<TipoImagen, string> {
  return TIPOS_IMAGEN.reduce(
    (acc, t) => ((acc[t] = ""), acc),
    {} as Record<TipoImagen, string>,
  );
}

/** Crea un producto borrador con todos los campos inicializados. */
export function crearProductoBorrador(parcial: Partial<Producto> = {}): Producto {
  return {
    id: "",
    nombre: "",
    identidad: { promesa: "", posicionamiento: "", dirigidoA: "" },
    productoId: "",
    mensajes: {},
    overlays: overlaysVacios(),
    imagenes: overlaysVacios(),
    precios: {},
    orderbumpPorDefecto: false,
    historialEmisiones: [],
    creadoEn: "",
    actualizadoEn: "",
    ...parcial,
  };
}
