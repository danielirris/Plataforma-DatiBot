"use client";

import { useEffect, useState } from "react";
import { type NumeroBot } from "@/lib/embudos/types";

type ProductoLite = { id: string; nombre: string; productoId?: string };
type MediaRow = Record<string, string | null>;

const keyProducto = (p: ProductoLite) => (p.productoId?.trim() || p.id);

const SLOTS: { slot: string; label: string; acepta: string }[] = [
  { slot: "video", label: "Video del embudo", acepta: "video/mp4,video/quicktime,.mp4,.mov,.m4v" },
  { slot: "pdf_1", label: "PDF 1", acepta: "application/pdf,.pdf" },
  { slot: "pdf_2", label: "PDF 2", acepta: "application/pdf,.pdf" },
  { slot: "pdf_3", label: "PDF 3", acepta: "application/pdf,.pdf" },
  { slot: "pdf_4", label: "PDF 4", acepta: "application/pdf,.pdf" },
  { slot: "pdf_5", label: "PDF 5", acepta: "application/pdf,.pdf" },
  { slot: "pdf_6", label: "PDF 6", acepta: "application/pdf,.pdf" },
];

function cols(slot: string): { url: string; media_id: string; caption: string; filename: string | null } {
  if (slot === "video")
    return { url: "url_video", media_id: "video_media_id", caption: "video_caption", filename: null };
  const n = slot.slice(4);
  return { url: `pdf_${n}_url`, media_id: `pdf_${n}_media_id`, caption: `pdf_${n}_caption`, filename: `pdf_${n}_filename` };
}

