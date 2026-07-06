#!/bin/bash
# Lanzador del servicio EbookForge dentro del monorepo.
# Arranca uvicorn con la app FastAPI (app:app). El puerto se toma de la env
# PORT (la genera Configuración en .env); default 8600.
set -e
cd "$(dirname "$0")"

# macOS (Homebrew): WeasyPrint carga Pango/Cairo/GDK por ctypes y no encuentra
# los dylibs de /opt/homebrew sin esto. En Linux/Docker la variable se ignora.
export DYLD_FALLBACK_LIBRARY_PATH="/opt/homebrew/lib:${DYLD_FALLBACK_LIBRARY_PATH}"

# Cargar PORT desde el .env generado, si existe.
PORT="${PORT:-8600}"
if [ -f .env ]; then
  _p="$(grep -E '^PORT=' .env | tail -1 | cut -d= -f2)"
  [ -n "$_p" ] && PORT="$_p"
fi

# Ejecutamos python -m uvicorn (no el script ./.venv/bin/uvicorn) para que el
# proceso final sea python directo: el salto por el shebang del wrapper hace que
# macOS elimine DYLD_* y WeasyPrint no encuentre Pango/Cairo.
exec ./.venv/bin/python -m uvicorn app:app --host 0.0.0.0 --port "${PORT:-8600}"
