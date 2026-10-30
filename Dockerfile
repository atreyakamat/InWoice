# One image: builds the React app and the API, then serves both from Node.
FROM node:22-alpine AS build
WORKDIR /app
# Prisma picks its engine by the OpenSSL it finds, so build and runtime need the same one.
RUN apk add --no-cache openssl
COPY backend/package*.json backend/
COPY frontend/package*.json frontend/
RUN npm --prefix backend ci && npm --prefix frontend ci
COPY backend backend
COPY frontend frontend
RUN npm --prefix frontend run build && npm --prefix backend run build && npm --prefix backend prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache openssl
# Prisma CLI (a dev dependency) baked into the image, so start-up never needs the
# internet: after a power cut the box may boot before the router is back.
RUN npm install -g prisma@5.22.0 && npm cache clean --force
COPY --from=build /app/backend/node_modules backend/node_modules
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/backend/prisma backend/prisma
COPY --from=build /app/backend/assets backend/assets
COPY --from=build /app/backend/package.json backend/package.json
COPY --from=build /app/frontend/dist frontend/dist
WORKDIR /app/backend
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD wget -qO- http://127.0.0.1:${PORT:-5000}/health >/dev/null || exit 1
# Apply pending migrations (e.g. the shop sync columns), then start.
CMD ["sh", "-c", "prisma migrate deploy && node dist/index.js"]
