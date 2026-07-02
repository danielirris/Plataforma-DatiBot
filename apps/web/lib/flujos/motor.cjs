/* ============================================================================
 * motor.js — Motor de la Fábrica de Embudos WhatsApp
 * ----------------------------------------------------------------------------
 * MOTOR ÚNICO compartido por index.html (navegador) y generar.mjs (CLI).
 * Sin dependencias externas. Funciona en Node (module.exports) y en el
 * navegador (global window.EmbudoMotor).
 *
 * ARQUITECTURA DE DOS CAPAS (nunca reemplazo global ingenuo):
 *   Capa 1 — Overwrite de campos por dirección estructural:
 *            se sobrescribe assignment.value de los nodos `set`
 *            (⚙️ CONFIGURAR, 🔌 Por API/País, 📦 Orderbumps, 📥 Datos de entrada)
 *            direccionando por nombre_de_asignación. Jamás por texto.
 *   Capa 2 — Sustitución global SOLO con lista blanca:
 *            se serializa a string y se reemplazan ÚNICAMENTE los tokens
 *            [TOKEN] que estén en la lista blanca (resolver). El valor se
 *            escapa para JSON con JSON.stringify(v).slice(1,-1).
 *
 * LISTA NEGRA (jamás se tocan): [BOT] [SISTEMA] [CLIENTE] y cualquier [n]
 * puramente numérico ([0] [1] [2] [4849] …).
 * ==========================================================================*/
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') window.EmbudoMotor = mod;
  if (typeof globalThis !== 'undefined') globalThis.EmbudoMotor = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ------------------------------------------------------------------ DATOS
  // Datos de pago (GUIA_SUPREMA §6) + API (DOCUMENTO MAESTRO de API).
  // SECRETOS: NO se hornean en la app (para poder publicarla). El token Graph/
  // CAPI, la service key de Supabase y el token de Telegram se piden en runtime
  // (panel «Credenciales», guardado solo en el navegador) y se inyectan en
  // generate() reemplazando los placeholders __GRAPH_TOKEN__/__SB_KEY__/__TG_TOKEN__.
  const GRAPH_TOKEN = '';

  // Marcadores de secreto (sustituidos por build-html en las plantillas embebidas
  // y reemplazados por los valores reales del usuario en generate()).
  const SECRET_PLACEHOLDERS = {
    __GRAPH_TOKEN__: 'graph',
    __SB_KEY__: 'supabase',
    __TG_TOKEN__: 'telegram',
    __CW_TOKEN__: 'chatwoot'
  };
  const COUNTRIES = {
    PE: {
      codigo: 'PE', nombre: '🇵🇪 Perú', moneda: 'PEN', simbolo: 'S/',
      numero_cuenta: '935616142', titular_cuenta: 'Said Zambrano',
      mi_telefono: '573227784838', phone_id: '1187905924398803',
      metodo_pago: 'Yape', banco: 'Yape / Plin',
      waba_id: '1417083590460335', webhook: 'meta-puente-pe', fb_credential_id: 'r58x5kAp2HplLZX2',
      page_id: '1019073437959288', capi_token: GRAPH_TOKEN,
      app_id: '1572307587358195', inbox_id: '573227784838', account_id: '1',
      chatwoot_token: '',
      metodos: [
        { key: 'yape', label: 'Yape', numero: '935616142' },
        { key: 'plin', label: 'Plin', numero: '935616142' }
      ]
    },
    CL: {
      codigo: 'CL', nombre: '🇨🇱 Chile', moneda: 'CLP', simbolo: '$',
      numero_cuenta: '13262377', titular_cuenta: 'Daniel Stiven Garay Martinez',
      rut: '530050165', mi_telefono: '573227784849', phone_id: '1197005053487898',
      metodo_pago: 'Global66', banco: 'Global66 / Global Card S.A.',
      waba_id: '1444758464005361', webhook: 'meta-puente-cl', fb_credential_id: 'r58x5kAp2HplLZX2',
      page_id: '1019073437959288', capi_token: GRAPH_TOKEN,
      app_id: '1572307587358195', account_id: '1',
      chatwoot_token: '',
      metodos: [
        { key: 'transferencia', label: 'Global66 (transferencia)', numero: '13262377' }
      ]
    },
    CO: {
      codigo: 'CO', nombre: '🇨🇴 Colombia', moneda: 'COP', simbolo: '$',
      numero_cuenta: '3058176936', titular_cuenta: 'Daniel Stiven Garay Martinez',
      llave_breb: '@copa2025', numero_nequi_daviplata: '3058176936',
      mi_telefono: '573138674668', phone_id: '675545768971178',
      metodo_pago: 'Nequi', banco: 'Nequi / Daviplata',
      waba_id: '3934647756851087', webhook: 'meta-puente-magenta', fb_credential_id: 'C5UIvDkVvjjbzR6t',
      page_id: '351876491348636', capi_token: GRAPH_TOKEN,
      app_id: '1431703831336996', inbox_id: '573138674668', account_id: '1',
      chatwoot_token: '',
      metodos: [
        { key: 'nequi', label: 'Nequi', numero: '3058176936' },
        { key: 'daviplata', label: 'Daviplata', numero: '3058176936' },
        { key: 'breb', label: 'Bre-B (llave)', numero: '@copa2025' }
      ]
    },
    VE: {
      codigo: 'VE', nombre: '🇻🇪 Venezuela', moneda: 'VES', simbolo: 'Bs',
      numero_cuenta: '24252177', titular_cuenta: 'Andres Acosta',
      telefono_ref: '04246846242', mi_telefono: '', phone_id: '',
      metodo_pago: 'Mercantil', banco: 'Mercantil', webhook: 'meta-puente-ve'
    },
    MX: {
      codigo: 'MX', nombre: '🇲🇽 México', moneda: 'MXN', simbolo: '$',
      numero_cuenta: '703180052006190817', titular_cuenta: 'Daniel Stiven Garay Martinez',
      referencia: '04246846242', mi_telefono: '', phone_id: '',
      metodo_pago: 'STP', banco: 'STP / TESORED', webhook: 'meta-puente-mx'
    }
  };

  // Pixel por categoría (no por país)
  const PIXELS = {
    hombres: '923766937348701', // carpintería, neveras, lavadoras…
    mujeres: ''                 // kéfir, helados, yogurt… (se pega una vez)
  };

  // Credenciales de Facebook Graph API (n8n) detectadas en las plantillas.
  // El usuario elige cuál usar POR PAÍS; en generate se reescribe en todos los
  // nodos que tengan credential `facebookGraphApi`. Se puede añadir una propia.
  const FACEBOOK_CREDENTIALS = [
    { id: 'r58x5kAp2HplLZX2', name: 'Facebook Graph account - Carolina2 - [4849]' },
    { id: 'C5UIvDkVvjjbzR6t', name: 'Autenticación Facebook - Diana' }
  ];

  // Nodos `set` que son fuente de verdad y pueden recibir Capa 1.
  // OJO: 🌐 Global (fijo) NO se toca salvo que el usuario lo pida (infra compartida).
  const CONFIG_NODE_KEYWORDS = ['CONFIGURAR', 'Por API', 'País', 'Orderbump', 'Datos de entrada'];
  const PROTECTED_NODE_KEYWORDS = ['Global (fijo)'];

  // Lista negra explícita (además de los tokens puramente numéricos).
  const BLACKLIST = new Set(['BOT', 'SISTEMA', 'CLIENTE']);

  // Etiquetas Chatwoot: viven como literal 'x' dentro del jsonBody de los
  // nodos httpRequest «🏷️ Etiqueta <x>». Overwrite dirigido por nodo (seguro:
  // NO global — 'metodo_pago' también es nombre de campo en CONFIGURAR).
  const LABELS = [
    { key: 'bienvenido', nodeMatch: 'Etiqueta bienvenid', def: 'bienvenido' },
    { key: 'metodo_pago', nodeMatch: 'Etiqueta metodo_pago', def: 'metodo_pago' },
    { key: 'comprador', nodeMatch: 'Etiqueta comprador', def: 'comprador' }
  ];

  // Regex de token REAL: solo MAYÚSCULAS/dígitos/guion_bajo entre corchetes.
  // Excluye por construcción: [0] via filtro numérico, [$json…], [hashes.x],
  // ['comprador'], [MENSAJE_1: …] (dos puntos/minúsculas), [\s\S], etc.
  const TOKEN_RE = /\[([A-ZÁÉÍÓÚÑ0-9_]{2,60})\]/g;

  // ---------------------------------------------------------------- HELPERS
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  function stripAccents(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  function slug(s) {
    return stripAccents(s).toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }
  function upperNoAccents(s) { return stripAccents(s).toUpperCase().trim(); }
  function capitalize(s) {
    s = String(s == null ? '' : s).trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }
  function toNum(v) {
    if (v === '' || v == null) return NaN;
    const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? NaN : n;
  }
  function isExpr(v) { return typeof v === 'string' && v.charAt(0) === '='; }

  // Escapa un valor para inyectarlo DENTRO de un string JSON ya serializado.
  function escapeForJson(v) {
    return JSON.stringify(String(v == null ? '' : v)).slice(1, -1);
  }

  // Reemplazo literal (sin regex) — el mecanismo aprobado por la guía.
  function splitJoin(str, needle, replacement) {
    return str.split(needle).join(replacement);
  }

  // ¿Es un token REAL (candidato a rellenar), no lista negra ni índice numérico?
  function isRealTokenName(name) {
    if (!name) return false;
    if (/^[0-9]+$/.test(name)) return false;   // [0] [1] [4849] …
    if (BLACKLIST.has(name)) return false;      // BOT SISTEMA CLIENTE
    return /^[A-ZÁÉÍÓÚÑ0-9_]{2,60}$/.test(name);
  }

  // Extrae los tokens reales (con corchetes) presentes en un string.
  function extractTokens(str) {
    const found = new Set();
    let m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(str)) !== null) {
      if (isRealTokenName(m[1])) found.add('[' + m[1] + ']');
    }
    return Array.from(found).sort();
  }

  // ------------------------------------------------------------- SET NODES
  function getAssignments(node) {
    const p = (node && node.parameters) || {};
    const a = p.assignments;
    if (a && Array.isArray(a.assignments)) {
      return a.assignments; // n8n v3 set node → array de {id,name,value,type}
    }
    // Legacy set node (values.string/number/…)
    const out = [];
    const vals = p.values || {};
    for (const k of Object.keys(vals)) {
      if (Array.isArray(vals[k])) for (const x of vals[k]) out.push(x);
    }
    return out;
  }
  function isSetNode(node) { return node && node.type === 'n8n-nodes-base.set'; }
  function nodeIs(node, keywords) {
    const nm = (node && node.name) || '';
    return keywords.some(k => nm.indexOf(k) !== -1);
  }

  // ------------------------------------------------------- DETECT FAMILY
  function collectConfigFieldNames(wf) {
    const names = new Set();
    for (const n of (wf.nodes || [])) {
      if (isSetNode(n)) for (const a of getAssignments(n)) if (a && a.name) names.add(a.name);
    }
    return names;
  }
  // Campos de config que NINGÚN nodo referencia (leftovers/otros países/otros
  // tipos). Un campo está "en uso" si su nombre aparece >1 vez en el workflow
  // (su definición + al menos una referencia json.<campo>). Se usa para ocultar
  // del formulario lo que no se va a usar (métodos de otro país, mensajes de
  // otro tipo de embudo, campos muertos como system_prompt/monto_esperado).
  function usedConfigFields(wf) {
    const str = JSON.stringify(wf);
    const used = new Set();
    collectConfigFieldNames(wf).forEach(function (f) {
      const esc = f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = str.match(new RegExp('\\b' + esc + '\\b', 'g'));
      if (m && m.length > 1) used.add(f);
    });
    return used;
  }

  function detectFamily(wf) {
    const f = collectConfigFieldNames(wf);
    // COD primero: puede traer también mensaje_1..8 (variante contraentrega).
    if (f.has('cod_bienvenida') || f.has('cod_cobro') || f.has('tier_basico_precio') ||
        f.has('msg_bienvenida') || f.has('precio_tier_basico') || f.has('tipo_embudo')) return 'COD';
    if (f.has('mensaje_video') || f.has('video_url')) return 'CORTO';
    if (f.has('mensaje_1')) return 'LARGO';
    return 'UNKNOWN';
  }

  // Campos que NO se muestran en el formulario: se deducen de arriba
  // (país + tipo + identidad). Se fuerzan en generate desde los derivados.
  const HIDDEN_FIELDS = new Set(['producto_nombre', 'pago_anticipado', 'tipo_embudo']);
  function hasConfigNode(wf) {
    return (wf.nodes || []).some(n => isSetNode(n) && (n.name || '').indexOf('CONFIGURAR TODO AQUÍ') !== -1);
  }

  // ------------------------------------------------------- INTROSPECCIÓN
  // Devuelve, por nodo config editable, sus asignaciones (nombre/valor/tipo),
  // saltando expresiones n8n (value que empieza por '='). Sirve para pintar
  // el formulario adaptado a la plantilla cargada (gana el archivo real).
  function introspect(wf) {
    const sections = [];
    const used = usedConfigFields(wf);
    for (const n of (wf.nodes || [])) {
      if (!isSetNode(n)) continue;
      if (!nodeIs(n, CONFIG_NODE_KEYWORDS)) continue;
      if (nodeIs(n, PROTECTED_NODE_KEYWORDS)) continue;
      const fields = [];
      for (const a of getAssignments(n)) {
        if (!a || !a.name) continue;
        if (HIDDEN_FIELDS.has(a.name)) continue;         // se deducen de arriba
        if (typeof a.value === 'string' && /^=?__[A-Z_]+__$/.test(a.value)) continue; // secreto (runtime)
        fields.push({ name: a.name, value: a.value, type: a.type || 'string', expr: isExpr(a.value), dead: !used.has(a.name) });
      }
      if (fields.length) sections.push({ node: n.name, fields: fields });
    }
    return {
      family: detectFamily(wf),
      hasConfig: hasConfigNode(wf),
      nodeCount: (wf.nodes || []).length,
      sections: sections,
      tokens: extractTokens(JSON.stringify(wf))
    };
  }

  // ------------------------------------------------------------- DERIVE
  // Calcula todos los valores derivados a partir del spec del formulario.
  function derive(spec) {
    spec = spec || {};
    const s = Object.assign({}, spec);
    const country = COUNTRIES[s.pais] || {};
    const tipo = (s.tipo || 'largo').toLowerCase();

    // Identidad
    s.producto_nombre = s.producto_nombre || slug(s.nombre_producto);
    s.producto_id = s.producto_id || (slug(s.producto_nombre) + '_' + String(s.pais || '').toLowerCase() + '_' + tipo);
    s.workflow_name = s.workflow_name || ('SUBW_' + s.producto_id);
    s.nombre_producto_upper = s.nombre_producto_upper || upperNoAccents(s.nombre_producto);
    s.categoria_producto_cap = s.categoria_producto_cap || capitalize(s.categoria_producto);

    // País (rellena desde datos horneados si el spec no trae override)
    s.titular_cuenta = s.titular_cuenta || country.titular_cuenta || '';
    s.numero_pago = s.numero_pago || country.numero_cuenta || '';
    s.mi_telefono = s.mi_telefono || country.mi_telefono || '';
    s.phone_id = s.phone_id || country.phone_id || '';
    s.metodo_pago = s.metodo_pago || country.metodo_pago || '';
    s.capi_currency = s.capi_currency || country.moneda || '';
    s.banco = s.banco || country.banco || '';
    s.terminacion_cuenta = s.terminacion_cuenta || String(s.numero_pago || '').slice(-4);
    s.numero_nequi_daviplata = s.numero_nequi_daviplata || country.numero_nequi_daviplata || s.numero_pago || '';
    s.llave_breb = s.llave_breb || country.llave_breb || '';

    // Atribución: page_id y capi_token del país; pixel_id por CATEGORÍA.
    s.page_id = s.page_id || country.page_id || '';
    s.capi_token = s.capi_token || country.capi_token || '';
    s.pixel_id = s.pixel_id || (PIXELS[s.categoria] || '');

    // Precios (números) y derivados
    const base = toNum(s.precio_base);
    const adic = toNum(s.precio_adicional_ob);
    const rmk180 = toNum(s.precio_rmk_180m);
    s.precio_combo = s.precio_combo || (isNaN(base) || isNaN(adic) ? '' : String(base + adic));
    const piso = isNaN(base) ? '' : String(Math.round(base * 0.6));
    s.piso_regateo = s.piso_regateo || piso;
    s.precio_regateo = s.precio_regateo || piso;
    s.monto_min_regateo = s.monto_min_regateo || piso;
    s.precio_regateo_ej = s.precio_regateo_ej || (isNaN(base) ? '' : String(Math.round(base * 0.7)));
    s.piso_validador = s.piso_validador || (isNaN(rmk180) ? '' : String(rmk180));
    s.monto_base = isNaN(base) ? (s.precio_base || '') : String(base);

    // pago_anticipado + tipo_embudo según tipo (deducidos, ocultos en la UI)
    s.pago_anticipado = s.pago_anticipado || (tipo === 'cod' ? 'No' : 'Si');
    s.tipo_embudo = s.tipo_embudo || (tipo === 'cod' ? 'contraentrega' : tipo);

    return s;
  }

  // ------------------------------------------------ RESOLVER (LISTA BLANCA)
  // Devuelve { "[TOKEN]": valor } para TODOS los tokens conocidos, dados el
  // spec derivado y (opcional) los valores de campos del formulario.
  // Resolución por patrones -> tolerante a los alias legados (con/sin acento,
  // sufijos _PE/_CO, PEGA_AQUI_*). Cualquier token no cubierto queda sin
  // resolver y el QC lo bloquea.
  function resolveTokens(spec, fieldValues) {
    const s = derive(spec);
    fieldValues = fieldValues || {};
    const map = {};
    const set = (tok, val) => { if (val != null) map['[' + tok + ']'] = String(val); };

    // Identidad
    set('NOMBRE_PRODUCTO', s.nombre_producto);
    set('NOMBRE_PRODUCTO_UPPER', s.nombre_producto_upper);
    set('PRODUCTO_NOMBRE', s.producto_nombre);
    set('CATEGORIA_PRODUCTO', s.categoria_producto);
    set('CATEGORIA_PRODUCTO_CAP', s.categoria_producto_cap);
    set('INDUSTRIA_DEL_PRODUCTO', s.industria);
    set('NOMBRE_ORDERBUMP', s.nombre_orderbump);
    set('MARCAS_COMUNES', s.marcas);
    set('EMOJI_PRODUCTO', s.emoji);
    set('DESCRIPCION_CORTA', s.descripcion_corta);
    set('DESCRIPCIÓN_CORTA', s.descripcion_corta);
    set('CAPTION_IMAGEN_PRODUCTO', s.caption_imagen || s.descripcion_corta);

    // Pago / país
    set('TITULAR_CUENTA', s.titular_cuenta);
    set('BENEFICIARIO_CUENTA', s.titular_cuenta);
    set('NUMERO_PAGO', s.numero_pago);
    set('BANCO_DESTINO', s.banco);
    set('TERMINACION_CUENTA', s.terminacion_cuenta);

    // Precios
    set('PRECIO_BASE', s.precio_base);
    set('PRECIO_TACHADO', s.precio_tachado);
    set('PRECIO_RMK_15M', s.precio_rmk_15m);
    set('PRECIO_RMK_60M', s.precio_rmk_60m);
    set('PRECIO_RMK_180M', s.precio_rmk_180m);
    set('PRECIO_ADICIONAL_OB', s.precio_adicional_ob);
    set('PRECIO_COMBO', s.precio_combo);
    set('PRECIO_NORMAL_OB', s.precio_normal_ob);
    set('PRECIO_REGATEO', s.precio_regateo);
    set('PISO_REGATEO', s.piso_regateo);
    set('PISO_REGATEO_MILES', s.piso_regateo);
    set('MONTO_MIN_REGATEO', s.monto_min_regateo);
    set('PRECIO_REGATEO_EJ', s.precio_regateo_ej);
    set('PISO_VALIDADOR', s.piso_validador);
    set('PISO_VALIDADOR_MINIMO', s.piso_validador);
    set('MONTO_BASE_PE', s.monto_base);
    set('MONTO_BASE_CO', s.monto_base);
    set('MONTO_MINIMO_VISION', s.monto_minimo_vision || s.piso_validador);
    // COD tiers
    set('PRECIO_TIER_BASICO', s.precio_tier_basico);
    set('PRECIO_TIER_MEDIUM', s.precio_tier_medium);
    set('PRECIO_TIER_PREMIUM', s.precio_tier_premium);

    // Activos / links
    set('URL_BASE_IMAGENES_PRODUCTO', s.url_base_imagenes);
    set('URL_IMAGEN_PRODUCTO', s.url_imagen_producto || (s.url_base_imagenes ? s.url_base_imagenes + '/Imagen1.png' : ''));
    set('DRIVE_CONTENIDO_PRODUCTO', s.drive_contenido);
    set('DRIVE_ORDERBUMP', s.drive_orderbump);
    set('DRIVE_ORDERBUMP_PDF', s.drive_orderbump);
    set('DRIVE_FOLDER_ID_COMPROBANTES', s.drive_folder_comprobantes);
    set('LINK_MP4_DEL_VIDEO', s.video_url);
    set('PEGA_AQUI_URL_DEL_VIDEO', s.video_url);
    set('URL_AUDIO_BIENVENIDA', s.url_audio_bienvenida);
    set('URL_AUDIO_OFERTA', s.url_audio_oferta);
    set('URL_AUDIO_1', s.url_audio_bienvenida);
    set('URL_AUDIO_2', s.url_audio_oferta);
    set('FORMS_GLE_COMPRADORES', s.forms_compradores);
    set('FORMS_GLE_COMPRADORES_PE', s.forms_compradores);
    set('FORMS_GLE_COMPRADORES_CO', s.forms_compradores);
    set('PEGA_AQUI_FORMS_COMPRADORES', s.forms_compradores);
    set('FORMS_GLE_SALIDA_PE', s.forms_salida);
    set('FORMS_GLE_SALIDA_CO', s.forms_salida);
    set('PEGA_AQUI_FORMS_SALIDA', s.forms_salida);

    // Listas
    set('LISTA_DE_BONOS', s.lista_bonos);
    set('LISTA_BENEFICIOS_OB', s.lista_beneficios_ob);

    // Meta / atribución
    set('PAGE_ID', s.page_id);
    set('PIXEL_ID', s.pixel_id);
    set('PIXEL_ID_MUJERES', s.pixel_id);
    set('PIXEL_ID_HOMBRES', s.pixel_id);
    set('CAPI_TOKEN', s.capi_token);
    set('TELEGRAM_BOT_TOKEN', s.telegram_token);

    // IDs — TODOS los [PRODUCTO_ID_*] al mismo producto_id calculado.
    ['PRODUCTO_ID_PE_LARGO', 'PRODUCTO_ID_PE_CORTO', 'PRODUCTO_ID_CO_CORTO',
     'PRODUCTO_ID_CO_LARGO', 'PRODUCTO_ID_CO_COD', 'PRODUCTO_ID_CO_COD']
      .forEach(t => set(t, s.producto_id));

    // Fallback por coincidencia de nombre con un campo del formulario:
    // p.ej. [MSG_BIENVENIDA] -> fieldValues['msg_bienvenida'] (COD).
    for (const name of Object.keys(fieldValues)) {
      const tok = '[' + upperNoAccents(name) + ']';
      const v = fieldValues[name];
      if (map[tok] == null && v != null && String(v).length) map[tok] = String(v);
    }

    // Limpia entradas vacías (no queremos "resolver" a "" y ocultar un hueco).
    Object.keys(map).forEach(k => { if (map[k] === '' || map[k] == null) delete map[k]; });
    return map;
  }

  // ------------------------------------------------------------- GENERATE
  // template : objeto workflow n8n (ya parseado)
  // spec     : identidad/precios/país/links/meta del producto
  // opts.fieldValues : { nombre_asignacion: valor } para Capa 1 (mensajes…)
  function generate(template, spec, opts) {
    opts = opts || {};
    const fieldValues = opts.fieldValues || {};
    if (!template || !Array.isArray(template.nodes)) {
      throw new Error('Plantilla inválida: falta el arreglo de nodos.');
    }
    if (!hasConfigNode(template)) {
      throw new Error('Plantilla inválida: no contiene el nodo "⚙️ CONFIGURAR TODO AQUÍ".');
    }
    const wf = deepClone(template);
    const s = derive(spec);
    const family = detectFamily(wf);
    const warnings = [];

    // Asegura que los campos deducidos existan en CONFIGURAR (p.ej. tipo_embudo
    // = contraentrega en COD, que no está en todas las plantillas).
    for (const node of wf.nodes) {
      if (!isSetNode(node) || (node.name || '').indexOf('CONFIGURAR TODO AQUÍ') === -1) continue;
      const arr = node.parameters && node.parameters.assignments && node.parameters.assignments.assignments;
      if (!Array.isArray(arr)) break;
      const have = new Set(arr.map(function (a) { return a.name; }));
      HIDDEN_FIELDS.forEach(function (fn) {
        if (!have.has(fn)) arr.push({ id: 'gen_' + fn, name: fn, value: s[fn] != null ? String(s[fn]) : '', type: 'string' });
      });
      break;
    }

    // -------- CAPA 1: overwrite de campos por dirección estructural --------
    for (const node of wf.nodes) {
      if (!isSetNode(node)) continue;
      if (nodeIs(node, PROTECTED_NODE_KEYWORDS)) continue; // 🌐 Global intacto
      for (const a of getAssignments(node)) {
        if (!a || !a.name) continue;
        // producto_id SIEMPRE igual al calculado (CONFIG y 📥 Datos de entrada).
        if (a.name === 'producto_id' && !isExpr(a.value)) { a.value = s.producto_id; continue; }
        // Campos deducidos de arriba (ocultos): se fuerzan desde los derivados.
        if (HIDDEN_FIELDS.has(a.name) && !isExpr(a.value)) { a.value = s[a.name]; continue; }
        if (isExpr(a.value)) continue; // no tocar expresiones n8n (={{ … }})
        if (Object.prototype.hasOwnProperty.call(fieldValues, a.name)) {
          const v = fieldValues[a.name];
          // Regla de oro: un campo vacío NO sobrescribe (no borra la plantilla).
          if (v != null && String(v).length > 0) a.value = v;
        }
      }
    }
    // Nombre del workflow
    wf.name = s.workflow_name;

    // -------- Métodos de pago (número copiable por método) ------------------
    // opts.pagos = [{ key:'nequi', numero:'320...' }, …]. Un país puede tener
    // 2+ métodos. Cada número va al copiable `<key>_mensaje_2` y (best-effort)
    // reemplaza el número por defecto del país dentro de `<key>_mensaje_1`.
    var pagos = (opts.pagos || []).filter(function (p) { return p && p.key && p.numero != null && String(p.numero) !== ''; });
    if (pagos.length) {
      var ctry = COUNTRIES[s.pais] || {};
      var defs = [ctry.numero_cuenta, ctry.numero_nequi_daviplata, ctry.llave_breb].filter(Boolean);
      var first = pagos[0];
      for (const node of wf.nodes) {
        if (!isSetNode(node) || nodeIs(node, PROTECTED_NODE_KEYWORDS)) continue;
        for (const a of getAssignments(node)) {
          if (!a || !a.name || isExpr(a.value)) continue;
          if (a.name === 'cod_copiable' || a.name === 'numero_cuenta') { a.value = String(first.numero); continue; }
          for (const pg of pagos) {
            var k = String(pg.key).toLowerCase();
            if (a.name === k + '_mensaje_2') { a.value = String(pg.numero); }
            else if (a.name === k + '_mensaje_1' && typeof a.value === 'string') {
              for (const def of defs) a.value = a.value.split(def).join(String(pg.numero));
            }
          }
        }
      }
    }

    // -------- Etiquetas Chatwoot (overwrite dirigido por nodo) --------------
    var labels = opts.labels || {};
    for (const node of wf.nodes) {
      if (node.type !== 'n8n-nodes-base.httpRequest') continue;
      for (const L of LABELS) {
        if ((node.name || '').indexOf(L.nodeMatch) === -1) continue;
        var val = labels[L.key];
        if (val == null || String(val).length === 0 || val === L.def) continue;
        var p = node.parameters || {};
        if (typeof p.jsonBody === 'string') {
          p.jsonBody = p.jsonBody.split("'" + L.def + "'").join("'" + String(val) + "'");
        }
      }
    }

    // -------- Autenticación de Facebook (credencial n8n por país) -----------
    // Reescribe la credencial `facebookGraphApi` en TODOS los nodos que la usan.
    var fb = opts.fbCredential;
    if (fb && (fb.id || fb.name)) {
      for (const node of wf.nodes) {
        if (node.credentials && node.credentials.facebookGraphApi) {
          node.credentials.facebookGraphApi = {
            id: fb.id || node.credentials.facebookGraphApi.id,
            name: fb.name || node.credentials.facebookGraphApi.name
          };
        }
      }
    }

    // -------- CAPA 2: sustitución global SOLO con lista blanca --------------
    let str = JSON.stringify(wf);
    const tokenMap = resolveTokens(s, fieldValues);
    const present = extractTokens(str);
    const unresolved = [];
    for (const tok of present) {
      if (Object.prototype.hasOwnProperty.call(tokenMap, tok)) {
        str = splitJoin(str, tok, escapeForJson(tokenMap[tok]));
      } else {
        unresolved.push(tok);
      }
    }

    // -------- Secretos: inyectar valores reales (runtime) en placeholders ---
    // Nunca van embebidos en la app; el usuario los pega en el panel Credenciales.
    var secrets = opts.secrets || {};
    var secretsMissing = [];
    for (const ph of Object.keys(SECRET_PLACEHOLDERS)) {
      if (str.indexOf(ph) === -1) continue;                 // ese secreto no aplica
      const val = secrets[SECRET_PLACEHOLDERS[ph]];
      if (val != null && String(val).length) str = splitJoin(str, ph, escapeForJson(val));
      else secretsMissing.push(SECRET_PLACEHOLDERS[ph]);     // quedó sin rellenar
    }
    secretsMissing = secretsMissing.filter(function (v, i, a) { return a.indexOf(v) === i; });

    // -------- Validación: debe volver a parsear sin error --------
    let out;
    try { out = JSON.parse(str); }
    catch (e) { throw new Error('El JSON generado no parsea: ' + e.message); }

    // -------- Auditoría: tokens reales que quedaron sin rellenar --------
    const auditLeft = extractTokens(JSON.stringify(out));

    // -------- Aviso: mensajes que quedaron como placeholder descriptivo -----
    for (const node of out.nodes) {
      if (!isSetNode(node) || !nodeIs(node, ['CONFIGURAR', 'Orderbump'])) continue;
      for (const a of getAssignments(node)) {
        if (a && typeof a.value === 'string' && /^\s*\[[^\]]{3,}\]\s*$/.test(a.value)) {
          warnings.push('Campo sin llenar en «' + node.name + '»: ' + a.name);
        }
      }
    }

    return {
      workflow: out,
      producto_id: s.producto_id,
      workflow_name: s.workflow_name,
      family: family,
      nodeCount: out.nodes.length,
      unresolved: unresolved.sort(),
      auditLeft: auditLeft,
      warnings: warnings,
      secretsMissing: secretsMissing,
      ok: auditLeft.length === 0 && unresolved.length === 0 && secretsMissing.length === 0
    };
  }

  // Audit "en seco" para el semáforo del QC en cada tecla: aplica el motor y
  // devuelve qué tokens reales quedarían pendientes, sin construir la descarga.
  function audit(template, spec, opts) {
    try {
      const r = generate(template, spec, opts);
      return { ok: r.ok, left: r.auditLeft, unresolved: r.unresolved, warnings: r.warnings, secretsMissing: r.secretsMissing, producto_id: r.producto_id };
    } catch (e) {
      return { ok: false, left: [], unresolved: [], warnings: [], secretsMissing: [], error: e.message };
    }
  }

  return {
    COUNTRIES, PIXELS, BLACKLIST, LABELS, FACEBOOK_CREDENTIALS,
    CONFIG_NODE_KEYWORDS, PROTECTED_NODE_KEYWORDS,
    // helpers expuestos (para pruebas/UI)
    slug, stripAccents, upperNoAccents, capitalize, escapeForJson,
    isRealTokenName, extractTokens, getAssignments, isSetNode,
    detectFamily, hasConfigNode, introspect, derive, resolveTokens,
    generate, audit,
    VERSION: '1.0.0'
  };
});
