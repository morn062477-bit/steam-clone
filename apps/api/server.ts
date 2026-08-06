/**
 * server.ts
 *
 * Steam 상점 클론 - 정적 페이지(public/)와 DB를 붙이는 최소 API 서버.
 * 의존성 추가 없이 node:http + Prisma만 쓴다.
 *
 * 실행: pnpm dev  (= tsx server.ts)
 *
 * 엔드포인트
 *   GET /                  public/index.html (그 외 경로는 public/ 정적 파일)
 *   GET /api/home          첫 화면에 필요한 모든 섹션을 한 번에
 *   GET /api/game/:slug    게임 상세 (모달용)
 *   GET /api/search?q=     이름 검색
 *
 * 가격 규칙(schema.prisma 주석과 동일)
 *   - 할인가는 저장하지 않는다. 활성 Discount.percent로 서버에서만 계산한다.
 *   - 원 단위 정수. 10원 단위로 반올림한다.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------
// .env 로드 (dotenv 미설치라 직접 파싱)
// ---------------------------------------------------------------

const ROOT = path.dirname(fileURLToPath(import.meta.url));

for (const line of readFileSync(path.join(ROOT, '.env'), 'utf-8').split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?(.*?)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const prisma = new PrismaClient();
const PORT = Number(process.env.PORT ?? 3000);

const PUBLIC_DIR = path.join(ROOT, 'public');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

// ---------------------------------------------------------------
// 공통 select / DTO
// ---------------------------------------------------------------

/** 카드 렌더에 필요한 최소 필드 */
const cardSelect = {
  id: true,
  slug: true,
  name: true,
  headerImage: true,
  capsuleImage: true,
  priceKrw: true,
  isFree: true,
  releaseDate: true,
  comingSoon: true,
  developer: true,
  publisher: true,
  steamReviewDesc: true,
  steamReviewTotal: true,
  steamPositivePercent: true,
  screenshots: { select: { url: true, thumbUrl: true }, orderBy: { order: 'asc' }, take: 6 },
  tags: {
    select: { tag: { select: { name: true, slug: true, kind: true } } },
    orderBy: { order: 'asc' },
    take: 8,
  },
  discounts: {
    select: { percent: true, type: true, endsAt: true },
    orderBy: { percent: 'desc' },
  },
} as const;

const DISCOUNT_LABEL: Record<string, string> = {
  DAILY: '일일 특가',
  WEEKEND: '주중 특가',
  SPECIAL: '특별 할인',
  SEASONAL: '시즌 세일',
};

/** 활성 할인만 남기는 where 조각 */
function activeDiscountWhere(now: Date) {
  return { startsAt: { lte: now }, endsAt: { gte: now } };
}

function toCard(g: any, now: Date) {
  const active = (g.discounts ?? []).filter(
    (d: any) => d.endsAt >= now, // 조회 시점에 이미 startsAt <= now 로 걸러 온다
  );
  const best = active[0] ?? null;
  const percent = best?.percent ?? 0;
  const price = g.priceKrw ?? 0;
  // 10원 단위 반올림. 정가 0원/무료는 할인 계산 자체를 하지 않는다.
  const finalKrw = percent > 0 && price > 0 ? Math.round((price * (100 - percent)) / 100 / 10) * 10 : price;

  return {
    slug: g.slug,
    name: g.name,
    headerImage: g.headerImage,
    capsuleImage: g.capsuleImage,
    screenshots: (g.screenshots ?? []).map((s: any) => ({ url: s.url, thumb: s.thumbUrl })),
    tags: (g.tags ?? []).map((t: any) => t.tag.name),
    genres: (g.tags ?? []).filter((t: any) => t.tag.kind === 'GENRE').map((t: any) => t.tag.name),
    priceKrw: price,
    finalKrw,
    discountPercent: percent,
    discountLabel: best ? DISCOUNT_LABEL[best.type] ?? '할인' : null,
    discountEndsAt: best?.endsAt ?? null,
    isFree: g.isFree,
    comingSoon: g.comingSoon,
    releaseDate: g.releaseDate,
    developer: g.developer,
    publisher: g.publisher,
    reviewDesc: g.steamReviewDesc,
    reviewTotal: g.steamReviewTotal,
    reviewPercent: g.steamPositivePercent,
  };
}

