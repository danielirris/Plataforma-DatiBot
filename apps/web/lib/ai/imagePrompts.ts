import type { TipoImagen } from "@plataforma/products";

// Los 5 prompts de escena (Apéndice A). Gemini genera SOLO el fondo/escena
// (sin texto); el servidor superpone el overlay con sharp. Cada prompt deja
// espacio reservado para el titular.

const REGLAS =
  "Fotografía/gráfico publicitario de alta conversión, formato cuadrado 1080×1080, colores vibrantes, alto contraste, optimizado para pantalla de celular, SIN texto, sin logos, sin marcas de agua.";

const PROMPTS: Record<TipoImagen, string> = {
  contenido:
    "Fotografía publicitaria profesional de {{PRODUCTO}}, estilo comercial de alta conversión para redes sociales. Composición limpia y centrada, iluminación brillante y cálida, fondo simple de color sólido o degradado suave que resalte el producto. Aspecto deseable y premium, coherente con: {{IDENTIDAD}}. Deja la franja superior despejada para un titular.",
  bonos:
    "Composición tipo 'value stack' para una oferta de {{PRODUCTO}}: varios elementos de bono relacionados (guías, recetarios, plantillas, accesorios o mockups digitales) apilados o en grilla ordenada, con aspecto de paquete de gran valor. Fondo con degradado llamativo, buena separación entre elementos, y una zona circular despejada en una esquina para una insignia.",
  bono_accion_rapida:
    "Un único elemento de bono destacado para {{PRODUCTO}}, iluminado con un foco de luz (spotlight) sobre fondo oscuro con acentos cálidos rojos y naranjas. Elementos gráficos sutiles de urgencia (un cronómetro o reloj estilizado). Sensación de recompensa exclusiva por actuar ya. Zona despejada arriba y una esquina libre para insignia.",
  remarketing_60:
    "Imagen tipo recordatorio amable para {{PRODUCTO}}: el producto presente de forma atractiva, composición que sugiere 'segunda oportunidad' y cercanía. Tono cálido y amistoso, un leve elemento de escasez (no agresivo). Fondo suave, franja superior despejada para un titular.",
  remarketing_180:
    "Imagen de alta urgencia para {{PRODUCTO}}: tratamiento visual de 'última llamada', acentos rojos intensos y alto contraste, elementos gráficos de escasez fuerte (cronómetro casi en cero, cupos por agotarse). El producto sigue siendo protagonista y deseable. Franja superior despejada para un titular grande.",
};

export function promptDeEscena(
  tipo: TipoImagen,
  producto: string,
  identidad: string,
): string {
  const base = PROMPTS[tipo]
    .replace(/\{\{PRODUCTO\}\}/g, producto || "el producto")
    .replace(/\{\{IDENTIDAD\}\}/g, identidad || "");
  return `${base} ${REGLAS}`;
}
