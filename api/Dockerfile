# API de Campus Eventos. El contexto de build es la RAÍZ del repo (necesita shared/):
#   docker build --platform linux/amd64 -f api/Dockerfile -t <repositorio-ecr-api>:latest .

# 1) Compilar TypeScript (shared + api).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY api/package.json api/
COPY worker/package.json worker/
RUN npm ci --workspace @eventos/shared --workspace @eventos/api --include-workspace-root
COPY shared/ shared/
COPY api/ api/
RUN npm run build -w shared && npm run build -w api

# 2) Solo dependencias de producción.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY api/package.json api/
COPY worker/package.json worker/
RUN npm ci --omit=dev --workspace @eventos/shared --workspace @eventos/api

# 3) Imagen final: sin compilador ni dependencias de desarrollo, con usuario sin privilegios.
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/shared/package.json ./shared/
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/api/package.json ./api/
COPY --from=build /app/api/dist ./api/dist
USER node
WORKDIR /app/api
EXPOSE 3000
# node directo (no npm) para que el SIGTERM de ECS llegue al proceso y cierre ordenadamente.
CMD ["node", "--enable-source-maps", "dist/main.js"]
