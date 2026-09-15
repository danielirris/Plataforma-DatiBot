// Definición central de las secciones de la plataforma.
// Al agregar una nueva app en el futuro, añade aquí su entrada
// y el sidebar la mostrará automáticamente.

export interface NavItem {
  href: string;
  label: string;
  /** emoji o icono corto para el sidebar */
  icon: string;
  /** descripción corta de la sección (portada y tooltip del sidebar) */
  description?: string;
  /** true si la sección aún es un placeholder (marca "pronto") */
  comingSoon?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Inicio",
    icon: "home",
    description: "Tu centro de mando: todas las herramientas en un solo lugar.",
  },
  {
    href: "/productos",
    label: "Productos",
    icon: "package",
    description:
      "Crea un producto: identidad, oferta, anuncios ganadores de referencia, análisis, guiones de anuncios, guión de video de embudo y videos.",
  },
  {
    href: "/ebooks",
    label: "Ebooks",
    icon: "book",
    description:
      "Genera ebooks en PDF con temas de diseño listos para entregar y vender.",
  },
  {
    href: "/extractor",
    label: "Editor de videos",
    icon: "clapperboard",
    description:
      "Convierte videos largos en clips verticales listos para publicar.",
  },
  {
    href: "/anuncios",
    label: "Mis anuncios",
    icon: "film",
    description: "Los anuncios que ya creaste, listos para ver y descargar.",
  },
  {
    href: "/reporte-anuncios",
    label: "Reporte de anuncios",
    icon: "bar-chart",
    description:
      "Atribución de Facebook Ads: qué anuncio trae cada venta, presupuestos y decisiones (se abre dentro de Datibot).",
  },
  {
    href: "/embudos",
    label: "Embudos",
    icon: "bot",
    description:
      "Configura los bots de WhatsApp: números, y por producto los mensajes, prompts, pasos y datos de pago (se guardan en Supabase, en vivo).",
  },
];

// Items de utilidad que van ABAJO del sidebar (junto al tema), separados de las
// herramientas principales.
export const NAV_FOOTER: NavItem[] = [
  {
    href: "/tutorial",
    label: "Tutorial",
    icon: "book-open",
    description:
      "Guías: cómo crear un producto, cómo funcionan los Embudos y cómo dar de alta un número.",
  },
  {
    href: "/configuracion",
    label: "Configuración",
    icon: "settings",
    description: "Instrucciones para la IA y precios por país.",
  },
];
