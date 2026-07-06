// ─────────────────────────────────────────────────────────────
// Esquema central de configuración.
// Única fuente de verdad para la sección "Configuración" del shell
// y para generar el .env de cada servicio (dashboard, extractor).
//
// Al agregar una nueva app/sección en el futuro:
//   1. Añade un objeto a CONFIG_GROUPS con sus campos.
//   2. (Si es un servicio) define su `envTarget` para el .env generado.
//   3. (Opcional) agrúpalo visualmente con `section`.
// ─────────────────────────────────────────────────────────────

export type FieldType = "text" | "password" | "number" | "url" | "select" | "textarea";

export interface ConfigField {
  /** clave canónica dentro del grupo, ej. "openai_api_key" */
  key: string;
  /** etiqueta visible en la UI */
  label: string;
  type: FieldType;
  /** nombre de la variable que el servicio espera en su .env, ej. "OPENAI_API_KEY" */
  envName?: string;
  placeholder?: string;
  help?: string;
  /** opciones para type:"select"; el primero es el valor por defecto */
  options?: string[];
}

export interface ConfigGroup {
  id: string;
  title: string;
  /** ruta del servicio cuyo .env se genera con este grupo (relativa al monorepo). null = solo se guarda */
  envTarget: string | null;
  /** encabezado de sección para agrupar tarjetas relacionadas en la UI */
  section?: string;
  /** texto de ayuda que se muestra bajo el título del grupo */
  note?: string;
  fields: ConfigField[];
}

