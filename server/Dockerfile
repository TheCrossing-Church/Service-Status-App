## Build stage — compile TypeScript with full devDeps available.
##
## better-sqlite3 publishes prebuilt binaries for common platforms, but they
## still want python3 + a C toolchain available for the postinstall script
## fallback. Cheap to add to the build stage; the runtime image stays slim.
FROM node:20-alpine AS build
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

## Runtime stage — production deps only, non-root user, slim image.
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Same toolchain — better-sqlite3 may rebuild on first install.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY migrations ./migrations

# Pre-create /data so the non-root user can write the SQLite file when the
# volume mounts on top of it.
RUN mkdir -p /data && chown -R node:node /data

USER node
EXPOSE 3000
CMD ["node", "dist/src/index.js"]
