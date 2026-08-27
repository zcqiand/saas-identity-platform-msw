# saas-msw Dockerfile（ADR-0012 B 强度 / M99.F03）
# handler 产物（src/handlers.msw.*.ts）由本地 `npm run gen:handlers` 生成并 committed；
# orval input 指向 ../saas-identity-platform-shared/...（Docker context 外），容器内不能 regen。
FROM node:20-alpine
WORKDIR /app

# npmmirror 镜像（CLAUDE.md 顶层约束）
RUN npm config set registry https://registry.npmmirror.com

ENV NODE_ENV=production
ENV PORT=5174

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY tsconfig.json ./
COPY src ./src

EXPOSE 5174

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5174/healthz || exit 1

CMD ["npx", "tsx", "src/server.ts"]