export const CONFIG_GROUPS: ConfigGroup[] = [
  // ── Compartidas ────────────────────────────────────────────────
  {
    id: "compartidas",
    title: "Compartidas",
    section: "General",
    envTarget: null,
    fields: [
      {
        key: "openai_api_key",
        label: "OpenAI API Key",
        type: "password",
        envName: "OPENAI_API_KEY",
        placeholder: "sk-...",
        help: "La usan Dashboard ads y Extractor si dejan la suya vacía.",
      },
    ],
  },

  // ── Dashboard ads ──────────────────────────────────────────────
  {
    id: "dashboard",
    title: "Dashboard ads",
    section: "Dashboard ads",
    envTarget: "apps/dashboard-service/.env",
    fields: [
      { key: "fb_token_1", label: "Facebook Token 1", type: "password", envName: "FB_TOKEN_1" },
      { key: "fb_label_1", label: "Facebook Label 1", type: "text", envName: "FB_LABEL_1" },
      { key: "fb_token_2", label: "Facebook Token 2", type: "password", envName: "FB_TOKEN_2" },
      { key: "fb_label_2", label: "Facebook Label 2", type: "text", envName: "FB_LABEL_2" },
      { key: "supabase_url", label: "Supabase URL", type: "url", envName: "SUPABASE_URL" },
      { key: "supabase_key", label: "Supabase Key (anon)", type: "password", envName: "SUPABASE_KEY" },
      { key: "supabase_service_key", label: "Supabase Service Key", type: "password", envName: "SUPABASE_SERVICE_KEY" },
      { key: "sales_table", label: "Tabla de ventas", type: "text", envName: "SALES_TABLE", placeholder: "compradores" },
      { key: "contacts_table", label: "Tabla de contactos", type: "text", envName: "CONTACTS_TABLE", placeholder: "contactos" },
      { key: "anuncios_table", label: "Tabla de anuncios", type: "text", envName: "ANUNCIOS_TABLE", placeholder: "anuncios" },
      { key: "usd_to_cop", label: "USD → COP", type: "number", envName: "USD_TO_COP", placeholder: "4000" },
      { key: "mxn_to_cop", label: "MXN → COP", type: "number", envName: "MXN_TO_COP", placeholder: "200" },
      { key: "pen_to_cop", label: "PEN → COP", type: "number", envName: "PEN_TO_COP", placeholder: "1080" },
      { key: "clp_to_cop", label: "CLP → COP", type: "number", envName: "CLP_TO_COP", placeholder: "4.5" },
    ],
  },

  // ── Editor de videos (antes "Extractor"; id/envTarget internos intactos) ──
  {
    id: "extractor",
    title: "Editor de videos",
    section: "Editor de videos",
    envTarget: "apps/extractor-service/.env",
    note: "OpenAI es obligatorio (transcripción + análisis). ElevenLabs solo para voz. Groq/Gemini no se usan hoy.",
    fields: [
      {
        key: "openai_api_key",
        label: "OpenAI API Key (requerido)",
        type: "password",
        envName: "OPENAI_API_KEY",
        help: "Obligatorio: la transcripción (Whisper) y el análisis de ganchos usan OpenAI. Déjalo vacío solo si pusiste la key en Compartidas.",
      },
      { key: "elevenlabs_api_key", label: "ElevenLabs API Key", type: "password", envName: "ELEVENLABS_API_KEY", help: "Opcional. Solo para generar voz (TTS)." },
      { key: "groq_api_key", label: "Groq API Key", type: "password", envName: "GROQ_API_KEY", help: "Reservado — no se usa hoy. Puedes dejarlo vacío." },
      { key: "gemini_api_key", label: "Gemini API Key", type: "password", envName: "GEMINI_API_KEY", help: "Reservado — no se usa hoy. Puedes dejarlo vacío." },
      { key: "whatsapp_link", label: "WhatsApp link (CTA)", type: "url", envName: "WHATSAPP_LINK" },
      { key: "port", label: "Puerto del servicio", type: "number", envName: "PORT", placeholder: "8000", help: "Déjalo en 8000. Cambiarlo rompe el embed a menos que ajustes NEXT_PUBLIC_EXTRACTOR_URL." },
    ],
  },

  // ── Ebooks (EbookForge) ────────────────────────────────────────
  // Motor determinista (sin IA). Solo necesita su puerto para el embed.
  {
    id: "ebooks",
    title: "Ebooks",
    section: "Ebooks",
    envTarget: "apps/ebookforge-service/.env",
    note: "Generador de ebooks (PDF) local y determinista. No usa API keys.",
    fields: [
      { key: "port", label: "Puerto del servicio", type: "number", envName: "PORT", placeholder: "8600", help: "Déjalo en 8600. Cambiarlo rompe el embed a menos que ajustes NEXT_PUBLIC_EBOOKFORGE_URL." },
    ],
  },

  // ── Generación con IA (imágenes y texto) ───────────────────────
  // envTarget null: lo consume el shell vía readConfig() (API routes de
  // /api/generate y /api/images), no un servicio Python.
  {
    id: "ia",
    title: "Generación con IA",
    section: "Generación con IA",
    envTarget: null,
    note: "Gemini genera las imágenes y, por defecto, también el texto. La key de OpenAI vive en «Compartidas» y se reutiliza si eliges OpenAI como proveedor de texto.",
    fields: [
      { key: "gemini_api_key", label: "Gemini API Key", type: "password", help: "Con acceso a generación de imágenes." },
      { key: "text_provider", label: "Proveedor de texto", type: "select", options: ["Gemini", "OpenAI"], help: "Quién redacta los mensajes. Default: Gemini." },
      {
        key: "image_estilo",
        label: "Estilo y calidad de las imágenes (prompt)",
        type: "textarea",
        help: "Se añade a CADA prompt de imagen para fijar estilo, calidad y formato. Déjalo vacío para usar el estilo por defecto.",
        placeholder:
          "Fotografía/gráfico publicitario de alta conversión, 1080×1080, colores vibrantes, alto contraste, iluminación profesional, optimizado para celular, SIN texto, sin logos, sin marcas de agua.",
      },
    ],
  },

  // ── Servidor de imágenes (VPS) ─────────────────────────────────
  {
    id: "vps",
    title: "Servidor de imágenes (VPS)",
    section: "Generación con IA",
    envTarget: null,
    note: "Adonde se suben las imágenes generadas por SFTP. El link público final = URL base + nombre de archivo.",
    fields: [
      { key: "vps_host", label: "Host", type: "text", placeholder: "cdn.midominio.com o IP", help: "IP o dominio del VPS." },
      { key: "vps_port", label: "Puerto", type: "number", placeholder: "22", help: "Puerto SSH/SFTP. Default 22." },
      { key: "vps_user", label: "Usuario", type: "text", help: "Usuario SSH/SFTP." },
      { key: "vps_auth", label: "Clave privada (ruta) o contraseña", type: "password", help: "Prefiere una ruta a clave privada." },
      { key: "vps_remote_dir", label: "Directorio remoto público", type: "text", placeholder: "/var/www/html/img/productos" },
      { key: "vps_public_base_url", label: "URL pública base", type: "text", placeholder: "https://cdn.midominio.com/img/productos" },
    ],
  },

  // ── Creador de Flujos: datos de emisión (no por país) ──────────
  // El motor resuelve estos tokens ([CATEGORIA_PRODUCTO], [DRIVE_CONTENIDO_PRODUCTO],
  // [FORMS_GLE_COMPRADORES_*]…). Los formularios: un solo valor sirve para todos
  // los países (el motor colapsa los sufijos _PE/_CO al mismo campo).
  {
    id: "flujos_general",
    title: "Creador de Flujos — datos de emisión",
    section: "Creador de Flujos",
    envTarget: null,
    note: "Valores que el emisor inyecta en el workflow (no dependen del país).",
    fields: [
      { key: "categoria_producto", label: "Categoría del producto", type: "text", placeholder: "neveras" },
      { key: "descripcion_corta", label: "Descripción corta", type: "text" },
      { key: "drive_contenido", label: "Drive de contenido (entrega)", type: "url" },
      { key: "forms_compradores", label: "Formulario compradores (Google Forms)", type: "url" },
      { key: "forms_salida", label: "Formulario salida / no compradores", type: "url" },
    ],
  },

  // ── Creador de Flujos: base por país ───────────────────────────
  // Estos grupos NO generan .env. Los consume el puente del navegador
  // (apps/web/public/tools/flujos/bridge.js), que inyecta estos valores
  // en la app de flujos según el país seleccionado.
  ...flujosPais("flujos_pe", "🇵🇪 Perú"),
  ...flujosPais("flujos_cl", "🇨🇱 Chile"),
  ...flujosPais("flujos_co", "🇨🇴 Colombia"),
];

/** Genera un grupo de configuración base para un país del Creador de Flujos. */
function flujosPais(id: string, title: string): ConfigGroup[] {
  return [
    {
      id,
      title: `Creador de Flujos — ${title}`,
      section: "Creador de Flujos — por país",
      envTarget: null,
      fields: [
        { key: "capi_token", label: "Token Facebook Graph / CAPI", type: "password", help: "El token de Meta para este país (CAPI + envío de WhatsApp)." },
        { key: "chatwoot_token", label: "Token de Chatwoot", type: "password" },
        { key: "pixel_id", label: "Píxel ID", type: "text", help: "Píxel de Meta para este país. Si lo dejas vacío, la app usa el de la categoría." },
        { key: "phone_id", label: "Phone ID (WhatsApp)", type: "text" },
        { key: "account_id", label: "Account ID (Chatwoot)", type: "text" },
        { key: "page_id", label: "Page ID", type: "text" },
      ],
    },
  ];
}

/** Estado guardado: { [groupId]: { [fieldKey]: value } } */
export type ConfigStore = Record<string, Record<string, string>>;
