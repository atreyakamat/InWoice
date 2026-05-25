FROM node:22-bookworm-slim AS frontend-build

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM ghcr.io/puppeteer/puppeteer:24.38.0 AS backend-build

WORKDIR /app/backend

USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm ci --omit=dev

COPY backend/ ./
RUN mkdir -p data/openwa-sessions uploads backups logs public
COPY --from=frontend-build /app/frontend/build ./public

EXPOSE 5000

CMD ["npm", "start"]
