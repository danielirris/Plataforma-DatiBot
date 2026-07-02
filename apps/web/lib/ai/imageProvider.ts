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

/** Escapa texto para inyectarlo en un SVG. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Superpone el texto exacto (español neutral) en la franja superior con sharp.
 * El texto se renderiza como SVG (fuente/posición/color controlados) para
 * garantizar legibilidad en celular.
 */
export async function superponerOverlay(
  fondo: Buffer,
  texto: string,
): Promise<Buffer> {
  if (!texto?.trim()) return fondo;

  // Envuelve el texto en ~2 líneas simples según longitud.
  const palabras = texto.trim().split(/\s+/);
  const mitad = Math.ceil(palabras.length / 2);
  const lineas =
    palabras.length > 4
      ? [palabras.slice(0, mitad).join(" "), palabras.slice(mitad).join(" ")]
      : [texto.trim()];

  const fontSize = lineas.length > 1 ? 74 : 88;
  const startY = 130;
  const tspans = lineas
    .map(
      (l, i) =>
        `<tspan x="540" dy="${i === 0 ? 0 : fontSize + 12}">${esc(l)}</tspan>`,
    )
    .join("");

  const svg = `
<svg width="${TAM}" height="${TAM}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="3" stdDeviation="6" flood-color="#000" flood-opacity="0.75"/>
    </filter>
  </defs>
  <text x="540" y="${startY}" text-anchor="middle" filter="url(#s)"
    font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}"
    font-weight="800" fill="#ffffff">${tspans}</text>
</svg>`;

  return sharp(fondo)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 88 })
    .toBuffer();
}
