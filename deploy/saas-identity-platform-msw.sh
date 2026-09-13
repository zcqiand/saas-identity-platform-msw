#!/bin/sh
# Usage: saas-identity-platform-msw.sh <DOCKER_USERNAME> <DOCKER_PASSWORD> [VERSION]
#
# 由 .github/workflows/ci.yml 的 deploy job 远程调用:
#   ssh deploy@vps -- cd /home/deploy/saas-identity-platform-msw
#                    && sh saas-identity-platform-msw.sh $DOCKER_USERNAME $DOCKER_PASSWORD $VERSION
#
# VERSION 默认是 latest。tag-based deploy 时显式传 tag 名(v0.4.x-YYYYMMDD)。
# CI 同时 push :latest + :<tag> 两份镜像,回滚只要手动指定旧 tag 再跑一次本脚本。
#
# 与姊妹仓 saas-identity-platform-nextjs.sh 的差异:
#   - msw 是内存 mock 后端（ADR-0012 不持久化），但家族 env 契约含 PG 五件套
#     （家族 synced keys / L0.5 parity 锁 key 集合），env-file 照写、runtime 不消费
#   - 容器内 tsx 起Express :5100；host=container=5100（ADR-0018 单层 port 方案，
#     docker run -p 127.0.0.1:5100:5100；saas 家族 X00 段 = msw 槽位）
#   - 密钥走 ./msw.env(DATABASE_URL + JWT_SIGNING_KEY),CI 由 secret DATABASE_URL
#     自举,只存在于 VPS
#   - 健康检查端点 /healthz（server.ts 显式 mode 标识,防止被当 staging）
#
# 前置:deploy 用户需在 docker 组中(sudo usermod -aG docker deploy)。

set -eu

USERNAME="${1:-}"
PASSWORD="${2:-}"
VERSION="${3:-latest}"
IMAGE="${USERNAME}/saas-identity-platform-msw:${VERSION}"
BASE="/home/deploy/saas-identity-platform-msw"
CONTAINER_NAME="saas-identity-platform-msw"

NGINX_DOMAIN="${NGINX_DOMAIN:-saas-msw.xiangru.uk}"
NGINX_CERT_BASENAME="${NGINX_CERT_BASENAME:-xiangru-uk}"

if [ -z "$USERNAME" ] || [ -z "$PASSWORD" ]; then
  echo "Usage: $0 <DOCKER_USERNAME> <DOCKER_PASSWORD> [VERSION]" >&2
  exit 2
fi

# msw.env 自举保护:缺失时,如 $DATABASE_URL 在环境里,自动生成(密钥随机);
# 否则 fail fast(避免凭空写默认 URL 触发对 saas_dev 的生产事故)。
# key 集合 = .env.example 全集（suite L0.5 check_deploy_parity 锁死）。
if [ ! -f "$BASE/msw.env" ]; then
  if [ -n "${DATABASE_URL:-}" ]; then
    echo "→ bootstrapping $BASE/msw.env from env DATABASE_URL (key 集合 = .env.example)"
    umask 077
    SECRET="$(openssl rand -hex 32)"
    {
      printf 'DATABASE_URL=%s\n' "$DATABASE_URL"
      printf 'DATABASE_NAME=saas_dev\n'
      printf 'DATABASE_USER=postgres\n'
      printf 'DATABASE_PASSWORD=changeme\n'
      printf 'JWT_SIGNING_KEY=%s\n' "$SECRET"
      printf 'JWT_ISSUER=saas-identity-platform\n'
      printf 'JWT_AUDIENCE=saas-identity-platform-clients\n'
      printf 'JWT_TTL_SECONDS=3600\n'
      printf 'SERVER_PORT=5100\n'
      printf 'PG_HOST=100.79.128.25\n'
      printf 'PG_PORT=5432\n'
      printf 'PG_USER=postgres\n'
      printf 'PG_PASSWORD=changeme\n'
      printf 'PG_DATABASE=saas_dev\n'
      printf 'SAAS_CORS_ALLOWED_ORIGINS=https://saas-nextjs.xiangru.uk,https://saas-react.xiangru.uk,https://saas-vue.xiangru.uk\n'
      printf 'JWT_AUTHORITY=https://auth.example.com\n'
    } > "$BASE/msw.env"
    chown deploy:deploy "$BASE/msw.env" 2>/dev/null || true
    chmod 600 "$BASE/msw.env"
  else
    echo "ERROR: $BASE/msw.env missing. Set DATABASE_URL env (CI secret) and rerun." >&2
    exit 1
  fi