export function MediaManager() {
  const [productosDatibot, setProductosDatibot] = useState<ProductoLite[]>([]);
  const [numeros, setNumeros] = useState<NumeroBot[]>([]);
  const [productoKey, setProductoKey] = useState<string>("");
  const [otro, setOtro] = useState<boolean>(false);
  const [otroText, setOtroText] = useState<string>(""); // texto del input "otro" (no dispara carga)
  const [phoneId, setPhoneId] = useState<string>("");
  const [media, setMedia] = useState<MediaRow | null>(null);
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState<boolean>(false);
  const [subiendo, setSubiendo] = useState<Record<string, boolean>>({});
  const [borrando, setBorrando] = useState<Record<string, boolean>>({});
  const [renovando, setRenovando] = useState<boolean>(false);
  const [vaciando, setVaciando] = useState<boolean>(false);
  const [estado, setEstado] = useState<string>("");
  const cargado = productoKey !== "" && !cargando;

  useEffect(() => {
    fetch("/api/products", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((l: ProductoLite[]) => setProductosDatibot(Array.isArray(l) ? l : []))
      .catch(() => {});
    fetch("/api/embudos/numeros", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setNumeros(Array.isArray(d.numeros) ? d.numeros : []))
      .catch(() => {});
  }, []);

  function aplicarMedia(row: MediaRow | null, key: string) {
    setMedia(row);
    const caps: Record<string, string> = {};
    for (const { slot } of SLOTS) caps[slot] = String(row?.[cols(slot).caption] ?? "");
    setCaptions(caps);
    // Número por defecto: PRIMERO el que ya aloja la media (row.phone_id) — así
    // "Reemplazar" un slot usa el número correcto y no choca con el guard de mezcla de
    // números (M5). Si no hay media previa, cae al número que vende el producto.
    const porProducto = numeros.find((n) => n.producto_activo === key);
    setPhoneId(String(row?.phone_id ?? "") || porProducto?.phone_id || numeros[0]?.phone_id || "");
  }

  async function cargar(key: string) {
    setProductoKey(key);
    setEstado("");
    if (!key) {
      setMedia(null);
      return;
    }
    setCargando(true);
    try {
      const r = await fetch(`/api/embudos/media?producto=${encodeURIComponent(key)}`, { cache: "no-store" });
      const data = await r.json();
      aplicarMedia((data.media ?? null) as MediaRow | null, key);
      if (data.error) setEstado("⚠️ " + data.error);
    } catch (e) {
      setEstado("⚠️ " + (e instanceof Error ? e.message : "Error de red"));
    }
    setCargando(false);
  }

  async function subir(slot: string, file: File) {
    if (!phoneId) {
      setEstado("⚠️ Elige primero el número que aloja la media.");
      return;
    }
    setSubiendo((s) => ({ ...s, [slot]: true }));
    setEstado(`Subiendo ${slot}… (guarda en img y sube a WhatsApp)`);
    try {
      const fd = new FormData();
      fd.append("producto", productoKey);
      fd.append("slot", slot);
      fd.append("phone_id", phoneId);
      fd.append("caption", captions[slot] ?? "");
      fd.append("archivo", file);
      const r = await fetch("/api/embudos/media/subir", { method: "POST", body: fd });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        aplicarMedia((data.media ?? null) as MediaRow, productoKey);
        setEstado(`✓ ${slot}: media_id listo.`);
      } else {
        setEstado("⚠️ " + (data.error ?? `Error ${r.status}`));
      }
    } catch (e) {
      setEstado("⚠️ " + (e instanceof Error ? e.message : "Error de red"));
    }
    setSubiendo((s) => ({ ...s, [slot]: false }));
  }

  async function guardarCaptions() {
    setEstado("Guardando captions…");
    const campos: Record<string, string> = {};
    for (const { slot } of SLOTS) campos[cols(slot).caption] = captions[slot] ?? "";
    try {
      const r = await fetch("/api/embudos/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ producto: productoKey, campos }),
      });
      const data = await r.json().catch(() => ({}));
      setEstado(r.ok ? "✓ Captions guardados." : "⚠️ " + (data.error ?? `Error ${r.status}`));
    } catch (e) {
      setEstado("⚠️ " + (e instanceof Error ? e.message : "Error de red"));
    }
  }

  async function renovar() {
    if (!confirm("Re-subir toda la media de este producto a WhatsApp (renueva los media_id)?")) return;
    setRenovando(true);
    setEstado("Renovando media…");
    try {
      const r = await fetch("/api/embudos/media/renovar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ producto: productoKey }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        await cargar(productoKey);
        const res = data.resultados?.[0];
        setEstado(res ? `✓ Renovados ${res.renovados}${res.errores?.length ? ` · errores: ${res.errores.join("; ")}` : ""}` : "✓ Listo.");
      } else setEstado("⚠️ " + (data.error ?? `Error ${r.status}`));
    } catch (e) {
      setEstado("⚠️ " + (e instanceof Error ? e.message : "Error de red"));
    }
    setRenovando(false);
  }

  async function borrarSlot(slot: string) {
    const label = SLOTS.find((s) => s.slot === slot)?.label ?? slot;
    if (!confirm(`¿Quitar «${label}»? Se borra el archivo y su media_id (podrás volver a subirlo).`))
      return;
    setBorrando((s) => ({ ...s, [slot]: true }));
    setEstado("");
    try {
      const r = await fetch("/api/embudos/media/borrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ producto: productoKey, slot }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        aplicarMedia((data.media ?? null) as MediaRow | null, productoKey);
        setEstado(`✓ «${label}» quitado.`);
      } else setEstado("⚠️ " + (data.error ?? `Error ${r.status}`));
    } catch (e) {
      setEstado("⚠️ " + (e instanceof Error ? e.message : "Error de red"));
    }
    setBorrando((s) => ({ ...s, [slot]: false }));
  }

  async function vaciarTodo() {
    if (
      !confirm(
        "¿Vaciar TODA la media de este producto? Se borran todos los archivos y se suelta el " +
          "número (para poder migrar el producto a otro número). Tendrás que volver a subir.",
      )
    )
      return;
    setVaciando(true);
    setEstado("");
    try {
      const r = await fetch("/api/embudos/media/borrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ producto: productoKey, todo: true }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        aplicarMedia((data.media ?? null) as MediaRow | null, productoKey);
        setEstado("✓ Media vaciada. Ya puedes subirla en otro número.");
      } else setEstado("⚠️ " + (data.error ?? `Error ${r.status}`));
    } catch (e) {
      setEstado("⚠️ " + (e instanceof Error ? e.message : "Error de red"));
    }
    setVaciando(false);
  }

  const inputCls =
    "w-full rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-sm text-text outline-none focus:border-accent";

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-medium">Media (video y PDFs)</h2>
        <p className="text-xs text-muted">
          Sube el video y los PDFs. La app los guarda en el servidor de archivos y los sube
          a WhatsApp para obtener el <code>media_id</code> (envío instantáneo). Se{" "}
          <b>renuevan solas cada ~20 días</b> (los media_id caducan); también puedes forzarlo
          con «Renovar media».
        </p>
      </div>

      {numeros.length === 0 && (
        <div className="rounded-lg border-l-2 border-amber-400 bg-amber-400/10 p-3 text-xs text-muted">
          Aún no hay <b className="text-text">números</b> configurados. La media se aloja en un
          número de WhatsApp, así que crea uno primero en la pestaña{" "}
          <a href="/embudos" className="text-accent-2 underline">Números</a> — si no, toda subida
          fallará con «Elige primero el número».
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Producto */}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Producto</span>
          {otro ? (
            <input
              value={otroText}
              placeholder="clave del producto (Enter para cargar)"
              // M3: cargar solo al salir del campo o con Enter, no en cada tecla.
              onChange={(e) => setOtroText(e.target.value)}
              // Solo recargar si la clave cambió (no pisar lo que haya en pantalla).
              onBlur={() => {
                const k = otroText.trim();
                if (k !== productoKey) cargar(k);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const k = otroText.trim();
                  if (k !== productoKey) cargar(k);
                }
              }}
              className={inputCls}
            />
          ) : (
            <select
              value={productoKey}
              onChange={(e) => {
                if (e.target.value === "__otro__") {
                  setOtro(true);
                  setOtroText("");
                  cargar("");
                } else cargar(e.target.value);
              }}
              className={inputCls}
            >
              <option value="">— elige un producto —</option>
              {productosDatibot.map((p) => (
                <option key={p.id} value={keyProducto(p)}>
                  {p.nombre}
                </option>
              ))}
              <option value="__otro__">Otro (escribir clave a mano)…</option>
            </select>
          )}
        </label>

        {/* Número que aloja la media */}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Número que aloja la media</span>
          <select value={phoneId} onChange={(e) => setPhoneId(e.target.value)} className={inputCls}>
            <option value="">— elige un número —</option>
            {numeros.map((n) => (
              <option key={n.phone_id} value={n.phone_id}>
                {n.nombre || n.numero_whatsapp || n.phone_id}
                {n.nombre ? ` · ${n.numero_whatsapp || n.phone_id}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {cargando && <p className="text-sm text-muted">Cargando…</p>}

      {cargado && productoKey && (
        <>
          <div className="space-y-3">
            {SLOTS.map(({ slot, label, acepta }) => {
              const c = cols(slot);
              const tieneId = Boolean(media?.[c.media_id]);
              const nombre = c.filename ? String(media?.[c.filename] ?? "") : "";
              return (
                <div key={slot} className="rounded-xl border border-[var(--hairline)] glass p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-text">{label}</span>
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-[11px] " +
                        (tieneId ? "bg-accent/20 text-accent-2" : "bg-[var(--field)] text-muted")
                      }
                    >
                      {tieneId ? "media_id ✓" : "sin subir"}
                    </span>
                    {nombre && <span className="text-xs text-muted">{nombre}</span>}
                    <div className="ml-auto flex items-center gap-2">
                      {tieneId && (
                        <button
                          onClick={() => borrarSlot(slot)}
                          disabled={borrando[slot]}
                          className="rounded-lg border border-[var(--hairline)] px-3 py-1.5 text-xs text-muted hover:text-red-400 disabled:opacity-50"
                        >
                          {borrando[slot] ? "Quitando…" : "Quitar"}
                        </button>
                      )}
                      <label className="cursor-pointer rounded-lg border border-accent/50 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent-2 hover:bg-accent/20">
                        {subiendo[slot] ? "Subiendo…" : tieneId ? "Reemplazar" : "Subir"}
                        <input
                          type="file"
                          accept={acepta}
                          className="hidden"
                          disabled={subiendo[slot]}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (f) subir(slot, f);
                          }}
                        />
                      </label>
                    </div>
                  </div>
                  <input
                    value={captions[slot] ?? ""}
                    placeholder="Caption (texto que acompaña al archivo)"
                    onChange={(e) => setCaptions((prev) => ({ ...prev, [slot]: e.target.value }))}
                    className={inputCls + " mt-2"}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--hairline)] glass p-4">
            <button
              onClick={guardarCaptions}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              Guardar captions
            </button>
            <button
              onClick={renovar}
              disabled={renovando}
              className="rounded-lg border border-[var(--hairline)] px-3 py-2 text-sm text-muted hover:text-text disabled:opacity-50"
            >
              {renovando ? "Renovando…" : "🔄 Renovar media (re-subir a WhatsApp)"}
            </button>
            <button
              onClick={vaciarTodo}
              disabled={vaciando}
              className="rounded-lg border border-[var(--hairline)] px-3 py-2 text-sm text-muted hover:text-red-400 disabled:opacity-50"
              title="Borra toda la media y suelta el número, para migrar el producto a otro número"
            >
              {vaciando ? "Vaciando…" : "🗑️ Vaciar toda la media"}
            </button>
            {estado && (
              <span className={"text-sm " + (estado.startsWith("✓") ? "text-accent-2" : "text-muted")}>
                {estado}
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
