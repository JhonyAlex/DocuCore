FROM node:22-bookworm-slim AS base

WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build

# Identidad del release inyectada en tiempo de build (el contexto Docker no
# incluye `.git`, por lo que el SHA debe llegar como argumento).
ARG GIT_SHA=unknown
ARG APP_VERSION=0.0.0
ENV GIT_SHA=${GIT_SHA} APP_VERSION=${APP_VERSION}

COPY . .
RUN pnpm prisma generate && pnpm build && node scripts/write-version.mjs

FROM base AS runtime

ENV NODE_ENV=production
ENV PORT=3001

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY prisma ./prisma
RUN pnpm prisma generate
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
COPY public ./public

EXPOSE 3001

CMD ["sh", "-c", "pnpm db:deploy && pnpm db:bootstrap-admin && exec pnpm start"]
