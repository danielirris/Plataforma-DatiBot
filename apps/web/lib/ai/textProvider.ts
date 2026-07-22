import { readConfig } from "@plataforma/config";

// Proveedor de texto: Gemini (default) u OpenAI, según /configuracion.
// Devuelve el texto crudo del modelo; el caller parsea el JSON.

export type ProveedorTexto = "Gemini" | "OpenAI";

export interface TextoConfig {
  provider: ProveedorTexto;
  geminiKey: string;
  openaiKey: string;
}

export async function leerTextoConfig(): Promise<TextoConfig> {
  const store = await readConfig();
  const ia = store["ia"] ?? {};
  const compartidas = store["compartidas"] ?? {};
  const provider = (ia["text_provider"] as ProveedorTexto) || "Gemini";
  return {
    provider,
    geminiKey: ia["gemini_api_key"] ?? "",
    openaiKey: compartidas["openai_api_key"] ?? "",
  };
}

const GEMINI_TEXT_MODEL = "gemini-2.5-flash";
const OPENAI_TEXT_MODEL = "gpt-4o-mini";

// Llama a Gemini con timeout y reintentos: los 429/5xx transitorios son
// frecuentes y, sin esto, la petición queda colgada hasta que el proxy
// (EasyPanel) la mata y devuelve su página HTML de error 502.
async function geminiFetch(url: string, body: unknown): Promise<Response> {
  const INTENTOS = 2;
  const TIMEOUT_MS = 100_000;
  let ultimo: unknown = null;
  for (let i = 0; i < INTENTOS; i++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      // Reintenta solo errores transitorios; el resto se devuelve al caller.
      if (res.ok || ![429, 500, 502, 503, 504].includes(res.status)) return res;
      ultimo = new Error(`Gemini respondió ${res.status}: ${await res.text()}`);
    } catch (e) {
      // Un timeout/abort NO se reintenta: reintentar una llamada lenta solo agota
      // el tiempo del proxy y acaba en el 502 HTML. Falla limpio para que el
      // usuario reintente. Los cortes de red sí se reintentan una vez.
      const nombre = (e as { name?: string })?.name ?? "";
      if (nombre === "TimeoutError" || nombre === "AbortError") throw e;
      ultimo = e;
    }
    if (i < INTENTOS - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw ultimo instanceof Error ? ultimo : new Error("Gemini no respondió (timeout).");
}

/** Genera texto con el proveedor configurado. Lanza Error con mensaje claro si falta la key. */
export async function generarTexto(prompt: string): Promise<string> {
  const cfg = await leerTextoConfig();

  if (cfg.provider === "OpenAI") {
    if (!cfg.openaiKey)
      throw new Error(
        "Falta la OpenAI API Key (grupo «Compartidas» en Configuración).",
      );
    return openaiChat(prompt, cfg.openaiKey);
  }

  if (!cfg.geminiKey)
    throw new Error(
      "Falta la Gemini API Key (grupo «Generación con IA» en Configuración).",
    );
  return geminiGenerate(prompt, cfg.geminiKey);
}

async function geminiGenerate(prompt: string, key: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await geminiFetch(url, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.8 },
  });
  if (!res.ok) {
    throw new Error(`Gemini respondió ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? "")
    .join("");
  if (!text) throw new Error("Gemini no devolvió texto.");
  return text;
}

export interface ResultadoGrounding {
  text: string;
  fuentes: { titulo: string; url: string }[];
}

/**
 * Investigación con Gemini + Google Search grounding (búsqueda web real).
 * Devuelve el texto y las fuentes web usadas. Solo Gemini soporta grounding.
 */
export async function investigarConGemini(
  prompt: string,
): Promise<ResultadoGrounding> {
  const cfg = await leerTextoConfig();
  if (!cfg.geminiKey)
    throw new Error(
      "La investigación de avatar usa Gemini (búsqueda web). Falta la Gemini API Key en Configuración.",
    );

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${encodeURIComponent(cfg.geminiKey)}`;
  const res = await geminiFetch(url, {
    contents: [{ parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.7 },
  });
  if (!res.ok)
    throw new Error(`Gemini (grounding) respondió ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const cand = data?.candidates?.[0];
  const text = (cand?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? "")
    .join("");
  if (!text) throw new Error("Gemini no devolvió texto en la investigación.");

  // Fuentes desde groundingMetadata.groundingChunks[].web { uri, title }
  const chunks = cand?.groundingMetadata?.groundingChunks ?? [];
  const fuentes = chunks
    .map((c: { web?: { uri?: string; title?: string } }) => ({
      url: c?.web?.uri ?? "",
      titulo: c?.web?.title ?? c?.web?.uri ?? "",
    }))
    .filter((f: { url: string }) => f.url);

  return { text, fuentes };
}

// Llama a OpenAI con timeout y reintentos, igual que geminiFetch. SIN timeout, una
// llamada lenta de OpenAI (frecuente al generar un capítulo largo) quedaba colgada
// hasta que el proxy (EasyPanel/Traefik) la mataba y devolvía su HTML de error 500
// —el 500 intermitente del creador de ebooks—. Ahora un cuelgue falla limpio y el
// usuario puede reintentar.
async function openaiFetch(body: unknown, key: string): Promise<Response> {
  const INTENTOS = 2;
  const TIMEOUT_MS = 90_000;
  let ultimo: unknown = null;
  for (let i = 0; i < INTENTOS; i++) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok || ![429, 500, 502, 503, 504].includes(res.status)) return res;
      ultimo = new Error(`OpenAI respondió ${res.status}: ${await res.text()}`);
    } catch (e) {
      // Un timeout/abort NO se reintenta (reintentar una llamada lenta solo agota
      // el tiempo del proxy); los cortes de red sí, una vez.
      const nombre = (e as { name?: string })?.name ?? "";
      if (nombre === "TimeoutError" || nombre === "AbortError")
        throw new Error("OpenAI tardó demasiado (timeout). Reintenta.");
      ultimo = e;
    }
    if (i < INTENTOS - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw ultimo instanceof Error ? ultimo : new Error("OpenAI no respondió (timeout).");
}

async function openaiChat(prompt: string, key: string): Promise<string> {
  const res = await openaiFetch(
    {
      model: OPENAI_TEXT_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
    },
    key,
  );
  if (!res.ok) {
    throw new Error(`OpenAI respondió ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI no devolvió texto.");
  return text;
}
