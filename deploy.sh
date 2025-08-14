#!/bin/bash
# ============================================
# 代码工匠 · AI灯光设计 — 多环境一键部署
#
# 用法:
#   ./deploy.sh production            # 部署生产   :3000
#   ./deploy.sh staging               # 部署测试   :3001
#   ./deploy.sh demo --seed           # 部署演示   :3002 并写入演示账号
#   ./deploy.sh <env> --smoke         # 部署后跑冒烟验证
#   ./deploy.sh <env> status|logs|down|seed|smoke   # 环境管理子命令
#
# 三个环境使用独立的 compose project 与数据卷，同一台机器可并行运行。
# 配置文件: deploy/env/<env>.env（首次运行自动从 .example 复制，生产需手工确认）
# ============================================
set -e
cd "$(dirname "$0")"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${YELLOW}▸ $*${NC}"; }
ok()    { echo -e "${GREEN}✔ $*${NC}"; }
die()   { echo -e "${RED}✖ $*${NC}"; exit 1; }

ENV_NAME="$1"; shift || true
case "$ENV_NAME" in
  production|staging|demo) ;;
  *) die "用法: ./deploy.sh <production|staging|demo> [--seed] [--smoke] [status|logs|down|seed|smoke]" ;;
esac

command -v docker >/dev/null 2>&1 || die "未安装 Docker: https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || die "Docker Compose V2 不可用（docker compose）"

ENV_FILE="deploy/env/${ENV_NAME}.env"
PROJECT="ai-light-${ENV_NAME}"

# ---------- 配置文件准备 ----------
if [ ! -f "$ENV_FILE" ]; then
  cp "${ENV_FILE}.example" "$ENV_FILE"
  if [ "$ENV_NAME" = "production" ]; then
    die "已生成 $ENV_FILE ，生产环境请先编辑其中的 JWT_SECRET / 支付 / AI 配置后重新执行"
  fi
  ok "已从模板生成 $ENV_FILE（${ENV_NAME}环境默认mock配置，可直接使用）"
fi
# 生产环境安全检查：JWT_SECRET 不能是模板占位/过短，支付与AI不能停在mock（否则用户可零成本
# 自证"已支付"领算力，或压根生成不出真实效果图）
if [ "$ENV_NAME" = "production" ]; then
  if grep -q '__请改为随机长字符串__' "$ENV_FILE"; then
    die "生产环境 $ENV_FILE 中 JWT_SECRET 仍是模板占位符，请先修改（openssl rand -hex 32）"
  fi
  JWT_SECRET_VAL=$(grep -E '^JWT_SECRET=' "$ENV_FILE" | tail -1 | cut -d= -f2-)
  [ "${#JWT_SECRET_VAL}" -ge 32 ] || die "生产环境 JWT_SECRET 长度不足32位，请用 openssl rand -hex 32 生成"
  PAY_PROVIDER_VAL=$(grep -E '^PAY_PROVIDER=' "$ENV_FILE" | tail -1 | cut -d= -f2-)
  [ "$PAY_PROVIDER_VAL" != "mock" ] || die "生产环境 PAY_PROVIDER 仍是 mock，任何登录用户都能免费给自己发算力！请改为 wechat 并填好商户信息"
  AI_PROVIDER_VAL=$(grep -E '^AI_PROVIDER=' "$ENV_FILE" | tail -1 | cut -d= -f2-)
  [ "$AI_PROVIDER_VAL" != "mock" ] || die "生产环境 AI_PROVIDER 仍是 mock，用户生成不出真实效果图，请改为 replicate/fal 并填好密钥"
fi

APP_PORT=$(grep -E '^APP_PORT=' "$ENV_FILE" | tail -1 | cut -d= -f2)
[ -n "$APP_PORT" ] || die "$ENV_FILE 缺少 APP_PORT"
export APP_PORT APP_ENV_FILE="$ENV_FILE"
export IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo latest)}"

dc() { docker compose -p "$PROJECT" "$@"; }

# ---------- 子命令 ----------
SUB="${1:-up}"
case "$SUB" in
  status) dc ps; exit 0 ;;
  logs)   dc logs -f --tail=100; exit 0 ;;
  down)   dc down; ok "$ENV_NAME 已停止（数据卷保留，彻底清除加 -v: docker compose -p $PROJECT down -v）"; exit 0 ;;
  seed)   dc exec app node scripts/seed.js; exit 0 ;;
  smoke)  ./scripts/smoke.sh "http://localhost:${APP_PORT}"; exit 0 ;;
esac

# ---------- 部署 ----------
info "部署 ${ENV_NAME} 环境（project=$PROJECT, port=$APP_PORT, image=ai-light-studio:$IMAGE_TAG）"
dc up -d --build

info "等待服务就绪…"
for i in $(seq 1 30); do
  if curl -sf "http://localhost:${APP_PORT}/api/health" >/dev/null 2>&1; then
    ok "服务已就绪: http://localhost:${APP_PORT}"
    break
  fi
  [ "$i" = 30 ] && { dc logs --tail=30; die "服务 30 秒内未就绪，日志见上方"; }
  sleep 1
done

# ---------- 可选步骤 ----------
for arg in "$@"; do
  case "$arg" in
    --seed)
      info "写入演示种子数据…"
      dc exec app node scripts/seed.js
      ;;
    --smoke)
      info "执行冒烟验证…"
      ./scripts/smoke.sh "http://localhost:${APP_PORT}"
      ;;
  esac
done

echo
ok "部署完成 · ${ENV_NAME} · http://localhost:${APP_PORT}"
echo "  常用: ./deploy.sh $ENV_NAME logs | status | down | seed | smoke"
