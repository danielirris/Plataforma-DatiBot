// ─────────────────────────────────────────────────────────────
// Modelo de datos "PRODUCTO" (rediseño v1).
//
// Un producto guarda lo reutilizable: identidad, ANUNCIOS GANADORES de referencia
// (la base creativa, en vez de investigar avatar/ángulos), oferta, GUIÓN del video
// de embudo, ebook, videos y precios por país. Los MENSAJES del embudo de WhatsApp
// (modelo COD) viven en su propia sección y se guardan en `mensajes`.
// ─────────────────────────────────────────────────────────────

/** Países con los que se puede trabajar. */
export const PAISES: { codigo: string; nombre: string }[] = [
  { codigo: "CO", nombre: "Colombia" },
  { codigo: "MX", nombre: "México" },
  { codigo: "EC", nombre: "Ecuador" },
  { codigo: "CL", nombre: "Chile" },
  { codigo: "VE", nombre: "Venezuela" },
  { codigo: "PE", nombre: "Perú" },
  { codigo: "AR", nombre: "Argentina" },
];

export interface IdentidadProducto {
  promesa: string;
  posicionamiento: string;
  dirigidoA: string;
}

// ── ANUNCIOS GANADORES DE REFERENCIA ───────────────────────────
// Guiones de anuncios ganadores de la competencia o del nicho, con un avatar MUY
// similar al del producto (ej.: gano vendiendo neveras usando un ganador de aires
// acondicionados). Son la base creativa: alimentan el guión de video de embudo y
// el cerebro de los anuncios, en vez de investigar el avatar desde cero.
export interface AnuncioReferencia {
  id: string;
  /** título corto para reconocerlo (ej. "Ganador aires acondicionados") */
  titulo: string;
  /** nicho/producto del anuncio original (ej. "aires acondicionados") */
  nicho: string;
  /** el guión/copy del anuncio ganador, pegado tal cual */
  guion: string;
}

export function anuncioReferenciaVacio(): AnuncioReferencia {
  return { id: "", titulo: "", nicho: "", guion: "" };
}

// Resultado de la fase "Anuncios ganadores": el análisis del material de referencia.
// Identifica hacia dónde apuntan los anuncios que vamos a generar (ángulo, dolor y
// avatar), ya adaptado a lo que vendemos REALMENTE (ver Producto.queVendemos).
export interface AnalisisAnuncios {
  /** el ángulo/gran idea con que atacamos (ej. "ahorro brutal vs. el método viejo") */
  angulo: string;
  /** el dolor o deseo central del avatar que el anuncio toca */
  dolor: string;
  /** quién es el avatar: quién es, cómo habla, qué teme, qué quiere */
  avatar: string;
  /** notas/insights extra: objeciones, ganchos que funcionan, cómo adaptarlo a lo nuestro */
  notas: string;
  generadoEn: string;
}

export function analisisAnunciosVacio(): AnalisisAnuncios {
  return { angulo: "", dolor: "", avatar: "", notas: "", generadoEn: "" };
}

// Un guión de anuncio de CAPTACIÓN listo para grabar (distinto del guión de embudo,
// que es de cierre dentro del WhatsApp). Se generan varios a partir del análisis.
export interface GuionAnuncio {
  id: string;
  /** título corto para reconocerlo (ej. "Anuncio 1 — testimonio en 1ª persona") */
  titulo: string;
  /** el ángulo/gancho concreto de ESTE anuncio */
  angulo: string;
  /** el guión completo listo para grabar, en prosa con saltos de línea */
  guion: string;
  generadoEn: string;
}

export function guionAnuncioVacio(): GuionAnuncio {
  return { id: "", titulo: "", angulo: "", guion: "", generadoEn: "" };
}

/**
 * Bloque de prompt que le recuerda a la IA QUÉ se vende realmente. Los anuncios de
 * referencia suelen ser de un nicho más general; esto reorienta toda la generación
 * (avatar, lenguaje, ejemplos, beneficios) hacia el producto real. "" si no hay nota.
 */
export function bloqueQueVendemos(p: Pick<Producto, "queVendemos">): string {
  const q = (p.queVendemos ?? "").trim();
  if (!q) return "";
  return `\n⚠️ QUÉ VENDEMOS REALMENTE (máxima prioridad): ${q}
Los anuncios ganadores de referencia son de un nicho más GENERAL y solo sirven para copiar el AVATAR, el tono y la estructura persuasiva. ADAPTA TODO (ejemplos, lenguaje, beneficios, inventario, objeciones, dolor) a ESTE producto real, NO al nicho de los anuncios de referencia. Si algo del ganador no aplica a lo que vendemos, cámbialo por su equivalente en nuestro producto.\n`;
}

