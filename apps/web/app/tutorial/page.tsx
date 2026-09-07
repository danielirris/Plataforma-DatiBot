import Link from "next/link";

export const dynamic = "force-dynamic";

// Un paso numerado dentro de una guía.
function Paso({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent text-xs font-bold text-[#111] ring-1 ring-[#111]">
        {n}
      </span>
      <div className="min-w-0 flex-1 text-sm leading-relaxed text-muted [&_b]:text-text [&_b]:font-semibold">
        {children}
      </div>
    </li>
  );
}

function Bloque({
  titulo,
  sub,
  children,
}: {
  titulo: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 rounded-2xl border border-[var(--hairline)] glass p-6">
      <h2 className="text-xl">{titulo}</h2>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function TutorialPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <span className="inline-block rounded border border-[#111] bg-accent px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-[#111]">
        Guía completa
      </span>
      <h1 className="mt-4 text-4xl tracking-tight text-text">Tutorial</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Cómo usar Datibot de principio a fin: crear un producto, preparar sus mensajes y
        videos, y — lo más importante — <b className="text-text">montar el número y el bot
        de WhatsApp</b> que cierra la venta. Sigue las secciones en orden.
      </p>

      {/* Índice */}
      <nav className="mt-6 flex flex-wrap gap-2 text-xs">
        {[
          ["#producto", "1 · Crear un producto"],
          ["#mensajes", "2 · Mensajes y precios"],
          ["#videos", "3 · Videos y anuncios"],
          ["#embudo", "4 · Montar número + producto"],
          ["#reglas", "Reglas de oro"],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="rounded-full border border-[var(--hairline)] bg-[var(--field)] px-3 py-1 text-muted hover:border-accent/50 hover:text-text"
          >
            {label}
          </a>
        ))}
      </nav>

      {/* 1. PRODUCTO */}
      <div id="producto">
        <Bloque
          titulo="1 · Crear un producto"
          sub="Todo arranca de un producto. Ve a Productos → Nuevo producto."
        >
          <ol className="space-y-3">
            <Paso n={1}>
              <b>Identidad.</b> Nombre del producto (se guarda en MAYÚSCULAS), promesa,
              posicionamiento y a quién va dirigido. Guarda el borrador.
            </Paso>
            <Paso n={2}>
              <b>Anuncios ganadores.</b> Pega guiones de anuncios que ya funcionan (de un
              avatar parecido) y, en <b>“¿Qué estás vendiendo realmente?”</b>, aclara tu
              producto exacto. Pulsa <b>Analizar anuncios</b> y la IA saca el ángulo, el
              dolor y el avatar.
            </Paso>
            <Paso n={3}>
              <b>Oferta.</b> <b>Generar oferta</b> la crea desde tu identidad; o escribe la
              tuya y usa <b>Mejorar mi oferta</b> para que la IA pula los textos.
            </Paso>
            <Paso n={4}>
              <b>Video de embudo</b> y <b>Guiones de anuncios.</b> La IA genera el guión de
              cierre y los guiones de captación, apoyándose en el análisis. Edítalos.
            </Paso>
            <Paso n={5}>
              <b>Videos.</b> Sube los videos largos del producto (materia prima para el
              editor).
            </Paso>
          </ol>
          <p className="mt-4 text-xs text-muted">
            Las guías que la IA sigue se configuran una vez en{" "}
            <Link href="/configuracion" className="text-accent-2 underline">
              Configuración → Instrucciones para la IA
            </Link>
            .
          </p>
        </Bloque>
      </div>

      {/* 2. MENSAJES */}
      <div id="mensajes">
        <Bloque
          titulo="2 · Mensajes y precios"
          sub="Los textos del embudo COD por país y los montos de la escalera."
        >
          <ol className="space-y-3">
            <Paso n={1}>
              En <b>Mensajes</b>, elige el producto y <b>pega</b> tus mensajes en cada
              espacio, por país. Usa <b>Copiar a los 5 países</b> si son iguales.
            </Paso>
            <Paso n={2}>
              Ajusta los <b>montos de la escalera</b> (7 fases) por país. Salen
              predeterminados de los <b>precios globales</b> (ver abajo) y puedes cambiarlos
              por producto.
            </Paso>
            <Paso n={3}>Guarda.</Paso>
          </ol>
          <div className="mt-4 rounded-lg border-l-2 border-accent bg-[var(--field)] p-3 text-xs text-muted">
            <b className="text-text">Precios globales:</b> en{" "}
            <Link href="/configuracion" className="text-accent-2 underline">
              Configuración → Precios por país
            </Link>{" "}
            defines los montos por defecto. Lo que pongas ahí sale predeterminado al editar
            los montos de cualquier producto.
          </div>
        </Bloque>
      </div>

      {/* 3. VIDEOS */}
      <div id="videos">
        <Bloque
          titulo="3 · Videos, ebooks y anuncios"
          sub="Convierte tu material en piezas listas para publicar."
        >
          <ol className="space-y-3">
            <Paso n={1}>
              <b>Editor de videos:</b> elige el producto y sus videos, ajusta estilo,
              subtítulos, música y CTA, y crea los anuncios. El modo{" "}
              <b>“Solo recortar”</b> entrega el video crudo con tu audio, sin adornos.
            </Paso>
            <Paso n={2}>
              <b>Ebooks:</b> genera el PDF del producto con un tema de diseño.
            </Paso>
            <Paso n={3}>
              <b>Mis anuncios:</b> ahí quedan los anuncios listos para ver y descargar.
            </Paso>
          </ol>
        </Bloque>
      </div>

      {/* 4. EMBUDO — número + producto */}
      <div id="embudo">
        <div className="mt-10 rounded-2xl border-2 border-[#111] glass p-6">
          <span className="inline-block rounded border border-[#111] bg-accent px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-[#111]">
            Lo importante
          </span>
          <h2 className="mt-3 text-2xl">4 · Montar el número y el producto (el bot)</h2>
          <p className="mt-2 text-sm text-muted">
            La sección <b className="text-text">Embudos</b> configura el bot de WhatsApp.
            Todo se guarda en Supabase y el motor de n8n lo lee en vivo:{" "}
            <b className="text-text">editar aquí = cambiar el bot al instante</b>.
          </p>

          {/* Requisito */}
          <div className="mt-5 rounded-xl border border-[var(--hairline)] bg-[var(--field)] p-4">
            <p className="text-sm font-semibold text-text">Antes de empezar (una sola vez)</p>
            <ol className="mt-3 space-y-3">
              <Paso n={1}>
                Corre el <b>SQL del esquema</b> en Supabase (crea las tablas{" "}
                <code className="rounded bg-[var(--panel)] px-1 text-xs">numeros</code>,{" "}
                <code className="rounded bg-[var(--panel)] px-1 text-xs">productos</code>,{" "}
                <code className="rounded bg-[var(--panel)] px-1 text-xs">pasos_embudo</code>,{" "}
                <code className="rounded bg-[var(--panel)] px-1 text-xs">mensajes_rotador</code>,{" "}
                <code className="rounded bg-[var(--panel)] px-1 text-xs">media_bots</code>).
              </Paso>
              <Paso n={2}>
                Configura en EasyPanel (servicio web) las variables{" "}
                <code className="rounded bg-[var(--panel)] px-1 text-xs">EMBUDOS_SUPABASE_URL</code> y{" "}
                <code className="rounded bg-[var(--panel)] px-1 text-xs">EMBUDOS_SUPABASE_SERVICE_KEY</code>, y redespliega.
              </Paso>
            </ol>
            <p className="mt-3 text-xs text-muted">
              Mientras no esté conectado, Embudos muestra un aviso con estas instrucciones.
            </p>
          </div>

          {/* Paso a paso */}
          <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted">
            Paso a paso
          </h3>
          <ol className="mt-3 space-y-3">
            <Paso n={1}>
              <b>Crea el número</b> (pestaña <b>Números</b> → “+ Nuevo número”): pon el{" "}
              <b>número de WhatsApp</b>, el <b>phone_id</b> de Meta, el <b>WABA</b>, el{" "}
              <b>account_id</b> de Chatwoot, la <b>credencial</b> de n8n, el <b>país</b> y el{" "}
              <b>CAPI token</b> (se guarda oculto). En{" "}
              <b>“Producto que vende hoy”</b> eliges cuál de tus productos atiende ese
              número. Guarda.
            </Paso>
            <Paso n={2}>
              <b>Configura el bot del producto</b> (pestaña <b>Bot por producto</b> → elige
              el mismo producto): <b>mensajes fijos</b>, <b>prompts de las IAs</b>,{" "}
              <b>datos de pago por país</b> y las <b>variantes anti-spam</b> (rotador, para
              que no mande siempre el mismo texto). Guarda.
            </Paso>
            <Paso n={3}>
              <b>Arma la secuencia</b> (pestaña <b>Embudo (pasos)</b>): pulsa{" "}
              <b>Cargar plantilla por defecto</b> para partir de la secuencia estándar
              (MENU → VIDEO → CONFIRMACIÓN → ENTREGA → STOP), reordena con ↑/↓, ajusta los{" "}
              <b>delays</b> y los <b>botones</b>. Guarda.
            </Paso>
            <Paso n={4}>
              <b>Sube la media</b> (pestaña <b>Media</b>): elige el número que la aloja y
              sube el <b>video</b> y los <b>PDFs</b>. La app los guarda y los sube a WhatsApp
              para obtener el <b>media_id</b> (envío instantáneo). Usa <b>Renovar media</b>{" "}
              cada ~3 semanas (los media_id caducan).
            </Paso>
            <Paso n={5}>
              <b>Conéctalo en n8n</b> (una sola vez): en tu flujo, enlaza la credencial de
              WhatsApp de ese número. El motor resuelve solo qué vender:{" "}
              <b>phone_id → producto_activo → producto</b>.
            </Paso>
          </ol>

          <div className="mt-5 rounded-lg border-l-2 border-accent bg-[var(--field)] p-3 text-xs text-muted">
            <b className="text-text">Para cambiar lo que vende un número:</b> solo cambia el
            campo <b className="text-text">“Producto que vende hoy”</b> en Números. Instantáneo.
          </div>
        </div>
      </div>

      {/* REGLAS */}
      <div id="reglas">
        <Bloque titulo="Reglas de oro" sub="Para que todo se mantenga sano.">
          <ul className="space-y-2 text-sm text-muted [&_b]:text-text">
            <li>• <b>Nada se borra:</b> productos, config, música y media viven en volúmenes persistentes.</li>
            <li>• <b>Secretos por entorno:</b> las API keys y tokens van en EasyPanel, nunca en el chat.</li>
            <li>• <b>Editar Embudos = cambiar el bot al instante</b> (Supabase en vivo); no hay que redesplegar.</li>
            <li>• <b>El n8n</b> debe resolver por número → producto para leer lo que editas aquí.</li>
          </ul>
        </Bloque>
      </div>
    </div>
  );
}
