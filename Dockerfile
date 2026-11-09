FROM node:24-bookworm-slim AS build

WORKDIR /app/backend

# Native dependencies such as argon2 may need a compiler.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend/tsconfig.json ./tsconfig.json
COPY backend/src ./src

RUN npm run build
RUN test -f dist/server.js && test -f dist/scripts/migrate.js
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime

WORKDIR /app/backend

ENV NODE_ENV=production

RUN apt-get update \
    && apt-get install -y --no-install-recommends libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/backend/package.json ./package.json
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist

# The migration runner resolves ../docs/migrations from /app/backend.
COPY docs/migrations/ /app/docs/migrations/

EXPOSE 4000

CMD ["node", "dist/server.js"]