/** cardSelect + 활성 할인만 */
function cardArgs(now: Date) {
  return {
    ...cardSelect,
    discounts: { ...cardSelect.discounts, where: activeDiscountWhere(now) },
  };
}

// ---------------------------------------------------------------
// /api/home
// ---------------------------------------------------------------

async function buildHome() {
  const now = new Date();
  const sel = cardArgs(now);

  // 스포트라이트에 쓸 장르. DB에 있는 것 중 앞에서부터 2개를 고른다.
  const SPOT_CANDIDATES = ['RPG', '시뮬레이션', '전략', '어드벤처', '캐주얼'];

  const [
    topRated,
    discounted,
    newest,
    upcoming,
    freeGames,
    genreTags,
  ] = await Promise.all([
    // 최고 인기: Steam 리뷰 수 기준
    prisma.game.findMany({
      where: { comingSoon: false },
      orderBy: { steamReviewTotal: 'desc' },
      take: 20,
      select: sel,
    }),
    // 할인 중인 게임 (활성 할인 보유)
    prisma.game.findMany({
      where: { discounts: { some: activeDiscountWhere(now) }, priceKrw: { gt: 0 } },
      take: 40,
      select: sel,
    }),
    // 신규 출시
    prisma.game.findMany({
      where: { comingSoon: false, releaseDate: { not: null } },
      orderBy: { releaseDate: 'desc' },
      take: 12,
      select: sel,
    }),
    // 출시 예정
    prisma.game.findMany({
      where: { comingSoon: true },
      orderBy: { releaseDate: 'asc' },
      take: 12,
      select: sel,
    }),
    // 무료 게임
    prisma.game.findMany({
      where: { isFree: true },
      orderBy: { steamReviewTotal: 'desc' },
      take: 12,
      select: sel,
    }),
    // 장르 태그 + 게임 수
    prisma.tag.findMany({
      where: { kind: 'GENRE' },
      select: { name: true, slug: true, _count: { select: { games: true } } },
      orderBy: { games: { _count: 'desc' } },
      take: 12,
    }),
  ]);

  const top = topRated.map((g) => toCard(g, now));
  const deals = discounted
    .map((g) => toCard(g, now))
    .sort((a, b) => b.discountPercent - a.discountPercent);

  // 히어로: 리뷰 많은 게임 중 할인 중인 첫 번째. 없으면 그냥 1위.
  const hero = top.find((g) => g.discountPercent > 0) ?? top[0];
  const featured = top.filter((g) => g.slug !== hero?.slug).slice(0, 5);

  // 스포트라이트 장르 2개
  const spotNames = SPOT_CANDIDATES.filter((n) =>
    genreTags.some((t) => t.name === n && t._count.games >= 4),
  ).slice(0, 2);

  const spotlights = await Promise.all(
    spotNames.map(async (name) => {
      const games = await prisma.game.findMany({
        where: { tags: { some: { tag: { name, kind: 'GENRE' } } } },
        orderBy: { steamReviewTotal: 'desc' },
        take: 4,
        select: sel,
      });
      return { tag: name, games: games.map((g) => toCard(g, now)) };
    }),
  );

  // 카테고리 카드 배경: 장르별 대표 게임 1개의 세로 카드
  const categories = await Promise.all(
    genreTags.slice(0, 10).map(async (t) => {
      const g = await prisma.game.findFirst({
        where: { tags: { some: { tag: { slug: t.slug } } } },
        orderBy: { steamReviewTotal: 'desc' },
        select: { capsuleImage: true, headerImage: true },
      });
      return {
        name: t.name,
        slug: t.slug,
        count: t._count.games,
        image: g?.capsuleImage || g?.headerImage || '',
      };
    }),
  );

  // 1만원 미만: 할인 적용 후 최종가 기준
  const cheapPool = await prisma.game.findMany({
    where: { isFree: false, priceKrw: { gt: 0, lt: 20000 } },
    orderBy: { steamReviewTotal: 'desc' },
    take: 40,
    select: sel,
  });
  const cheap = cheapPool
    .map((g) => toCard(g, now))
    .filter((g) => g.finalKrw > 0 && g.finalKrw < 10000)
    .slice(0, 10);

  return {
    hero,
    featured,
    deals: deals.slice(0, 12),
    spotlights,
    tabs: [
      { key: 'new', label: '인기 신규 출시 게임', games: newest.map((g) => toCard(g, now)).slice(0, 10) },
      { key: 'top', label: '최고 인기 게임', games: top.slice(0, 10) },
      { key: 'soon', label: '인기 출시 예정 게임', games: upcoming.map((g) => toCard(g, now)).slice(0, 10) },
      { key: 'deal', label: '특별 할인', games: deals.slice(0, 10) },
      { key: 'free', label: '주목받는 무료 게임', games: freeGames.map((g) => toCard(g, now)).slice(0, 10) },
    ],
    categories,
    cheap,
    stats: { games: await prisma.game.count(), discounts: deals.length },
  };
}

