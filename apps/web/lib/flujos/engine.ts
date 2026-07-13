import type { Producto } from "@plataforma/products";
import motor from "./motor.cjs";
import largo from "./templates/largo.json";
import corto from "./templates/corto.json";
import cod from "./templates/cod.json";

// Envuelve el motor n8n (EmbudoMotor) como librería. NO reescribe el motor:
// lo alimenta con datos del PRODUCTO (portátil) y del PAÍS (config).
//
// El motor original vive en apps/web/lib/flujos/motor.cjs (copia del generador,
// intacto). generate(template, spec, opts) devuelve { workflow, ok, warnings,
// unresolved, ... }.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const M: any = motor;

const TEMPLATES: Record<string, unknown> = { largo, corto, cod };

export type TipoEmbudo = "largo" | "corto" | "cod";

export interface EmitirParams {
  producto: Producto;
  pais: string;
  tipo: TipoEmbudo;
  usarOrderbump: boolean;
  /** grupo flujos_XX de la config del país: capi_token, pixel_id, phone_id, … */
  countryConfig: Record<string, string>;
  /** grupo flujos_general: categoría, descripción, drive, formularios (no por país) */
  generalConfig?: Record<string, string>;
}

export interface ResultadoEmision {
  workflow: unknown;
  ok: boolean;
  warnings: string[];
  unresolved: string[];
  secretsMissing?: string[];
}

export function tiposDisponibles(): TipoEmbudo[] {
  return ["largo", "corto", "cod"];
}

// Lista de bonos para [LISTA_DE_BONOS], derivada de la oferta del producto.
function listaBonos(producto: Producto): string {
  const bonos = producto.oferta?.bonos ?? [];
  return bonos
    .map((b) => (b?.titulo ?? "").trim())
    .filter(Boolean)
    .map((t) => `✅ ${t}`)
    .join("\n");
}

// Base pública de las imágenes para [URL_BASE_IMAGENES_PRODUCTO]: la carpeta
// (sin el archivo) de la primera imagen del producto que exista.
function baseImagenes(producto: Producto): string {
  const img = producto.imagenes ?? ({} as Producto["imagenes"]);
  const alguna = Object.values(img).find((u) => typeof u === "string" && u.startsWith("http"));
  if (!alguna) return "";
  const i = alguna.lastIndexOf("/");
  return i > "https://".length ? alguna.slice(0, i) : alguna;
}

export function emitir({
  producto,
  pais,
  tipo,
  usarOrderbump,
  countryConfig,
  generalConfig = {},
}: EmitirParams): ResultadoEmision {
  const template = TEMPLATES[tipo];
  if (!template) throw new Error(`No hay plantilla para el tipo "${tipo}".`);

  const precios = producto.precios?.[pais] ?? {
    base: "",
    tachado: "",
    adicional_ob: "",
    normal_ob: "",
    rmk_15m: "",
    rmk_60m: "",
    rmk_180m: "",
  };

  // spec: datos que el motor resuelve como tokens [PRECIO_*], [NOMBRE_PRODUCTO]…
  const spec: Record<string, unknown> = {
    pais,
    tipo,
    nombre_producto: producto.nombre,
    producto_nombre: producto.nombre,
    // datos fijos por país (desde la config del shell)
    pixel: countryConfig.pixel_id || undefined,
    page_id: countryConfig.page_id || undefined,
    phone_id: countryConfig.phone_id || undefined,
    account_id: countryConfig.account_id || undefined,
    // precios por producto×país
    precio_base: precios.base,
    precio_tachado: precios.tachado,
    precio_adicional_ob: precios.adicional_ob,
    precio_rmk_15m: precios.rmk_15m,
    precio_rmk_60m: precios.rmk_60m,
    precio_rmk_180m: precios.rmk_180m,
    // datos de emisión de Creador de Flujos (no por país)
    categoria_producto: generalConfig.categoria_producto || undefined,
    descripcion_corta: generalConfig.descripcion_corta || producto.identidad?.promesa || undefined,
    industria: generalConfig.industria_del_producto || undefined,
    marcas: generalConfig.marcas_comunes || undefined,
    nombre_orderbump: generalConfig.nombre_orderbump || undefined,
    emoji: generalConfig.emoji_producto || undefined,
    precio_normal_ob: precios.normal_ob || undefined,
    drive_contenido: generalConfig.drive_contenido || undefined,
    forms_compradores: generalConfig.forms_compradores || undefined,
    forms_salida: generalConfig.forms_salida || undefined,
    // derivados del propio producto (Grupo 3 cableado)
    lista_bonos: listaBonos(producto) || undefined,
    lista_beneficios_ob: listaBonos(producto) || undefined,
    url_base_imagenes: baseImagenes(producto) || undefined,
  };

  // fieldValues (Capa 1): mensajes + links de imágenes. Vacío NO sobrescribe.
  const img = producto.imagenes ?? ({} as Producto["imagenes"]);
  const fieldValues: Record<string, string> = {
    ...producto.mensajes,
    imagen_producto_url: img.contenido,
    imagen_bonos_url: img.bonos,
    imagen_bono_rapido_url: img.bono_accion_rapida,
    imagen_rmk_15m_url: img.remarketing_60, // reusa la de 60 (decisión acordada)
    imagen_rmk_60m_url: img.remarketing_60,
    imagen_rmk_180m_url: img.remarketing_180,
    ob_imagen_url: img.bono_accion_rapida,
  };

  const opts = {
    fieldValues,
    secrets: {
      graph: countryConfig.capi_token || "",
      chatwoot: countryConfig.chatwoot_token || "",
      supabase: "",
      telegram: "",
    },
    pagos: [],
    labels: {},
  };

  const res = M.generate(template, spec, opts);
  const workflow = res.workflow;

  // Orderbump = No → el nodo queda presente pero DESACTIVADO (disabled) en n8n,
  // así se omite del recorrido sin eliminarlo.
  if (!usarOrderbump && workflow && Array.isArray(workflow.nodes)) {
    for (const node of workflow.nodes) {
      if ((node?.name || "").indexOf("Orderbump") !== -1) node.disabled = true;
    }
  }

  return {
    workflow,
    ok: !!res.ok,
    warnings: res.warnings ?? [],
    unresolved: res.unresolved ?? [],
    secretsMissing: res.secretsMissing ?? [],
  };
}
