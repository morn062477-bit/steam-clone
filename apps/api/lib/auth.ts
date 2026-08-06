/**
 * lib/auth.ts
 *
 * 회원가입 + 이메일 인증. 실제 스팀 가입 플로우와 동일한 2단계 구조.
 *
 *   1) startSignup    이메일만 받아 PendingSignup 생성, 인증 메일 발송
 *   2) verifyEmail     인증 링크 클릭 → PendingSignup.verifiedAt 기록 (User 는 아직 없음)
 *   3) getSignupStatus 프론트가 폴링으로 verifiedAt 여부 확인
 *   4) completeSignup  인증된 PendingSignup 에 계정 이름/비밀번호를 채워 User 로 승격
 */

import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcrypt';
import type { PrismaClient } from '@prisma/client';
import { sendVerificationEmail } from './mailer.js';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24시간
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NICKNAME_RE = /^[A-Za-z0-9]{6,20}$/; // 영문/숫자만, 6~20자

export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function hashToken(raw: string) {
  return createHash('sha256').update(raw).digest('hex');
}

export async function startSignup(
  prisma: PrismaClient,
  webOrigin: string,
  body: { email?: string },
) {
  const email = body.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) throw new AuthError(400, '올바른 이메일 주소를 입력하세요.');

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) throw new AuthError(409, '이미 가입된 이메일입니다.');

  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  // 같은 이메일로 재가입 시도(재전송) 시 이전 pending 을 새 토큰으로 덮어쓴다. id 는 유지된다.
  const pending = await prisma.pendingSignup.upsert({
    where: { email },
    create: { email, tokenHash, expiresAt },
    update: { tokenHash, expiresAt, verifiedAt: null },
  });

  const verifyUrl = `${webOrigin}/api/auth/verify?token=${rawToken}`;
  await sendVerificationEmail(email, verifyUrl);

  return { signupId: pending.id, email };
}

export async function verifyEmail(prisma: PrismaClient, rawToken: string) {
  if (!rawToken) throw new AuthError(400, '인증 토큰이 없습니다.');
  const tokenHash = hashToken(rawToken);

  const pending = await prisma.pendingSignup.findUnique({ where: { tokenHash } });
  if (!pending) throw new AuthError(400, '유효하지 않은 인증 링크입니다.');

  if (pending.expiresAt < new Date()) {
    throw new AuthError(400, '인증 링크가 만료되었습니다. 처음부터 다시 가입해 주세요.');
  }

  if (!pending.verifiedAt) {
    await prisma.pendingSignup.update({ where: { id: pending.id }, data: { verifiedAt: new Date() } });
  }

  return { email: pending.email };
}

export async function getSignupStatus(prisma: PrismaClient, signupId: string) {
  const pending = await prisma.pendingSignup.findUnique({ where: { id: signupId } });
  if (!pending) throw new AuthError(404, '가입 요청을 찾을 수 없습니다.');
  return { email: pending.email, verified: Boolean(pending.verifiedAt) };
}

export async function completeSignup(
  prisma: PrismaClient,
  body: { signupId?: string; nickname?: string; password?: string },
) {
  const signupId = body.signupId?.trim();
  const nickname = body.nickname?.trim();
  const password = body.password ?? '';

  if (!signupId) throw new AuthError(400, '가입 요청 정보가 없습니다.');
  if (!nickname || !NICKNAME_RE.test(nickname))
    throw new AuthError(400, '계정 이름은 영문/숫자로 6~20자여야 합니다.');
  if (password.length < 8) throw new AuthError(400, '비밀번호는 8자 이상이어야 합니다.');

  const pending = await prisma.pendingSignup.findUnique({ where: { id: signupId } });
  if (!pending) throw new AuthError(404, '가입 요청을 찾을 수 없습니다.');
  if (!pending.verifiedAt) throw new AuthError(400, '이메일 인증을 먼저 완료해 주세요.');
  if (pending.expiresAt < new Date()) throw new AuthError(400, '인증이 만료되었습니다. 처음부터 다시 가입해 주세요.');

  const nicknameTaken = await prisma.user.findUnique({ where: { nickname } });
  if (nicknameTaken) throw new AuthError(409, '이미 사용 중인 계정 이름입니다.');

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { email: pending.email, nickname, passwordHash },
    });
    await tx.pendingSignup.delete({ where: { id: pending.id } });
    return created;
  });

  return { email: user.email, nickname: user.nickname };
}
