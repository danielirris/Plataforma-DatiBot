"use client";

import { useEffect, useState } from "react";
import {
  PAISES_EMBUDO_BOT,
  NOMBRE_PAIS,
  numeroBotVacio,
  type NumeroBot,
} from "@/lib/embudos/types";

type ProductoLite = { id: string; nombre: string; productoId?: string };

const keyProducto = (p: ProductoLite) => (p.productoId?.trim() || p.id);

// Campos de texto simple del formulario (label + si es sensible/password).
const CAMPOS: { k: keyof NumeroBot; label: string; sensible?: boolean; hint?: string }[] = [
  { k: "numero_whatsapp", label: "Número de WhatsApp", hint: "El número marcable, ej. 573227784838" },
  { k: "phone_id", label: "Phone ID (Meta)", hint: "phone_number_id — es la clave del número" },
  { k: "waba_id", label: "WABA ID" },
  { k: "account_id", label: "Chatwoot account_id" },
  { k: "credencial_wa", label: "Credencial WA en n8n", hint: 'ej. "Carolina1 [4838]"' },
  { k: "capi_token", label: "CAPI token (System User)", sensible: true, hint: "Se guarda oculto." },
];

export function NumerosManager() {
  const [configurado, setConfigurado] = useState(true);
  const [numeros, setNumeros] = useState<NumeroBot[]>([]);
  const [productos, setProductos] = useState<ProductoLite[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [form, setForm] = useState<NumeroBot | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [otroProducto, setOtroProducto] = useState(false);
  const [estado, setEstado] = useState("");

  async function cargar() {
    setCargando(true);
    setErrorCarga("");
    try {
      const [rn, rp] = await Promise.all([
        fetch("/api/embudos/numeros", { cache: "no-store" }),
        fetch("/api/products", { cache: "no-store" }),
      ]);
      const dn = await rn.json();
      setConfigurado(dn.configurado !== false);
      setNumeros(Array.isArray(dn.numeros) ? dn.numeros : []);
      if (dn.error && dn.configurado !== false) setErrorCarga(dn.error);
      if (rp.ok) {
        const lista = (await rp.json()) as ProductoLite[];
        setProductos(Array.isArray(lista) ? lista : []);
      }
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function nuevo() {
    setForm(numeroBotVacio());
    setEditandoId(null);
    setOtroProducto(false);
    setEstado("");
  }

  function editar(n: NumeroBot) {
    setForm({ ...n });
    setEditandoId(n.phone_id);
    const enLista = productos.some((p) => keyProducto(p) === n.producto_activo);
    setOtroProducto(Boolean(n.producto_activo) && !enLista);
    setEstado("");
  }

  function setCampo(k: keyof NumeroBot, v: string) {
    setForm((f) => (f ? { ...f, [k]: v } : f));
  }

  async function guardar() {
    if (!form) return;
    setEstado("Guardando…");
    try {
      const res = await fetch("/api/embudos/numeros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEstado("⚠️ " + (data.error ?? `Error ${res.status}`));
        return;
      }
      setForm(null);
      setEditandoId(null);
      await cargar();
    } catch (e) {
      setEstado("⚠️ " + (e instanceof Error ? e.message : "Error de red"));
    }
  }

  async function borrar(phone_id: string, numero: string) {
    if (!confirm(`¿Borrar el número ${numero || phone_id}? El bot dejará de resolverlo.`)) return;
    try {
      const res = await fetch(`/api/embudos/numeros/${encodeURIComponent(phone_id)}`, {
        method: "DELETE",
      });
      if (res.ok) await cargar();
    } catch {
      /* silencio: recarga manual */
    }
  }

  const nombreProducto = (clave: string) => {
    const p = productos.find((x) => keyProducto(x) === clave);
    return p ? p.nombre : clave;
  };

  if (!configurado) {
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

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Números</h2>
          <p className="text-xs text-muted">
            La config técnica de cada número de WhatsApp y qué producto vende hoy.
          </p>
        </div>
        {!form && (
          <button
            onClick={nuevo}
            className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            + Nuevo número
          </button>
        )}
      </div>

      {errorCarga && (
        <div className="rounded-lg border border-red-400/40 bg-red-400/10 p-3 text-xs text-red-400">
          {errorCarga}
        </div>
      )}

      {/* Lista de números */}
      {!form && (
        <div className="space-y-2">
          {cargando ? (
            <p className="text-sm text-muted">Cargando…</p>
          ) : numeros.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--hairline)] p-6 text-center text-sm text-muted">
              Aún no hay números. Crea el primero con <b>“+ Nuevo número”</b>.
            </p>
          ) : (
            numeros.map((n) => (
              <div
                key={n.phone_id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--hairline)] glass p-4"
              >
                <span className="rounded-full bg-[var(--field)] px-2 py-0.5 text-xs font-medium text-muted">
                  {NOMBRE_PAIS[n.pais] ?? n.pais}
                </span>
                <span className="font-medium text-text">{n.numero_whatsapp || n.phone_id}</span>
                <span className="text-xs text-muted">
                  vende:{" "}
                  {n.producto_activo ? (
                    <b className="text-text">{nombreProducto(n.producto_activo)}</b>
                  ) : (
                    <i>sin asignar</i>
                  )}
                </span>
                <div className="ml-auto flex items-center gap-3">
                  <button
                    onClick={() => editar(n)}
                    className="text-xs text-accent-2 hover:underline"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => borrar(n.phone_id, n.numero_whatsapp)}
                    className="text-xs text-muted hover:text-red-400"
                  >
                    Borrar
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Formulario */}
      {form && (
        <div className="space-y-4 rounded-xl border border-[var(--hairline)] glass p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">
              {editandoId ? "Editar número" : "Nuevo número"}
            </h3>
            <button
              onClick={() => {
                setForm(null);
                setEditandoId(null);
                setEstado("");
              }}
              className="text-xs text-muted hover:text-text"
            >
              Cancelar
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {CAMPOS.map(({ k, label, sensible, hint }) => (
              <label key={k} className="flex flex-col gap-1 text-sm">
                <span className="text-muted">{label}</span>
                <input
                  type={sensible ? "password" : "text"}
                  value={String(form[k] ?? "")}
                  disabled={k === "phone_id" && editandoId !== null}
                  onChange={(e) => setCampo(k, e.target.value)}
                  autoComplete={sensible ? "new-password" : "off"}
                  className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent disabled:opacity-50"
                />
                {hint && <span className="text-xs text-muted">{hint}</span>}
              </label>
            ))}

            {/* País */}
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">País que atiende</span>
              <select
                value={form.pais}
                onChange={(e) => setCampo("pais", e.target.value)}
                className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
              >
                {PAISES_EMBUDO_BOT.map((p) => (
                  <option key={p} value={p}>
                    {NOMBRE_PAIS[p]} ({p})
                  </option>
                ))}
              </select>
            </label>

            {/* Producto activo (apuntador) */}
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">Producto que vende hoy</span>
              {otroProducto ? (
                <input
                  type="text"
                  value={form.producto_activo}
                  placeholder="clave del producto (ej. masmellos)"
                  onChange={(e) => setCampo("producto_activo", e.target.value)}
                  className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
                />
              ) : (
                <select
                  value={form.producto_activo}
                  onChange={(e) => {
                    if (e.target.value === "__otro__") {
                      setOtroProducto(true);
                      setCampo("producto_activo", "");
                    } else {
                      setCampo("producto_activo", e.target.value);
                    }
                  }}
                  className="rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent"
                >
                  <option value="">— sin asignar —</option>
                  {productos.map((p) => (
                    <option key={p.id} value={keyProducto(p)}>
                      {p.nombre}
                    </option>
                  ))}
                  <option value="__otro__">Otro (escribir a mano)…</option>
                </select>
              )}
              <span className="text-xs text-muted">
                Se conecta a tus productos de Datibot. Cambiarlo aquí cambia lo que vende el
                número, al instante.
              </span>
            </label>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={guardar}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              Guardar número
            </button>
            {estado && <span className="text-sm text-muted">{estado}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
