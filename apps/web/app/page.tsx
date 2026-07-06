import Link from "next/link";
import { NAV_ITEMS } from "@plataforma/ui";

export default function HomePage() {
  const sections = NAV_ITEMS.filter((i) => i.href !== "/");

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-panel p-8 sm:p-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 left-24 h-56 w-56 rounded-full bg-accent-2/10 blur-3xl"
        />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-bg/50 px-3 py-1 text-xs text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-2" />
            Centro de mando
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">
              Datibot
            </span>
          </h1>
          <p className="mt-3 max-w-xl text-muted">
            Todas tus herramientas en un solo lugar: crea productos, genera ebooks
            y anuncios, mide tus campañas y edita tus videos. Con estilos y datos
            compartidos.
          </p>
        </div>
      </div>

      {/* Secciones */}
      <h2 className="mb-4 mt-10 text-sm font-semibold uppercase tracking-wide text-muted">
        Herramientas
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {sections.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group relative overflow-hidden rounded-xl border border-border bg-panel p-5 transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lg hover:shadow-accent/5"
          >
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-bg text-2xl transition-colors group-hover:border-accent/40">
                {item.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{item.label}</span>
                  {item.comingSoon && (
                    <span className="rounded bg-white/5 px-2 py-0.5 text-xs text-muted">
                      pronto
                    </span>
                  )}
                  <span className="ml-auto text-muted opacity-0 transition-opacity group-hover:opacity-100">
                    →
                  </span>
                </div>
                {item.description && (
                  <p className="mt-1 text-sm text-muted">{item.description}</p>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
