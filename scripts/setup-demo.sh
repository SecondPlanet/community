#!/usr/bin/env bash
# ============================================
# setup-demo.sh — 一键本地 demo 部署入口 (2026-08-04)
#
# 新同事 clone repo 下来后, 跑这一条命令就完事了:
#   bash scripts/setup-demo.sh
#
# 自动完成:
#   1. 准备 .env (从 .env.example 复制, 自动生成 JWT_SECRET)
#   2. docker compose up -d mysql redis minio
#   3. 等三件套 health check 通过
#   4. pnpm install (根 + 所有 workspace)
#   5. pnpm db:generate (Prisma Client)
#   6. pnpm db:migrate (应用所有迁移)
#   7. pnpm db:seed:demo (6 步 demo 数据: 用户/CMS/讲师/学员/订单...)
#   8. 打印登录账号 + 关键 URL
#
# 跑完即可: pnpm dev  (API :8080 + Web :5500)
# 详细 demo 数据说明见 README §7
# ============================================

set -e

# -------- 颜色输出 (no TTY 时不染色) --------
if [ -t 1 ]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
  BLUE='\033[0;34m'; BOLD='\033[1m'; RESET='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; BLUE=''; BOLD=''; RESET=''
fi

step() { echo -e "\n${BLUE}${BOLD}▶ $1${RESET}"; }
ok()   { echo -e "${GREEN}✅ $1${RESET}"; }
warn() { echo -e "${YELLOW}⚠️  $1${RESET}"; }
die()  { echo -e "${RED}❌ $1${RESET}"; exit 1; }

# -------- 0. 路径检查 --------
step "0/8 检查工作目录"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"
[ -f "package.json" ] || die "未找到 package.json, 请在 enterprise 根目录跑这个脚本"
ok "在 $ROOT_DIR"

# -------- 1. 前置依赖检查 --------
step "1/8 检查前置依赖"
command -v node   >/dev/null 2>&1 || die "缺 node, 装 Node.js 20+"
command -v pnpm   >/dev/null 2>&1 || die "缺 pnpm, 跑: corepack enable && corepack prepare pnpm@latest --activate"
command -v docker >/dev/null 2>&1 || die "缺 docker, 装 Docker Desktop"
command -v openssl >/dev/null 2>&1 || die "缺 openssl (用于生成 JWT_SECRET)"
ok "node / pnpm / docker / openssl 都齐"

# 检查 docker daemon
if ! docker info >/dev/null 2>&1; then
  die "docker daemon 没起, 启 Docker Desktop 后再试"
fi
ok "docker daemon 在跑"

# -------- 2. .env 准备 --------
step "2/8 准备 .env"
if [ ! -f ".env" ]; then
  cp .env.example .env
  ok "已从 .env.example 复制 .env"
else
  ok ".env 已存在, 跳过"
fi

# 检查 JWT_SECRET
if ! grep -qE '^JWT_SECRET="[A-Za-z0-9]{32,}"' .env; then
  NEW_SECRET="$(openssl rand -hex 32)"
  # 替换或追加
  if grep -qE '^JWT_SECRET=' .env; then
    # macOS 和 Linux 兼容的 in-place 替换
    if [ "$(uname)" = "Darwin" ]; then
      sed -i '' "s|^JWT_SECRET=.*|JWT_SECRET=\"$NEW_SECRET\"|" .env
    else
      sed -i "s|^JWT_SECRET=.*|JWT_SECRET=\"$NEW_SECRET\"|" .env
    fi
    ok "已替换占位符 JWT_SECRET"
  else
    echo "JWT_SECRET=\"$NEW_SECRET\"" >> .env
    ok "已追加 JWT_SECRET"
  fi
else
  ok "JWT_SECRET 已是 ≥32 字符有效值, 跳过"
fi

# -------- 3. Docker 基础设施 --------
step "3/8 启动 Docker 基础设施 (mysql / redis / minio)"
docker compose up -d mysql redis minio
ok "docker compose up -d 完成"

# -------- 4. 等三件套 health --------
step "4/8 等 mysql / redis / minio health check 通过"
echo "  (第一次会拉镜像, 稍等...)"
for i in {1..60}; do
  MYSQL_OK=$(docker inspect --format='{{.State.Health.Status}}' secondplanet-mysql 2>/dev/null || echo "starting")
  REDIS_OK=$(docker inspect --format='{{.State.Health.Status}}' secondplanet-redis 2>/dev/null || echo "starting")
  MINIO_OK=$(docker inspect --format='{{.State.Health.Status}}' secondplanet-minio 2>/dev/null || echo "starting")
  if [ "$MYSQL_OK" = "healthy" ] && [ "$REDIS_OK" = "healthy" ] && [ "$MINIO_OK" = "healthy" ]; then
    ok "mysql / redis / minio 都 healthy"
    break
  fi
  if [ "$i" = "60" ]; then
    warn "60s 内没全 healthy — 当前状态: mysql=$MYSQL_OK redis=$REDIS_OK minio=$MINIO_OK"
    warn "通常 mysql 第一次初始化要 30-60s, 重跑这个脚本即可 (基础设施已起, 后面的步骤会跳过 healthy check 重试)"
    # 不 exit — 让 prisma migrate 自己去重试
    break
  fi
  printf "."
  sleep 2
done

# -------- 5. pnpm install --------
step "5/8 pnpm install"
if [ -d "node_modules" ] && [ -d "apps/api/node_modules" ] && [ -d "apps/web/node_modules" ]; then
  ok "node_modules 已存在, 跳过 (如要重装, rm -rf node_modules apps/*/node_modules)"
else
  pnpm install
  ok "pnpm install 完成"
fi

# -------- 6. Prisma generate + migrate --------
step "6/8 Prisma generate + migrate"
pnpm db:generate
ok "prisma generate 完成"
pnpm db:migrate
ok "migrate 完成"

# -------- 7. Demo 数据灌入 --------
step "7/8 灌入 demo 数据 (6 步)"
warn "这一步会跑 6 个 seed 脚本, 全部 idempotent, 大约 10s"
pnpm --filter @secondplanet/api db:seed:demo
ok "demo 数据灌入完成"

# -------- 8. 收尾输出 --------
step "8/8 全部完成 🎉"
echo ""
echo -e "${BOLD}登录账号:${RESET}"
echo "  (种子脚本使用的演示账号见上一步 seed 输出; 生产环境用 .env 里的 ADMIN_EMAIL)"
echo ""
echo -e "${BOLD}启动 dev server:${RESET}"
echo "  pnpm dev                # API :8080 + Web :5500"
echo ""
echo -e "${BOLD}关键 URL (跑 pnpm dev 之后):${RESET}"
echo "  公共讲师墙        : http://localhost:5500/instructors"
echo "  Admin 讲师管理    : http://localhost:5500/admin/instructors"
echo "  API 根            : http://localhost:8080/api/v1"
echo "  Swagger API 文档  : http://localhost:8080/api/docs"
echo "  Health check      : http://localhost:8080/api/v1/health/ready"
echo ""
echo -e "${BOLD}demo 数据状态:${RESET}"
echo "  users: 13 (2 admin + 1 student + 10 extra)   courses: 6   degrees: 2   hackathons: 6"
echo "  instructors: 16 (15 published + 1 draft)      expertises: 14"
echo "  enrollments: 22   practice completions: 6   paid orders: 2   badges: 8"
echo ""
echo -e "${BOLD}下一步:${RESET}"
echo "  pnpm dev    # 起前后端"
echo "  浏览器打开 http://localhost:5500 用演示账号登录开始体验"
echo ""
