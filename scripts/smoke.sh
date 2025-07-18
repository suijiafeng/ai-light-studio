#!/bin/bash
# ============================================
# 部署后冒烟测试 —— 30秒确认核心链路可用
# 用法: ./scripts/smoke.sh [base-url]     默认 http://localhost:3000
# 检查: 健康 → 风格列表 → 套餐 → 注册 → 登录 → 余额 → 前端页面
# 退出码: 0 全部通过 / 1 有失败
# ============================================
set -u
BASE="${1:-http://localhost:3000}"
PASS=0; FAIL=0
GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'

check() { # check <名称> <期望片段> <实际输出>
  if echo "$3" | grep -q "$2"; then
    echo -e "${GREEN}✔ $1${NC}"; PASS=$((PASS+1))
  else
    echo -e "${RED}✖ $1${NC}  期望包含: $2  实际: $(echo "$3" | head -c 120)"; FAIL=$((FAIL+1))
  fi
}

echo "冒烟测试目标: $BASE"

check "健康检查 /api/health"      '"status":"ok"'   "$(curl -sm 5 "$BASE/api/health")"
check "风格列表 /api/generate/styles" '"night_warm"' "$(curl -sm 5 "$BASE/api/generate/styles")"
check "套餐列表 /api/pay/packages"   '"packages"'    "$(curl -sm 5 "$BASE/api/pay/packages")"

# 注册临时账号（时间戳邮箱，不污染正式数据；失败不影响已有账号）
EMAIL="smoke-$(date +%s)@test.local"
REG=$(curl -sm 10 -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"smoke123456\",\"nickname\":\"smoke\"}")
check "注册 /api/auth/register" '"token"' "$REG"

TOKEN=$(echo "$REG" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
if [ -n "$TOKEN" ]; then
  check "登录态 /api/auth/me"        '"email"'   "$(curl -sm 5 "$BASE/api/auth/me" -H "Authorization: Bearer $TOKEN")"
  check "余额 /api/credits/balance"  '"credits"' "$(curl -sm 5 "$BASE/api/credits/balance" -H "Authorization: Bearer $TOKEN")"
else
  echo -e "${RED}✖ 未取得token，跳过登录态检查${NC}"; FAIL=$((FAIL+2))
fi

check "前端页面 /" '<div id="app">' "$(curl -sm 5 "$BASE/")"

echo "-----------------------------"
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}冒烟通过: $PASS 项全部OK${NC}"
else
  echo -e "${RED}冒烟失败: 通过$PASS / 失败$FAIL${NC}"
  exit 1
fi
