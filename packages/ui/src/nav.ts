// Definición central de las secciones de la plataforma.
// Al agregar una nueva app en el futuro, añade aquí su entrada
// y el sidebar la mostrará automáticamente.

export interface NavItem {
  href: string;
  label: string;
  /** emoji o icono corto para el sidebar */
  icon: string;
  /** true si la sección aún es un placeholder (marca "pronto") */
  comingSoon?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Inicio", icon: "🏠" },
  { href: "/flujos", label: "Creador de Flujos", icon: "🔀" },
  { href: "/dashboard", label: "Dashboard ads", icon: "📊" },
  { href: "/extractor", label: "Extractor", icon: "🎬" },
  { href: "/configuracion", label: "Configuración", icon: "⚙️" },
];
