import sharp from "sharp";

// Generación de imagen con Gemini (gemini-2.5-flash-image, "Nano Banana") vía
// generateContent, y superposición de texto server-side con sharp.
// El modelo/endpoint está aislado aquí para poder cambiarlo si evoluciona.

const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";
const TAM = 1080;

/** Genera el fondo/escena (sin texto) y devuelve un Buffer JPEG 1080×1080. */
export async function generarEscena(
  prompt: string,
  geminiKey: string,
): Promise<Buffer> {
  if (!geminiKey)
    throw new Error("Falta la Gemini API Key (grupo «Generación con IA»).");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${encodeURIComponent(geminiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini (imagen) respondió ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const inline = parts.find(
    (p: { inlineData?: { data?: string } }) => p?.inlineData?.data,
  );
  if (!inline?.inlineData?.data)
    throw new Error("Gemini no devolvió imagen (revisa el modelo/permiso).");

  const raw = Buffer.from(inline.inlineData.data, "base64");
  // Normaliza a JPEG cuadrado.
  return sharp(raw).resize(TAM, TAM, { fit: "cover" }).jpeg({ quality: 88 }).toBuffer();
}

