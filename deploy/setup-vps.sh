#!/bin/sh
# setup-vps.sh — VPS 一次性 bootstrap（Ubuntu/Debian）— saas-identity-platform-msw
#
# 用法:
#   sudo sh deploy/setup-vps.sh saas-msw.example.com
#
# 同一台 VPS 上家族其它 saas 仓（nextjs/react/vue/aspnetcore/springboot）已跑过
# 各自的 setup-vps.sh 时：deploy 用户 / docker 组 / nginx / cert 全部就绪，
# 本脚本只剩建目录 + 渲染 vhost 两件事（幂等，重复跑无害）。
#
# 本脚本不写任何 env key —— msw.env 的唯一生产者是 deploy/saas-identity-platform-msw.sh
# （suite L0.5 check_deploy_parity 的比对对象；本脚本无 KEY= 输出，不参与比对）。
#
# 你**还要做**的（不在脚本里）:
#   a) Cloudflare DNS 加 saas-msw A/CNAME 记录 → VPS（家族其它子域同 IP）
#   b) msw repo 的 GitHub Repository Secrets 加:
#        DOCKER_USERNAME / DOCKER_PASSWORD / VPS_HOST / VPS_USER / VPS_SSH_KEY /
#        DATABASE_URL（msw.env 自举源；runtime 不消费 DB，但家族 env 契约要求 key 在）

set -eu

DOMAIN="${1:-saas-msw.xiangru.uk}"
BASE="/home/deploy/saas-identity-platform-msw"

log() { printf '→ %s\n' "$*"; }

# ── 1. 系统包（家族 VPS 已就绪则跳过） ─────────────
if ! command -v nginx >/dev/null 2>&1; then
  log "install nginx"
  apt-get update && apt-get install -y nginx
fi
if ! command -v docker >/dev/null 2>&1; then
  log "install docker"
  apt-get update && apt-get install -y docker.io
  systemctl enable --now docker
fi

# ── 2. deploy 用户 + docker 组（已存在则跳过） ─────
if ! id deploy >/dev/null 2>&1; then
  log "create deploy user (key-only)"
  useradd -m -s /bin/bash deploy
  passwd -l deploy
fi
if ! id -nG deploy | grep -qw docker; then
  log "add deploy to docker group"
  usermod -aG docker deploy
fi

# ── 3. 目录 ────────────────────────────────────────
log "create $BASE"
mkdir -p "$BASE"
chown deploy:deploy "$BASE" 2>/dev/null || true

# ── 4. vhost 渲染 + 启用（cert 复用家族 xiangru-uk） ──────────────
# deploy/saas-identity-platform-msw.sh 每次 deploy 也会重渲染；这里提前装好
# 是为了让「DNS 先通、镜像后发」的窗口期内 nginx 返回明确的上游错误而非 404。
if [ -f deploy/nginx-vps.conf.example ]; then
  log "render nginx vhost for $DOMAIN"
  sed \
    -e "s|/etc/nginx/ssl/your-cert\.cert|/etc/nginx/ssl/xiangru-uk.cert|g" \
    -e "s|/etc/nginx/ssl/your-cert\.key|/etc/nginx/ssl/xiangru-uk.key|g" \
    -e "s|saas-msw\.xiangru\.uk|$DOMAIN|g" \
    deploy/nginx-vps.conf.example > "/etc/nginx/sites-available/$DOMAIN"
  ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
  nginx -t
  systemctl reload nginx
  log "nginx vhost installed"
fi

log "done. 下一步: CI tag 部署（需 GitHub Secrets 含 DATABASE_URL/DOCKER_*/VPS_*）"
