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
- **Recursos:** este es el pesado (Chromium de Remotion). Dale ≥ 2 GB RAM.
- **Env:**
  ```
  OPENAI_API_KEY=...        (obligatorio: transcripción + análisis)
  ELEVENLABS_API_KEY=...    (opcional, solo voz)
  WHATSAPP_LINK=...         (CTA)
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
  ```

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
