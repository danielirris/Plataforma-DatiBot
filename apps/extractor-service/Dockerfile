# clip-generator (Editor de videos) — FFmpeg (libass) + Node + Remotion.
#
# Se construye desde la RAÍZ del monorepo (contexto = repo root), igual que web
# y ebooks, para poder desplegarlo desde Plataforma-DatiBot en EasyPanel.
# En EasyPanel: Build context = "/", Dockerfile = "apps/extractor-service/Dockerfile".
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

# FFmpeg (extracción + render + libass para subtítulos), fuentes, Node.js y las
# librerías de sistema que necesita el Chrome headless de Remotion en Linux.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg fonts-dejavu-core fonts-noto-color-emoji curl ca-certificates gnupg \
        libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libgbm1 libasound2 \
        libxrandr2 libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 libxext6 \
        libxshmfence1 libpango-1.0-0 libcairo2 libcups2 \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencias de Python primero (mejor cacheo de capas).
COPY apps/extractor-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Runtime de Remotion: instala deps y hornea el navegador headless en la imagen.
COPY apps/extractor-service/remotion-runtime/ ./remotion-runtime/
RUN cd remotion-runtime \
    && npm install --no-audit --no-fund \
    && node ensure-browser.mjs

# Código de la aplicación.
COPY apps/extractor-service/app/ ./app/
COPY apps/extractor-service/web/ ./web/
COPY apps/extractor-service/remotion/ ./remotion/

# Carpeta de almacenamiento (volumen persistente en EasyPanel).
RUN mkdir -p /app/storage

EXPOSE 8000

# Healthcheck tolerante: durante un render pesado el contenedor sigue vivo.
HEALTHCHECK --interval=30s --timeout=15s --start-period=60s --retries=5 \
    CMD python -c "import urllib.request,os,sys; sys.exit(0) if urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8000')+'/healthz', timeout=12).status==200 else sys.exit(1)"

# Arranque: lee el puerto de la env PORT.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
