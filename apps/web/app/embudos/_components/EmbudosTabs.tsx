"use client";

import { useEffect, useState } from "react";
import { NumerosManager } from "./NumerosManager";
import { ProductosBotManager } from "./ProductosBotManager";
import { SupabaseSetupBanner } from "./SupabaseSetupBanner";

type Tab = "numeros" | "bots";

export function EmbudosTabs() {
  const [configurado, setConfigurado] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("numeros");

  useEffect(() => {
    fetch("/api/embudos/numeros", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setConfigurado(d.configurado !== false))
      .catch(() => setConfigurado(true)); // si falla la red, deja pasar (los managers avisan)
  }, []);

  if (configurado === null) return <p className="text-sm text-muted">Cargando…</p>;
  if (!configurado) return <SupabaseSetupBanner />;

  const tabs: { id: Tab; label: string }[] = [
    { id: "numeros", label: "Números" },
    { id: "bots", label: "Bot por producto" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-[var(--hairline)]">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors " +
              (tab === t.id
                ? "border-accent font-medium text-text"
                : "border-transparent text-muted hover:text-text")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "numeros" ? <NumerosManager /> : <ProductosBotManager />}
    </div>
  );
}
