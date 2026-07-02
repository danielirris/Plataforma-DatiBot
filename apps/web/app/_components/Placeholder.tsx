export function Placeholder({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <div className="flex items-center gap-3">
        <span className="text-3xl">{icon}</span>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <span className="rounded bg-white/5 px-2 py-0.5 text-xs text-muted">
          pendiente de migrar
        </span>
      </div>
      <div className="mt-4 text-muted">{children}</div>
    </div>
  );
}
