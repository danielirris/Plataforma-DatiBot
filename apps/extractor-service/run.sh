#!/bin/bash
# Lanzador del servicio Extractor dentro del monorepo.
# Pone el FFmpeg compilado (bin/) al frente del PATH y arranca uvicorn.
# El puerto se toma de la env PORT (la genera Configuración); default 8000.
set -e
cd "$(dirname "$0")"

export PATH="$PWD/bin:$PATH"

# Cargar PORT desde el .env generado, si existe.
PORT="${PORT:-8000}"
if [ -f .env ]; then
  _p="$(grep -E '^PORT=' .env | tail -1 | cut -d= -f2)"
  [ -n "$_p" ] && PORT="$_p"
fi

exec ./.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
