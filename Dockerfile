FROM node:22-bookworm-slim AS base

WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build

COPY . .
RUN pnpm prisma generate && pnpm build

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

CMD ["sh", "-c", "pnpm db:deploy && exec pnpm start"]
