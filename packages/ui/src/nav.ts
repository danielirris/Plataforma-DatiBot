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
      "Crea un producto de principio a fin: avatar, ángulos, oferta, mensajes, imágenes y ebook.",
  },
  {
    href: "/ebooks",
    label: "Ebooks",
    icon: "📕",
    description:
      "Genera ebooks en PDF con temas de diseño listos para entregar y vender.",
  },
  {
    href: "/flujos",
    label: "Creador de Flujos",
    icon: "🔀",
    description:
      "Arma y emite SubWorkflows de n8n por país, sin tocar el motor a mano.",
  },
  {
    href: "/dashboard",
    label: "Dashboard ads",
    icon: "📊",
    description:
      "ROAS, CPA y métricas de tus campañas de Facebook Ads en tiempo real.",
  },
  {
    href: "/extractor",
    label: "Editor de videos",
    icon: "🎬",
    description:
      "Convierte videos largos en clips verticales listos para publicar.",
  },
  {
    href: "/configuracion",
    label: "Configuración",
    icon: "⚙️",
    description: "API keys y ajustes de toda la plataforma en un solo panel.",
  },
];
