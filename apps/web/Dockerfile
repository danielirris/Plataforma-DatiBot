# Shell Next.js (build autocontenido "standalone").
#
# IMPORTANTE: este Dockerfile se construye desde la RAÍZ del monorepo, no desde
# apps/web (necesita pnpm-workspace.yaml y los paquetes @plataforma/*).
# En EasyPanel: Build context = "/", Dockerfile path = "apps/web/Dockerfile".

# ── Etapa de build ─────────────────────────────────────────────
FROM node:20-slim AS builder
RUN corepack enable
WORKDIR /repo

# Copiamos todo el monorepo (el .dockerignore de la raíz excluye node_modules,
# .next, .venv, secretos, etc.).
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter web build

# ── Etapa de runtime ───────────────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Salida standalone: server.js + node_modules trazados + paquetes del workspace.
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public

EXPOSE 3000

# El server standalone del monorepo queda en apps/web/server.js.
CMD ["node", "apps/web/server.js"]
