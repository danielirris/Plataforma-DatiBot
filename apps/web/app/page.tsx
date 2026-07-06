import Link from "next/link";
import { NAV_ITEMS } from "@plataforma/ui";

export default function HomePage() {
  const sections = NAV_ITEMS.filter((i) => i.href !== "/");

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      {/* Hero de vidrio con glows */}
      <div className="glass relative overflow-hidden rounded-3xl border border-[var(--hairline)] p-8 sm:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/30 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-28 left-16 h-72 w-72 rounded-full bg-accent-2/20 blur-3xl"
        />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--hairline)] bg-[var(--field)] px-3 py-1 text-xs text-muted backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-2 shadow-[0_0_8px] shadow-accent-2" />
            Centro de mando
          </span>
          <h1 className="mt-5 text-5xl font-bold tracking-tight sm:text-6xl">
            <span className="bg-gradient-to-r from-accent via-accent-2 to-accent bg-clip-text text-transparent">
              Datibot
            </span>
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
            Todas tus herramientas en un solo lugar: crea productos, genera
            ebooks y anuncios, mide tus campañas y edita tus videos —{" "}
            <span className="text-text">con estilos y datos compartidos.</span>
          </p>
        </div>
      </div>

      {/* Secciones */}
      <h2 className="mb-4 mt-12 text-sm font-semibold uppercase tracking-[0.15em] text-muted">
        Herramientas
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {sections.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group relative overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--field)] p-5 backdrop-blur transition-all hover:-translate-y-1 hover:border-accent/40 hover:bg-[var(--hover)] hover:shadow-xl hover:shadow-accent/10"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-accent/0 blur-2xl transition-colors group-hover:bg-accent/20"
            />
            <div className="relative flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[var(--field)] to-[var(--field)] text-2xl ring-1 ring-[var(--hairline)] transition-all group-hover:ring-accent/40">
                {item.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-text">{item.label}</span>
                  {item.comingSoon && (
                    <span className="rounded bg-[var(--field)] px-2 py-0.5 text-xs text-muted">
                      pronto
                    </span>
                  )}
                  <span className="ml-auto translate-x-0 text-muted opacity-0 transition-all group-hover:translate-x-1 group-hover:text-accent-2 group-hover:opacity-100">
                    →
                  </span>
                </div>
                {item.description && (
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {item.description}
                  </p>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