fi
# 校验 msw.env 关键行（server.ts 对 CORS 白名单 fail-fast,缺了容器起不来）
if ! grep -q '^DATABASE_URL=' "$BASE/msw.env"; then
  echo "ERROR: $BASE/msw.env has no DATABASE_URL line" >&2
  exit 1
fi
if ! grep -q '^SAAS_CORS_ALLOWED_ORIGINS=' "$BASE/msw.env"; then
  echo "ERROR: $BASE/msw.env has no SAAS_CORS_ALLOWED_ORIGINS line (server.ts fail-fast)" >&2
  exit 1
fi

# CORS origin 级无损追加（nextjs 仓同款）：三前端 prod 域名都可跨源调 msw。
# 存量 env-file 缺哪个 origin 就补哪个（origin 级，不整值覆盖，运维手工 origin 保留）。
for cors_origin in "https://saas-nextjs.xiangru.uk" \
                   "https://saas-react.xiangru.uk" \
                   "https://saas-vue.xiangru.uk"; do
  if grep -q '^SAAS_CORS_ALLOWED_ORIGINS=' "$BASE/msw.env" && ! grep '^SAAS_CORS_ALLOWED_ORIGINS=' "$BASE/msw.env" | grep -qF "$cors_origin"; then
    sed -i "s#^\(SAAS_CORS_ALLOWED_ORIGINS=.*\)#\1,${cors_origin}#" "$BASE/msw.env"
    echo "→ reconcile SAAS_CORS_ALLOWED_ORIGINS: 追加缺失 origin ${cors_origin}"
  fi
done

# nginx vhost 重渲染（每次 deploy 都跑,ADR-0018:容器端口变了 vhost 必须跟）。
# 模板每次都从 master 拉最新 —— VPS 本地缓存老模板会渲染出老端口全家族 502。
NGINX_SITES_AVAILABLE="/etc/nginx/sites-available"
NGINX_SITES_ENABLED="/etc/nginx/sites-enabled"
NGINX_VHOST_FILE="${NGINX_SITES_AVAILABLE}/${NGINX_DOMAIN}"
NGINX_VHOST_LINK="${NGINX_SITES_ENABLED}/${NGINX_DOMAIN}"
NGINX_TEMPLATE="${BASE}/nginx-vps.conf.example"

echo "→ fetching nginx-vps.conf.example template (always fresh from master)"
if ! curl -fsSL "https://raw.githubusercontent.com/zcqiand/saas-identity-platform-msw/refs/heads/master/deploy/nginx-vps.conf.example" -o "${NGINX_TEMPLATE}"; then
  echo "ERROR: failed to fetch nginx template, vhost re-render aborts"
  exit 1
fi