// ── OFERTA (Grand Slam Offer del embudo) ───────────────────────
export interface ProductoPrincipalOferta {
  titulo: string;
  descripcion_corta: string;
  que_incluye: string[];
  /** valor percibido en TEXTO comparativo, no en dinero */
  valor_percibido_texto: string;
  /**
   * Producto tipo "N elementos de X" (ej. 25 ejemplos de mascarillas). ``cantidad``
   * es N y ``elemento`` es el texto (ej. "ejemplos de mascarillas"). Si se rellenan,
   * el título del producto principal es "N elemento" y el EBOOK se redacta con
   * EXACTAMENTE esa cantidad de elementos. 0/"" = no aplica (producto normal).
   */
  cantidad?: number;
  elemento?: string;
}
export interface BonoOferta {
  titulo: string;
  descripcion_corta: string;
  por_que_lo_incluyo: string;
  /** objeción del cliente (compra o uso) que este bono desactiva */
  objecion_que_desactiva: string;
  valor_percibido_texto: string;
}
/** Algo que el usuario YA tiene, para arrancar la oferta desde ahí en vez de que la
 *  IA lo invente de cero. Se marca su rol dentro de la oferta. */
export interface ActivoExistente {
  titulo: string;
  descripcion: string;
  /** rol en la oferta: es el producto principal, o uno de los bonos */
  tipo: "principal" | "bono";
}
export interface Oferta {
  nombre_oferta: string;
  promesa_grande: string;
  /** lo que el usuario YA tiene (título + descripción + rol). La IA lo respeta como
   *  punto de partida al generar la oferta: no reinventa lo que ya está aquí. */
  ya_tengo: ActivoExistente[];
  producto_principal: ProductoPrincipalOferta;
  /** 3 o 4 bonos */
  bonos: BonoOferta[];
  framing_del_stack: string;
  razon_de_urgencia: string;
  /** si la oferta incluye algún bono en video (lo decide un toggle de la UI) */
  incluye_video: boolean;
}

export const MIN_BONOS = 3;
export const MAX_BONOS = 4;

// ── EBOOK (se crea por fases desde la OFERTA) ──────────────────
// Fase 1: idea · Fase 2: índice en capítulos · Fase 3: redacción capítulo a
// capítulo (+ fotos realistas por capítulo generadas con Gemini).
export interface EbookIdea {
  titulo: string;
  subtitulo: string;
  /** qué es el libro y qué promete (2-4 frases; guía toda la redacción) */
  concepto: string;
  publico: string;
}
export interface EbookFoto {
  /** URL pública (servidor de imágenes) */
  url: string;
  /** nombre de archivo (es el `src` que referencia el bloque image del motor) */
  nombre: string;
  caption?: string;
}
export interface EbookCapitulo {
  titulo: string;
  resumen: string;
  /** cuántas fotos generar para este capítulo (0-4) */
  num_fotos: number;
  fotos: EbookFoto[];
  /** bloques redactados por la IA (null = capítulo aún sin redactar) */
  bloques: Record<string, unknown>[] | null;
}
/**
 * Qué entregable de la oferta se está escribiendo. La oferta trae el producto
 * principal Y los bonos: cada uno es un ebook distinto que hay que crear.
 */
export interface EbookObjetivo {
  tipo: "principal" | "bono";
  /** índice dentro de oferta.bonos (solo aplica si tipo === "bono") */
  bono: number;
}

export interface EbookProducto {
  idea: EbookIdea | null;
  capitulos: EbookCapitulo[];
  /** tema de diseño del motor (amigurumi, capital, …) */
  tema: string;
  foto_portada: EbookFoto | null;
  /** el entregable que se está creando (producto principal o un bono) */
  objetivo: EbookObjetivo;
  /**
   * Órdenes del usuario para la IA: mandan sobre la oferta al crear el libro.
   * Ej.: "céntrate en la limpieza facial, nada de captar clientes; 8 sesiones
   * por cada uno de los 5 tipos de piel".
   */
  instrucciones: string;
}
export function ebookVacio(): EbookProducto {
  return {
    idea: null,
    capitulos: [],
    tema: "capital",
    foto_portada: null,
    objetivo: { tipo: "principal", bono: 0 },
    instrucciones: "",
  };
}

// ── VIDEOS del producto (materia prima para editar los anuncios) ──
// Videos largos (de TikTok/grabaciones) que el editor analiza y recorta.
export interface VideoProducto {
  /** URL pública (servidor de archivos) */
  url: string;
  /** nombre de archivo en el servidor */
  nombre: string;
  /** nombre original que subió el usuario (para mostrar) */
  original: string;
  /** tamaño en bytes (informativo) */
  bytes: number;
}

// ── GUIÓN DEL VIDEO DE EMBUDO ──────────────────────────────────
// El video de CIERRE que va DENTRO del embudo de WhatsApp (no el de captación).
// La IA lo redacta a partir de los anuncios ganadores + la oferta. Se entrega como
// texto listo para grabar (el usuario lo graba con su cara/voz).
export interface GuionEmbudo {
  /** formato usado (A: muestra · B: testimonial · C: cronología · D: corto · E: descubrimiento) */
  formato: string;
  /** el guión listo para grabar, en prosa con saltos de línea */
  guion: string;
  generadoEn: string;
}

