import Link from "next/link";
import { NAV_ITEMS } from "@plataforma/ui";

export default function HomePage() {
  const sections = NAV_ITEMS.filter((i) => i.href !== "/");

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <h1 className="text-2xl font-semibold">Mi Plataforma</h1>
      <p className="mt-2 text-muted">
        Shell unificado. Cada sección vive aquí con estilos y navegación
        compartidos. Empieza configurando tus API keys.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {sections.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-xl border border-border bg-panel p-5 transition-colors hover:border-accent/50"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
              {item.comingSoon && (
                <span className="ml-auto rounded bg-white/5 px-2 py-0.5 text-xs text-muted">
                  pronto
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
