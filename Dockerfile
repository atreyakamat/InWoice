# One image: builds the React app and the API, then serves both from Node.
FROM node:22-alpine AS build
WORKDIR /app
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
COPY --from=build /app/backend/node_modules backend/node_modules
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/backend/prisma backend/prisma
COPY --from=build /app/backend/package.json backend/package.json
COPY --from=build /app/frontend/dist frontend/dist
WORKDIR /app/backend
EXPOSE 5000
# Apply pending migrations, then start. Prisma CLI is a dev dependency, so use npx with a pinned version.
CMD ["sh", "-c", "npx --yes prisma@5.22.0 migrate deploy && node dist/index.js"]
