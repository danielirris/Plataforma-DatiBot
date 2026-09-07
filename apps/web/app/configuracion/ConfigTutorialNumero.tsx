// Tutorial técnico: dar de alta un número nuevo (Meta + n8n + Chatwoot + Supabase).
// Es la "plomería" que se hace a mano, fuera de la app. Se muestra en Configuración.

function Paso({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent text-xs font-bold text-[#111] ring-1 ring-[#111]">
        {n}
      </span>
      <div className="min-w-0 flex-1 text-sm leading-relaxed text-muted [&_b]:font-semibold [&_b]:text-text">
        {children}
      </div>
    </li>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-lg border-l-2 border-[#e0a800] bg-[var(--field)] p-3 text-xs text-muted [&_b]:text-text">
      ⚠️ {children}
    </div>
  );
}

function Parte({
  letra,
  titulo,
  sub,
  children,
}: {
  letra: string;
  titulo: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--hairline)] glass p-5">
      <div className="flex items-baseline gap-2">
        <span className="rounded border border-[#111] bg-accent px-2 py-0.5 text-xs font-bold text-[#111]">
          {letra}
        </span>
        <h3 className="text-base font-semibold text-text">{titulo}</h3>
      </div>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

const code = "rounded bg-[var(--field)] px-1 py-0.5 text-[12px] font-mono text-text border border-[var(--hairline)]";

const ERRORES: [string, string, string][] = [
  ['WhatsApp: "Object … does not exist / missing permissions"', "Credencial WA de otro número", "Usar la credencial del número correcto"],
  ['Chatwoot: 401 "You need to sign in"', "Credencial no enlazada al importar", "Re-seleccionar la credencial en el nodo (genericAuthType: httpHeaderAuth)"],
  ['Chatwoot: 404 "Resource could not be found"', "conversation_id inválido", "Verificar que llegue el conversation_id real del recibidor"],
  ["WhatsApp #132018", "media_id nulo o número sin ventana de 24h", "Precargar media / abrir ventana escribiendo al número"],
  ["Se envía todo 8 veces", "Supabase devolvió N filas y n8n las multiplicó", "Colapsar a 1 item antes de seguir la cadena"],
  ["Supabase 23505 duplicate key", "La fila ya existe", "Usar UPSERT (on_conflict) o borrar antes"],
  ["Supabase 23502 not null", "Falta una columna NOT NULL", "Incluir esa columna (ej. capi_token)"],
  ['Code node "Unexpected token"', "Error de sintaxis JS", "Revisar y validar el JS del bloque"],
];

export function ConfigTutorialNumero() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl">Tutorial: dar de alta un número nuevo</h2>
        <p className="mt-1 text-sm text-muted">
          Proceso completo para conectar un número de WhatsApp nuevo al bot (Meta · n8n ·
          Chatwoot · Supabase). ~15-20 min la primera vez. La mayoría es <b className="text-text">cablear
          infraestructura</b>; la config de producto/embudo NO se toca aquí (esa la edita la app).
        </p>
      </div>

      {/* Mapa mental */}
      <div className="rounded-2xl border border-[var(--hairline)] glass p-5">
        <p className="text-sm font-semibold text-text">Las 4 capas que hay que conectar</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          {[
            ["Meta", "WhatsApp Cloud", "phone_id · WABA · token · webhook"],
            ["n8n · Recibidor", "por número", "webhook + puente Chatwoot + resuelve producto"],
            ["n8n · Motor", "por producto", "clasifica y envía (data-driven)"],
            ["Supabase", "los datos", "config del embudo — la edita la app"],
          ].map(([t, s, d], i) => (
            <div key={i} className="rounded-xl border border-[var(--hairline)] bg-[var(--field)] p-3">
              <div className="text-xs font-bold text-text">{t}</div>
              <div className="text-[11px] text-accent-2">{s}</div>
              <div className="mt-1 text-[11px] leading-snug text-muted">{d}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          Dar de alta un número toca las <b className="text-text">3 primeras capas</b>. La 4ª
          (Supabase) ya la maneja la app.
        </p>
      </div>

      {/* Antes de empezar */}
      <div className="rounded-2xl border border-[var(--hairline)] glass p-5">
        <p className="text-sm font-semibold text-text">Antes de empezar — ten a la mano</p>
        <ul className="mt-2 space-y-1 text-sm text-muted [&_b]:text-text">
          <li>☐ Acceso al <b>Meta Business Manager</b> (WhatsApp Cloud API)</li>
          <li>☐ Acceso a <b>n8n</b></li>
          <li>☐ Acceso a <b>Chatwoot</b></li>
          <li>☐ Acceso a la <b>app</b> (para crear la fila en <code className={code}>numeros</code>)</li>
          <li>☐ Saber <b>qué producto</b> venderá el número (ya debe existir en Supabase)</li>
        </ul>
      </div>

      <Parte letra="A" titulo="Meta (WhatsApp Cloud API)" sub="En el Business Manager, 100% manual.">
        <ol className="space-y-3">
          <Paso n={1}><b>Registra el número</b> en WhatsApp Cloud API y verifícalo (SMS/llamada).</Paso>
          <Paso n={2}>Anota el <b>phone_id</b> (phone_number_id) — es la CLAVE del número, la usarás en todo.</Paso>
          <Paso n={3}>Anota el <b>WABA id</b> (WhatsApp Business Account).</Paso>
          <Paso n={4}>Genera/usa un <b>System User token</b> con permisos de WhatsApp (para media y CAPI). Este es el <code className={code}>capi_token</code>. Guárdalo seguro.</Paso>
          <Paso n={5}>Deja a mano la <b>URL del webhook de n8n</b> (la creas en la Parte D y la conectas en la E).</Paso>
        </ol>
        <Warn>El token/credencial <b>debe corresponder al número</b>. Si no, Meta responde <i>"Object with ID … does not exist / missing permissions"</i>.</Warn>
      </Parte>

      <Parte letra="B" titulo="n8n: credencial de WhatsApp del número">
        <ol className="space-y-3">
          <Paso n={1}>En n8n → <b>Credentials → New → "Facebook Graph API"</b> (o el tipo de tus nodos de WhatsApp).</Paso>
          <Paso n={2}>Pega el <b>System User token</b> del número.</Paso>
          <Paso n={3}>Nómbrala reconocible: <code className={code}>Nombre [últimos4dígitos]</code> (ej. <code className={code}>Carolina1 [4838]</code>). El sufijo evita confundir credenciales.</Paso>
        </ol>
        <Warn>Usar la credencial de OTRO número falla con "missing permissions" aunque el phone_id sea correcto. <b>Credencial y phone_id deben ser del mismo número.</b></Warn>
      </Parte>

      <Parte letra="C" titulo="Chatwoot: inbox del número">
        <ol className="space-y-3">
          <Paso n={1}>Chatwoot → <b>Settings → Inboxes → Add Inbox → WhatsApp (API)</b>.</Paso>
          <Paso n={2}>Conéctalo con el <code className={code}>phone_id</code> / token del número.</Paso>
          <Paso n={3}>Anota el <b>account_id</b> (normalmente <code className={code}>1</code>) y el <b>inbox_id</b>.</Paso>
          <Paso n={4}>Asegúrate de que existan las <b>etiquetas</b> del bot (en minúscula): <code className={code}>menu_enviado</code>, <code className={code}>bienvenida</code>, <code className={code}>contenido_solicitado</code>, <code className={code}>contenido_enviado</code>, <code className={code}>comprador</code>, <code className={code}>stop</code>, y las de país: <code className={code}>col per mex chi ven ecu</code>. (Chatwoot solo aplica etiquetas que YA existen.)</Paso>
        </ol>
      </Parte>

      <Parte letra="D" titulo="n8n: el recibidor del número" sub="Recibe el webhook de Meta y puentea a Chatwoot. Hay uno por número: duplícalo y ajústalo.">
        <ol className="space-y-3">
          <Paso n={1}><b>Duplica</b> tu recibidor plantilla → renómbralo <code className={code}>RECIBIDOR_API_&lt;4dígitos&gt;</code>.</Paso>
          <Paso n={2}>En el <b>nodo Webhook (Meta)</b>: cámbiale el <b>path</b> a algo único (ej. <code className={code}>wa-&lt;4dígitos&gt;</code>). Genera una URL nueva — cópiala para la Parte E.</Paso>
          <Paso n={3}>Donde use el <b>phone_id</b>, ponle el del número nuevo (a veces en un nodo Set, a veces en el payload).</Paso>
          <Paso n={4}>En los nodos de WhatsApp/Chatwoot revisa la <b>credencial correcta</b>: WhatsApp → la de la Parte B; Chatwoot → tu credencial Header Auth.</Paso>
          <Paso n={5}>En el ruteo por país (<code className={code}>Switch por País → Call …</code>), apunta los <code className={code}>Call</code> al <b>workflow de producto</b> (el motor).</Paso>
          <Paso n={6}><b>Guarda y activa</b> el recibidor (este SÍ se activa, tiene webhook).</Paso>
        </ol>
        <Warn>Al duplicar/importar: <b>las credenciales no se enlazan solas</b> — abre cada nodo y re-selecciónala. Header Auth (Chatwoot): <code className={code}>genericAuthType: httpHeaderAuth</code>. Si da 401 "You need to sign in", re-selecciónala.</Warn>
      </Parte>

      <Parte letra="E" titulo="Conectar el webhook de Meta → n8n">
        <ol className="space-y-3">
          <Paso n={1}>En Meta (webhooks de WhatsApp del número): pega la <b>URL del webhook</b> de n8n (Parte D).</Paso>
          <Paso n={2}>Suscríbete al evento <code className={code}>messages</code>.</Paso>
          <Paso n={3}>Verifica el webhook (Meta manda un challenge; el recibidor plantilla ya lo maneja).</Paso>
          <Paso n={4}>Manda un mensaje de prueba y confirma que <b>llega una ejecución</b> al recibidor en n8n.</Paso>
        </ol>
      </Parte>

      <Parte letra="F" titulo="Supabase: la fila del número (esto lo hace la app)" sub="App → Embudos → Números → Nuevo número.">
        <ul className="space-y-1 text-sm text-muted [&_b]:text-text">
          <li>• Número de WhatsApp (marcable) · <b>Phone ID</b> (clave) · WABA · Chatwoot account_id</li>
          <li>• Credencial WA en n8n (el nombre, ej. <code className={code}>Carolina1 [4838]</code>) · CAPI token (oculto)</li>
          <li>• <b>Producto que vende hoy</b> (<code className={code}>producto_activo</code>) — un número puede atender varios países; el país lo resuelve el motor, no se fija aquí.</li>
        </ul>
        <p className="mt-2 text-sm text-muted">Guardar crea la fila en <code className={code}>numeros</code>. Cambiar <code className={code}>producto_activo</code> cambia lo que vende, al instante.</p>
        <Warn>Para que el motor <b>lea</b> de <code className={code}>numeros</code> (phone_id → producto_activo) hace falta el ajuste del recibidor (trabajo de n8n). Mientras no esté, la fila se guarda pero el motor usa el modelo viejo.</Warn>
      </Parte>

      <Parte letra="G" titulo="Precargar la media del producto en ESE número" sub="Los media_id están amarrados al número que los subió.">
        <ol className="space-y-3">
          <Paso n={1}>Corre el workflow <code className={code}>PRECARGAR_MEDIA_&lt;producto&gt;</code> apuntando al <b>phone_id nuevo</b> y con la <b>credencial del número nuevo</b>. (O usa la pestaña <b>Media</b> de la app.)</Paso>
          <Paso n={2}>Verifica que <code className={code}>media_bots</code> tenga los <code className={code}>media_id</code> (no nulos).</Paso>
        </ol>
        <Warn>Los <code className={code}>media_id</code> caducan (~30 días). Debe haber renovación periódica.</Warn>
      </Parte>

      <Parte letra="H" titulo="Checklist de prueba (recorrido completo)" sub="Escribe al número desde un WhatsApp de prueba (limpia etiquetas si ya probaste).">
        <ul className="space-y-1.5 text-sm text-muted [&_b]:text-text">
          <li>☐ Llega <b>1</b> mensaje de bienvenida (variado, con tu nombre) → <code className={code}>menu_enviado</code> + país</li>
          <li>☐ Respondes → <b>video + mensaje con botón</b> "Recibir material" → <code className={code}>bienvenida</code></li>
          <li>☐ Tocas el botón → "escribe SI RECIBIR" → <code className={code}>contenido_solicitado</code></li>
          <li>☐ Escribes "si recibir" → <b>ENTREGA</b> (2 PDF + link + cobro + datos pago) → <code className={code}>contenido_enviado</code></li>
          <li>☐ Escribes algo raro → responde la <b>IA</b> (con emojis y saltos de línea)</li>
          <li>☐ Escribes <b>STOP</b> → "no te escribo más" → <code className={code}>stop</code> → deja de responder</li>
          <li>☐ Las <b>notas privadas</b> aparecen en Chatwoot cuando se manda media/botón</li>
        </ul>
      </Parte>

      {/* Errores */}
      <div className="rounded-2xl border border-[var(--hairline)] glass p-5">
        <p className="text-sm font-semibold text-text">Errores comunes</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="border-b border-[var(--border)] pb-2 pr-3 font-mono font-normal">Síntoma</th>
                <th className="border-b border-[var(--border)] pb-2 pr-3 font-mono font-normal">Causa</th>
                <th className="border-b border-[var(--border)] pb-2 font-mono font-normal">Fix</th>
              </tr>
            </thead>
            <tbody>
              {ERRORES.map(([s, c, f], i) => (
                <tr key={i} className="align-top">
                  <td className="border-b border-[var(--hair)] py-2 pr-3 text-text">{s}</td>
                  <td className="border-b border-[var(--hair)] py-2 pr-3 text-muted">{c}</td>
                  <td className="border-b border-[var(--hair)] py-2 text-muted">{f}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resumen */}
      <div className="rounded-2xl border border-[#111] glass p-5">
        <p className="text-sm font-semibold text-text">Qué es manual y qué es la app</p>
        <p className="mt-2 text-sm text-muted [&_b]:text-text">
          <b>Manual (pocas veces):</b> Meta (número, token, webhook), credencial en n8n, inbox de
          Chatwoot, duplicar/ajustar el recibidor. La "plomería" del número.
        </p>
        <p className="mt-2 text-sm text-muted [&_b]:text-text">
          <b>App (frecuente):</b> la fila en <code className={code}>numeros</code> y TODA la config de
          producto/embudo (mensajes, prompts, pasos, delays, botones, media, datos de pago).
        </p>
        <p className="mt-2 text-xs text-muted">Automatizas lo de todos los días; dejas manual lo de cada tanto.</p>
      </div>
    </div>
  );
}
