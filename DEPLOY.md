# Despliegue en VPS con EasyPanel

La plataforma son **4 servicios** que se despliegan desde este mismo repo de
GitHub, cada uno como una **App** distinta en EasyPanel (contenedores separados):

| Servicio EasyPanel | Carpeta | Puerto | Subdominio sugerido | Login |
|--------------------|---------|--------|---------------------|-------|
| `web` (shell) | `apps/web` | 3000 | `app.tudominio.com` | App (env `APP_AUTH_*`) |
| `dashboard` | `apps/dashboard-service` | 8501 | `dashboard.tudominio.com` | Basic Auth de EasyPanel |
| `extractor` | `apps/extractor-service` | 8000 | `extractor.tudominio.com` | Basic Auth de EasyPanel |
| `ebooks` | `apps/ebookforge-service` | 8600 | `ebooks.tudominio.com` | Basic Auth de EasyPanel |

El shell (web) embebe a los otros 3 por iframe usando las URLs de sus subdominios.

Hay un **5º servicio opcional**: `editor`, que es el mismo `apps/web` con
`SOLO_EDITOR=1` y otro dominio, para prestar el editor de videos a alguien de
fuera sin darle el resto. Ver **2-bis**.

> **Modelo de secretos:** como cada servicio es un contenedor aparte, las API keys
> de los servicios Python se ponen como **variables de entorno en EasyPanel**, NO
> con los `.env` que genera el panel de Configuración (ese mecanismo era para un
> solo host). Las keys del propio shell (Gemini, VPS) sí se cargan desde
> **/configuracion** y se guardan en el volumen `/data`.

---

## 0. DNS

