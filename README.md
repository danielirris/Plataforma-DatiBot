# Mi Plataforma

Monorepo que unifica varias apps bajo **un solo shell web** con navegación,
estilos y configuración compartidos. Está pensado para ir creciendo: cada
herramienta vive en su propia ruta y se le pueden añadir secciones nuevas.

Stack: **Turborepo + pnpm + Next.js 15 (App Router, TypeScript, Tailwind 4)**
como cáscara, más servicios Python (Streamlit / FastAPI) embebidos.

---

## Qué incluye hoy

| Sección | Ruta | Qué es | Cómo está integrada |
|---------|------|--------|---------------------|
| Inicio | `/` | Portada del shell | Nativa (Next.js) |
| Creador de Flujos | `/flujos` | Generador de SubWorkflows n8n (HTML/JS offline) | **Absorbida**: servida estática en `public/tools/flujos/` + iframe |
| Dashboard ads | `/dashboard` | Facebook Ads × Supabase → ROAS/CPA (Streamlit) | **Servicio** `apps/dashboard-service` (puerto 8501) + iframe |
| Extractor | `/extractor` | Clips verticales desde video (FastAPI + FFmpeg + Remotion) | **Servicio** `apps/extractor-service` (puerto 8000) + iframe |
| Configuración | `/configuracion` | Panel central de **todas las API keys** | Nativa (Next.js) |

---

## Estructura

```
mi-plataforma/
├── apps/
│   ├── web/                  # Shell Next.js 15 — dueño del sidebar, estilos y Configuración
│   │   └── app/
│   │       ├── layout.tsx            # sidebar + layout raíz
│   │       ├── page.tsx              # inicio
│   │       ├── flujos/               # iframe → /public/tools/flujos
│   │       ├── dashboard/            # iframe → servicio Streamlit
│   │       ├── extractor/            # iframe → servicio FastAPI
│   │       ├── configuracion/        # panel de API keys
│   │       └── api/config/           # GET/POST del almacén de config
│   ├── dashboard-service/    # Dashboard ads (Streamlit, Python) — copia autónoma
│   └── extractor-service/    # Extractor (FastAPI + Remotion, Python) — copia autónoma
├── packages/
│   ├── ui/                   # sidebar (nav), helper cn(), tokens de estilo
│   └── config/              # esquema de config + lectura/escritura + generación de .env
├── turbo.json · pnpm-workspace.yaml · package.json
└── .config-store.json        # almacén de keys (NO se versiona; lo crea Configuración)
```

---

## Requisitos

- **Node ≥ 20** (probado con 24). pnpm se activa con `corepack enable pnpm`.
- **Python 3.11+** (probado con 3.13) para los dos servicios.
- **ffprobe** en el sistema (los servicios de video lo usan). En macOS: `brew install ffmpeg`.
  (El `ffmpeg` con subtítulos ya viene compilado en `apps/extractor-service/bin/`.)

---

## Primer arranque

```bash
cd mi-plataforma

# 1. Dependencias JS del workspace
pnpm install

# 2. Entornos Python de los dos servicios (crea .venv e instala requirements)
pnpm setup:services

# 3. Levantar TODO con un solo comando
pnpm dev
```

`pnpm dev` (Turborepo) levanta en paralelo:

- **web** → http://localhost:3000  (el shell; entra por aquí)
- **dashboard-service** → http://localhost:8501  (embebido en `/dashboard`)
- **extractor-service** → http://localhost:8000  (embebido en `/extractor`)

Abre **http://localhost:3000** y navega desde el sidebar.

---

## Configuración de API keys (importante)

No hay archivos `.env` que editar a mano. Todo se gestiona desde
**⚙️ Configuración** en el shell:

1. Entra a http://localhost:3000/configuracion
2. Rellena las keys de cada app (Dashboard ads, Extractor, etc.)
3. Guarda.

Al guardar:

- Los valores se guardan en `.config-store.json` (raíz, fuera de git).
- Se **regenera automáticamente** el `.env` de cada servicio
  (`apps/dashboard-service/.env`, `apps/extractor-service/.env`) con los nombres
  de variable que cada app espera. Las apps Python los leen con
  `python-dotenv` / `pydantic-settings` sin cambios.

> ⚠️ Tras cambiar una key hay que **reiniciar el servicio** afectado (Ctrl+C y
> `pnpm dev` de nuevo) para que tome el nuevo `.env`.

La key de OpenAI del grupo **Compartidas** se hereda a los servicios que la
dejen vacía.

---

## Cómo agregar una sección nueva en el futuro

### A) Una página nativa del shell (React/Next)

1. Crea `apps/web/app/mi-seccion/page.tsx`.
2. Añade la entrada al sidebar en `packages/ui/src/nav.ts`:
   ```ts
   { href: "/mi-seccion", label: "Mi Sección", icon: "✨" },
   ```
   Aparece sola en el sidebar y en la portada.

### B) Una app externa embebida (otro servicio: Python, otro Node, etc.)

1. Copia la app a `apps/mi-servicio/` (por copia, no muevas el original).
2. Dale un `package.json` con un script `dev` que arranque su servidor en un
   puerto libre (mira `dashboard-service` o `extractor-service` como plantilla).
   Turborepo lo incluirá en `pnpm dev` automáticamente.
3. Crea `apps/web/app/mi-seccion/page.tsx` con un `<iframe>` apuntando a su puerto.
4. Añade su entrada en `packages/ui/src/nav.ts`.
5. Si necesita API keys, añade su grupo en
   `packages/config/src/schema.ts` (con `envTarget` apuntando a su `.env`) y
   aparecerán en Configuración, que le generará su `.env`.

---

## Notas y pendientes conocidos

- **Extractor — render Remotion:** el modo *Recortes* (FFmpeg) y toda la UI
  funcionan. El modo *Edición Remotion* (render final de anuncios) necesita
  instalar las deps Node de `apps/extractor-service/remotion-runtime/` y
  `apps/extractor-service/web-preview/` (`npm install` en cada una; descargan un
  Chromium headless). Hazlo cuando vayas a usar ese modo.
- **Sin login:** la plataforma es abierta (uso local). El shell está montado
  para poder añadir auth después (p. ej. middleware de Next) sin rehacer nada.
- **`app-grande`** (Documents) es una versión vieja de Dashboard ads y quedó
  fuera a propósito. **`prrsv-validator`** (bioinformática) tampoco entró por no
  encajar temáticamente.
- Las apps originales en `Documents/` **no se tocaron**: todo se trabajó por copia.

---

## Comandos útiles

| Comando | Qué hace |
|---------|----------|
| `pnpm dev` | Levanta shell + los dos servicios |
| `pnpm --filter web dev` | Solo el shell Next.js |
| `pnpm --filter dashboard-service dev` | Solo Dashboard ads |
| `pnpm --filter extractor-service dev` | Solo Extractor |
| `pnpm build` | Build de producción del shell |
| `pnpm setup:services` | (Re)crea los venvs de Python |