// ---------------------------------------------------------------
// /api/game/:slug
// ---------------------------------------------------------------

async function buildDetail(slug: string) {
  const now = new Date();
  const g = await prisma.game.findUnique({
    where: { slug },
    select: {
      ...cardArgs(now),
      description: true,
      shortDesc: true,
      requiredAge: true,
      metacritic: true,
      supportsWindows: true,
      supportsMac: true,
      supportsLinux: true,
      reqWindows: true,
      steamAppId: true,
      reviewCount: true,
      reviews: {
        take: 5,
        orderBy: { helpfulCount: 'desc' },
        select: {
          isRecommended: true,
          content: true,
          playtimeMinutes: true,
          helpfulCount: true,
          createdAt: true,
          user: { select: { nickname: true, avatarUrl: true } },
        },
      },
      _count: { select: { dlcs: true, reviews: true } },
    },
  });
  if (!g) return null;

  const card = toCard(g, now);
  return {
    ...card,
    shortDesc: g.shortDesc,
    description: g.description,
    requiredAge: g.requiredAge,
    metacritic: g.metacritic,
    platforms: {
      windows: g.supportsWindows,
      mac: g.supportsMac,
      linux: g.supportsLinux,
    },
    reqWindows: g.reqWindows,
    steamAppId: g.steamAppId,
    dlcCount: g._count.dlcs,
    reviews: g.reviews.map((r) => ({
      nickname: r.user.nickname,
      avatarUrl: r.user.avatarUrl,
      isRecommended: r.isRecommended,
      content: r.content,
      playtimeHours: Math.round(r.playtimeMinutes / 60),
      helpfulCount: r.helpfulCount,
      createdAt: r.createdAt,
    })),
    reviewCountLocal: g._count.reviews,
  };
}

// ---------------------------------------------------------------
// /api/search
// ---------------------------------------------------------------

async function search(q: string) {
  const now = new Date();
  if (!q.trim()) return [];
  const rows = await prisma.game.findMany({
    where: { name: { contains: q.trim(), mode: 'insensitive' } },
    orderBy: { steamReviewTotal: 'desc' },
    take: 12,
    select: cardArgs(now),
  });
  return rows.map((g) => toCard(g, now));
}

// ---------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------

function json(res: ServerResponse, data: unknown, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

// 홈 응답은 짧게 캐시한다. 새로고침마다 10여 개 쿼리를 다시 칠 이유가 없다.
let homeCache: { at: number; data: unknown } | null = null;
const HOME_TTL_MS = 30_000;

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const p = url.pathname;

  if (p === '/api/home') {
    if (!homeCache || Date.now() - homeCache.at > HOME_TTL_MS) {
      homeCache = { at: Date.now(), data: await buildHome() };
    }
    return json(res, homeCache.data);
  }

  if (p.startsWith('/api/game/')) {
    const slug = decodeURIComponent(p.slice('/api/game/'.length));
    const game = await buildDetail(slug);
    return game ? json(res, game) : json(res, { error: 'not found' }, 404);
  }

  if (p === '/api/search') {
    return json(res, await search(url.searchParams.get('q') ?? ''));
  }

  // public/ 정적 파일. 디렉터리 밖으로 나가는 경로는 거른다.
  const rel = p === '/' ? 'index.html' : p.slice(1);
  const file = path.resolve(PUBLIC_DIR, rel);
  const type = MIME[path.extname(file)];

  if (type && file.startsWith(PUBLIC_DIR + path.sep)) {
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
      return res.end(body);
    } catch {
      /* 아래 404로 */
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404');
}

createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(`${req.method} ${req.url}`, err);
    if (!res.headersSent) json(res, { error: String(err?.message ?? err) }, 500);
    else res.end();
  });
}).listen(PORT, () => {
  console.log(`Steam 상점 클론: http://localhost:${PORT}`);
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
