/**
 * DB에 연결해 게임 목록을 확인한다. (읽기 전용)
 * 실행: pnpm tsx list-games.ts
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';

// .env 수동 로드 (dotenv 미설치)
for (const line of readFileSync('.env', 'utf-8').split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?(.*?)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const prisma = new PrismaClient();

async function main() {
  const total = await prisma.game.count();
  console.log(`총 게임 수: ${total}\n`);

  const games = await prisma.game.findMany({
    orderBy: { steamReviewTotal: 'desc' },
    select: {
      steamAppId: true,
      name: true,
      priceKrw: true,
      isFree: true,
      steamReviewDesc: true,
      steamPositivePercent: true,
      releaseDate: true,
    },
  });

  for (const [i, g] of games.entries()) {
    const price = g.isFree ? '무료' : `${g.priceKrw.toLocaleString('ko-KR')}원`;
    const review = g.steamReviewDesc
      ? `${g.steamReviewDesc}(${g.steamPositivePercent ?? '-'}%)`
      : '-';
    const date = g.releaseDate ? g.releaseDate.toISOString().slice(0, 10) : '-';
    console.log(
      `${String(i + 1).padStart(3)}. ${g.name} | ${price} | ${review} | ${date} | appid=${g.steamAppId ?? '-'}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
