"use client";

import { useState, type ChangeEvent } from "react";
import {
  CONFIG_GROUPS,
  type ConfigGroup,
  type ConfigStore,
} from "@plataforma/config/schema";
import { PAISES_EMBUDO } from "@/lib/embudo/paises";
import { ConfigTutorialNumero } from "./ConfigTutorialNumero";

type TabConfig = "instrucciones" | "precios" | "tutorial";

// Instrucciones maestras que guían a la IA. Se guardan bajo la clave "instrucciones"
// del mismo almacén de config (persiste en el volumen /data) y se inyectan en los
// generadores correspondientes. Ver apps/web/lib/ai/instrucciones.ts.
const INSTRUCCIONES: { key: string; titulo: string; desc: string }[] = [
  {
    key: "anuncios",
    titulo: "Realización de anuncios del producto",
    desc: "La IA la seguirá al generar los guiones de anuncios (paso «Guiones de anuncios» de cada producto).",
  },
  {
    key: "embudo",
    titulo: "Video del embudo",
    desc: "La IA la seguirá al generar el guión del video de embudo de cada producto.",
  },
  {
    key: "mensajes",
    titulo: "Flujo de mensajes (WhatsApp COD)",
    desc: "La IA la seguirá al generar los 10 mensajes del flujo por país (sección «Mensajes»).",
  },
];

