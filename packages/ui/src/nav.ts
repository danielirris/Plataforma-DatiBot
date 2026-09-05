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
    icon: "🏠",
    description: "Tu centro de mando: todas las herramientas en un solo lugar.",
  },
  {
    href: "/productos",
    label: "Productos",
    icon: "📦",
    description:
      "Crea un producto: identidad, oferta, anuncios ganadores de referencia, guión de video de embudo, ebook y videos.",
  },
  {
    href: "/mensajes",
    label: "Mensajes",
    icon: "💬",
    description:
      "Pega tus mensajes del embudo de WhatsApp (COD) por país y guárdalos.",
  },
  {
    href: "/ebooks",
    label: "Ebooks",
    icon: "📕",
    description:
      "Genera ebooks en PDF con temas de diseño listos para entregar y vender.",
  },
  {
    href: "/extractor",
    label: "Editor de videos",
    icon: "🎬",
    description:
      "Convierte videos largos en clips verticales listos para publicar.",
  },
  {
    href: "/anuncios",
    label: "Mis anuncios",
    icon: "🎞️",
    description: "Los anuncios que ya creaste, listos para ver y descargar.",
  },
  {
    href: "/embudos",
    label: "Embudos",
    icon: "🤖",
    description:
      "Configura los bots de WhatsApp: números, y por producto los mensajes, prompts, pasos y datos de pago (se guardan en Supabase, en vivo).",
  },
  {
    href: "/configuracion",
    label: "Configuración",
    icon: "⚙️",
    description: "API keys y ajustes de toda la plataforma en un solo panel.",
  },
];
