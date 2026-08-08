/**
 * lib/qrLogin.ts
 *
 * QR 코드 로그인. 실제 스팀 앱과 달리 이 프로젝트엔 별도 모바일 앱이 없어서
 * "폰"도 그냥 브라우저다. 그래서 기기 인증은 두 겹으로 나눈다:
 *
 *   1) QrLoginTicket   데스크탑이 만든 1회용 티켓. 폰이 CONFIRMED 로 바꾸면
 *                      데스크탑의 다음 폴링이 실제 세션을 발급하고 CONSUMED 로 소비한다.
 *   2) TrustedDevice   폰 브라우저가 처음 로그인할 때 "이 기기 기억하기"를 켜면 발급되는
 *                      장기 토큰. 다음 QR 스캔부터는 비밀번호 없이 이 토큰으로 사용자를
 *                      인식하되, 승인 버튼은 항상 다시 눌러야 한다(도난 기기 자동 로그인 방지).
 */

import { randomBytes, createHash } from 'node:crypto';
import QRCode from 'qrcode';
import type { PrismaClient } from '@prisma/client';
import { AuthError } from './auth.js';
import { createSession } from './session.js';

const QR_TTL_MS = 3 * 60 * 1000; // 3분
const DEVICE_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180일
export const DEVICE_COOKIE = 'device';

function hashToken(raw: string) {
  return createHash('sha256').update(raw).digest('hex');
}

/** 데스크탑: QR 티켓을 만들고 그 안에 담을 로그인 URL을 QR 이미지(data URL)로 인코딩한다. */
export async function startQrLogin(prisma: PrismaClient, webOrigin: string) {
  const rawToken = randomBytes(32).toString('hex');
  const ticket = await prisma.qrLoginTicket.create({
    data: { tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + QR_TTL_MS) },
  });

  const loginUrl = `${webOrigin}/qr-login?token=${rawToken}`;
  const qrDataUrl = await QRCode.toDataURL(loginUrl, { margin: 1, width: 240 });

  return { ticketId: ticket.id, qrDataUrl, expiresAt: ticket.expiresAt.toISOString() };
}

/** 폰: QR 링크로 처음 들어왔을 때 티켓이 아직 유효한지 확인. */
export async function checkQrTicket(prisma: PrismaClient, rawToken: string) {
  if (!rawToken) throw new AuthError(400, '유효하지 않은 QR 코드입니다.');
  const ticket = await prisma.qrLoginTicket.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!ticket) throw new AuthError(404, '유효하지 않은 QR 코드입니다.');
  if (ticket.status !== 'PENDING') throw new AuthError(410, '이미 사용된 QR 코드입니다.');
  if (ticket.expiresAt < new Date()) throw new AuthError(410, 'QR 코드가 만료되었습니다. 데스크탑에서 새로고침해 주세요.');
  return { valid: true };
}

/** 폰: 기기 쿠키로 이 브라우저가 이전에 로그인해 기억해 둔 사용자가 있는지 찾는다. */
export async function resolveTrustedDevice(prisma: PrismaClient, rawDeviceToken: string | undefined) {
  if (!rawDeviceToken) return null;
  const device = await prisma.trustedDevice.findUnique({
    where: { tokenHash: hashToken(rawDeviceToken) },
    include: { user: true },
  });
  if (!device) return null;

  await prisma.trustedDevice.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  const { user } = device;
  return { id: user.id, nickname: user.nickname, email: user.email, avatarUrl: user.avatarUrl };
}

/** 폰: "이 기기 기억하기"로 로그인했을 때 새 기기 토큰을 발급한다. */
export async function issueTrustedDevice(prisma: PrismaClient, userId: string, label: string | null) {
  const rawToken = randomBytes(32).toString('hex');
  await prisma.trustedDevice.create({ data: { userId, tokenHash: hashToken(rawToken), label } });
  return { token: rawToken, maxAgeSec: DEVICE_TTL_MS / 1000 };
}

/** 폰: 승인 버튼 → 티켓을 해당 사용자로 CONFIRMED 전이. 데스크탑의 다음 폴링이 소비한다. */
export async function confirmQrLoginWithUser(prisma: PrismaClient, rawToken: string, userId: string) {
  const ticket = await prisma.qrLoginTicket.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!ticket) throw new AuthError(404, '유효하지 않은 QR 코드입니다.');
  if (ticket.status !== 'PENDING') throw new AuthError(410, '이미 처리된 QR 코드입니다.');
  if (ticket.expiresAt < new Date()) throw new AuthError(410, 'QR 코드가 만료되었습니다. 데스크탑에서 새로고침해 주세요.');

  await prisma.qrLoginTicket.update({ where: { id: ticket.id }, data: { status: 'CONFIRMED', userId } });
  return { ok: true };
}

/** 데스크탑: 폴링. CONFIRMED 상태를 발견한 첫 폴링이 실제 세션을 발급하고 티켓을 소비한다. */
export async function pollQrLogin(prisma: PrismaClient, ticketId: string) {
  if (!ticketId) throw new AuthError(400, '잘못된 요청입니다.');

  const ticket = await prisma.qrLoginTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) return { status: 'INVALID' as const };

  if (ticket.status === 'PENDING') {
    if (ticket.expiresAt < new Date()) return { status: 'EXPIRED' as const };
    return { status: 'PENDING' as const };
  }

  if (ticket.status === 'CONSUMED') return { status: 'CONSUMED' as const };

  // CONFIRMED: 이 폴링에서 실제 세션을 발급하고 1회성으로 소비한다.
  const user = ticket.userId ? await prisma.user.findUnique({ where: { id: ticket.userId } }) : null;
  if (!user) return { status: 'EXPIRED' as const };

  const session = await createSession(prisma, {
    id: user.id,
    nickname: user.nickname,
    email: user.email,
    avatarUrl: user.avatarUrl,
  });
  await prisma.qrLoginTicket.update({ where: { id: ticket.id }, data: { status: 'CONSUMED' } });

  return { status: 'CONFIRMED' as const, token: session.token, maxAgeSec: session.maxAgeSec, user: session.user };
}
