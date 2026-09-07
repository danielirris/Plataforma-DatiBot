// Aviso que se muestra cuando Supabase aún no está conectado (falta la env var).
export function SupabaseSetupBanner() {
  return (
    <div className="rounded-xl border border-accent/50 bg-accent/10 p-5 text-sm">
      <p className="font-medium text-text">⚙️ Falta conectar Supabase</p>
      <p className="mt-2 text-muted">
        Configura estas variables en el <b>Environment de EasyPanel</b> (servicio web) y
        redespliega:
      </p>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-[var(--hairline)] bg-[var(--field)] p-3 text-xs">
{`EMBUDOS_SUPABASE_URL=https://jquahxsesqcjakxkcneu.supabase.co
EMBUDOS_SUPABASE_SERVICE_KEY=<tu service key>`}
      </pre>
      <p className="mt-3 text-xs text-muted">
        Y crea las tablas con el SQL de <code>apps/web/lib/embudos/schema.sql</code> en el
        editor SQL de Supabase.
      </p>
    </div>
  );
}
