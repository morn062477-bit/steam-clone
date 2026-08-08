/**
 * lib/session.ts
 *
 * 로그인 / 로그아웃.
 * JWT 없이 RefreshToken 테이블만으로 세션을 관리한다 — 이메일 인증 토큰과 동일한 패턴
 * (랜덤 토큰을 발급해 원본은 쿠키로 주고, 해시만 DB에 저장한다. 평문 저장 금지).
 * 서버가 매 요청마다 DB를 조회해 즉시 revoke 가능하다는 게 장점.
 */

import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcrypt';
import type { PrismaClient } from '@prisma/client';
import { AuthError } from './auth.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일
export const SESSION_COOKIE = 'session';

function hashToken(raw: string) {
  return createHash('sha256').update(raw).digest('hex');
}

type SessionUser = { id: string; nickname: string; email: string; avatarUrl: string | null };

/** 계정 이름/이메일 + 비밀번호를 검증하고 User 를 돌려준다. QR 로그인의 수동 로그인 분기에서도 재사용. */
export async function verifyCredentials(
  prisma: PrismaClient,
  account: string | undefined,
  password: string | undefined,
): Promise<SessionUser> {
  const acc = account?.trim();
  const pw = password ?? '';
  if (!acc || !pw) throw new AuthError(400, '계정 이름과 비밀번호를 모두 입력하세요.');

  const user = await prisma.user.findFirst({
    where: { OR: [{ nickname: acc }, { email: acc.toLowerCase() }] },
  });

  // 계정 없음/비번 틀림을 구분해 알려주지 않는다 (계정 존재 여부 노출 방지).
  const valid = user ? await bcrypt.compare(pw, user.passwordHash) : false;
  if (!user || !valid) throw new AuthError(401, '계정 이름 또는 비밀번호가 올바르지 않습니다.');

  return { id: user.id, nickname: user.nickname, email: user.email, avatarUrl: user.avatarUrl };
}

/** RefreshToken 세션 발급. 일반 로그인과 QR 로그인 승인 양쪽에서 재사용. */
export async function createSession(prisma: PrismaClient, user: SessionUser) {
  const rawToken = randomBytes(32).toString('hex');
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  return { token: rawToken, maxAgeSec: SESSION_TTL_MS / 1000, user };
}

export async function login(
  prisma: PrismaClient,
  body: { account?: string; password?: string },
) {
  const user = await verifyCredentials(prisma, body.account, body.password);
  return createSession(prisma, user);
}

export async function logout(prisma: PrismaClient, rawToken: string | undefined) {
  if (!rawToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** 세션 쿠키로 현재 로그인된 사용자를 찾는다. 없거나 만료/폐기됐으면 null. */
export async function getSessionUser(prisma: PrismaClient, rawToken: string | undefined) {
  if (!rawToken) return null;
  const token = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true },
  });
  if (!token || token.revokedAt || token.expiresAt < new Date()) return null;
  const { user } = token;
  return { id: user.id, nickname: user.nickname, email: user.email, avatarUrl: user.avatarUrl };
}

// ---------------------------------------------------------------
// 쿠키 파싱/직렬화. 프레임워크 없이 node:http만 쓰는 프로젝트 스타일에 맞춰 직접 구현.
// ---------------------------------------------------------------

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function serializeCookie(name: string, value: string, maxAgeSec: number) {
  const attrs = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  attrs.push(maxAgeSec > 0 ? `Max-Age=${maxAgeSec}` : 'Max-Age=0');
  return attrs.join('; ');
}
