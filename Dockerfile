# saas-msw Dockerfile（ADR-0012 B 强度 / M99.F03）
FROM node:20-alpine AS builder
WORKDIR /app

# npmmirror 镜像（CLAUDE.md 顶层约束）
RUN npm config set registry https://registry.npmmirror.com

COPY package*.json ./
RUN npm ci

COPY tsconfig.json orval.config.ts ./
COPY src ./src

RUN npm run gen:handlers

FROM node:20-alpine AS runner
WORKDIR /app

RUN npm config set registry https://registry.npmmirror.com

ENV NODE_ENV=production
ENV PORT=5174

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/src ./src

EXPOSE 5174

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5174/healthz || exit 1

CMD ["npx", "tsx", "src/server.ts"]
