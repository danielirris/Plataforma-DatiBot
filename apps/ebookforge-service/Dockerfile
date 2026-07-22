# EbookForge (FastAPI + WeasyPrint).
#
# Se construye desde la RAÍZ del monorepo (contexto = repo root), igual que la web,
# porque EasyPanel usa la raíz del repo como contexto de build.
# En EasyPanel: Build context = "/", Dockerfile = "apps/ebookforge-service/Dockerfile".

FROM python:3.12-slim

# WeasyPrint necesita estas librerías del sistema (Pango/Cairo/GDK)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0 \
    libffi-dev shared-mime-info fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

ENV PORT=8600

WORKDIR /app
COPY apps/ebookforge-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/ebookforge-service/ .

EXPOSE 8600
# Sonda de vida: si el servicio se atasca (WeasyPrint colgado, event loop
# bloqueado), /healthz deja de responder y EasyPanel reinicia el contenedor en
# vez de dejarlo devolviendo 5xx para siempre. Usa python (no hay curl en la
# imagen). start-period holgado para el arranque de uvicorn.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8600')+'/healthz',timeout=5)"
# Lee el puerto de la env PORT (EasyPanel lo inyecta); default 8600.
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8600}"]
