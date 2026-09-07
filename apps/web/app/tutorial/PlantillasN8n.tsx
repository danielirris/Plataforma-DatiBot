"use client";

import { useEffect, useState } from "react";

type Plantilla = { slot: string; nombre: string; desc: string };

export function PlantillasN8n() {
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [disponibles, setDisponibles] = useState<Record<string, boolean>>({});
  const [subiendo, setSubiendo] = useState<Record<string, boolean>>({});
  const [estado, setEstado] = useState<string>("");

  async function cargar() {
    try {
      const r = await fetch("/api/plantillas", { cache: "no-store" });
      const d = await r.json();
      setPlantillas(d.plantillas ?? []);
      setDisponibles(d.disponibles ?? {});
    } catch {
      /* nada */
    }
  }
  useEffect(() => {
    cargar();
  }, []);

  async function subir(slot: string, file: File) {
    setSubiendo((s) => ({ ...s, [slot]: true }));
    setEstado("");
    try {
      const fd = new FormData();
      fd.append("archivo", file);
      const r = await fetch(`/api/plantillas/${slot}`, { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setEstado(`✓ "${slot}" actualizado.`);
        await cargar();
      } else {
        setEstado("⚠️ " + (d.error ?? `Error ${r.status}`));
      }
    } catch (e) {
      setEstado("⚠️ " + (e instanceof Error ? e.message : "Error de red"));
    }
    setSubiendo((s) => ({ ...s, [slot]: false }));
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Sube aquí el <b className="text-text">.json</b> de cada workflow de n8n (exportado
        desde n8n) y descárgalo cuando lo necesites — por ejemplo, para duplicar el
        recibidor al dar de alta un número. Se guardan de forma permanente.
      </p>

      {plantillas.map((p) => (
        <div
          key={p.slot}
          className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--hairline)] glass p-4"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text">{p.nombre}</span>
              <span
                className={
                  "rounded-full px-2 py-0.5 text-[11px] " +
                  (disponibles[p.slot]
                    ? "bg-accent/20 text-accent-2"
                    : "bg-[var(--field)] text-muted")
                }
              >
                {disponibles[p.slot] ? "cargada" : "sin subir"}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted">{p.desc}</p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {disponibles[p.slot] && (
              <a
                href={`/api/plantillas/${p.slot}`}
                download={`${p.slot}.json`}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-[#111]"
              >
                ⬇️ Descargar
              </a>
            )}
            <label className="cursor-pointer rounded-lg border border-accent/50 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent-2 hover:bg-accent/20">
              {subiendo[p.slot] ? "Subiendo…" : disponibles[p.slot] ? "Reemplazar" : "Subir .json"}
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                disabled={subiendo[p.slot]}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) subir(p.slot, f);
                }}
              />
            </label>
          </div>
        </div>
      ))}

      {estado && (
        <span className={"text-sm " + (estado.startsWith("✓") ? "text-accent-2" : "text-muted")}>
          {estado}
        </span>
      )}
    </div>
  );
}
