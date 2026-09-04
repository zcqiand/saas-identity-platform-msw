// jwt-signer.ts — saas-msw 真签 HS256 access token (Phase 1A)
//
// 镜像 saas-identity-platform-nextjs/src/lib/jwt.ts 的 signToken 形态，但只做签发
// （MSW 不需要验签，验签由真实后端 NimbusJwtDecoder / jose 负责）。
//
// 与 saas-identity-platform-{springboot,aspnetcore} 共享 JWT_SIGNING_KEY (env)，
// 因此 MSW 签出来的 token 在真后端 dev profile 也能验签通过——不再需要 DevJwtDecoder
// / RequireSignedTokens=false 兜底（Phase 2 会删除）。
//
// v0.4.0 起替换旧 `mock-jwt-${userId}` 占位字符串（MSW handler 内部约定、prod
// 不能识别的 opaque token）。同源共享 dev key 是 dev-only 妥协：prod JWT_SIGNING_KEY
// 走 vault 注入，MSW 在 prod 不部署（mode=msw 已显式标记）。

import { SignJWT } from "jose";

const enc = new TextEncoder();

// ADR-0019 禁 env 字面默认值。signing key 缺失 throw（与 issuer/audience 同款 fail-fast）。
export function getSigningKey(): Uint8Array {
  const k = process.env.JWT_SIGNING_KEY;
  if (!k || k.length < 32) {
    throw new Error(
      "JWT_SIGNING_KEY env is missing or shorter than 32 bytes. Set in .env.example / .env.test.",
    );
  }
  return enc.encode(k);
}

// ADR-0019 禁 env 字面默认值。issuer/audience 缺失 throw,handler 启动即拒。
export function getIssuer(): string {
  const v = process.env.JWT_ISSUER;
  if (!v) throw new Error("JWT_ISSUER env is required (ADR-0019 禁字面默认值)");
  return v;
}

export function getAudience(): string {
  const v = process.env.JWT_AUDIENCE;
  if (!v) throw new Error("JWT_AUDIENCE env is required (ADR-0019 禁字面默认值)");
  return v;
}

function getTtlSeconds(): number {
  const raw = process.env.JWT_TTL_SECONDS;
  if (!raw) throw new Error("JWT_TTL_SECONDS env is required (ADR-0019 禁字面默认值)");
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`JWT_TTL_SECONDS 非法值 ${raw}（必须正整数）`);
  }
  return n;
}

/**
 * 真签 HS256 access token。
 * @param claims.sub user id
 * @param claims.tenant_id 租户 id
 * @param claims.scope 空格分隔的 scope（RFC 6749 §3.3）
 */
export async function signAccessToken(claims: {
  sub: string;
  tenant_id: string;
  scope?: string;
  ttlSeconds?: number;
}): Promise<string> {
  const ttl = claims.ttlSeconds ?? getTtlSeconds();
  return await new SignJWT({
    ...(claims.scope ? { scope: claims.scope } : {}),
    tenant_id: claims.tenant_id,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(getIssuer())
    .setAudience(getAudience())
    .setSubject(claims.sub)
    .setIssuedAt()
    .setJti(crypto.randomUUID())
    .setExpirationTime(`${ttl}s`)
    .sign(getSigningKey());
}