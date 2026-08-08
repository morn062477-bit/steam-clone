/**
 * lib/mailer.ts
 *
 * 이메일 발송. SendGrid HTTPS API 사용 — Gmail SMTP(nodemailer)에서 교체했다.
 * Railway 같은 클라우드 호스팅은 스팸 방지 목적으로 SMTP 포트(465/587) 아웃바운드를
 * 막아두는 경우가 많아, Gmail SMTP 연결이 응답 없이 계속 멈춰있다가 타임아웃났다.
 * SendGrid는 일반 HTTPS(443) API라 이런 차단에 걸리지 않는다.
 *
 * Resend 대신 SendGrid를 쓰는 이유: Resend는 도메인 인증 전엔 "가입한 본인 이메일"
 * 로만 발송 가능하다. SendGrid는 도메인 없이 이메일 주소 하나만 인증하는
 * "Single Sender Verification"으로 아무 수신자에게나 보낼 수 있다(무료 티어 하루 100통).
 *
 * SENDGRID_API_KEY 가 .env 에 없으면 실제 발송 대신 콘솔에 인증 링크를 그대로 찍는다.
 * (팀원 로컬에 SendGrid 계정이 없어도 개발 가능)
 *
 * 설정: https://sendgrid.com 가입 → Settings → Sender Authentication →
 *   Single Sender Verification 으로 발신자 이메일 인증 → Settings → API Keys 에서 키 발급
 * SENDGRID_FROM 은 위에서 인증한 그 이메일 주소로 지정해야 한다(안 그러면 거부됨).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// PNG 를 쓴다. SVG(logo_steam_icon.svg)로 붙여서 보내 봤더니 Gmail 이 차단해
// 깨진 이미지로 떴다. PNG 는 사실상 모든 클라이언트에서 뜬다.
const ASSETS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const STEAM_LOGO_PNG_BASE64 = readFileSync(path.join(ASSETS_DIR, 'logo_steam_icon.png')).toString('base64');

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM = process.env.SENDGRID_FROM;

export async function sendVerificationEmail(to: string, verifyUrl: string) {
  const subject = 'Steam 클론 - 이메일 주소를 인증해 주세요';
  const origin = new URL(verifyUrl).origin;
  const html = `
    <div style="background:#171a21;max-width:600px;margin:0 auto;padding:40px 36px;font-family:Arial,Helvetica,sans-serif;color:#c7d5e0;">
      <div style="margin-bottom:24px;">
        <img src="data:image/png;base64,${STEAM_LOGO_PNG_BASE64}" alt="Steam" height="72" style="height:72px;display:block;" />
      </div>
      <h1 style="color:#fff;font-size:22px;font-weight:700;line-height:1.4;margin:0 0 24px;">
        계속해서 새로운 Steam 계정을 만들려면 아래에서 이메일 주소를 인증해 주세요.
      </h1>
      <a href="${verifyUrl}"
         style="display:block;box-sizing:border-box;text-align:center;
                background:linear-gradient(to right,#06bfff,#2d73ff);color:#fff;
                padding:14px 24px;border-radius:3px;text-decoration:none;
                font-weight:bold;font-size:15px;margin-bottom:28px;">
        이메일 주소 인증하기
      </a>
      <p style="font-size:14px;line-height:1.7;color:#c7d5e0;margin:0 0 24px;">
        Steam Guard 보안, Steam 장터, Steam 거래와 같은 Steam의 기능을 최대한 활용하고 계정을
        안전하게 복구하려면 이메일 주소를 인증해야 합니다.
      </p>
      <h2 style="color:#fff;font-size:15px;font-weight:700;margin:0 0 10px;">이메일 환경 설정 관리</h2>
      <p style="font-size:14px;line-height:1.7;color:#c7d5e0;margin:0 0 20px;">
        Valve는 때때로 Steam의 게임과 이벤트에 대한 정보를 제공하기 위해 이메일을 보내드리기도
        합니다. 이러한 이메일을 받고 싶지 않으시거나 이메일 발송 조건을 변경하고 싶으신 경우,
        계정을 생성하신 후 <a href="${origin}" style="color:#66c0f4;">여기</a>로 이동하여 이메일
        환경 설정을 변경할 수 있습니다.
      </p>
      <p style="font-size:14px;line-height:1.7;color:#66c0f4;margin:0 0 32px;">
        최근에 이 이메일 주소로 새로운 계정을 만들려고 한 적이 없다면 이 이메일을 무시하셔도 됩니다.
      </p>
      <p style="font-size:14px;line-height:1.7;color:#c7d5e0;margin:0;">
        감사합니다.<br>
        정글 크래프톤 5조 일동
      </p>
    </div>
  `;

  if (!SENDGRID_API_KEY || !SENDGRID_FROM) {
    console.log(`[mailer] SENDGRID_API_KEY/SENDGRID_FROM 미설정 — 실제 발송 대신 링크만 출력합니다.`);
    console.log(`[mailer] -> ${to}: ${verifyUrl}`);
    return;
  }

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: SENDGRID_FROM, name: 'Steam 클론' },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SendGrid 메일 발송 실패 (${res.status}): ${body}`);
  }
}
