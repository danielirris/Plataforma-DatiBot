import Link from "next/link";
import { PlantillasN8n } from "./PlantillasN8n";
import { ConfigTutorialNumero } from "../configuracion/ConfigTutorialNumero";
import { OpenHashSection } from "./OpenHashSection";

export const dynamic = "force-dynamic";

// ── Piezas reutilizables ────────────────────────────────────────────────────

// Un paso numerado dentro de una guía.
function Paso({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--field)] text-xs font-medium text-text ring-1 ring-[var(--hairline)]">
        {n}
      </span>
      <div className="min-w-0 flex-1 text-sm leading-relaxed text-muted [&_b]:font-medium [&_b]:text-text">
        {children}
      </div>
    </li>
  );
}

// Lista de consejos o de advertencias (con un punto de color según el tono).
function Notas({
  titulo,
  tono,
  items,
}: {
  titulo: string;
  tono: "tip" | "warn";
  items: React.ReactNode[];
}) {
  const dot = tono === "tip" ? "bg-accent-2" : "bg-[var(--warn)]";
  return (
    <div className="mt-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{titulo}</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-muted [&_b]:font-medium [&_b]:text-text">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
            <span className="min-w-0 flex-1">{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Una sección plegable del tutorial. El resumen (título + una línea) siempre se
// ve; el usuario despliega para leer el detalle.
function Seccion({
  id,
  num,
  titulo,
  sub,
  defaultOpen,
  destacado,
  children,
}: {
  id: string;
  num: string;
  titulo: string;
  sub: string;
  defaultOpen?: boolean;
  destacado?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      id={id}
      open={defaultOpen}
      className={`group mt-4 scroll-mt-6 overflow-hidden rounded-2xl border glass ${
        destacado ? "border-accent/40" : "border-[var(--hairline)]"
      }`}
    >
      <summary className="flex cursor-pointer list-none items-start gap-3 p-5 [&::-webkit-details-marker]:hidden">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--field)] text-xs font-medium text-text ring-1 ring-[var(--hairline)]">
          {num}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg leading-snug text-text">{titulo}</span>
          <span className="mt-0.5 block text-sm text-muted">{sub}</span>
        </span>
        <svg
          className="mt-1.5 h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="border-t border-[var(--hairline)] p-5 pt-4">{children}</div>
    </details>
  );
}

// Etiqueta de código breve (nombres de variables, tablas, etc.).
function Cod({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-[var(--panel)] px-1 text-xs text-text">{children}</code>
  );
}

// Sub-guía plegable dentro de una sección (para pasos de configuración opcionales).
function SubGuia({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <details className="group/sub mt-2 rounded-xl border border-[var(--hairline)] bg-[var(--field)] px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-text [&::-webkit-details-marker]:hidden">
        <span className="text-muted transition-transform group-open/sub:rotate-45">+</span>
        {titulo}
      </summary>
      <div className="mt-3 border-t border-[var(--hairline)] pt-3">{children}</div>
    </details>
  );
}

// ── Página ───────────────────────────────────────────────────────────────────

export default function TutorialPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <OpenHashSection />
      <span className="inline-block rounded-full border border-[var(--hairline)] bg-[var(--field)] px-3 py-1 text-xs text-muted">
        Guía completa
      </span>
      <h1 className="mt-4 text-4xl tracking-tight text-text">Tutorial</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Cómo usar Datibot de principio a fin: entrar, crear un producto, preparar sus
        ebooks, anuncios y videos, y —lo más importante— montar el{" "}
        <b className="font-medium text-text">número y el bot de WhatsApp</b> que cierra la
        venta. Toca cada tarjeta para desplegarla.
      </p>

      {/* Índice */}
      <nav className="mt-6 flex flex-wrap gap-2 text-xs">
        {[
          ["#dia1", "Antes del día 1"],
          ["#mapa", "Cómo se conecta todo"],
          ["#empezar", "Cómo entrar y moverte"],
          ["#producto", "1 · Producto"],
          ["#config", "2 · Configuración"],
          ["#ebooks", "3 · Ebooks"],
          ["#editor", "4 · Editor de videos"],
          ["#anuncios", "5 · Mis anuncios"],
          ["#reporte", "6 · Reporte de anuncios"],
          ["#embudo", "7 · Embudos (el bot)"],
          ["#plantillas", "Plantillas n8n"],
          ["#numero", "Dar de alta un número"],
          ["#glosario", "Diccionario"],
          ["#faq", "Preguntas frecuentes"],
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

      {/* Orden recomendado */}
      <div className="mt-6 rounded-xl border-l-2 border-accent bg-[var(--field)] p-4 text-sm text-muted [&_b]:font-medium [&_b]:text-text">
        <b>Orden recomendado la primera vez:</b> crea un <b>producto</b> → define{" "}
        <b>precios e instrucciones de la IA</b> en Configuración → genera sus{" "}
        <b>ebooks/anuncios/videos</b> → y al final monta el <b>número y el bot</b> en
        Embudos, que es lo que cierra la venta.
      </div>

      {/* ── ANTES DEL DÍA 1 ── */}
      <Seccion
        id="dia1"
        num="•"
        titulo="Antes del día 1: qué necesitas (y quién lo monta)"
        sub="La parte técnica se instala una sola vez; como dueño empiezas en «Crear un producto» cuando esté lista."
        defaultOpen
      >
        <p className="text-sm text-muted [&_b]:font-medium [&_b]:text-text">
          Datibot se apoya en varias piezas externas. La <b>instalación (una sola vez) la
          hace tu técnico</b>; tú, como dueño, trabajas el día a día dentro de la app.
        </p>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">
          Cuentas y servicios que hacen falta
        </p>
        <ul className="mt-2 space-y-1.5 text-sm text-muted [&_b]:font-medium [&_b]:text-text">
          <li>• <b>Meta Business</b> con un número de <b>WhatsApp Business</b> aprobado (Cloud API) — por ahí vende el bot.</li>
          <li>• <b>Servidor</b> (EasyPanel) con RAM suficiente — aquí vive Datibot.</li>
          <li>• <b>n8n</b> — el motor que automatiza los mensajes del bot.</li>
          <li>• <b>Chatwoot</b> — la bandeja donde ves las conversaciones.</li>
          <li>• <b>Supabase</b> — la base de datos donde vive la configuración del bot.</li>
          <li>• Clave/saldo de <b>OpenAI</b> y <b>Gemini</b> — para la IA (textos) y las imágenes de los ebooks.</li>
        </ul>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--hairline)] bg-[var(--field)] p-3 text-sm text-muted [&_b]:font-medium [&_b]:text-text">
            <b className="text-text">Una sola vez · tu técnico</b>
            <p className="mt-1 text-xs">Montar los servicios de arriba, correr el SQL de Embudos, poner las variables en EasyPanel y conectar cada número (ver «Dar de alta un número»).</p>
          </div>
          <div className="rounded-xl border border-accent/40 bg-[var(--field)] p-3 text-sm text-muted [&_b]:font-medium [&_b]:text-text">
            <b className="text-text">Cada día · tú</b>
            <p className="mt-1 text-xs">Crear productos, generar ebooks/anuncios/videos, editar los Embudos (mensajes, precios, secuencia) y leer el Reporte.</p>
          </div>
        </div>
      </Seccion>

      {/* ── CÓMO SE CONECTA TODO ── */}
      <Seccion
        id="mapa"
        num="•"
        titulo="Cómo se conecta todo (el recorrido de una venta)"
        sub="De un producto a una venta atribuida: cómo encajan las piezas."
      >
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {[
            "Producto",
            "Ebook + videos",
            "Editor → anuncios",
            "Publicas en Facebook (clic a WhatsApp)",
            "El bot atiende (Embudos)",
            "Venta",
            "Reporte (atribución)",
          ].map((paso, i, arr) => (
            <span key={paso} className="flex items-center gap-2">
              <span className="rounded-full border border-[var(--hairline)] bg-[var(--field)] px-2.5 py-1 text-text">
                {paso}
              </span>
              {i < arr.length - 1 && <span className="text-accent-2">→</span>}
            </span>
          ))}
        </div>
        <Notas
          tono="tip"
          titulo="Cruces que conviene saber"
          items={[
            <>El <b>video de embudo</b> que creas en Productos (paso 4) es el MISMO que subes en <b>Embudos → Media</b>.</>,
            <>Los <b>ebooks y bonos</b> son los <b>PDFs</b> que el bot entrega en la ENTREGA.</>,
            <>Los <b>precios</b> de Configuración precargan los <b>datos de pago</b> del bot por país.</>,
            <>El bot solo aparece en el <b>Reporte</b> si publicaste el video como <b>anuncio de clic a WhatsApp</b>: así Facebook genera el <Cod>ctwa_clid</Cod> que cruza cada venta.</>,
          ]}
        />
      </Seccion>

      {/* ── CÓMO ENTRAR Y MOVERTE ── */}
      <Seccion
        id="empezar"
        num="0"
        titulo="Cómo entrar y moverte"
        sub="Iniciar sesión, el menú, ocultar la barra y el modo claro/oscuro."
      >
        <ol className="space-y-3">
          <Paso n={1}>
            <b>Iniciar sesión.</b> Al abrir Datibot aparece la pantalla de acceso. Escribe
            tu <b>usuario</b> y <b>contraseña</b> (son los del negocio; no hay registro) y
            pulsa <b>Iniciar sesión</b>. Si te equivocas, sale en rojo «Usuario o
            contraseña incorrectos».
          </Paso>
          <Paso n={2}>
            <b>Quedas dentro por 30 días.</b> No tienes que volver a escribir la contraseña
            cada vez, aunque cierres el navegador. Toda la plataforma está protegida: si la
            sesión caduca, cualquier página te lleva sola al login y luego te regresa.
          </Paso>
          <Paso n={3}>
            <b>El menú lateral.</b> A la izquierda están Inicio, Productos, Ebooks, Editor
            de videos, Mis anuncios, Reporte de anuncios y Embudos; abajo (separados),
            Tutorial y Configuración. La sección donde estás se resalta en verde.
          </Paso>
          <Paso n={4}>
            <b>Ocultar el menú.</b> Pulsa el botón de flecha arriba del menú para
            plegarlo y ganar pantalla; queda un botón redondo con tres rayas (menú)
            para volver a mostrarlo. Se recuerda en ese
            navegador (en el celular arranca oculto).
          </Paso>
          <Paso n={5}>
            <b>Tema y salir.</b> Abajo del menú cambias entre <b>Tema claro / oscuro</b>, y
            con <b>Salir</b> cierras sesión y vuelves al login.
          </Paso>
        </ol>
        <Notas
          tono="tip"
          titulo="Bueno saber"
          items={[
            <>No hay «olvidé mi contraseña»: el usuario y la clave se fijan en el servidor (EasyPanel). Cambiar la contraseña ahí cierra todas las sesiones abiertas.</>,
            <>Las claves/API de los servicios (OpenAI, Gemini…) <b>no</b> se tocan en la web: van en el panel del servidor.</>,
          ]}
        />
      </Seccion>

      {/* ── 1 · PRODUCTO ── */}
      <Seccion
        id="producto"
        num="1"
        titulo="Crear un producto"
        sub="Todo arranca aquí. Un asistente de 6 pasos: identidad, anuncios, oferta, video, guiones y videos."
        defaultOpen
      >
        <p className="mb-4 text-sm text-muted">
          Ve a <b className="font-medium text-text">Productos → «+ Nuevo producto»</b>. Cada
          tarjeta tiene «Editar» y «Borrar» (Borrar pide confirmación y no se puede
          deshacer).
        </p>
        <ol className="space-y-3">
          <Paso n={1}>
            <b>Identidad.</b> Nombre (se guarda en MAYÚSCULAS), <b>productoId</b> (tu
            identificador propio tipo <Cod>CHZ-001</Cod>, <b>no</b> el de la pasarela de
            pago), promesa, posicionamiento y a quién va dirigido. Pulsa{" "}
            <b>Guardar borrador</b>. Debes guardar aquí primero: los botones de IA de los
            pasos siguientes necesitan que el producto ya exista.
          </Paso>
          <Paso n={2}>
            <b>Anuncios ganadores.</b> Con «+ Agregar anuncio ganador» pega guiones que ya
            funcionan (de un avatar parecido). Llena el recuadro{" "}
            <b>«🎯 ¿Qué estás vendiendo realmente?»</b> para que la IA apunte a tu producto
            exacto. Pulsa <b>🔍 Analizar anuncios</b>: saca ángulo, dolor y avatar
            (editables). Cierra con <b>Guardar anuncios</b>.
          </Paso>
          <Paso n={3}>
            <b>Oferta.</b> <b>🎁 Generar oferta</b> la crea desde tu identidad (producto
            principal + bonos, promesa, urgencia); o escribe la tuya y usa{" "}
            <b>✨ Mejorar mi oferta</b> para que la IA solo pula la redacción. Todo queda
            editable. <b>Guardar oferta</b>.
          </Paso>
          <Paso n={4}>
            <b>Video de embudo.</b> Es el video de <b>cierre</b> que va dentro del WhatsApp.{" "}
            <b>✨ Generar guión con IA</b> escribe un guión corto (25–55 s) desde tus
            anuncios y la oferta. Edítalo y <b>Guardar guión</b>.
          </Paso>
          <Paso n={5}>
            <b>Guiones de anuncios.</b> Son los de captación (frenan el scroll y llevan al
            WhatsApp). Elige cuántos (1–8) y <b>✍️ Generar guiones</b>. Cada generación{" "}
            <b>se suma</b> a los anteriores; quita a mano los que sobren. <b>Guardar
            guiones</b>.
          </Paso>
          <Paso n={6}>
            <b>Videos.</b> Sube los videos largos del producto con <b>⬆️ Subir videos</b>
            (se suben por trozos, aguantan archivos grandes). Son la materia prima del
            Editor de videos. <b>Guardar videos</b>.
          </Paso>
        </ol>
        <Notas
          tono="warn"
          titulo="Ojo con esto"
          items={[
            <>Los generadores de IA rellenan la pantalla pero <b>no guardan solos</b>: cada paso tiene su botón «Guardar…». Si sales sin guardar, se pierde lo generado.</>,
            <>Si al guardar sale «El producto cambió en otra pestaña o sección», es porque se editó en otro lado a la vez (p. ej. el ebook): <b>recarga y vuelve a guardar</b> (te protege de borrar secciones).</>,
            <>Cada botón de IA exige que primero hayas guardado la Identidad (paso 1).</>,
          ]}
        />
      </Seccion>

      {/* ── 2 · CONFIGURACIÓN ── */}
      <Seccion
        id="config"
        num="2"
        titulo="Configuración: precios e instrucciones para la IA"
        sub="Los ajustes que usan TODOS los productos: cómo escribe la IA y los precios base por país."
      >
        <p className="mb-4 text-sm text-muted">
          En el menú, abajo, entra a{" "}
          <Link href="/configuracion" className="text-accent-2 underline">
            Configuración
          </Link>
          . Tiene dos pestañas y un solo botón <b className="font-medium text-text">Guardar
          configuración</b> que guarda ambas a la vez.
        </p>
        <ol className="space-y-3">
          <Paso n={1}>
            <b>Instrucciones IA.</b> Dos guías que la IA sigue al generar:{" "}
            <b>«Realización de anuncios del producto»</b> (guía los guiones de anuncios) y{" "}
            <b>«Video del embudo»</b> (guía el guión del video de cierre). Pega el texto o
            sube un <Cod>.txt</Cod>/<Cod>.md</Cod>. Se aplican a <b>todos</b> los productos.
          </Paso>
          <Paso n={2}>
            <b>Precios por país.</b> Cada país (Colombia, Perú, Ecuador, Chile, Venezuela)
            con su escalera de precios <b>Fase 1 a Fase 7</b>. Es el valor por defecto que
            se precarga en cada producto (y en los datos de pago del bot).
          </Paso>
          <Paso n={3}>
            <b>Guarda.</b> Sale «✓ Guardado. Se aplica de inmediato en las próximas
            generaciones».
          </Paso>
        </ol>
        <Notas
          tono="warn"
          titulo="Ojo con esto"
          items={[
            <>Los cambios solo afectan a lo que generes <b>después</b>: lo ya generado no se reescribe. Guarda antes de mandar a generar.</>,
            <>Si un producto ya tiene sus propios precios puestos a mano, cambiar los precios globales <b>no</b> le pisa esos montos.</>,
            <>Solo acepta <Cod>.txt</Cod> o <Cod>.md</Cod>: un PDF o Word hay que copiarlo y pegar el texto.</>,
          ]}
        />
      </Seccion>

      {/* ── 3 · EBOOKS ── */}
      <Seccion
        id="ebooks"
        num="3"
        titulo="Ebooks"
        sub="Convierte un producto en un PDF listo para vender o entregar como bono. La IA lo escribe en 3 fases."
      >
        <p className="mb-4 text-sm text-muted">
          El ebook <b className="font-medium text-text">nace de la oferta</b> del producto:
          si el producto no tiene oferta, primero créala en Productos.
        </p>
        <ol className="space-y-3">
          <Paso n={1}>
            <b>Elige producto y entregable.</b> En <b>Ebooks</b> selecciona el producto y en
            «¿Qué vamos a crear?» el producto principal o uno de los bonos (cada uno es un
            ebook aparte).
          </Paso>
          <Paso n={2}>
            <b>Órdenes para la IA</b> (muy recomendable). Escribe de qué va el libro y qué{" "}
            <b>cantidad</b> quieres (p. ej. «8 sesiones por tipo de piel, 40 en total»).
            Estas órdenes mandan sobre la oferta.
          </Paso>
          <Paso n={3}>
            <b>Fase 1 · Idea.</b> <b>Generar idea (desde la oferta)</b>: la IA propone
            título, subtítulo, concepto y público. Editable (el concepto guía toda la
            redacción).
          </Paso>
          <Paso n={4}>
            <b>Fase 2 · Índice.</b> Elige el número de capítulos (4–20) y <b>Generar
            índice</b>. Edita títulos y resúmenes antes de redactar.
          </Paso>
          <Paso n={5}>
            <b>Fase 3 · Redacción.</b> En cada capítulo, <b>Redactar</b>. Corrige en el
            cuadro editable. Con <b>👁 Ver al lado</b> lo ves maquetado con el diseño real.
          </Paso>
          <Paso n={6}>
            <b>Fotos</b> (opcional). Por capítulo elige 0–4 fotos y <b>Generar fotos</b>
            (realistas, con IA); también la <b>Foto de portada</b>. Tras generarlas,{" "}
            <b>Guardar ebook</b>.
          </Paso>
          <Paso n={7}>
            <b>Genera el PDF.</b> Con todos los capítulos redactados, elige el{" "}
            <b>Tema de diseño</b> (amigurumi, arcade, capital, impulso, sabores o sereno) y{" "}
            <b>Generar PDF</b>: se descarga a tu equipo.
          </Paso>
        </ol>
        <Notas
          tono="warn"
          titulo="Ojo con esto"
          items={[
            <>Nada se conserva hasta pulsar <b>Guardar ebook</b>: la redacción y las fotos se pierden si cambias de producto o recargas sin guardar.</>,
            <>Regenerar el índice (Fase 2) <b>borra</b> todos los capítulos ya redactados.</>,
            <>El botón <b>Generar PDF</b> está apagado mientras quede algún capítulo sin redactar.</>,
            <>Las fotos necesitan la clave de IA (Gemini) y el servidor de imágenes bien configurados.</>,
          ]}
        />
      </Seccion>

      {/* ── 4 · EDITOR DE VIDEOS ── */}
      <Seccion
        id="editor"
        num="4"
        titulo="Editor de videos"
        sub="Toma tus videos largos y arma varios anuncios cortos con recortes, subtítulos, música y CTA. Tú pones la voz."
      >
        <p className="mb-4 text-sm text-muted">
          Regla de oro: el número de <b className="font-medium text-text">«¿Cuántos
          anuncios?»</b> manda. Necesitas <b className="font-medium text-text">un audio
          (locución) por cada anuncio</b>, y cada anuncio dura lo que dure su audio.
        </p>
        <ol className="space-y-3">
          <Paso n={1}>
            <b>Materia prima.</b> Arriba eliges el <b>producto</b> (sus videos ya aparecen
            marcados). En «Videos a usar (X/Y)» deja marcados solo los que quieres recortar.
          </Paso>
          <Paso n={2}>
            <b>Estilo.</b> Elige uno de los 7 estilos (Modo Bestia, Editorial Mono, Premium
            Noir, Afiche Retro, Relato Doc, Elegante · Mujer, Impacto · Hombre). Cada uno
            trae su tipografía y colores.
          </Paso>
          <Paso n={3}>
            <b>Subtítulos y opciones.</b> Tipo de subtítulo, tipografía y color de
            resaltado. Música de fondo (biblioteca libre, ON), sonido de inicio (ON) y
            «quitar silencios» de la locución (ON).
          </Paso>
          <Paso n={4}>
            <b>Cierre (CTA).</b> Marca «Poner llamada a la acción al final», su título, el
            botón (WhatsApp u «Otro») y, opcional, la <b>oferta a destacar</b> (p. ej. «2x1
            solo hoy»).
          </Paso>
          <Paso n={5}>
            <b>Sube los audios</b> (obligatorio). En «🎙️ Audios — uno por anuncio» sube
            tantas locuciones como anuncios pediste, <b>en orden</b> (el 1º es del Anuncio
            1…). Puedes soltar varias de golpe.
          </Paso>
          <Paso n={6}>
            <b>Ganchos</b> (opcional). En «🎯 Hook visual» pulsa <b>Buscar ganchos</b>: la
            IA propone aperturas y asignas una por anuncio. O sube tu propio gancho por
            anuncio (manda sobre el automático).
          </Paso>
          <Paso n={7}>
            <b>Crea.</b> Pulsa <b>✨ Crear anuncios</b> (se activa solo con ≥1 video marcado
            y exactamente tantos audios como anuncios). Ves el progreso paso a paso. En
            «🚦 Cola del editor» esperas tu turno: hay <b>un solo worker</b> (se procesan de
            uno en uno).
          </Paso>
          <Paso n={8}>
            <b>Descarga.</b> Con «✅ Anuncios listos»: <b>Previsualizar y renderizar</b>
            (editor visual), <b>⬇️ Anuncio 1, 2…</b> (cada video) o el <b>proyecto Remotion
            (.zip)</b> editable. Quedan también en <b>Mis anuncios</b>.
          </Paso>
        </ol>
        <div className="mt-4 rounded-lg border-l-2 border-accent bg-[var(--field)] p-3 text-xs text-muted [&_b]:font-medium [&_b]:text-text">
          <b>Cómo se llaman los archivos:</b> cada anuncio se descarga como{" "}
          <Cod>PRODUCTO_anuncio_1.mp4</Cod>, <Cod>PRODUCTO_anuncio_2.mp4</Cod>… y el ZIP con
          todos como <Cod>PRODUCTO_anuncios.zip</Cod>. «PRODUCTO» es el nombre de tu
          producto (espacios y símbolos pasan a «_», máx. 40 caracteres).
        </div>
        <Notas
          tono="warn"
          titulo="Ojo con esto"
          items={[
            <>No podrás pulsar «Crear anuncios» hasta tener el <b>mismo número de audios que de anuncios</b> y al menos un video marcado.</>,
            <>Cambiar la selección de videos (o de producto) <b>borra los ganchos</b> ya elegidos.</>,
            <><b>«✂️ Solo recortar»</b> entrega el video crudo con tu voz, sin subtítulos/CTA/ganchos, pero <b>igual exige un audio por anuncio</b> (la música sí se mantiene).</>,
          ]}
        />
      </Seccion>

      {/* ── 5 · MIS ANUNCIOS ── */}
      <Seccion
        id="anuncios"
        num="5"
        titulo="Mis anuncios"
        sub="La estantería de los anuncios de video que ya creaste: verlos, descargarlos y borrarlos."
      >
        <ol className="space-y-3">
          <Paso n={1}>
            <b>Ver.</b> En <b>Mis anuncios</b> quedan en tarjetas los anuncios que creaste
            (los <b>últimos 25</b>), con miniatura, nombre, fecha y cuántos videos tiene. Si
            no aparece el recién creado, pulsa <b>🔄 Actualizar</b>.
          </Paso>
          <Paso n={2}>
            <b>Descargar.</b> Los botones <b>⬇️ 1, ⬇️ 2…</b> bajan cada clip. El número de
            botones te dice cuántos videos terminó ese anuncio.
          </Paso>
          <Paso n={3}>
            <b>Ver / editar.</b> <b>👁️ Ver / editar</b> abre en otra pestaña. Si dice{" "}
            <b>«Sin renderizar todavía»</b>, el botón será «Previsualizar y renderizar»:
            ábrelo para generar el video final. <b>🛠️ Proyecto</b> baja el <Cod>.zip</Cod>
            editable.
          </Paso>
          <Paso n={4}>
            <b>Borrar.</b> <b>🗑️ Borrar</b> lo elimina del servidor tras confirmar. Es
            definitivo.
          </Paso>
        </ol>
        <Notas
          tono="tip"
          titulo="Bueno saber"
          items={[
            <>Los anuncios se <b>crean</b> en el Editor de videos; aquí solo los ves y gestionas.</>,
            <>Se conservan los últimos 25; los más antiguos se descartan solos.</>,
          ]}
        />

        <div className="mt-5 rounded-xl border-l-2 border-accent bg-[var(--field)] p-4 text-sm text-muted [&_b]:font-medium [&_b]:text-text">
          <p className="font-medium text-text">El puente con las ventas: publica el video en Facebook</p>
          <p className="mt-1">
            Descargar el video no lo pone a vender. El paso que conecta todo es{" "}
            <b>subirlo a Facebook Ads Manager como anuncio de «clic a WhatsApp»</b> apuntando
            al número del bot. Así, cuando alguien toca el anuncio y escribe, el bot lo
            atiende (Embudos) y Facebook genera el <Cod>ctwa_clid</Cod> que luego cruza cada
            venta en el <b>Reporte de anuncios</b>. Sin este paso, tu atribución sale vacía.
          </p>
        </div>
      </Seccion>

      {/* ── 6 · REPORTE DE ANUNCIOS ── */}
      <Seccion
        id="reporte"
        num="6"
        titulo="Reporte de anuncios"
        sub="Atribución de Facebook Ads dentro de Datibot: qué anuncio trae cada venta, cuánto gastas y cómo dejarlo conectado."
      >
        <ol className="space-y-3">
          <Paso n={1}>
            <b>Entra sin otro login.</b> Abre <b>Reporte de anuncios</b> desde el menú: usa
            tu misma sesión de Datibot, sin pedir otro usuario ni contraseña.
          </Paso>
          <Paso n={2}>
            <b>Qué muestra.</b> Qué anuncio generó cada venta (cruzado por <Cod>ad_id</Cod>),
            el gasto y los presupuestos por anuncio, y el rendimiento por país. Los importes
            van en <b>USD</b>, con su equivalente en pesos debajo de tus ventas propias.
          </Paso>
        </ol>

        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted">
          Puesta a punto (una vez)
        </p>
        <p className="mt-1 mb-1 text-xs text-muted">
          Esto se configura <b className="font-medium text-text">una sola vez</b> y suele
          hacerlo quien monta la parte técnica. Como dueño, para el día a día te basta con
          los dos pasos de arriba (entrar y leer el reporte).
        </p>

        <SubGuia titulo="Conectar un Business de Facebook (token de Usuario del Sistema)">
          <p className="mb-3 text-sm text-muted">
            Es la forma segura y permanente (no caduca como los tokens normales).
          </p>
          <ol className="space-y-2">
            <Paso n={1}>
              Entra a <b>business.facebook.com</b> con el perfil dueño del Business →{" "}
              <b>Configuración del negocio</b> (⚙️).
            </Paso>
            <Paso n={2}>
              <b>Usuarios → Usuarios del sistema → Agregar</b>: ponle nombre (ej. «Reporte
              Ads») y rol <b>Administrador</b>.
            </Paso>
            <Paso n={3}>
              <b>Asignar activos → Cuentas publicitarias</b> → marca <b>todas</b> las que
              quieras ver → permiso <b>Administrar campañas</b>.
            </Paso>
            <Paso n={4}>
              <b>Generar nuevo token</b> → elige tu App → permisos <Cod>ads_read</Cod> y{" "}
              <Cod>ads_management</Cod> (y <Cod>business_management</Cod> si aparece) →{" "}
              <b>copia el token</b>.
            </Paso>
            <Paso n={5}>
              En el panel → <b>Configuración → Conexiones → Agregar conexión</b>, pega el
              token y guarda. Vuelve al Dashboard y <b>Recargar</b>.
            </Paso>
          </ol>
          <p className="mt-2 text-xs text-muted">
            Repite por cada Business que tengas: cada Business = una conexión.
          </p>
        </SubGuia>

        <SubGuia titulo="Conectar un 2º Business u otro perfil (una sola app central)">
          <p className="mb-3 text-sm text-muted">
            Si administras otro perfil con su propio Business, <b className="text-text">no
            uses «Socios»</b>. Lo mejor es reusar <b className="text-text">una sola app
            central</b> (la de tu perfil principal) para todos.
          </p>
          <ol className="space-y-2">
            <Paso n={1}>
              Haz que tu <b>app central</b> esté disponible en el Business del 2º perfil: en
              ese Business → <b>Configuración del negocio → Cuentas → Apps → Agregar →
              Conectar un identificador de app (App ID)</b> y pega el <b>App ID</b> de tu app
              central.
            </Paso>
            <Paso n={2}>
              En ese Business crea un <b>Usuario del sistema</b> Administrador, asígnale sus
              cuentas y <b>genera el token</b> eligiendo la <b>app central</b> (ya aparece en
              la lista).
            </Paso>
            <Paso n={3}>
              Pega ese token en <b>Configuración → Conexiones</b>. Ahora ves los dos Business
              juntos y puedes filtrar por Business.
            </Paso>
          </ol>
        </SubGuia>

        <SubGuia titulo="¿No tienes App de Facebook? Créala una vez">
          <ol className="space-y-2">
            <Paso n={1}>
              Entra a <b>developers.facebook.com/apps → Crear app → tipo Negocio</b>.
            </Paso>
            <Paso n={2}>
              En <b>Configuración → Información básica</b> copia el <b>App ID</b> y la{" "}
              <b>Clave secreta</b>.
            </Paso>
            <Paso n={3}>
              Agrega el producto <b>Marketing API</b>. En <b>modo de desarrollo</b> basta
              para leer TUS propias cuentas (no necesitas revisión de Facebook).
            </Paso>
          </ol>
        </SubGuia>

        <SubGuia titulo="Conectar Supabase (2ª fuente de ventas)">
          <ol className="space-y-2">
            <Paso n={1}>
              En <b>supabase.com → Project Settings → API</b> copia el <b>Project URL</b> y
              una <b>API key</b> (la <Cod>service_role</Cod>, o una con lectura de tu tabla).
            </Paso>
            <Paso n={2}>
              Ponlas como env en EasyPanel del servicio de anuncios: <Cod>SUPABASE_URL</Cod>{" "}
              y <Cod>SUPABASE_KEY</Cod>. Guarda y redespliega.
            </Paso>
            <Paso n={3}>
              En el panel → <b>Configuración → Supabase</b>: escribe el nombre de la tabla y{" "}
              <b>mapea las columnas</b> (id del anuncio, valor, fecha/hora, y opcional
              producto/país e id único). <b>Probar conexión</b> → <b>Sincronizar</b>.
            </Paso>
          </ol>
          <p className="mt-2 text-xs text-muted">
            Las ventas de Supabase se deduplican por su id de fila. En <b>Configuración →
            Moneda → Fuente de las ventas</b> eliges contar todas las fuentes o solo una
            (para no contar doble).
          </p>
        </SubGuia>

        <SubGuia titulo="Atribución con CAPI y el ctwa_clid (importante)">
          <p className="mb-3 text-sm text-muted">
            Facebook ya <b className="text-text">no atribuye por el número</b> del cliente:
            manda un <Cod>ctwa_clid</Cod> (el ID del clic en el anuncio, distinto en cada
            clic). Es lo que hay que devolverle.
          </p>
          <ol className="space-y-2">
            <Paso n={1}>
              En <b>n8n</b>, en el primer mensaje del lead, guarda{" "}
              <Cod>referral.ctwa_clid</Cod> (y <Cod>referral.source_id</Cod> = el ad_id)
              junto a la venta en Supabase.
            </Paso>
            <Paso n={2}>
              En el panel → <b>Configuración → Pixel / CAPI</b>: pon el <b>Pixel ID</b> y el{" "}
              <b>token CAPI</b>, y <b>mapea la columna</b> del <Cod>ctwa_clid</Cod>.
            </Paso>
            <Paso n={3}>
              La app envía cada venta a Facebook como conversión (Purchase) con ese ID: así
              Facebook optimiza y arma públicos aunque la venta ocurra en WhatsApp.
            </Paso>
          </ol>
          <p className="mt-2 text-xs text-muted">
            El teléfono/email (hasheados) siguen de respaldo, pero la llave principal ahora
            es el <Cod>ctwa_clid</Cod>.
          </p>
        </SubGuia>

        <SubGuia titulo="Ver la facturación por país">
          <p className="text-sm text-muted">
            La app saca el país de cada anuncio del <b className="text-text">targeting</b> del
            conjunto (a quién se lo muestras). El <b>gasto por país</b> sale con la conexión
            de Facebook; la <b>facturación por país</b> sale si tus ventas traen el país
            (columna <Cod>Pais</Cod> en Excel/Sheets, o la columna mapeada en Supabase).
            Míralo en <b>Dashboard → Rendimiento por país</b>.
          </p>
        </SubGuia>

        <Notas
          tono="tip"
          titulo="Bueno saber"
          items={[
            <>El tutorial de anuncios está <b>unificado aquí</b>: dentro del panel, la pestaña «Tutoriales» te trae a esta misma sección.</>,
            <>Si el panel llegara a salir en blanco, ábrelo directo en <b>anuncios.datibot.lat</b>.</>,
          ]}
        />
      </Seccion>

      {/* ── 7 · EMBUDOS — número + producto (lo importante) ── */}
      <Seccion
        id="embudo"
        num="7"
        titulo="Montar el número y el producto (el bot)"
        sub="Lo importante: aquí se configura el bot de WhatsApp. Editar en Embudos = cambiar el bot al instante."
        defaultOpen
        destacado
      >
        <span className="inline-block rounded-full border border-accent/50 bg-accent/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-text">
          Lo importante
        </span>
        <p className="mt-3 text-sm text-muted">
          La sección <b className="font-medium text-text">Embudos</b> configura el bot de
          WhatsApp. Todo se guarda en Supabase y el motor de n8n lo lee en vivo:{" "}
          <b className="font-medium text-text">editar aquí = cambiar el bot al
          instante</b>, sin redesplegar.
        </p>

        {/* Requisito técnico (una sola vez) */}
        <div className="mt-5 rounded-xl border border-[var(--hairline)] bg-[var(--field)] p-4">
          <p className="text-sm font-semibold text-text">
            Puesta a punto técnica (una sola vez — la hace quien monta el sistema)
          </p>
          <p className="mt-1 text-xs text-muted">
            Como dueño no necesitas hacer esto: si al entrar a Embudos <b>no</b> ves un
            aviso de conexión, ya está lista para usar. Si aparece el aviso, pásale estos
            dos pasos a tu técnico.
          </p>
          <ol className="mt-3 space-y-3">
            <Paso n={1}>
              Correr el <b>SQL del esquema</b> (<Cod>apps/web/lib/embudos/schema.sql</Cod>)
              en el editor SQL de Supabase — crea las tablas <Cod>numeros</Cod>,{" "}
              <Cod>productos</Cod>, <Cod>pasos_embudo</Cod>, <Cod>mensajes_rotador</Cod> y{" "}
              <Cod>media_bots</Cod>. Se puede correr varias veces sin romper nada.
            </Paso>
            <Paso n={2}>
              Definir en EasyPanel (servicio web) <Cod>EMBUDOS_SUPABASE_URL</Cod> y{" "}
              <Cod>EMBUDOS_SUPABASE_SERVICE_KEY</Cod>, y redesplegar.
            </Paso>
          </ol>
        </div>

        {/* Paso a paso */}
        <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted">
          Las 4 pestañas, en orden
        </h3>
          <ol className="mt-3 space-y-3">
            <Paso n={1}>
              <b>Números</b> («+ Nuevo número»): pon un <b>Nombre</b> (identifica la cuenta
              publicitaria), el <b>número de WhatsApp</b>, el <b>Phone ID</b> de Meta (su
              identificador, te lo da Meta), el <b>WABA</b>, el <b>account_id</b> de Chatwoot, la{" "}
              <b>credencial</b> de n8n y el <b>CAPI token</b> (se guarda oculto). En{" "}
              <b>«Producto que vende hoy»</b> eliges cuál de tus productos atiende ese
              número. Guarda.
            </Paso>
            <Paso n={2}>
              <b>Bot por producto</b> (elige el mismo producto): los <b>mensajes fijos</b>
              (bienvenida, cobro, bonos, datos de pago, felicitación), los{" "}
              <b>prompts de las IAs</b> (convencer y cobrar), el bloque{" "}
              <b>Pixel / campaña</b> y los <b>datos de pago por país</b> (titular, cuenta,
              método, moneda, precio base). Vienen precargados con los datos fijos de cada
              país y con Configuración → Precios. Guarda.
            </Paso>
            <Paso n={3}>
              <b>Embudo (constructor)</b>: arma la secuencia por bloques, agrupada en 5
              estados (<b>MENU → VIDEO → CONFIRMACIÓN → ENTREGA → STOP</b>). Pulsa{" "}
              <b>Cargar plantilla por defecto</b> para partir de la estándar, reordena con
              ↑/↓, ajusta los <b>delays</b> (anti-baneo) y los <b>botones</b>. Un bloque de
              mensaje puede tener <b>«Varias versiones (anti-spam)»</b>: el bot elige una al
              azar. Guarda.
            </Paso>
            <Paso n={4}>
              <b>Media</b>: elige el <b>número que aloja la media</b> y sube el <b>video</b>
              (máx. 16 MB) y los <b>PDFs</b> (máx. 100 MB c/u). La app los sube a WhatsApp
              para obtener el <b>media_id</b> (envío instantáneo) y puedes ponerles un{" "}
              <b>caption</b>. Se renueva sola cada <b>20 días</b> (los media_id caducan a los
              ~30); o fuérzalo con <b>🔄 Renovar media</b>.
            </Paso>
            <Paso n={5}>
              <b>Conéctalo en n8n</b> (una sola vez): enlaza la credencial de WhatsApp de
              ese número. El motor resuelve solo qué vender:{" "}
              <b>phone_id → producto_activo → producto</b>.
            </Paso>
          </ol>

          <div className="mt-5 rounded-lg border-l-2 border-accent bg-[var(--field)] p-3 text-xs text-muted [&_b]:font-medium [&_b]:text-text">
            <b>Para cambiar lo que vende un número:</b> solo cambia el campo{" "}
            <b>«Producto que vende hoy»</b> en Números. Instantáneo.
          </div>

          <Notas
            tono="warn"
            titulo="Ojo con esto"
            items={[
              <>El <b>Phone ID</b> (el identificador del número que da Meta, no es una contraseña) no se puede cambiar al editar: si te equivocas, borra el número y créalo de nuevo.</>,
              <>El <b>CAPI token</b> no se vuelve a mostrar: al editar, si dejas el campo vacío se conserva el que ya estaba; solo escribe uno nuevo si quieres reemplazarlo.</>,
              <>Para subir media <b>debe existir al menos un número</b> (la media se aloja en un WhatsApp). Y el video no puede pasar de 16 MB.</>,
              <>Si el constructor del Embudo avisa que no pudo leer Supabase, <b>no entra en modo edición</b> a propósito (evita borrar pasos al guardar con datos a medias): vuelve a elegir el producto.</>,
            ]}
          />

          <div className="mt-5 rounded-xl border border-[var(--hairline)] bg-[var(--field)] p-4 text-sm text-muted [&_b]:font-medium [&_b]:text-text">
            <p className="font-medium text-text">Compruébalo tú mismo (2 minutos)</p>
            <p className="mt-1">
              Escríbete al número desde <b>otro</b> WhatsApp y confirma el recorrido completo:
            </p>
            <ul className="mt-2 space-y-1 text-xs">
              <li>☐ Llega la <b>bienvenida</b> con el menú.</li>
              <li>☐ Respondes y llega el <b>video</b> con su botón.</li>
              <li>☐ Confirmas y llegan los <b>PDFs / bonos</b> y los <b>datos de pago</b>.</li>
              <li>☐ Escribes <b>STOP</b> y el bot deja de escribirte.</li>
            </ul>
            <p className="mt-2 text-xs">
              Si algo de esto no pasa, revisa el FAQ («El bot no responde nada») o avisa a tu
              técnico.
            </p>
          </div>
      </Seccion>

      {/* PLANTILLAS n8n (técnico) */}
      <Seccion
        id="plantillas"
        num="+"
        titulo="Plantillas de n8n (avanzado · para tu técnico)"
        sub="Descarga los workflows de n8n para importarlos (recibidor, motor, precarga de media)."
      >
        <PlantillasN8n />
      </Seccion>

      {/* DAR DE ALTA UN NÚMERO (avanzado · técnico) */}
      <Seccion
        id="numero"
        num="⚙"
        titulo="Dar de alta un número (avanzado · para tu técnico)"
        sub="Conectar por primera vez un número con Meta, n8n y Chatwoot. Como dueño puedes saltarte esta parte."
      >
        <ConfigTutorialNumero />
      </Seccion>

      {/* ── DICCIONARIO ── */}
      <Seccion
        id="glosario"
        num="•"
        titulo="Diccionario rápido"
        sub="Las palabras técnicas que aparecen en el tutorial, en una línea cada una."
      >
        <ul className="space-y-1.5 text-sm text-muted [&_b]:font-medium [&_b]:text-text">
          <li><b>Meta / WhatsApp Cloud API</b> — la plataforma de Facebook por donde tu número envía y recibe mensajes.</li>
          <li><b>n8n</b> — el motor que automatiza los mensajes del bot (lee lo que editas en Embudos y actúa).</li>
          <li><b>Supabase</b> — la base de datos donde vive la configuración del bot (lo que editas en Embudos).</li>
          <li><b>Chatwoot</b> — la bandeja donde ves y respondes las conversaciones.</li>
          <li><b>Phone ID</b> — el identificador de tu número que da Meta (no es una contraseña).</li>
          <li><b>WABA</b> — el identificador de tu cuenta de WhatsApp Business en Meta.</li>
          <li><b>media_id</b> — el «id» que WhatsApp le pone a un archivo (video/PDF) para enviarlo al instante; caduca y se renueva sola.</li>
          <li><b>Pixel / CAPI</b> — la forma de devolverle a Facebook las ventas que ocurren en WhatsApp, para que optimice tus anuncios.</li>
          <li><b>ctwa_clid</b> — el id del clic en un anuncio de «clic a WhatsApp»; conecta cada venta con el anuncio que la trajo.</li>
        </ul>
      </Seccion>

      {/* ── PREGUNTAS FRECUENTES ── */}
      <div id="faq" className="mt-10 scroll-mt-6">
        <h2 className="text-2xl">Preguntas frecuentes</h2>
        <p className="mt-1 text-sm text-muted">Los tropiezos más comunes y su solución.</p>
        <div className="mt-4 space-y-2">
          {[
            [
              "Generé algo con la IA pero al volver ya no estaba",
              <>Los generadores rellenan la pantalla pero no guardan solos. Pulsa el botón <b className="font-medium text-text">«Guardar…»</b> de ese paso antes de salir.</>,
            ],
            [
              "Al guardar sale «el producto cambió en otra pestaña»",
              <>Se editó el mismo producto en dos sitios a la vez (p. ej. Productos y Ebooks). <b className="font-medium text-text">Recarga y vuelve a guardar</b>: es una protección para no borrar secciones.</>,
            ],
            [
              "No puedo pulsar «Crear anuncios» en el editor",
              <>Faltan requisitos: necesitas <b className="font-medium text-text">al menos un video marcado</b> y <b className="font-medium text-text">exactamente un audio por cada anuncio</b> que pediste.</>,
            ],
            [
              "Un anuncio dice «Sin renderizar todavía»",
              <>Aún no tiene el video final. Ábrelo con <b className="font-medium text-text">«Previsualizar y renderizar»</b> para generarlo.</>,
            ],
            [
              "Edité los Embudos pero el bot no cambió",
              <>Primero confirma que <b className="font-medium text-text">guardaste</b> y que Embudos no muestra aviso de conexión. Si guardaste y aun así no cambia, avisa a quien te montó el sistema: la parte de automatización (n8n) puede necesitar un ajuste.</>,
            ],
            [
              "El bot no responde nada",
              <>Revisa en orden: (1) ¿le <b className="font-medium text-text">escribiste tú primero</b>? WhatsApp solo deja responder dentro de las 24 h de tu último mensaje. (2) ¿el número quedó bien conectado? (usa «Compruébalo tú mismo» en Embudos). Si nada de eso, avísale a tu técnico: puede ser el flujo de n8n apagado o el webhook de Meta caído (tiene la tabla de errores en «Dar de alta un número»).</>,
            ],
            [
              "El bot dejó de enviar el video o los PDFs",
              <>Puede haber caducado el media_id. Ve a <b className="font-medium text-text">Embudos → Media</b> y pulsa <b className="font-medium text-text">🔄 Renovar media</b>.</>,
            ],
            [
              "«Reporte de anuncios» sale en blanco",
              <>Es cómo se muestra embebido, no tu sesión. Ábrelo directo en <b className="font-medium text-text">anuncios.datibot.lat</b>.</>,
            ],
            [
              "Se perdieron productos o anuncios tras reimplementar",
              <>Faltan los <b className="font-medium text-text">volúmenes persistentes</b> en <Cod>/data</Cod> (web y editor). Sin ellos, cada redeploy empieza vacío. Esto lo configura tu técnico en EasyPanel.</>,
            ],
            [
              "La página no carga, da error 502, o se vació todo tras un cambio",
              <>No es tu culpa ni algo que arregles tú: recarga y, si sigue, <b className="font-medium text-text">avisa a tu técnico</b>. Suele ser del servidor (falta de RAM al desplegar, las variables internas, o los volúmenes <Cod>/data</Cod>) y se revisa en EasyPanel.</>,
            ],
            [
              "Olvidé la contraseña",
              <>No hay recuperación desde la web: se cambia en el servidor (EasyPanel). Cambiarla cierra todas las sesiones abiertas.</>,
            ],
          ].map(([q, a], i) => (
            <details
              key={i}
              className="group rounded-xl border border-[var(--hairline)] bg-[var(--field)] px-4 py-3"
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-text [&::-webkit-details-marker]:hidden">
                <span className="text-muted transition-transform group-open:rotate-45">+</span>
                {q}
              </summary>
              <div className="mt-2 pl-5 text-sm leading-relaxed text-muted">{a}</div>
            </details>
          ))}
        </div>
      </div>

      {/* REGLAS */}
      <div id="reglas" className="mt-10 scroll-mt-6">
        <h2 className="text-2xl">Reglas de oro</h2>
        <p className="mt-1 text-sm text-muted">Para que todo se mantenga sano.</p>
        <ul className="mt-4 space-y-2 text-sm text-muted [&_b]:font-medium [&_b]:text-text">
          <li>• <b>Guarda cada paso:</b> la IA no guarda sola; cada sección tiene su botón «Guardar…».</li>
          <li>• <b>Nada se borra:</b> productos, config, música y media viven en volúmenes persistentes (<Cod>/data</Cod>).</li>
          <li>• <b>Secretos por entorno:</b> las API keys y tokens van en EasyPanel, nunca en el chat.</li>
          <li>• <b>Editar Embudos = cambiar el bot al instante</b> (Supabase en vivo); no hay que redesplegar.</li>
          <li>• <b>El n8n</b> debe resolver por número → producto para leer lo que editas aquí.</li>
        </ul>
      </div>
    </div>
  );
}
