// Puente shell → Creador de Flujos.
// Añadido por el monorepo (no forma parte de la app original).
//
// La app de flujos maneja sus secretos en un panel propio (localStorage) y un
// único token Graph global. Este puente lee la Configuración del shell
// (/api/config, mismo origen) y, según el país seleccionado, inyecta el token
// Graph/CAPI y demás datos base de ESE país en la app:
//
//   - Rellena el campo global #sec_graph con el token del país activo, de modo
//     que generate() lo use (la app sustituye __GRAPH_TOKEN__ por ese valor).
//   - Sobrescribe en EmbudoMotor.COUNTRIES[XX] los IDs y el chatwoot_token.
//   - Sobrescribe EmbudoMotor.PIXELS por categoría.
//
// Si un valor está vacío en Configuración, NO se toca (se respeta el de la app).

(function () {
  "use strict";
  var MAP = { PE: "flujos_pe", CL: "flujos_cl", CO: "flujos_co" };
  var store = null;

  function applyCountryData(M) {
    if (!M || !M.COUNTRIES) return;
    Object.keys(MAP).forEach(function (code) {
      var cfg = store[MAP[code]] || {};
      var c = M.COUNTRIES[code];
      if (!c) return;
      ["phone_id", "account_id", "page_id", "chatwoot_token", "capi_token"].forEach(
        function (k) {
          if (cfg[k]) c[k] = cfg[k];
        },
      );
    });
  }

  // Detecta el país activo por el texto de la pestaña activa.
  function activeCode(M) {
    var active = document.querySelector(".tab.active");
    if (!active || !M || !M.COUNTRIES) return null;
    var txt = active.textContent || "";
    return (
      Object.keys(M.COUNTRIES).find(function (code) {
        var n = M.COUNTRIES[code] && M.COUNTRIES[code].nombre;
        return n && txt.indexOf(n) >= 0;
      }) || null
    );
  }

  // Fija el valor de un input (por id) y notifica a la app.
  function setInput(id, value) {
    if (!value) return;
    var f = document.getElementById(id);
    if (f && f.value !== value) {
      f.value = value;
      f.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  // Rellena, para el país activo: el token Graph global (#sec_graph) y el
  // píxel (#pixel_id). El píxel por país tiene prioridad sobre el de categoría.
  function syncCountryFields(M) {
    var code = activeCode(M);
    if (!code) return;
    var cfg = store[MAP[code]] || {};
    setInput("sec_graph", cfg.capi_token);
    setInput("pixel_id", cfg.pixel_id);
  }

  function boot() {
    fetch("/api/config")
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        store = data || {};
        var M = window.EmbudoMotor;
        applyCountryData(M);

        // Sondeo ligero: cada 250 ms detecta si cambió el país activo y reaplica
        // token + píxel. Robusto frente al re-render de la app (evita depender de
        // detectar el clic, que compite con la reconstrucción del formulario).
        var lastCode = null;
        setInterval(function () {
          var code = activeCode(M);
          if (code && code !== lastCode) {
            lastCode = code;
            syncCountryFields(M);
          }
        }, 250);
      })
      .catch(function (e) {
        console.warn("[flujos-bridge] no se pudo cargar la config:", e);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
