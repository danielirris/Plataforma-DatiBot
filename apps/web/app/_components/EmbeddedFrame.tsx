// Marco Datibot para una herramienta embebida (iframe). Le pone un encabezado
// consistente (icono + nombre + descripción) para que dashboard, editor y
// ebooks se sientan parte de Datibot y no como apps sueltas.
export function EmbeddedFrame({
  src,
  title,
  icon,
  description,
  allow,
}: {
  src: string;
  title: string;
  icon: string;
  description?: string;
  allow?: string;
}) {
  return (
    <div className="flex h-full flex-col">
      <header className="glass flex items-center gap-3 border-b border-[var(--hairline)] px-6 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--hairline)] bg-[var(--field)] text-lg">
          {icon}
        </span>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold leading-tight text-text">{title}</h1>
          {description && (
            <p className="truncate text-xs text-muted">{description}</p>
          )}
        </div>
        <span className="ml-auto hidden items-center gap-1.5 text-xs text-muted sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-2" />
          Datibot
        </span>
      </header>
      <iframe
        src={src}
        title={title}
        allow={allow}
        className="w-full flex-1 border-0"
      />
    </div>
  );
}
