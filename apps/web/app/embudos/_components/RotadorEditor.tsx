"use client";

import { useEffect, useState } from "react";
import { type RotadorRow } from "@/lib/embudos/types";

type Grupo = { campo: string; variantes: string[] };

// Campos típicos del rotador (solo sugerencias para el autocompletado).
const SUGERENCIAS = ["menu", "boton_texto", "bienvenida", "recordatorio"];

export function RotadorEditor({ producto }: { producto: string }) {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [cargando, setCargando] = useState<boolean>(false);
  const [guardando, setGuardando] = useState<boolean>(false);
  const [estado, setEstado] = useState<string>("");

  useEffect(() => {
    if (!producto) {
      setGrupos([]);
      return;
    }
    let vivo = true;
    setCargando(true);
    setEstado("");
    fetch(`/api/embudos/rotador?producto=${encodeURIComponent(producto)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!vivo) return;
        const porCampo = new Map<string, RotadorRow[]>();
        for (const f of (data.filas ?? []) as RotadorRow[]) {
          const arr = porCampo.get(f.campo) ?? [];
          arr.push(f);
          porCampo.set(f.campo, arr);
        }
        const gs: Grupo[] = [];
        for (const [campo, filas] of porCampo) {
          filas.sort((a, b) => a.variante - b.variante);
          gs.push({ campo, variantes: filas.map((x) => x.texto) });
        }
        setGrupos(gs);
        if (data.error) setEstado("⚠️ " + data.error);
      })
      .catch((e) => vivo && setEstado("⚠️ " + (e instanceof Error ? e.message : "Error de red")))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [producto]);

  function setCampo(gi: number, campo: string) {
    setGrupos((prev) => prev.map((g, i) => (i === gi ? { ...g, campo } : g)));
    setEstado("");
  }
  function setVariante(gi: number, vi: number, texto: string) {
    setGrupos((prev) =>
      prev.map((g, i) =>
        i === gi ? { ...g, variantes: g.variantes.map((v, j) => (j === vi ? texto : v)) } : g,
      ),
    );
    setEstado("");
  }
  function addVariante(gi: number) {
    setGrupos((prev) =>
      prev.map((g, i) => (i === gi ? { ...g, variantes: [...g.variantes, ""] } : g)),
    );
  }
  function removeVariante(gi: number, vi: number) {
    setGrupos((prev) =>
      prev.map((g, i) =>
        i === gi ? { ...g, variantes: g.variantes.filter((_, j) => j !== vi) } : g,
      ),
    );
  }
  function addCampo() {
    setGrupos((prev) => [...prev, { campo: "", variantes: [""] }]);
  }
  function removeCampo(gi: number) {
    setGrupos((prev) => prev.filter((_, i) => i !== gi));
  }

  async function guardar() {
    setGuardando(true);
    setEstado("Guardando…");
    const filas: { campo: string; variante: number; texto: string }[] = [];
    for (const g of grupos) {
      const campo = g.campo.trim();
      if (!campo) continue;
      let n = 0;
      for (const t of g.variantes) {
        if (!t.trim()) continue;
        n += 1;
        filas.push({ campo, variante: n, texto: t });
      }
    }
    try {
      const r = await fetch("/api/embudos/rotador", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ producto, filas }),
      });
      const data = await r.json().catch(() => ({}));
      setEstado(r.ok ? "✓ Guardado en Supabase." : "⚠️ " + (data.error ?? `Error ${r.status}`));
    } catch (e) {
      setEstado("⚠️ " + (e instanceof Error ? e.message : "Error de red"));
    }
    setGuardando(false);
  }

  const inputCls =
    "w-full rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-sm text-text outline-none focus:border-accent";

  return (
    <div className="space-y-3 rounded-xl border border-[var(--hairline)] glass p-5">
      <div>
        <p className="text-sm font-medium text-text">Mensajes con variantes (rotador)</p>
        <p className="text-xs text-muted">
          Varias versiones del mismo mensaje: el bot elige una al azar en cada envío (evita
          que WhatsApp lo marque como spam). El <b>campo</b> es el nombre que usa el motor
          (ej. <code>menu</code>, <code>boton_texto</code>).
        </p>
      </div>

      {cargando ? (
        <p className="text-sm text-muted">Cargando…</p>
      ) : (
        <>
          <datalist id="rotador-campos">
            {SUGERENCIAS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>

          {grupos.length === 0 && (
            <p className="rounded-lg border border-dashed border-[var(--hairline)] p-4 text-center text-xs text-muted">
              Aún no hay mensajes con variantes. Agrega uno abajo.
            </p>
          )}

          {grupos.map((g, gi) => (
            <div key={gi} className="space-y-2 rounded-lg border border-[var(--hairline)] bg-[var(--field)] p-3">
              <div className="flex items-center gap-2">
                <input
                  value={g.campo}
                  list="rotador-campos"
                  placeholder="nombre del campo (ej. menu)"
                  onChange={(e) => setCampo(gi, e.target.value)}
                  className="flex-1 rounded border border-[var(--hairline)] bg-[var(--bg)] px-2 py-1.5 text-sm font-medium text-text outline-none focus:border-accent"
                />
                <button
                  onClick={() => removeCampo(gi)}
                  className="shrink-0 text-xs text-muted hover:text-red-400"
                >
                  Quitar campo
                </button>
              </div>
              {g.variantes.map((v, vi) => (
                <div key={vi} className="flex items-start gap-2">
                  <span className="mt-2 w-6 shrink-0 text-right text-xs text-muted">{vi + 1}</span>
                  <textarea
                    value={v}
                    rows={2}
                    placeholder="Variante del mensaje…"
                    onChange={(e) => setVariante(gi, vi, e.target.value)}
                    className={inputCls + " bg-[var(--bg)]"}
                  />
                  <button
                    onClick={() => removeVariante(gi, vi)}
                    className="mt-1.5 shrink-0 text-xs text-muted hover:text-red-400"
                    title="Quitar variante"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() => addVariante(gi)}
                className="text-xs text-accent-2 hover:underline"
              >
                + agregar variante
              </button>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              onClick={addCampo}
              className="rounded-lg border border-accent/50 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent-2"
            >
              + Agregar mensaje
            </button>
            <button
              onClick={guardar}
              disabled={guardando}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Guardar rotador"}
            </button>
            {estado && (
              <span className={"text-sm " + (estado.startsWith("✓") ? "text-accent-2" : "text-muted")}>
                {estado}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