// ── EMBUDO DE WHATSAPP (mensajes COD por país) ─────────────────
// La escalera es base (nivel 1) + 6 ORDERBUMPS (niveles 2-7). El MONTO de cada
// nivel es fijo por país (lib/embudo/paises.ts); aquí solo se define QUÉ bono
// agrega cada orderbump. Los 10 mensajes se generan con IA por país.
export interface Orderbump {
  /** nivel de la escalera: 2..7 (el 1 es el producto base de la oferta) */
  nivel: number;
  /** el bono que agrega este nivel */
  nombre_bono: string;
  /** por qué le sirve al cliente (el paréntesis del msg_cobro) */
  descripcion: string;
}
export interface VendedorEmbudo {
  nombre: string;
  genero: "F" | "M" | "N";
  oficio: string;
}
export interface EmbudoWhatsApp {
  vendedor: VendedorEmbudo;
  /** los 6 orderbumps (niveles 2..7); el nivel 1 es el producto base de la oferta */
  orderbumps: Orderbump[];
  /** los 10 mensajes generados por país: { CO: { msg_bienvenida: "...", … }, … } */
  mensajesPorPais: Record<string, Record<string, string>>;
}
export function embudoVacio(): EmbudoWhatsApp {
  return {
    vendedor: { nombre: "", genero: "F", oficio: "" },
    orderbumps: Array.from({ length: 6 }, (_, i) => ({
      nivel: i + 2,
      nombre_bono: "",
      descripcion: "",
    })),
    mensajesPorPais: {},
  };
}

export function bonoVacio(): BonoOferta {
  return {
    titulo: "",
    descripcion_corta: "",
    por_que_lo_incluyo: "",
    objecion_que_desactiva: "",
    valor_percibido_texto: "",
  };
}
export function activoVacio(): ActivoExistente {
  return { titulo: "", descripcion: "", tipo: "principal" };
}
export function ofertaVacia(): Oferta {
  return {
    nombre_oferta: "",
    promesa_grande: "",
    ya_tengo: [],
    producto_principal: {
      titulo: "",
      descripcion_corta: "",
      que_incluye: [""],
      valor_percibido_texto: "",
      cantidad: 0,
      elemento: "",
    },
    bonos: [bonoVacio(), bonoVacio(), bonoVacio()],
    framing_del_stack: "",
    razon_de_urgencia: "",
    incluye_video: false,
  };
}

export interface Producto {
  id: string;
  nombre: string;
  identidad: IdentidadProducto;
  /** identificador propio del producto (NO el ID de pago/checkout, que es por país) */
  productoId: string;
  /** anuncios ganadores de referencia (la base creativa, avatar similar) */
  anunciosReferencia: AnuncioReferencia[];
  /**
   * Nota clave: QUÉ estamos vendiendo realmente. Los anuncios de referencia suelen
   * ser de un nicho más general (ej. "confección de ropa"), pero el producto real
   * es específico (ej. "confección de ropa PARA PERROS"). Esta nota le dice a la IA
   * hacia dónde adaptar todo (guiones, oferta, mensajes, anuncios). Opcional.
   */
  queVendemos: string;
  /** análisis de los anuncios ganadores: ángulo, dolor y avatar. null hasta analizarlo */
  analisisAnuncios: AnalisisAnuncios | null;
  /** paquete de venta (Grand Slam Offer); null hasta que se genera */
  oferta: Oferta | null;
  /** guiones de anuncios de captación generados a partir del análisis */
  guionesAnuncios: GuionAnuncio[];
  /** guión del video de embudo (cierre dentro del WhatsApp); null hasta generarlo */
  guionEmbudo: GuionEmbudo | null;
  /** ebook del producto (se crea por fases desde la oferta) */
  ebook: EbookProducto;
  /** videos largos adjuntos (materia prima para editar los anuncios) */
  videos: VideoProducto[];
  /** embudo de WhatsApp (COD): vendedor, orderbumps y los 10 mensajes por país. Se llena en la sección Mensajes. */
  embudo: EmbudoWhatsApp | null;
  creadoEn: string;
  actualizadoEn: string;
}

/** Crea un producto borrador con todos los campos inicializados. */
export function crearProductoBorrador(parcial: Partial<Producto> = {}): Producto {
  return {
    id: "",
    nombre: "",
    identidad: { promesa: "", posicionamiento: "", dirigidoA: "" },
    productoId: "",
    anunciosReferencia: [],
    queVendemos: "",
    analisisAnuncios: null,
    oferta: null,
    guionesAnuncios: [],
    guionEmbudo: null,
    ebook: ebookVacio(),
    videos: [],
    embudo: null,
    creadoEn: "",
    actualizadoEn: "",
    ...parcial,
  };
}
