# Worker de notificaciones. El contexto de build es la RAÍZ del repo (necesita shared/):
#   docker build --platform linux/amd64 -f worker/Dockerfile -t <repositorio-ecr-worker>:latest .

# 1) Compilar TypeScript (shared + worker).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY api/package.json api/
COPY worker/package.json worker/
RUN npm ci --workspace @eventos/shared --workspace @eventos/worker --include-workspace-root
COPY shared/ shared/
COPY worker/ worker/
RUN npm run build -w shared && npm run build -w worker

# 2) Solo dependencias de producción.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY api/package.json api/
COPY worker/package.json worker/
RUN npm ci --omit=dev --workspace @eventos/shared --workspace @eventos/worker

# 3) Imagen final: sin puerto ni health check HTTP (el contrato lo pide así para el worker).
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/shared/package.json ./shared/
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/worker/package.json ./worker/
COPY --from=build /app/worker/dist ./worker/dist
USER node
WORKDIR /app/worker
CMD ["node", "--enable-source-maps", "dist/main.js"]
