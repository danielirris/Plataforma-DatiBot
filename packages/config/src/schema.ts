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

export type FieldType = "text" | "password" | "number" | "url";

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

  // ── Extractor ──────────────────────────────────────────────────
  {
    id: "extractor",
    title: "Extractor",
    section: "Extractor",
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

  // ── Creador de Flujos: base por país ───────────────────────────
  // Estos grupos NO generan .env. Los consume el puente del navegador
  // (apps/web/public/tools/flujos/bridge.js), que inyecta estos valores
  // en la app de flujos según el país seleccionado.
  ...flujosPais("flujos_pe", "🇵🇪 Perú"),
  ...flujosPais("flujos_cl", "🇨🇱 Chile"),
  ...flujosPais("flujos_co", "🇨🇴 Colombia"),
  {
    id: "flujos_pixels",
    title: "Creador de Flujos — Píxeles (por categoría)",
    section: "Creador de Flujos",
    envTarget: null,
    note: "El píxel de Meta va por categoría, no por país.",
    fields: [
      { key: "hombres", label: "Píxel — categoría hombres", type: "text", placeholder: "923766937348701" },
      { key: "mujeres", label: "Píxel — categoría mujeres", type: "text" },
    ],
  },
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
        { key: "phone_id", label: "Phone ID (WhatsApp)", type: "text" },
        { key: "account_id", label: "Account ID (Chatwoot)", type: "text" },
        { key: "page_id", label: "Page ID", type: "text" },
      ],
    },
  ];
}

/** Estado guardado: { [groupId]: { [fieldKey]: value } } */
export type ConfigStore = Record<string, Record<string, string>>;
