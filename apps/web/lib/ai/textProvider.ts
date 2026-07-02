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
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8 },
    }),
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

async function openaiChat(prompt: string, key: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: OPENAI_TEXT_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI respondió ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI no devolvió texto.");
  return text;
}
