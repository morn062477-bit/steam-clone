/**
 * apps/api/prisma/seed.ts
 *
 * seed/games.json을 읽어 DB에 넣는다.
 * 실행: pnpm db:seed  (package.json에 "prisma": { "seed": "tsx prisma/seed.ts" })
 *
 * 여러 번 실행해도 안전하도록 upsert를 쓴다.
 */

import { PrismaClient, Prisma, TagKind, DiscountType } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const SEED_FILE = path.resolve('seed/games.json');

interface SysReq {
  minimum: string | null;
  recommended: string | null;
}

interface SeedGame {
  steamAppId: number;
  slug: string;
  name: string;
  shortDesc: string;
  description: string;
  headerImage: string;
  capsuleImage: string;
  priceKrw: number;
  isFree: boolean;
  discountPercent: number;
  releaseDate: string | null;
  comingSoon: boolean;
  developer: string;
  publisher: string;
  requiredAge: number;
  metacritic: number | null;
  supportsWindows: boolean;
  supportsMac: boolean;
  supportsLinux: boolean;
  genres: string[];
  categories: string[];
  screenshots: { url: string; thumbUrl: string }[];

  // fetch-movies.ts가 덧붙인 필드. 구버전 games.json에는 없을 수 있어 optional
  previewVideoUrl?: string | null;
  detailVideoUrl?: string | null;

  // enrich-steam.ts가 덧붙인 필드. 구버전 games.json에는 없을 수 있어 optional
  reviewScore?: number | null;
  reviewScoreDesc?: string | null;
  reviewCountTotal?: number;
  reviewCountPositive?: number;
  reviewCountNegative?: number;
  reviewPositivePercent?: number | null;
  reqWindows?: SysReq | null;
  reqMac?: SysReq | null;
  reqLinux?: SysReq | null;
  dlcAppIds?: number[];
  dlcCount?: number;
}

function slugifyTag(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '');
}

/** "2026년 8월 4일" / "4 Aug, 2026" 등 다양한 포맷 방어적 파싱 */
function parseReleaseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const ko = raw.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (ko) return new Date(Number(ko[1]), Number(ko[2]) - 1, Number(ko[3]));
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function upsertTag(name: string, kind: TagKind) {
  const slug = slugifyTag(name);
  return prisma.tag.upsert({
    where: { slug },
    update: {},
    create: { name, slug, kind },
  });
}

/**
 * Prisma의 nullable Json 컬럼은 평범한 null을 받지 않는다.
 * SQL NULL로 넣으려면 Prisma.DbNull을 써야 한다.
 */
function jsonOrNull(v: unknown) {
  return v == null ? Prisma.DbNull : (v as Prisma.InputJsonValue);
}

/** Steam 원본 집계 필드. 재실행 시에도 갱신되도록 create/update 양쪽에 쓴다 */
function steamFields(g: SeedGame) {
  return {
    steamReviewScore: g.reviewScore ?? null,
    steamReviewDesc: g.reviewScoreDesc ?? null,
    steamReviewTotal: g.reviewCountTotal ?? 0,
    steamReviewPositive: g.reviewCountPositive ?? 0,
    steamReviewNegative: g.reviewCountNegative ?? 0,
    steamPositivePercent: g.reviewPositivePercent ?? null,
    reqWindows: jsonOrNull(g.reqWindows),
    reqMac: jsonOrNull(g.reqMac),
    reqLinux: jsonOrNull(g.reqLinux),
  };
}