export function ConfigForm({ initial }: { initial: ConfigStore }) {
  const [store, setStore] = useState<ConfigStore>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [nombresArchivo, setNombresArchivo] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<TabConfig>("instrucciones");

  function setField(groupId: string, key: string, value: string) {
    setStore((prev) => ({
      ...prev,
      [groupId]: { ...(prev[groupId] ?? {}), [key]: value },
    }));
    setStatus("idle");
  }

  // Precios globales (montos de la escalera por país). Se guardan como CSV por país en
  // store.precios[pais]; sirven de valor por defecto para los montos de cada producto.
  function preciosDe(pais: string): string[] {
    const def = PAISES_EMBUDO.find((p) => p.codigo === pais)?.montos.map(String) ?? [];
    const guardados = (store.precios?.[pais] ?? "").split(",");
    return def.map((d, i) => {
      const v = (guardados[i] ?? "").trim();
      return v !== "" ? v : d;
    });
  }
  function setPrecio(pais: string, i: number, valor: string) {
    const arr = preciosDe(pais);
    arr[i] = valor.trim();
    setField("precios", pais, arr.join(","));
  }

  // Lee un archivo de texto (.txt/.md) y vuelca su contenido en la instrucción.
  async function subirInstruccion(key: string, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a subir el mismo archivo
    if (!file) return;
    try {
      const texto = await file.text();
      setField("instrucciones", key, texto);
      setNombresArchivo((p) => ({ ...p, [key]: `📄 ${file.name}` }));
    } catch {
      setNombresArchivo((p) => ({ ...p, [key]: "⚠️ No se pudo leer el archivo" }));
    }
  }

  async function save() {
    setStatus("saving");
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(store),
      });
      setStatus(res.ok ? "saved" : "error");
    } catch {
      setStatus("error");
    }
  }

  // Agrupa los grupos VISIBLES por su `section` conservando el orden de
  // definición. Los `hidden` se gestionan por el Environment de EasyPanel.
  const sections: { name: string; groups: ConfigGroup[] }[] = [];
  for (const group of CONFIG_GROUPS.filter((g) => !g.hidden)) {
    const name = group.section ?? "Otros";
    let bucket = sections.find((s) => s.name === name);
    if (!bucket) {
      bucket = { name, groups: [] };
      sections.push(bucket);
    }
    bucket.groups.push(group);
  }

  return (
    <div className="space-y-6">
      {/* Pestañas: qué se está configurando */}
      <div className="flex flex-wrap gap-2 border-b border-[var(--hairline)]">
        {(
          [
            ["instrucciones", "Instrucciones IA"],
            ["precios", "Precios"],
            ["tutorial", "Tutorial: nuevo número"],
          ] as [TabConfig, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors " +
              (tab === id
                ? "border-accent font-medium text-text"
                : "border-transparent text-muted hover:text-text")
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Instrucciones maestras de IA: se suben/pegan aquí y guían a los generadores. */}
      {tab === "instrucciones" && (
      <div className="space-y-4">
        <h2 className="border-b border-[var(--hairline)] pb-1 text-sm font-semibold uppercase tracking-wide text-muted">
          Instrucciones para la IA
        </h2>
        <p className="text-xs text-muted">
          Sube (o pega) tus guías para que la IA las siga al generar. Se guardan de forma{" "}
          <b>permanente</b> y se aplican a <b>todos</b> los productos. Archivos de texto
          (<code>.txt</code> o <code>.md</code>); si tu guía está en PDF/Word, pega el texto
          en el cuadro.
        </p>

        {INSTRUCCIONES.map((it) => {
          const val = store.instrucciones?.[it.key] ?? "";
          return (
            <section
              key={it.key}
              className="rounded-xl border border-[var(--hairline)] glass p-5"
            >
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <h3 className="font-medium">{it.titulo}</h3>
                <span className="shrink-0 text-xs text-muted">
                  {val.trim() ? `${val.length.toLocaleString()} caracteres` : "vacío"}
                </span>
              </div>
              <p className="mb-3 text-xs text-muted">{it.desc}</p>

              <div className="flex flex-wrap items-center gap-3">
                <label className="cursor-pointer rounded-lg border border-accent/50 bg-accent/10 px-4 py-2 text-sm font-medium text-accent-2 hover:bg-accent/20">
                  ⬆️ Subir archivo (.txt / .md)
                  <input
                    type="file"
                    accept=".txt,.md,.markdown,.text,text/plain,text/markdown"
                    className="hidden"
                    onChange={(e) => subirInstruccion(it.key, e)}
                  />
                </label>
                {val.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      setField("instrucciones", it.key, "");
                      setNombresArchivo((p) => ({ ...p, [it.key]: "" }));
                    }}
                    className="text-xs text-muted hover:text-red-400"
                  >
                    Borrar
                  </button>
                )}
                {nombresArchivo[it.key] && (
                  <span className="text-xs text-muted">{nombresArchivo[it.key]}</span>
                )}
              </div>

              <textarea
                rows={8}
                value={val}
                placeholder="Pega aquí las instrucciones, o súbelas como archivo…"
                onChange={(e) => setField("instrucciones", it.key, e.target.value)}
                className="mt-3 w-full rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 font-mono text-xs text-text outline-none focus:border-accent"
              />
            </section>
          );
        })}
      </div>
      )}

      {/* Precios globales: montos de la escalera por país. Sirven de valor por defecto
          para los montos de cada producto (sección Mensajes). */}
      {tab === "precios" && (
      <div className="space-y-4">
        <h2 className="border-b border-[var(--hairline)] pb-1 text-sm font-semibold uppercase tracking-wide text-muted">
          Precios por país (escalera)
        </h2>
        <p className="text-xs text-muted">
          Los 7 montos de la escalera por país. Lo que pongas aquí sale <b>predeterminado</b>{" "}
          al editar los montos de cada producto (en <b>Mensajes</b>); cada producto puede
          ajustarlos sin afectar estos globales.
        </p>
        <div className="space-y-3">
          {PAISES_EMBUDO.map((pa) => (
            <section
              key={pa.codigo}
              className="rounded-xl border border-[var(--hairline)] glass p-4"
            >
              <div className="mb-2 flex items-baseline gap-2">
                <span className="text-sm font-medium">
                  {pa.bandera} {pa.nombre}
                </span>
                <span className="text-xs text-muted">
                  {pa.moneda} ({pa.simbolo})
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {preciosDe(pa.codigo).map((v, i) => (
                  <label key={i} className="flex flex-col gap-0.5 text-[11px] text-muted">
                    <span>Fase {i + 1}</span>
                    <div className="flex items-center gap-1">
                      <span>{pa.simbolo}</span>
                      <input
                        type="number"
                        value={v}
                        onChange={(e) => setPrecio(pa.codigo, i, e.target.value)}
                        className="w-full rounded border border-[var(--hairline)] bg-[var(--field)] px-2 py-1 text-sm text-text outline-none focus:border-accent"
                      />
                    </div>
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
      )}

      {/* Grupos por variables de entorno (todos ocultos hoy) */}
      {sections.map((section) => (
        <div key={section.name} className="space-y-4">
          <h2 className="border-b border-[var(--hairline)] pb-1 text-sm font-semibold uppercase tracking-wide text-muted">
            {section.name}
          </h2>

          {section.groups.map((group) => (
            <section
              key={group.id}
              className="rounded-xl border border-[var(--hairline)] glass p-5"
            >
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <h3 className="font-medium">{group.title}</h3>
                {group.envTarget && (
                  <span className="shrink-0 text-xs text-muted">
                    genera <code>{group.envTarget}</code>
                  </span>
                )}
              </div>
              {group.note && (
                <p className="mb-4 text-xs text-muted">{group.note}</p>
              )}
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {group.fields.map((field) => (
                  <label
                    key={field.key}
                    className={
                      "flex flex-col gap-1 text-sm" +
                      (field.type === "textarea" ? " sm:col-span-2" : "")
                    }
                  >
                    <span className="text-muted">{field.label}</span>
                    {field.type === "textarea" ? (
                      <textarea
                        rows={4}
                        value={store[group.id]?.[field.key] ?? ""}
                        placeholder={field.placeholder}
                        onChange={(e) =>
                          setField(group.id, field.key, e.target.value)
                        }
                        className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
                      />
                    ) : field.type === "select" ? (
                      <select
                        value={
                          store[group.id]?.[field.key] ??
                          field.options?.[0] ??
                          ""
                        }
                        onChange={(e) =>
                          setField(group.id, field.key, e.target.value)
                        }
                        className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
                      >
                        {field.options?.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={
                          field.type === "password"
                            ? "password"
                            : field.type === "number"
                              ? "number"
                              : "text"
                        }
                        value={store[group.id]?.[field.key] ?? ""}
                        placeholder={field.placeholder}
                        onChange={(e) =>
                          setField(group.id, field.key, e.target.value)
                        }
                        className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
                      />
                    )}
                    {field.help && (
                      <span className="text-xs text-muted">{field.help}</span>
                    )}
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>
      ))}

      {/* Tutorial técnico: dar de alta un número nuevo (plomería fuera de la app) */}
      {tab === "tutorial" && <ConfigTutorialNumero />}

      {tab !== "tutorial" && (
      <div className="sticky bottom-0 flex items-center gap-3 border-t border-[var(--hairline)] bg-bg/80 py-4 backdrop-blur">
        <button
          onClick={save}
          disabled={status === "saving"}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {status === "saving" ? "Guardando…" : "Guardar configuración"}
        </button>
        {status === "saved" && (
          <span className="text-sm text-accent-2">
            ✓ Guardado. Reinicia los servicios (y recarga Flujos) para aplicar.
          </span>
        )}
        {status === "error" && (
          <span className="text-sm text-red-400">Error al guardar.</span>
        )}
      </div>
      )}
    </div>
  );
}
