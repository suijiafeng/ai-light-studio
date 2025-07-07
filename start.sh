#!/bin/bash
# ============================================
# 代码工匠AI灯光设计 · 一键安装+启动
# 用法: ./start.sh        （首次自动安装依赖）
# 停止: 按 Ctrl+C 自动同时停止前后端
# ============================================
set -e
cd "$(dirname "$0")"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

# 1. 检查 Node.js
if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}✖ 未检测到 Node.js，请先安装（建议18及以上）: https://nodejs.org/${NC}"
  exit 1
fi
NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo -e "${RED}✖ Node.js 版本过低（当前 $(node -v)），请升级到 18 及以上${NC}"
  exit 1
fi
echo -e "${GREEN}✔ Node.js $(node -v)${NC}"

# 2. 首次自动生成 .env
if [ ! -f server/.env ]; then
  cp server/.env.example server/.env
  echo -e "${GREEN}✔ 已生成 server/.env（默认mock模式，无需密钥）${NC}"
fi

# 3. 自动安装依赖（仅首次或依赖缺失时）
if [ ! -d server/node_modules ]; then
  echo -e "${YELLOW}▸ 正在安装后端依赖…${NC}"
  (cd server && npm install --no-audit --no-fund)
fi
if [ ! -d web/node_modules ]; then
  echo -e "${YELLOW}▸ 正在安装前端依赖…${NC}"
  (cd web && npm install --no-audit --no-fund)
fi
echo -e "${GREEN}✔ 依赖就绪${NC}"

# 4. 启动前后端，Ctrl+C 一键全停
cleanup() { echo -e "\n${YELLOW}▸ 正在停止服务…${NC}"; kill $SERVER_PID $WEB_PID 2>/dev/null; exit 0; }
trap cleanup INT TERM

echo -e "${YELLOW}▸ 启动后端 (http://localhost:3000)…${NC}"
(cd server && node src/index.js) &
SERVER_PID=$!

echo -e "${YELLOW}▸ 启动前端 (http://localhost:5173)…${NC}"
(cd web && npx vite --port 5173) &
WEB_PID=$!

sleep 3
if curl -s http://localhost:3000/api/health >/dev/null 2>&1; then
  echo -e "${GREEN}"
  echo "=============================================="
  echo "  ✔ 启动成功！浏览器打开: http://localhost:5173"
  echo "  按 Ctrl+C 停止全部服务"
  echo "=============================================="
  echo -e "${NC}"
  command -v open >/dev/null 2>&1 && open http://localhost:5173
else
  echo -e "${RED}✖ 后端启动异常，请查看上方报错信息${NC}"
fi

wait
