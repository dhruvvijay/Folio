FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=folio_build_ca \
    if [ -s /run/secrets/folio_build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/folio_build_ca; fi; \
    npm ci --omit=dev --no-audit --no-fund
COPY client ./client
COPY scripts/build-worker.mjs ./scripts/build-worker.mjs
COPY worker ./worker
RUN npm run build:portable

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 FOLIO_SQLITE_PATH=/data/folio.sqlite
RUN install -d -m 0700 -o node -g node /data
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist/server ./dist/server
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node portable ./portable
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "portable/server.mjs"]
