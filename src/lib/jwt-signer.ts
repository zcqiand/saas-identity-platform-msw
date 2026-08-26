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

function getSigningKey(): Uint8Array {
  const k = process.env.JWT_SIGNING_KEY;
  if (!k || k.length < 32) {
    throw new Error(
      "JWT_SIGNING_KEY env is missing or shorter than 32 bytes. Set in .env.example / .env.test.",
    );
  }
  return enc.encode(k);
}

function getIssuer(): string {
  return process.env.JWT_ISSUER ?? "saas-identity-platform";
}

function getAudience(): string {
  return process.env.JWT_AUDIENCE ?? "saas-identity-platform-clients";
}

function getTtlSeconds(): number {
  const raw = process.env.JWT_TTL_SECONDS;
  const n = raw ? Number(raw) : 3600;
  return Number.isFinite(n) && n > 0 ? n : 3600;
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