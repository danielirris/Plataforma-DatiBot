"use client";

import { useState } from "react";
import { CONFIG_GROUPS, type ConfigStore } from "@plataforma/config/schema";

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

  return (
    <div className="space-y-8">
      {CONFIG_GROUPS.map((group) => (
        <section
          key={group.id}
          className="rounded-xl border border-border bg-panel p-5"
        >
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-medium">{group.title}</h2>
            {group.envTarget && (
              <span className="text-xs text-muted">
                genera <code>{group.envTarget}</code>
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {group.fields.map((field) => (
              <label key={field.key} className="flex flex-col gap-1 text-sm">
                <span className="text-muted">{field.label}</span>
                <input
                  type={field.type === "password" ? "password" : field.type === "number" ? "number" : "text"}
                  value={store[group.id]?.[field.key] ?? ""}
                  placeholder={field.placeholder}
                  onChange={(e) => setField(group.id, field.key, e.target.value)}
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

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={status === "saving"}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {status === "saving" ? "Guardando…" : "Guardar configuración"}
        </button>
        {status === "saved" && (
          <span className="text-sm text-accent-2">
            ✓ Guardado. Reinicia los servicios para aplicar.
          </span>
        )}
        {status === "error" && (
          <span className="text-sm text-red-400">Error al guardar.</span>
        )}
      </div>
    </div>
  );
}
