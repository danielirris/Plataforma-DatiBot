"use client";

import { useState } from "react";
import { Logo } from "../_components/Logo";

export default function LoginPage() {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        // Navegación COMPLETA para que el middleware vea la nueva cookie.
        const next = new URLSearchParams(window.location.search).get("next");
        window.location.href = next && next.startsWith("/") ? next : "/";
      } else {
        setError(data?.error ?? "No se pudo iniciar sesión.");
        setCargando(false);
      }
    } catch {
      setError("Fallo de red. Inténtalo de nuevo.");
      setCargando(false);
    }
  }

  const input =
    "mt-1 w-full rounded-lg border border-[var(--hairline)] bg-[var(--field)] px-3 py-2 text-text outline-none focus:border-accent";

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <Logo size={40} />
          <span className="text-2xl font-semibold uppercase tracking-tight text-text">
            Datibot
          </span>
        </div>
        <form
          onSubmit={entrar}
          className="glass space-y-4 rounded-2xl border border-[var(--hairline)] p-6"
        >
          <h1 className="text-lg">Iniciar sesión</h1>
          <label className="block text-sm">
            <span className="text-muted">Usuario</span>
            <input
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              autoFocus
              autoComplete="username"
              className={input}
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted">Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className={input}
            />
          </label>
          {error && <p className="text-sm text-[var(--bad)]">⚠️ {error}</p>}
          <button
            type="submit"
            disabled={cargando}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-[#111] disabled:opacity-60"
          >
            {cargando ? "Entrando…" : "Iniciar sesión"}
          </button>
        </form>
      </div>
    </div>
  );
}
