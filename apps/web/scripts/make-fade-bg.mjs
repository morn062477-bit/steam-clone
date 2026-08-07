/**
 * 축제 페이지 배경 두 장을 만든다.
 *
 *   sale-bg-top.webp  — 맨 위에 한 번만 깔리는 그림(sale-bg.jpg)의 아래쪽을
 *                       투명으로 녹인 것. 알파가 필요해 webp.
 *   sale-bg-tile.jpg  — 그 아래로 계속 반복되는 도시 띠.
 *                       원본이 이미 위/아래 끝이 맞물리게 그려져 있어 손대지 않고 복사만 한다.
 *
 * 왜 이렇게 하나
 *   CSS 그라데이션 레이어는 위 그림이 화면 어디서 끝나는지 알 수 없다.
 *   높이가 auto 라 화면폭에 따라 달라지기 때문이다.
 *   대신 위 그림의 아래쪽을 투명으로 녹여 두면, 그 자리에서 아래 반복 띠가
 *   자연스럽게 비쳐 올라온다. 반복 띠의 위상이 어디에 걸리든 상관없다.
 *
 * 실행: node apps/web/scripts/make-fade-bg.mjs   (sharp 필요)
 */
import sharp from "sharp";
import { copyFile } from "node:fs/promises";

const dir = (p) => new URL(p, import.meta.url).pathname;

const SRC_TOP = dir("../public/sale-bg.jpg");
const OUT_TOP = dir("../public/sale-bg-top.webp");
const SRC_TILE = "/Users/baesubin/Desktop/files/apps/api/public/사이버펑크 메인 추가 화면.jpg";
const OUT_TILE = dir("../public/sale-bg-tile.jpg");

const FADE_RATIO = 0.18; // 아래에서부터 투명으로 녹이는 구간

const { width: W, height: H } = await sharp(SRC_TOP).metadata();
const F = Math.round(H * FADE_RATIO);
console.log(`위 그림 ${W}x${H} — 하단 ${F}px(${Math.round(FADE_RATIO * 100)}%)를 투명으로 녹인다`);

// 위(불투명) → 아래(투명). dest-in 이라 흰 부분만 남는다.
const mask = Buffer.from(
  `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
     <defs>
       <linearGradient id="g" x1="0" y1="${(H - F) / H}" x2="0" y2="1">
         <stop offset="0%" stop-color="#fff" stop-opacity="1"/>
         <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
       </linearGradient>
     </defs>
     <rect width="${W}" height="${H - F}" fill="#fff"/>
     <rect y="${H - F}" width="${W}" height="${F}" fill="url(#g)"/>
   </svg>`,
);

await sharp(SRC_TOP)
  .ensureAlpha()
  .composite([{ input: mask, blend: "dest-in" }])
  .webp({ quality: 82, alphaQuality: 90 })
  .toFile(OUT_TOP);

await copyFile(SRC_TILE, OUT_TILE);

const top = await sharp(OUT_TOP).metadata();
const tile = await sharp(OUT_TILE).metadata();
console.log(`저장: ${OUT_TOP} (${top.width}x${top.height}, alpha ${top.hasAlpha})`);
console.log(`저장: ${OUT_TILE} (${tile.width}x${tile.height})`);
