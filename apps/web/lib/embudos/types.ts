// Tipos del editor de Embudos (CRUD sobre Supabase). Reflejan el esquema de
// apps/web/lib/embudos/schema.sql (modelo Número vs Producto).
import { PAISES_EMBUDO } from "@/lib/embudo/paises";

/** Países que maneja un producto/embudo. */
export const PAISES_EMBUDO_BOT = ["CO", "PE", "EC", "CL", "VE"] as const;
export type PaisBot = (typeof PAISES_EMBUDO_BOT)[number];

/** Mapa código→nombre, DERIVADO del único catálogo con datos (PAISES_EMBUDO), para no
 * duplicar los nombres de país en dos sitios. */
export const NOMBRE_PAIS: Record<string, string> = Object.fromEntries(
  PAISES_EMBUDO.map((p) => [p.codigo, p.nombre]),
);

/** `numeros` — lo estático de un número de WhatsApp. Una fila por número. */
export interface NumeroBot {
  phone_id: string;
  /** nombre para identificar la cuenta publicitaria (solo para la app) */
  nombre: string;
  numero_whatsapp: string;
  waba_id: string;
  capi_token: string;
  account_id: string;
  credencial_wa: string;
  /** Referencia del dueño (Facebook): a qué cuenta publicitaria / perfil / app
   * pertenece este número. Texto libre, solo para verlo de un vistazo. */
  cuenta_publicitaria: string;
  perfil: string;
  aplicacion: string;
  pais: string;
  /** apuntador: qué producto vende HOY este número (clave `producto`) */
  producto_activo: string;
  actualizado_at?: string;
  /** solo-cliente: indica si hay capi_token guardado (el valor NO viaja al navegador) */
  capi_token_set?: boolean;
}

export function numeroBotVacio(): NumeroBot {
  return {
    phone_id: "",
    nombre: "",
    numero_whatsapp: "",
    waba_id: "",
    capi_token: "",
    account_id: "",
    credencial_wa: "",
    cuenta_publicitaria: "",
    perfil: "",
    aplicacion: "",
    pais: "",
    producto_activo: "",
  };
}

/** Config del bot por (producto, pais). Se lee/escribe en la tabla `config_bots` de
 * Supabase (NO en `productos`, que es el catálogo de precios). El nombre del tipo se
 * conserva por compatibilidad. */
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
  // Niveles de entrega: monto MÍNIMO del rango por país (numérico) + mensaje que se envía
  // si el pago cae en ese nivel (texto, IGUAL para todos los países). Nivel vacío = ignorado.
  nivel_1_min: number | null;
  nivel_1_texto: string;
  nivel_2_min: number | null;
  nivel_2_texto: string;
  nivel_3_min: number | null;
  nivel_3_texto: string;
  nivel_4_min: number | null;
  nivel_4_texto: string;
  nivel_5_min: number | null;
  nivel_5_texto: string;
  nivel_6_min: number | null;
  nivel_6_texto: string;
  nivel_7_min: number | null;
  nivel_7_texto: string;
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

// Los 3 estados FINALES del embudo. Sus nombres = las etiquetas que deja (en minúscula):
// el motor decide qué estado correr según la etiqueta que ya tiene el cliente. Cada estado
// termina (o empieza) con su bloque `etiqueta` del mismo nombre. La etiqueta `comprador`
// (al pagar) no tiene estado: con ella el bot se calla.
export const ESTADOS_EMBUDO = ["bienvenida", "contenido_solicitado", "contenido_enviado"] as const;

/** Descripción corta de cada estado (para la UI del editor de embudo). */
export const ESTADO_INFO: Record<string, string> = {
  bienvenida:
    "Primer contacto (sin etiqueta): bienvenida (ROTA) → video con caption → botón «Recibir material» (ROTA) → deja etiqueta bienvenida.",
  contenido_solicitado:
    "Ya tiene «bienvenida» y pidió el material: botón «Quiero recibirlo» (ROTA) → deja etiqueta contenido_solicitado.",
  contenido_enviado:
    "Ya tiene «contenido_solicitado»: etiqueta contenido_enviado PRIMERO (candado anti-reenvío) → PDF(s) → link a bonos → Cobro #1 (precios) → Cobro #2 (datos de pago).",
};

