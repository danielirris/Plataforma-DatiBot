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

/** Secciones de la investigación de avatar (con las preguntas exactas para la IA). */
export const AVATAR_SECCIONES: { key: string; label: string; pregunta: string }[] = [
  {
    key: "compradores",
    label: "Quiénes compran",
    pregunta:
      "¿Quiénes son las personas más probables de comprar esto? Descríbelas con detalle.",
  },
  {
    key: "deseos",
    label: "Deseos",
    pregunta: "¿Cuáles son sus deseos más profundos relacionados con esto?",
  },
  {
    key: "demografia",
    label: "Demografía y psicografía",
    pregunta:
      "¿Quién es exactamente el cliente (edad, género, ocupación)? ¿Qué actitudes políticas, religiosas o sociales tienen? ¿Cuáles son sus mayores esperanzas y sueños? ¿Sus mayores victorias y fracasos? ¿Qué fuerzas externas creen que les han impedido ser felices o mejorar? ¿Cuáles son sus prejuicios y creencias inamovibles sobre la vida, el amor y la familia? Termina con una síntesis de 1 a 3 frases.",
  },
  {
    key: "otras_soluciones",
    label: "Otras soluciones existentes",
    pregunta:
      "¿Qué otras soluciones usa ya el mercado para este problema (lista)? ¿Qué les gusta y qué les disgusta de esas alternativas? ¿Tienen historias de terror o malas experiencias? ¿Creen realmente que funcionan? Si no, ¿por qué?",
  },
  {
    key: "curiosidad",
    label: "Curiosidad y autoridad",
    pregunta:
      "¿Alguien ha intentado resolver esto de una manera muy original y con qué resultado? ¿Existe una historia de 'conspiración' de por qué las soluciones tradicionales no funcionan? ¿Hay algún dato histórico, estudio o descubrimiento poco conocido que valide este enfoque?",
  },
  {
    key: "mecanismo_unico",
    label: "Mecanismo único",
    pregunta:
      "¿Cuál es la causa raíz o el 'enemigo oculto' del problema del cliente? ¿Por qué este producto/método funciona de manera diferente a todo lo demás? ¿Cuál es el Mecanismo Único que hace que sea la única solución que realmente tiene sentido?",
  },
];

export interface FuenteAvatar {
  titulo: string;
  url: string;
}

/** Objeciones de COMPRA: qué frena al cliente al momento de pagar. */
export const CATEGORIAS_OBJECION_COMPRA = [
  "precio",
  "confianza",
  "logistica",
  "autenticidad",
  "garantia",
  "necesidad",
  "otro",
] as const;
export type CategoriaObjecionCompra =
  (typeof CATEGORIAS_OBJECION_COMPRA)[number];

/** Objeciones de USO: qué frena al cliente DESPUÉS de comprar (usar/mantener). */
export const CATEGORIAS_OBJECION_USO = [
  "dificultad",
  "tiempo",
  "mantenimiento",
  "riesgo_de_fallar",
  "no_soy_capaz",
  "efectos_secundarios",
  "otro",
] as const;
export type CategoriaObjecionUso = (typeof CATEGORIAS_OBJECION_USO)[number];

export interface ObjecionCompra {
  objecion: string;
  categoria: CategoriaObjecionCompra;
  respuesta_sugerida: string;
}
export interface ObjecionUso {
  objecion: string;
  categoria: CategoriaObjecionUso;
  respuesta_sugerida: string;
}

export interface Avatar {
  compradores: string;
  deseos: string;
  demografia: string;
  otras_soluciones: string;
  curiosidad: string;
  mecanismo_unico: string;
  /** qué frena al cliente al momento de pagar (5-8) */
  objeciones_compra: ObjecionCompra[];
  /** qué frena al cliente al usar/mantener el producto tras comprar (5-8) */
  objeciones_uso: ObjecionUso[];
  /** fuentes web usadas por el grounding de Gemini */
  fuentes: FuenteAvatar[];
}

/** Catálogo de tipos de ángulo publicitario (vector psicológico). */
export const TIPOS_ANGULO = [
  "DOLOR_AGUDO",
  "RESULTADO_SOÑADO",
  "MIEDO_OCULTO",
  "AUTORIDAD_RESPALDO",
  "PRUEBA_SOCIAL",
  "CONSPIRACION_SECRETO",
  "MECANISMO_UNICO",
  "CONTRA_SOLUCIONES_FALLIDAS",
  "IDENTIDAD_ASPIRACION",
  "ATAJO_HACK",
  "VERGUENZA_SOCIAL",
  "URGENCIA_VENTANA",
  "NEGOCIO_EMPRENDER",
] as const;
export type TipoAngulo = (typeof TIPOS_ANGULO)[number];

/** Cuántos ángulos exige el producto. */
export const NUM_ANGULOS = 6;

/** Mecanismos psicológicos del banco de ganchos (data/ganchos_base.json). */
export const MECANISMOS_GANCHO = [
  "NOVEDAD_HACK",
  "GENERAL",
  "CURIOSIDAD_SECRETO",
  "DOLOR_PROBLEMA",
  "AUTORIDAD_CREDENCIAL",
  "SORPRESA_REVELACION",
  "CONTROVERSIA_OPINION",
  "RELATABILIDAD_IDENTIFICACION",
  "URGENCIA_FOMO",
  "ADVERTENCIA_MIEDO",
  "TRANSFORMACION_ANTES_DESPUES",
  "PRUEBA_SOCIAL",
] as const;
export type MecanismoGancho = (typeof MECANISMOS_GANCHO)[number];

/** Cuántos ganchos por ángulo. */
export const NUM_GANCHOS = 3;

