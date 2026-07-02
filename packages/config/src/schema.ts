// ─────────────────────────────────────────────────────────────
// Esquema central de configuración.
// Única fuente de verdad para la sección "Configuración" del shell
// y para generar el .env de cada servicio (dashboard, extractor).
//
// Al agregar una nueva app/sección en el futuro:
//   1. Añade un objeto a CONFIG_GROUPS con sus campos.
//   2. (Si es un servicio) define su `envTarget` para el .env generado.
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
  fields: ConfigField[];
}

export const CONFIG_GROUPS: ConfigGroup[] = [
  {
    id: "compartidas",
    title: "Compartidas",
    envTarget: null,
    fields: [
      {
        key: "openai_api_key",
        label: "OpenAI API Key",
        type: "password",
        envName: "OPENAI_API_KEY",
        placeholder: "sk-...",
        help: "Se usa por Dashboard ads y Extractor si comparten cuenta.",
      },
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard ads",
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
  {
    id: "extractor",
    title: "Extractor",
    envTarget: "apps/extractor-service/.env",
    fields: [
      { key: "openai_api_key", label: "OpenAI API Key", type: "password", envName: "OPENAI_API_KEY", help: "Déjalo vacío para usar la compartida." },
      { key: "elevenlabs_api_key", label: "ElevenLabs API Key", type: "password", envName: "ELEVENLABS_API_KEY" },
      { key: "groq_api_key", label: "Groq API Key", type: "password", envName: "GROQ_API_KEY" },
      { key: "gemini_api_key", label: "Gemini API Key", type: "password", envName: "GEMINI_API_KEY" },
      { key: "whatsapp_link", label: "WhatsApp link (CTA)", type: "url", envName: "WHATSAPP_LINK" },
      { key: "port", label: "Puerto del servicio", type: "number", envName: "PORT", placeholder: "8000" },
    ],
  },
  {
    id: "flujos",
    title: "Creador de Flujos",
    envTarget: null,
    fields: [
      { key: "graph_token", label: "Facebook Graph Token", type: "password" },
      { key: "supabase_key", label: "Supabase Service Key", type: "password" },
      { key: "telegram_token", label: "Telegram Bot Token", type: "password" },
      { key: "chatwoot_token", label: "Chatwoot Token", type: "password" },
    ],
  },
];

/** Estado guardado: { [groupId]: { [fieldKey]: value } } */
export type ConfigStore = Record<string, Record<string, string>>;
