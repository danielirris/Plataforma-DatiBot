"use client";

import { useState } from "react";
import {
  CONFIG_GROUPS,
  type ConfigGroup,
  type ConfigStore,
} from "@plataforma/config/schema";

export function ConfigForm({ initial }: { initial: ConfigStore }) {
  const [store, setStore] = useState<ConfigStore>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  function setField(groupId: string, key: string, value: string) {
    setStore((prev) => ({
      ...prev,
      [groupId]: { ...(prev[groupId] ?? {}), [key]: value },
    }));
    setStatus("idle");
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

  // Agrupa los grupos por su `section` conservando el orden de definición.
  const sections: { name: string; groups: ConfigGroup[] }[] = [];
  for (const group of CONFIG_GROUPS) {
    const name = group.section ?? "Otros";
    let bucket = sections.find((s) => s.name === name);
    if (!bucket) {
      bucket = { name, groups: [] };
      sections.push(bucket);
    }
    bucket.groups.push(group);
  }

  return (
    <div className="space-y-10">
      {sections.map((section) => (
        <div key={section.name} className="space-y-4">
          <h2 className="border-b border-border pb-1 text-sm font-semibold uppercase tracking-wide text-muted">
            {section.name}
          </h2>

          {section.groups.map((group) => (
            <section
              key={group.id}
              className="rounded-xl border border-border bg-panel p-5"
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
                    className="flex flex-col gap-1 text-sm"
                  >
                    <span className="text-muted">{field.label}</span>
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
                      className="rounded-lg border border-border bg-bg px-3 py-2 text-text outline-none focus:border-accent"
                    />
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

      <div className="sticky bottom-0 flex items-center gap-3 border-t border-border bg-bg/80 py-4 backdrop-blur">
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
    </div>
  );
}
