/**
 * lib/mailer.ts
 *
 * 무료 이메일 발송. Gmail SMTP(nodemailer) 사용 — 비용 없음, 별도 서비스 가입 불필요.
 * GMAIL_USER / GMAIL_APP_PASSWORD 가 .env 에 없으면 실제 발송 대신
 * 콘솔에 인증 링크를 그대로 찍는다. (팀원 로컬에 Gmail 계정이 없어도 개발 가능)
 *
 * Gmail 앱 비밀번호 발급: https://myaccount.google.com/apppasswords
 * (Google 계정에 2단계 인증이 켜져 있어야 발급 메뉴가 보인다)
 */

import nodemailer from 'nodemailer';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// PNG 를 쓴다. SVG(logo_steam_icon.svg)로 붙여서 보내 봤더니 Gmail 이 차단해
// 깨진 이미지로 떴다. PNG 는 사실상 모든 클라이언트에서 뜬다.
// logo_steam_icon.png 는 같은 아이콘을 200x200 으로 렌더한 것이라 모양은 동일하다.
const ASSETS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const STEAM_LOGO_PNG = readFileSync(path.join(ASSETS_DIR, 'logo_steam_icon.png'));
const LOGO_CID = 'steam-logo';

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

const transporter =
  GMAIL_USER && GMAIL_APP_PASSWORD
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
      })
    : null;

export async function sendVerificationEmail(to: string, verifyUrl: string) {
  const subject = 'Steam 클론 - 이메일 주소를 인증해 주세요';
  const origin = new URL(verifyUrl).origin;
  const html = `
    <div style="background:#171a21;max-width:600px;margin:0 auto;padding:40px 36px;font-family:Arial,Helvetica,sans-serif;color:#c7d5e0;">
      <div style="margin-bottom:24px;">
        <img src="cid:${LOGO_CID}" alt="Steam" height="72" style="height:72px;display:block;" />
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

  if (!transporter) {
    console.log(`[mailer] GMAIL_USER/GMAIL_APP_PASSWORD 미설정 — 실제 발송 대신 링크만 출력합니다.`);
    console.log(`[mailer] -> ${to}: ${verifyUrl}`);
    return;
  }

  await transporter.sendMail({
    from: `"Steam 클론" <${GMAIL_USER}>`,
    to,
    subject,
    html,
    attachments: [
      {
        filename: 'logo_steam_icon.png',
        content: STEAM_LOGO_PNG,
        contentType: 'image/png',
        cid: LOGO_CID,
        contentDisposition: 'inline',
      },
    ],
  });
}
