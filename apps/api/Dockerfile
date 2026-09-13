# Build eseguita con contesto = radice del repo (vedi infra/docker-compose.yml)
# perché l'Hub API vive in un monorepo npm workspaces.

FROM node:22-alpine AS builder
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/api ./apps/api
COPY apps/web/package.json ./apps/web/package.json

RUN npm ci
RUN npm run build -w apps/api

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /repo/apps/api/package.json ./package.json
COPY --from=builder /repo/apps/api/dist ./dist
COPY --from=builder /repo/node_modules ./node_modules

EXPOSE 4000
CMD ["node", "dist/index.js"]
