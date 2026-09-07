// Tipos del editor de Embudos (CRUD sobre Supabase). Reflejan el esquema de
// apps/web/lib/embudos/schema.sql (modelo Número vs Producto).

/** Países que maneja un producto/embudo. */
export const PAISES_EMBUDO_BOT = ["CO", "PE", "EC", "CL", "VE"] as const;
export type PaisBot = (typeof PAISES_EMBUDO_BOT)[number];

export const NOMBRE_PAIS: Record<string, string> = {
  CO: "Colombia",
  PE: "Perú",
  EC: "Ecuador",
  CL: "Chile",
  VE: "Venezuela",
};

/** `numeros` — lo estático de un número de WhatsApp. Una fila por número. */
export interface NumeroBot {
  phone_id: string;
  numero_whatsapp: string;
  waba_id: string;
  capi_token: string;
  account_id: string;
  credencial_wa: string;
  pais: string;
  /** apuntador: qué producto vende HOY este número (clave `producto`) */
  producto_activo: string;
  actualizado_at?: string;
}

export function numeroBotVacio(): NumeroBot {
  return {
    phone_id: "",
    numero_whatsapp: "",
    waba_id: "",
    capi_token: "",
    account_id: "",
    credencial_wa: "",
    pais: "CO",
    producto_activo: "",
  };
}

/** Campos técnicos del número que se muestran como sensibles (tipo password). */
export const NUMERO_CAMPOS_SENSIBLES: (keyof NumeroBot)[] = ["capi_token"];

/** `productos` — lo variable por (producto, pais). Se usará en la fase de edición del bot. */
export interface ProductoBot {
  producto: string;
  pais: string;
  pixel_id: string;
  page_id: string;
  msg_bienvenida: string;
  msg_cobro: string;
  msg_bonos_intro: string;
  msg_datos_pago: string;
  msg_felicitacion: string;
  system_prompt_convencer: string;
  system_prompt_cobrar: string;
  titular_cuenta: string;
  numero_cuenta: string;
  metodo_pago: string;
  metodos_pago_texto: string;
  brec_alias: string;
  moneda: string;
  moneda_simbolo: string;
  precio_base: number | null;
  validacion_titular: string;
  validacion_cuenta_hint: string;
  validacion_alias: string;
  actualizado_at?: string;
}

/** `mensajes_rotador` — variantes anti-spam de un mensaje (por producto, país-agnóstico). */
export interface RotadorRow {
  producto: string;
  campo: string;
  variante: number;
  texto: string;
}

/** `pasos_embudo` — un paso de la secuencia del embudo. */
export interface PasoEmbudo {
  producto: string;
  estado: string;
  orden: number;
  tipo: string;
  contenido: string;
  fuente: string;
  delay_segundos: number;
}

export const ESTADOS_EMBUDO = ["MENU", "VIDEO", "CONFIRMACION", "ENTREGA", "STOP"] as const;
export const TIPOS_PASO = ["mensaje", "video", "pdf", "boton", "etiqueta", "wait"] as const;
export const FUENTES_PASO = ["config", "media", "rotador", "directo"] as const;

/** Descripción corta de cada estado (para la UI del editor de embudo). */
export const ESTADO_INFO: Record<string, string> = {
  MENU: "Primer contacto → menú de bienvenida (rotado) → etiqueta menu_enviado.",
  VIDEO: "Video (con caption) → mensaje con BOTÓN → etiqueta bienvenida.",
  CONFIRMACION: "Tras el botón → “escribe SI RECIBIR” → etiqueta contenido_solicitado.",
  ENTREGA: "Etiqueta contenido_enviado (candado) → PDFs → link bonos → cobro → datos de pago.",
  STOP: "“No te escribo más” → etiqueta stop.",
};