# cert 归一化规则必须排在 <domain> 通配之前（2026-09-03 家族事故根因,sed -e 按序执行）
TMP_VHOST="$(mktemp -t vpstpl.XXXXXX)"
sed \
  -e "s|/etc/nginx/ssl/<domain>\.crt|/etc/nginx/ssl/${NGINX_CERT_BASENAME}.cert|g" \
  -e "s|/etc/nginx/ssl/<domain>\.cert|/etc/nginx/ssl/${NGINX_CERT_BASENAME}.cert|g" \
  -e "s|/etc/nginx/ssl/<domain>\.key|/etc/nginx/ssl/${NGINX_CERT_BASENAME}.key|g" \
  -e "s|/etc/nginx/ssl/your-cert\.crt|/etc/nginx/ssl/${NGINX_CERT_BASENAME}.cert|g" \
  -e "s|/etc/nginx/ssl/your-cert\.cert|/etc/nginx/ssl/${NGINX_CERT_BASENAME}.cert|g" \
  -e "s|/etc/nginx/ssl/your-cert\.key|/etc/nginx/ssl/${NGINX_CERT_BASENAME}.key|g" \
  -e "s|<domain>|${NGINX_DOMAIN}|g" \
  -e "s|saas\.YOUR_DOMAIN|${NGINX_DOMAIN}|g" \
  "${NGINX_TEMPLATE}" > "${TMP_VHOST}"

if [ -e "${NGINX_VHOST_FILE}" ] && diff -q "${TMP_VHOST}" "${NGINX_VHOST_FILE}" >/dev/null 2>&1; then
  echo "→ nginx vhost ${NGINX_VHOST_FILE} unchanged, skip"
  rm -f "${TMP_VHOST}"
else
  echo "→ rendering nginx vhost ${NGINX_VHOST_FILE} (domain=${NGINX_DOMAIN} cert=${NGINX_CERT_BASENAME})"
  if [ -w "${NGINX_SITES_AVAILABLE}" ]; then
    cp "${TMP_VHOST}" "${NGINX_VHOST_FILE}"
  else
    sudo cp "${TMP_VHOST}" "${NGINX_VHOST_FILE}" \
      || { echo "ERROR: sudo cp ${NGINX_VHOST_FILE} failed"; rm -f "${TMP_VHOST}"; exit 1; }
  fi
  if [ -w "${NGINX_SITES_ENABLED}" ]; then
    ln -sf "${NGINX_VHOST_FILE}" "${NGINX_VHOST_LINK}"
  else
    sudo ln -sf "${NGINX_VHOST_FILE}" "${NGINX_VHOST_LINK}" \
      || { echo "ERROR: sudo ln ${NGINX_VHOST_LINK} failed"; rm -f "${TMP_VHOST}"; exit 1; }
  fi
  rm -f "${TMP_VHOST}"
  echo "→ nginx -t"
  sudo nginx -t
  echo "→ systemctl reload nginx"
  sudo systemctl reload nginx
  echo "✓ nginx reloaded"
fi

echo "→ image: $IMAGE"
echo "→ docker login"
printf '%s' "$PASSWORD" | docker login -u "$USERNAME" --password-stdin

echo "→ docker pull"
docker pull "$IMAGE"

echo "→ docker stop & rm $CONTAINER_NAME"
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true

echo "→ docker run"
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p "127.0.0.1:5100:5100" \
  --env-file "$BASE/msw.env" \
  "$IMAGE"

echo "→ docker image prune"
docker image prune -f

echo "→ docker ps"
docker ps --filter name="$CONTAINER_NAME"

# 健康检查: 容器 healthcheck 30s 内应 healthy（Dockerfile wget /healthz）
echo "→ waiting for container health..."
i=0
while [ $i -lt 30 ]; do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "starting")
  if [ "$STATUS" = "healthy" ]; then
    echo "→ container healthy after ${i}s"
    break
  fi
  if [ "$STATUS" = "unhealthy" ]; then
    echo "→ container unhealthy, logs:"
    docker logs --tail 30 "$CONTAINER_NAME"
    exit 1
  fi
  i=$((i+1))
  sleep 1
done

if [ $i -ge 30 ]; then
  echo "→ container failed to become healthy in 30s, logs:"
  docker logs --tail 30 "$CONTAINER_NAME"
  exit 1
fi

echo "→ deploy done at $(date -u)"
