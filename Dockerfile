# ============================================
# 代码工匠 · AI灯光设计 — 生产镜像（多阶段构建）
# 构建:  docker build -t ai-light-studio .
# 运行:  docker run -d -p 3000:3000 -v ai-light-data:/app/server/data --env-file server/.env ai-light-studio
# 推荐直接使用 docker compose up -d（见 docker-compose.yml）
# ============================================

# ---------- 阶段1: 构建前端 ----------
FROM node:22-alpine AS web-builder
WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---------- 阶段2: 安装后端生产依赖 ----------
# better-sqlite3 为原生模块，需要编译工具链；编译失败也不影响——
# 运行时会自动降级为 Node 内置 node:sqlite（Node >= 22.13）
FROM node:22-alpine AS server-deps
RUN apk add --no-cache python3 make g++
WORKDIR /build/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---------- 阶段3: 运行时 ----------
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY --from=server-deps /build/server/node_modules ./server/node_modules
COPY server/package.json ./server/
COPY server/src ./server/src
# 后端按 ../../web/dist 相对路径托管前端产物，目录结构需与仓库一致
COPY --from=web-builder /build/web/dist ./web/dist

# 数据目录（SQLite + 上传图 + 结果图），运行时挂载卷持久化
RUN mkdir -p /app/server/data \
  && addgroup -S app && adduser -S app -G app \
  && chown -R app:app /app
USER app

WORKDIR /app/server
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "src/index.js"]
