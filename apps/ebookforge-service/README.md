# EbookForge

Un motor para generar ebooks bonitos (PDF + HTML autocontenido) a partir de
**contenido** + un **tema**. El motor es determinista y open-source: **no usa IA
para producir** los ebooks, así que correrlo cuesta prácticamente $0.

> La IA (un chat como este) solo se usa **una vez por diseño**, para crear un
> tema nuevo a partir de un ebook de referencia. Producir ebooks es 100% local.

```
contenido (JSON de bloques)  +  tema  →  HTML (fuentes e imágenes incrustadas)  →  PDF
```

## Estructura

```
ebookforge/
  cli.py                 # generar por línea de comandos
  app.py                 # servicio web (FastAPI) + UI mínima
  engine/                # el MOTOR (constante, no se toca)
    schema… render.py    # bloques + tema -> HTML -> PDF
    assets.py            # incrusta imágenes (redimensiona+base64) y fuentes
  themes/                # los TEMAS (la parte bonita, reutilizable)
    amigurumi/
      theme.py           # registra cómo se dibuja cada bloque
      theme.css          # tokens: paleta + fuentes
      components.py      # SVG (flores, pájaros, doodles…)
      fonts/             # .ttf subseteados
  content/
    ejemplo.json         # un documento de ejemplo
    imagenes/            # las fotos que referencia el JSON
  Dockerfile  requirements.txt
```

## Uso rápido (local, gratis)

```bash
pip install -r requirements.txt
# en Linux, WeasyPrint necesita: sudo apt install libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0
python cli.py content/ejemplo.json --html salida.html -o salida.pdf
```

## Como app web

```bash
uvicorn app:app --reload      # abre http://localhost:8000
```
Pegas el JSON, subes las imágenes, eliges el tema y descargas el PDF.

## Con Docker (para desplegar)

```bash
docker build -t ebookforge .
docker run -p 8000:8000 ebookforge
```
Despliega esa imagen en cualquier serverless con capa gratis (Google Cloud Run,
Render, Railway, Fly). Escalan a cero: pagas centavos solo cuando genera.

## El contenido: bloques

Un documento es `{"title","theme","blocks":[…]}`. Tipos de bloque disponibles:

| tipo        | campos principales                                  |
|-------------|-----------------------------------------------------|
| `cover`     | title, latch, subtitle, welcome[], tagline, brand   |
| `section`   | eyebrow, title                                      |
| `paragraph` | text                                                |
| `list`      | items[]                                             |
| `card`      | name, link, link_text, body                         |
| `image`     | src (nombre en content/imagenes/), caption          |
| `callout`   | tag, text, kind (note · sell · danger)              |
| `chips`     | items[]                                             |
| `divider`   | —                                                   |
| `closing`   | big, small, brand                                   |

Añadir un tipo nuevo = una función en `themes/<tema>/theme.py` (en `RENDERERS`).
Sirve para catálogos, recetarios, manuales, guías… el mismo motor para todo.

## Crear un tema nuevo

Un tema es una carpeta en `themes/` con `theme.py` + `theme.css` + `components.py`
(+ `fonts/`). Dos caminos:

1. **A mano:** copia `themes/amigurumi/`, cambia la paleta en `theme.css` y los
   SVG en `components.py`.
2. **Desde un ebook de referencia:** súbeme (en un chat) un PDF cuyo estilo te
   guste y te devuelvo la carpeta del tema lista para soltar aquí.

## Costos

- Motor y librerías: **$0** (WeasyPrint, Pillow, FastAPI, fuentes de Google).
- Hosting: **$0–5/mes** (serverless con capa gratis) o gratis en local.
- IA: **$0** si tú das el contenido; si quieres redacción automática, un modelo
  barato (nunca uno caro).