async function seedGames(games: SeedGame[]) {
  const tagCache = new Map<string, string>(); // slug -> tagId

  for (const g of games) {
    const game = await prisma.game.upsert({
      where: { slug: g.slug },
      update: {
        priceKrw: g.priceKrw,
        previewVideoUrl: g.previewVideoUrl ?? null,
        detailVideoUrl: g.detailVideoUrl ?? null,
        ...steamFields(g),
      },
      create: {
        steamAppId: g.steamAppId,
        slug: g.slug,
        name: g.name,
        shortDesc: g.shortDesc,
        description: g.description,
        headerImage: g.headerImage,
        capsuleImage: g.capsuleImage,
        previewVideoUrl: g.previewVideoUrl ?? null,
        detailVideoUrl: g.detailVideoUrl ?? null,
        priceKrw: g.priceKrw,
        isFree: g.isFree,
        releaseDate: parseReleaseDate(g.releaseDate),
        comingSoon: g.comingSoon,
        developer: g.developer,
        publisher: g.publisher,
        requiredAge: g.requiredAge,
        metacritic: g.metacritic,
        supportsWindows: g.supportsWindows,
        supportsMac: g.supportsMac,
        supportsLinux: g.supportsLinux,
        ...steamFields(g),
      },
    });

    // 태그
    const entries: [string, TagKind][] = [
      ...g.genres.map((n) => [n, TagKind.GENRE] as [string, TagKind]),
      ...g.categories.slice(0, 6).map((n) => [n, TagKind.CATEGORY] as [string, TagKind]),
    ];

    for (const [i, [name, kind]] of entries.entries()) {
      const slug = slugifyTag(name);
      let tagId = tagCache.get(slug);
      if (!tagId) {
        tagId = (await upsertTag(name, kind)).id;
        tagCache.set(slug, tagId);
      }
      await prisma.gameTag.upsert({
        where: { gameId_tagId: { gameId: game.id, tagId } },
        update: {},
        create: { gameId: game.id, tagId, order: i },
      });
    }

    // 스크린샷 (재실행 시 중복 방지를 위해 지우고 다시 넣음)
    await prisma.screenshot.deleteMany({ where: { gameId: game.id } });
    if (g.screenshots.length) {
      await prisma.screenshot.createMany({
        data: g.screenshots.map((s, i) => ({
          gameId: game.id,
          url: s.url,
          thumbUrl: s.thumbUrl,
          order: i,
        })),
      });
    }

    // DLC (스크린샷과 같은 이유로 지우고 다시 넣음)
    await prisma.gameDlc.deleteMany({ where: { gameId: game.id } });
    if (g.dlcAppIds?.length) {
      await prisma.gameDlc.createMany({
        data: g.dlcAppIds.map((dlcAppId, i) => ({ gameId: game.id, dlcAppId, order: i })),
        skipDuplicates: true,
      });
    }

    // 할인: Steam에서 할인 중이던 게임에 진행 중인 할인을 만들어 준다
    if (g.discountPercent > 0 && !g.isFree) {
      const now = new Date();
      const endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const type =
        g.discountPercent >= 60
          ? DiscountType.SEASONAL
          : g.discountPercent >= 40
            ? DiscountType.DAILY
            : DiscountType.WEEKEND;

      await prisma.discount.deleteMany({ where: { gameId: game.id } });
      await prisma.discount.create({
        data: { gameId: game.id, percent: g.discountPercent, type, startsAt: now, endsAt },
      });
    }
  }

  console.log(`게임 ${games.length}건, 태그 ${tagCache.size}종 처리 완료`);
}

async function seedUsers() {
  const passwordHash = await bcrypt.hash('test1234!', 10);
  const users = [
    { email: 'demo@steam.local', nickname: '데모유저' },
    { email: 'gamer@steam.local', nickname: '겜돌이' },
    { email: 'reviewer@steam.local', nickname: '리뷰왕' },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, passwordHash, country: 'KR' },
    });
  }
  console.log(`테스트 계정 ${users.length}개 (비밀번호: test1234!)`);
}

async function seedReviews() {
  const users = await prisma.user.findMany({ take: 3 });
  const games = await prisma.game.findMany({ take: 30, select: { id: true } });

  const samples = [
    { rec: true, text: '시간 순삭입니다. 친구랑 하면 두 배로 재밌어요.' },
    { rec: true, text: '최적화도 괜찮고 한글 번역 품질이 좋습니다.' },
    { rec: false, text: '초반은 좋은데 중반부터 반복 구간이 너무 깁니다.' },
    { rec: true, text: '이 가격에 이 볼륨이면 안 살 이유가 없습니다.' },
  ];

  let count = 0;
  for (const game of games) {
    for (const user of users) {
      if (Math.random() > 0.5) continue;
      const s = samples[Math.floor(Math.random() * samples.length)];
      await prisma.review.upsert({
        where: { userId_gameId: { userId: user.id, gameId: game.id } },
        update: {},
        create: {
          userId: user.id,
          gameId: game.id,
          isRecommended: s.rec,
          content: s.text,
          playtimeMinutes: Math.floor(Math.random() * 6000),
        },
      });
      count++;
    }
  }

  // 집계 캐시 갱신
  for (const game of games) {
    const [total, positive] = await Promise.all([
      prisma.review.count({ where: { gameId: game.id } }),
      prisma.review.count({ where: { gameId: game.id, isRecommended: true } }),
    ]);
    await prisma.game.update({
      where: { id: game.id },
      data: { reviewCount: total, positiveCount: positive },
    });
  }

  console.log(`리뷰 ${count}건`);
}

async function main() {
  const raw = await readFile(SEED_FILE, 'utf-8').catch(() => {
    throw new Error(
      `${SEED_FILE} 없음. 먼저 scripts/fetch-steam.ts를 실행하거나 팀에서 커밋한 파일을 받으세요.`,
    );
  });

  const games: SeedGame[] = JSON.parse(raw);
  console.log(`시드 시작: ${games.length}건\n`);

  await seedGames(games);
  await seedUsers();
  await seedReviews();

  console.log('\n시드 완료');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
