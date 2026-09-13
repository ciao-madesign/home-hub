# Build eseguita con contesto = radice del repo (vedi infra/docker-compose.yml).

FROM node:22-alpine AS builder
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/web ./apps/web
COPY apps/api/package.json ./apps/api/package.json

RUN npm ci
RUN npm run build -w apps/web

FROM nginx:alpine AS runtime
COPY --from=builder /repo/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