/** Un GANCHO: los 2 primeros segundos de un anuncio (intro/titular). */
export interface Gancho {
  texto: string;
  mecanismo: MecanismoGancho;
  /** opcional: plantilla del banco que sirvió de semilla */
  plantilla_origen?: string;
  por_que_funciona: string;
}

/**
 * Un ÁNGULO es el encuadre emocional/argumental desde el que se vende el
 * producto. NO es una feature: es una entrada psicológica al deseo/dolor.
 */
export interface Angulo {
  id: string;
  nombre: string;
  tipo: TipoAngulo;
  promesa_central: string;
  gran_idea: string;
  publico_objetivo_del_angulo: string;
  emocion_dominante: string;
  dolor_o_deseo_atacado: string;
  prueba_o_evidencia: string;
  /** 3 ganchos ganadores (se rellenan en el paso de ganchos) */
  hooks: Gancho[];
}

/**
 * Ranuras de mensaje del embudo que redacta la IA (coinciden con los campos del
 * nodo ⚙️ CONFIGURAR del motor n8n). El copy va en español neutral y DEJA
 * INTACTOS los tokens del motor ([PRECIO_BASE], [NUMERO_PAGO], …) que se
 * rellenan por país al emitir.
 */
export const RANURAS_MENSAJE: { key: string; descripcion: string }[] = [
  { key: "mensaje_1", descripcion: "Gancho inicial: golpea el problema/dolor y promete la solución." },
  { key: "mensaje_2", descripcion: "Transformación: pinta el antes→después y los beneficios." },
  { key: "mensaje_3", descripcion: "Lista '¿Qué recibes?' con checks ✅ de lo incluido." },
  { key: "mensaje_4", descripcion: "Bonos de hoy: lista de bonos con emojis y su valor." },
  { key: "mensaje_5", descripcion: "Cómo funciona + retorno de inversión. Usa [PRECIO_BASE] si mencionas precio." },
  { key: "mensaje_6", descripcion: "Bono extra por urgencia ('solo por hoy')." },
  { key: "mensaje_7", descripcion: "Precio: valor tachado y final. Usa [PRECIO_TACHADO] y [PRECIO_BASE]." },
  { key: "mensaje_8_botones", descripcion: "Invita a elegir método de pago (previo a los botones)." },
  { key: "mensaje_rmk_15m", descripcion: "Remarketing a los 15 min: recordatorio suave." },
  { key: "mensaje_rmk_60m", descripcion: "Remarketing a los 60 min: escasez media." },
  { key: "mensaje_rmk_180m", descripcion: "Remarketing a los 180 min: última llamada, urgencia fuerte." },
  { key: "ob_mensaje_oferta", descripcion: "Oferta del Orderbump: propone el extra. Puedes usar [PRECIO_ADICIONAL_OB]." },
  { key: "ob_mensaje_si", descripcion: "Confirmación cuando el cliente acepta el Orderbump." },
  { key: "ob_mensaje_no", descripcion: "Confirmación cuando el cliente rechaza el Orderbump." },
];

/**
 * Precios por producto y país. Son los que el motor mapea a sus tokens
 * ([PRECIO_BASE], [PRECIO_TACHADO], [PRECIO_ADICIONAL_OB], [PRECIO_RMK_*]).
 * El combo y el regateo los DERIVA el motor; no se guardan aquí.
 */
export interface PreciosPais {
  base: string;
  tachado: string;
  adicional_ob: string;
  /** precio "normal" del orderbump (si se vende suelto) */
  normal_ob: string;
  rmk_15m: string;
  rmk_60m: string;
  rmk_180m: string;
}

export interface EmisionRegistro {
  pais: string;
  fecha: string;
}

// ── OFERTA (Grand Slam Offer del embudo) ───────────────────────
export interface ProductoPrincipalOferta {
  titulo: string;
  descripcion_corta: string;
  que_incluye: string[];
  /** valor percibido en TEXTO comparativo, no en dinero */
  valor_percibido_texto: string;
}
export interface BonoOferta {
  titulo: string;
  descripcion_corta: string;
  por_que_lo_incluyo: string;
  /** objeción del avatar (compra o uso) que este bono desactiva */
  objecion_que_desactiva: string;
  valor_percibido_texto: string;
}
export interface Oferta {
  nombre_oferta: string;
  promesa_grande: string;
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

export function bonoVacio(): BonoOferta {
  return {
    titulo: "",
    descripcion_corta: "",
    por_que_lo_incluyo: "",
    objecion_que_desactiva: "",
    valor_percibido_texto: "",
  };
}
export function ofertaVacia(): Oferta {
  return {
    nombre_oferta: "",
    promesa_grande: "",
    producto_principal: {
      titulo: "",
      descripcion_corta: "",
      que_incluye: [""],
      valor_percibido_texto: "",
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
  /** investigación de avatar (grounding web con Gemini) */
  avatar: Avatar;
  /** 6 ángulos publicitarios (encuadres para vender el mismo producto) */
  angulos: Angulo[];
  /** paquete de venta (Grand Slam Offer); null hasta que se genera */
  oferta: Oferta | null;
  /** ebook del producto (se crea por fases desde la oferta) */
  ebook: EbookProducto;
  /** videos largos adjuntos (materia prima para editar los anuncios) */
  videos: VideoProducto[];
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
    avatar: {
      compradores: "",
      deseos: "",
      demografia: "",
      otras_soluciones: "",
      curiosidad: "",
      mecanismo_unico: "",
      objeciones_compra: [],
      objeciones_uso: [],
      fuentes: [],
    },
    angulos: [],
    oferta: null,
    ebook: ebookVacio(),
    videos: [],
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