Apunta estos registros A al IP del VPS (o un `*.tudominio.com` comodín):
`app`, `dashboard`, `extractor`, `ebooks`. EasyPanel emite el HTTPS (Let's Encrypt)
solo al asignar el dominio a cada servicio.

---

## 1. Servicios Python (despliega estos primero)

Para cada uno: **Create → App → Source: GitHub** (este repo, rama `main`).

### dashboard
- **Build:** método Dockerfile · Build context `apps/dashboard-service` · Dockerfile `Dockerfile`.
- **Puerto:** 8501.
- **Dominio:** `dashboard.tudominio.com` (activa HTTPS).
- **Basic Auth:** actívalo en los ajustes del dominio (usuario/clave que quieras).
- **Env (Facebook + Supabase):**
  ```
  OPENAI_API_KEY=...
  FB_TOKEN_1=...        FB_LABEL_1=...
  FB_TOKEN_2=...        FB_LABEL_2=...
  SUPABASE_URL=...      SUPABASE_KEY=...      SUPABASE_SERVICE_KEY=...
  SALES_TABLE=compradores   CONTACTS_TABLE=contactos   ANUNCIOS_TABLE=anuncios
  USD_TO_COP=4000  MXN_TO_COP=200  PEN_TO_COP=1080  CLP_TO_COP=4.5
  ```

### extractor
- **Build:** Dockerfile · context `apps/extractor-service` · Dockerfile `Dockerfile`.
- **Puerto:** 8000.
- **Dominio:** `extractor.tudominio.com` · **Basic Auth** activado.
- **Volumen persistente:** monta uno en `/app/storage` (videos/jobs/outputs).
- **Recursos:** este es el pesado (Chromium de Remotion). **Dale 4–5 GB de RAM**
  (Memory Limit). Con menos, un anuncio pesado revienta el límite → OOM → el
  contenedor se reinicia a mitad de render → **500 intermitente** en el editor.
- **Réplicas / workers:** deja **1 réplica** y **1 worker** (el CMD ya es 1). NO
  subas `--workers` ni pongas 2+ réplicas: la cola y el estado son en memoria y
  SQLite es de un solo escritor → se rompería. Para más carga, sube RAM, no copias.
- **Env:**
  ```
  OPENAI_API_KEY=...        (obligatorio: transcripción + análisis)
  ELEVENLABS_API_KEY=...    (opcional, solo voz)
  WHATSAPP_LINK=...         (CTA)
  REMOTION_CONCURRENCY=2    (IMPORTANTE: pestañas Chromium en paralelo al render.
                             Acota el pico de RAM. Pon 1 si el VPS es pequeño. Sin
                             esto, Remotion abre 1 por núcleo y se dispara el OOM.)
  ```

### ebooks
- **Build:** Dockerfile · **context `/` (raíz del repo)** · Dockerfile `apps/ebookforge-service/Dockerfile`.
- **Puerto:** 8600.
- **Dominio:** `ebooks.tudominio.com` · **Basic Auth** activado.
- **Env:** ninguna (el motor no usa keys).

---

## 2. Shell (web) — despliega al final

Necesita las URLs de los 3 subdominios de arriba, así que va después.

- **Build:** método Dockerfile · **Build context `/` (raíz del repo)** · Dockerfile `apps/web/Dockerfile`.
  (La web se construye desde la raíz porque necesita el workspace pnpm completo.)
- **Puerto:** 3000.
- **Dominio:** `app.tudominio.com` (activa HTTPS).
- **Basic Auth de EasyPanel:** **NO** lo actives aquí — el login lo hace la app con
  `APP_AUTH_*` (si activas ambos, el navegador pediría contraseña dos veces).
- **Volumen persistente:** monta uno en `/data` (guarda `.config-store.json` y los productos).
- **Env:**
  ```
  APP_AUTH_USER=tu_usuario
  APP_AUTH_PASSWORD=una_clave_fuerte
  DATA_DIR=/data
  DASHBOARD_URL=https://dashboard.tudominio.com
  EXTRACTOR_URL=https://extractor.tudominio.com
  EBOOKFORGE_URL=https://ebooks.tudominio.com
  # URL INTERNA del servicio ebooks (para el botón "Generar ebook" de Productos).
  # Debe ser la interna, no la pública (la pública lleva Basic Auth).
  EBOOK_RENDER_URL=http://ebooks:8600
  ```
  > El botón **Generar ebook** (en Productos) crea el contenido con la IA del
  > shell (Gemini/OpenAI) y lo manda al servicio `ebooks` a renderizar el PDF.
  > Por eso `web` necesita alcanzar a `ebooks` por la red interna del proyecto.

---

## 2-bis. Editor de videos suelto (opcional) — `editor.tudominio.com`

Para darle **solo el editor de videos** a alguien de fuera, sin darle el resto de
la plataforma ni tus productos. Es el **mismo repo y el mismo Dockerfile** que
`web`: cambian el dominio y las variables. Los arreglos que hagas al editor le
llegan redesplegando este servicio.

Crea una **segunda App** en EasyPanel:

- **Build:** igual que `web` — Dockerfile · Build context `/` · `apps/web/Dockerfile`.
  > ⚠️ **No lo crees duplicando el servicio `extractor`**: la copia hereda su
  > Dockerfile (`apps/extractor-service/...`) y construiría el motor Python en vez
  > de la pantalla del editor. Créalo desde cero.
- **Puerto:** el que diga el log al arrancar (`Network: http://0.0.0.0:XX`).
  El Dockerfile declara 3000, pero **EasyPanel suele inyectar `PORT=80`** y
  entonces el dominio debe apuntar al **80**, no al 3000. Si no coincide, sale
  "Service is not reachable".
- **Dominio:** `editor.tudominio.com` (activa HTTPS). Necesita su registro DNS
  propio (una `A` a la IP del VPS, igual que `app`), o no resolverá.
- **Basic Auth de EasyPanel:** **NO** lo actives (el login lo hace la app).
- **Volumen:** **no montes el volumen `/data` de `web`.** No lo necesita, y sin él
  es imposible que se filtren tus productos aunque algo falle.
- **Env:**
  ```
  SOLO_EDITOR=1
  APP_AUTH_USER=el_usuario_de_tu_invitada
  APP_AUTH_PASSWORD=una_clave_distinta_a_la_tuya
  EXTRACTOR_INTERNAL_URL=http://extractor:8000
  EXTRACTOR_URL=https://extractor.tudominio.com
  IMG_PUBLIC_BASE=https://editor.tudominio.com
  VPS_LOCAL_DIR=/data/img
  ```

Con `SOLO_EDITOR=1`, `middleware.ts` deja pasar **solo** el editor y sus APIs
(`/extractor`, `/api/editor/jobs|hooks|voz|videos`, `GET /api/editor/cola`,
`/api/img`). Todo lo demás —incluida `/api/config`, que devuelve las API keys—
responde 404 aunque se entre por URL directa. Quedan fuera a propósito
`/api/editor/galeria` (los anuncios del extractor son de todos los que lo usan)
y el `POST /api/editor/cola` (vaciar la cola cancelaría **tus** renders).

**Ten en cuenta:**

- **El extractor es el mismo y hace un trabajo a la vez.** Los renders de tu
  invitada se ponen en la misma cola que los tuyos y os esperáis mutuamente.
- **El gasto de IA lo pagas tú:** cada anuncio que genere consume tu cuota.
- **Credenciales aparte.** Ponle usuario y contraseña **distintos** de los tuyos:
  así se los quitas cerrando este servicio, sin tocar tu app.
- **Los videos que suba** van a `VPS_LOCAL_DIR` con el prefijo `vid-editor-` y
  **nadie los borra solos**: revisa esa carpeta de vez en cuando.

---

## 3. Post-despliegue

1. Entra a `https://app.tudominio.com` → te pide el login de `APP_AUTH_*`.
2. Ve a **⚙️ Configuración** y rellena las keys del **shell**:
   - **Generación con IA:** Gemini API Key (+ proveedor de texto).
   - **Servidor de imágenes (VPS):** host, usuario, clave, directorio y URL pública.
   Se guardan en `/data/.config-store.json` (persisten entre redeploys).
3. Navega por el sidebar: Dashboard, Editor de videos y Ebooks cargan por iframe.
   Cada uno pedirá su Basic Auth la primera vez (usa las mismas credenciales para todos
   y el navegador las recuerda durante la sesión).

---

## Notas y solución de problemas

- **Redeploy automático:** conecta el repo para que cada `git push` a `main`
  redepliegue. Los datos persisten gracias a los volúmenes (`/data`, `/app/storage`).
- **El dashboard (Streamlit) no carga en el iframe:** añade a su `ENTRYPOINT`
  `--server.enableCORS=false --server.enableXsrfProtection=false` y redeploy.
- **Las keys del dashboard/extractor no se aplican:** recuerda que van como **env
  del servicio en EasyPanel**, no en /configuracion. Tras cambiarlas, redeploy del servicio.
- **Cambiar de puerto:** los servicios leen `PORT` de la env; si lo cambias, ajusta
  también el puerto del dominio en EasyPanel.
