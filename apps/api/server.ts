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
 *   GET /api/category/:slug 카테고리(장르) 전용 페이지
 *   GET /api/deals          할인 및 이벤트 전용 페이지 (전체 할인 게임)
 *   GET /api/price-search?max= 가격대별 검색 (최종가 max 이하)
 *   POST /api/login        로그인 (계정 이름 또는 이메일 + 비밀번호)
 *   POST /api/logout       로그아웃 (세션 폐기)
 *   GET  /api/cart          내 장바구니 (로그인 필요)
 *   POST /api/cart          장바구니에 추가 { slug } (로그인 필요)
 *   DELETE /api/cart/:slug  장바구니에서 제거 (로그인 필요)
 *   POST /api/cart/merge    로그인 전 로컬 장바구니 병합 { slugs: string[] } (로그인 필요)
 *   POST /api/checkout/prepare   장바구니로 PENDING 주문 생성, 포트원 결제창에 넘길 값 반환 (로그인 필요)
 *   POST /api/checkout/complete  { orderId } 포트원 결제 검증 후 주문 확정 + 라이브러리 반영 (로그인 필요)
 *   GET  /api/wishlist          내 찜 목록 (로그인 필요)
 *   POST /api/wishlist          찜 목록에 추가 { slug } (로그인 필요)
 *   POST /api/wishlist/reorder  찜 목록 순서 저장 { slugs: string[] } (로그인 필요)
 *   DELETE /api/wishlist/:slug  찜 목록에서 제거 (로그인 필요)
 *   POST /api/review/:id/vote   평가에 반응 { kind: HELPFUL|NOT_HELPFUL|FUNNY|AWARD } (로그인 필요)
 *                               같은 걸 다시 누르면 취소. 네/아니요는 서로 배타적.
 *
 * 가격 규칙(schema.prisma 주석과 동일)
 *   - 할인가는 저장하지 않는다. 활성 Discount.percent로 서버에서만 계산한다.
 *   - 원 단위 정수. 10원 단위로 반올림한다.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { startSignup, verifyEmail, getSignupStatus, completeSignup, AuthError } from './lib/auth.js';
import { login, logout, getSessionUser, SESSION_COOKIE, parseCookies, serializeCookie } from './lib/session.js';

// ---------------------------------------------------------------
// .env 로드 (dotenv 미설치라 직접 파싱)
// ---------------------------------------------------------------

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')));

for (const line of readFileSync(path.join(ROOT, '.env'), 'utf-8').split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?(.*?)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const prisma = new PrismaClient();
const PORT = Number(process.env.PORT ?? 3000);
// 인증 메일의 링크가 가리킬 주소. apps/web 이 /api/* 를 이 서버로 프록시하므로
// 기본값은 web 쪽 origin(3000)으로 둔다.
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3000';

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
  libraryImage: true,
  previewVideoUrl: true,
  supportsWindows: true,
  supportsMac: true,
  supportsLinux: true,
  shortDesc: true,
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
    libraryImage: g.libraryImage,
    // 카드/호버 패널의 플랫폼 아이콘, 축제 페이지의 STEAM DECK 탭 필터에 쓴다
    platforms: {
      windows: g.supportsWindows,
      mac: g.supportsMac,
      linux: g.supportsLinux,
    },
    shortDesc: g.shortDesc,
    previewVideoUrl: g.previewVideoUrl,
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

const reviewCardSelect = {
  id: true,
  isRecommended: true,
  content: true,
  playtimeMinutes: true,
  helpfulCount: true,
  createdAt: true,
  user: { select: { nickname: true, avatarUrl: true } },
  votes: { select: { kind: true, userId: true } },
} as const;

/**
 * @param viewerId 로그인한 사용자. 내가 어떤 반응을 눌러 뒀는지(myVotes) 채우는 데만 쓴다.
 *
 * helpfulCount 는 시드로 들어온 값이라 실제 투표와 별개다.
 * 화면에 보이는 수는 "시드값 + 실제 HELPFUL 투표 수"로 합쳐서 준다.
 * 유쾌(FUNNY)는 시드에 없어서 투표 수만 센다.
 */
function toReviewDto(r: any, viewerId?: string | null) {
  const votes = r.votes ?? [];
  const count = (kind: string) => votes.filter((v: any) => v.kind === kind).length;

  return {
    id: r.id,
    nickname: r.user.nickname,
    avatarUrl: r.user.avatarUrl,
    isRecommended: r.isRecommended,
    content: r.content,
    playtimeHours: Math.round(r.playtimeMinutes / 60),
    helpfulCount: (r.helpfulCount ?? 0) + count('HELPFUL'),
    funnyCount: count('FUNNY'),
    awardCount: count('AWARD'),
    myVotes: viewerId ? votes.filter((v: any) => v.userId === viewerId).map((v: any) => v.kind) : [],
    createdAt: r.createdAt,
  };
}

/**
 * 평가에 반응을 남긴다. 이미 같은 걸 눌렀으면 취소(토글)한다.
 * 네/아니요는 서로 배타적이라 한쪽을 켜면 반대쪽은 지운다.
 */
const REVIEW_VOTE_KINDS = ['HELPFUL', 'NOT_HELPFUL', 'FUNNY', 'AWARD'] as const;
type ReviewVoteKindStr = (typeof REVIEW_VOTE_KINDS)[number];

async function voteReview(userId: string, reviewId: string, kind: ReviewVoteKindStr) {
  const review = await prisma.review.findUnique({ where: { id: reviewId }, select: { id: true } });
  if (!review) throw new AuthError(404, '평가를 찾을 수 없습니다.');

  const mine = await prisma.reviewVote.findFirst({ where: { userId, reviewId, kind } });
  if (mine) {
    await prisma.reviewVote.delete({ where: { id: mine.id } });
  } else {
    // 네 ↔ 아니요는 하나만 남긴다
    const opposite =
      kind === 'HELPFUL' ? 'NOT_HELPFUL' : kind === 'NOT_HELPFUL' ? 'HELPFUL' : null;
    if (opposite) {
      await prisma.reviewVote.deleteMany({ where: { userId, reviewId, kind: opposite as any } });
    }
    await prisma.reviewVote.create({ data: { userId, reviewId, kind: kind as any } });
  }

  const updated = await prisma.review.findUnique({
    where: { id: reviewId },
    select: reviewCardSelect,
  });
  return toReviewDto(updated, userId);
}

/** @param viewerId 로그인한 사용자. 평가마다 내가 누른 반응(myVotes)을 채우는 데 쓴다 */
async function buildDetail(slug: string, viewerId?: string | null) {
  const now = new Date();
  const g = await prisma.game.findUnique({
    where: { slug },
    select: {
      ...cardArgs(now),
      description: true,
      shortDesc: true,
      detailVideoUrl: true,
      requiredAge: true,
      metacritic: true,
      supportsWindows: true,
      supportsMac: true,
      supportsLinux: true,
      reqWindows: true,
      steamAppId: true,
      reviewCount: true,
      // 날짜/플레이시간 필터를 프론트에서 걸려면 5개로는 부족해 넉넉히 받아온다.
      reviews: {
        take: 30,
        orderBy: { helpfulCount: 'desc' },
        select: reviewCardSelect,
      },
      _count: { select: { dlcs: true, reviews: true } },
    },
  });
  if (!g) return null;

  const recentReviews = await prisma.review.findMany({
    where: { game: { slug } },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: reviewCardSelect,
  });

  // 비슷한 게임: 같은 장르 태그를 가장 많이 공유하는 다른 게임 순.
  // DLC 관계 데이터가 없어서(수집한 DLC appid가 우리 DB 게임과 매칭 안 됨) 장르 겹침으로 대신한다.
  const genreLinks = await prisma.gameTag.findMany({
    where: { gameId: g.id, tag: { kind: 'GENRE' } },
    select: { tagId: true },
  });
  const genreTagIds = genreLinks.map((t) => t.tagId);

  let similarGames: ReturnType<typeof toCard>[] = [];
  if (genreTagIds.length) {
    const overlap = await prisma.gameTag.groupBy({
      by: ['gameId'],
      where: { tagId: { in: genreTagIds }, gameId: { not: g.id } },
      _count: { tagId: true },
      orderBy: { _count: { tagId: 'desc' } },
      take: 12,
    });
    const orderedIds = overlap.map((o) => o.gameId);
    if (orderedIds.length) {
      const rows = await prisma.game.findMany({
        where: { id: { in: orderedIds } },
        select: cardArgs(now),
      });
      const rank = new Map(orderedIds.map((id, i) => [id, i]));
      rows.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
      similarGames = rows.map((r) => toCard(r, now));
    }
  }

  const card = toCard(g, now);
  return {
    ...card,
    shortDesc: g.shortDesc,
    description: g.description,
    detailVideoUrl: g.detailVideoUrl,
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
    // map 에 함수만 넘기면 두 번째 인자로 인덱스가 들어가므로 명시적으로 감싼다
    reviews: g.reviews.map((r) => toReviewDto(r, viewerId)),
    recentReviews: recentReviews.map((r) => toReviewDto(r, viewerId)),
    reviewCountLocal: g._count.reviews,
    similarGames,
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
// /api/price-search?max= — 가격대별 검색 (할인 적용 최종가 기준)
// ---------------------------------------------------------------

async function buildPriceSearch(max: number) {
  const now = new Date();
  const rows = await prisma.game.findMany({
    where: { isFree: false, priceKrw: { gt: 0 } },
    orderBy: { steamReviewTotal: 'desc' },
    select: cardArgs(now),
  });
  // priceKrw(정가)로 미리 거르면 할인폭이 큰 게임(정가는 높지만 할인가는 낮은)을 놓친다.
  // 그래서 일단 다 받아와 finalKrw(최종가) 기준으로 거른다.
  const games = rows.map((g) => toCard(g, now)).filter((g) => g.finalKrw > 0 && g.finalKrw <= max);
  return { max, games };
}

// ---------------------------------------------------------------
// /api/category/:slug — 카테고리(장르) 전용 페이지
// ---------------------------------------------------------------

async function buildCategory(slug: string) {
  const now = new Date();
  const tag = await prisma.tag.findUnique({ where: { slug } });
  if (!tag) return null;

  const rows = await prisma.game.findMany({
    where: { tags: { some: { tagId: tag.id } } },
    orderBy: { steamReviewTotal: 'desc' },
    take: 40,
    select: cardArgs(now),
  });
  const games = rows.map((g) => toCard(g, now));

  // 서브 탭: 이 카테고리 게임들에 이 태그 다음으로 많이 같이 붙는 태그 상위 9개
  const subTagCount = new Map<string, number>();
  for (const g of games) {
    for (const t of g.tags) {
      if (t === tag.name) continue;
      subTagCount.set(t, (subTagCount.get(t) ?? 0) + 1);
    }
  }
  const subTags = [...subTagCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 9)
    .map(([name]) => name);

  return {
    name: tag.name,
    slug: tag.slug,
    hero: games.slice(0, 8),
    subTags,
    popular: games,
  };
}

// ---------------------------------------------------------------
// /api/deals — 할인 및 이벤트 전용 페이지 (홈 화면은 12개로 잘라서 주므로 별도 조회)
// ---------------------------------------------------------------

async function buildDeals() {
  const now = new Date();
  const rows = await prisma.game.findMany({
    where: { discounts: { some: activeDiscountWhere(now) }, priceKrw: { gt: 0 } },
    orderBy: { steamReviewTotal: 'desc' },
    select: cardArgs(now),
  });
  const deals = rows.map((g) => toCard(g, now)).sort((a, b) => b.discountPercent - a.discountPercent);
  return { deals };
}

// ---------------------------------------------------------------
// /api/cart (BE 2 담당)
// ---------------------------------------------------------------

async function getCart(userId: string) {
  const now = new Date();
  const items = await prisma.cartItem.findMany({
    where: { userId },
    orderBy: { addedAt: 'desc' },
    select: { addedAt: true, game: { select: cardArgs(now) } },
  });
  return items.map((i) => ({ ...toCard(i.game, now), addedAt: i.addedAt }));
}

async function findGameIdBySlug(slug: string) {
  const game = await prisma.game.findUnique({ where: { slug }, select: { id: true } });
  if (!game) throw new AuthError(404, '게임을 찾을 수 없습니다.');
  return game.id;
}

async function addToCart(userId: string, slug: string) {
  const gameId = await findGameIdBySlug(slug);
  await prisma.cartItem.upsert({
    where: { userId_gameId: { userId, gameId } },
    create: { userId, gameId },
    update: {},
  });
  return getCart(userId);
}

async function removeFromCart(userId: string, slug: string) {
  const gameId = await findGameIdBySlug(slug);
  await prisma.cartItem.deleteMany({ where: { userId, gameId } });
  return getCart(userId);
}

/** 로그인 전 로컬(게스트)에 담아둔 슬러그들을 로그인 계정 카트로 옮긴다. 없는 슬러그는 조용히 무시. */
async function mergeCart(userId: string, slugs: string[]) {
  const clean = [...new Set(slugs.filter((s) => typeof s === 'string' && s.trim()))];
  if (clean.length === 0) return getCart(userId);

  const games = await prisma.game.findMany({ where: { slug: { in: clean } }, select: { id: true } });
  await Promise.all(
    games.map((g) =>
      prisma.cartItem.upsert({
        where: { userId_gameId: { userId, gameId: g.id } },
        create: { userId, gameId: g.id },
        update: {},
      }),
    ),
  );
  return getCart(userId);
}

// ---------------------------------------------------------------
// /api/checkout — 포트원(PortOne) V2 결제
// ---------------------------------------------------------------

const PORTONE_API_BASE = 'https://api.portone.io';

/** 장바구니 스냅샷으로 PENDING 주문을 만든다. 결제창에 넘길 paymentId/금액/이름을 함께 돌려준다. */
async function prepareCheckout(userId: string) {
  const now = new Date();
  const items = await prisma.cartItem.findMany({
    where: { userId },
    select: { game: { select: cardArgs(now) } },
  });
  if (items.length === 0) throw new AuthError(400, '장바구니가 비어 있습니다.');

  const cards = items.map((i) => ({ id: i.game.id, ...toCard(i.game, now) }));
  const totalKrw = cards.reduce((sum, g) => sum + g.finalKrw, 0);
  const paymentId = 'pay_' + randomBytes(16).toString('hex');
  const orderName = cards.length === 1 ? cards[0].name : `${cards[0].name} 외 ${cards.length - 1}종`;

  const order = await prisma.order.create({
    data: {
      userId,
      totalKrw,
      status: 'PENDING',
      paymentId,
      items: {
        create: cards.map((g) => ({
          gameId: g.id,
          priceKrw: g.priceKrw,
          discountPercent: g.discountPercent,
          paidKrw: g.finalKrw,
        })),
      },
    },
  });

  return { orderId: order.id, paymentId, totalKrw, orderName };
}

/** 포트원 서버에 결제 상태/금액을 조회해 클라이언트가 보고한 값이 아니라 실제 값으로 검증한다. */
async function fetchPortOnePayment(paymentId: string) {
  const secret = process.env.PORTONE_API_SECRET;
  if (!secret) throw new AuthError(500, 'PORTONE_API_SECRET이 설정되어 있지 않습니다.');
  const res = await fetch(`${PORTONE_API_BASE}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `PortOne ${secret}` },
  });
  if (!res.ok) throw new AuthError(502, '포트원 결제 조회에 실패했습니다.');
  return res.json() as Promise<{ status: string; amount?: { total?: number } }>;
}

async function completeCheckout(userId: string, orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order || order.userId !== userId) throw new AuthError(404, '주문을 찾을 수 없습니다.');
  if (order.status !== 'PENDING') throw new AuthError(409, '이미 처리된 주문입니다.');
  if (!order.paymentId) throw new AuthError(400, '결제 정보가 없는 주문입니다.');

  const payment = await fetchPortOnePayment(order.paymentId);
  const paid = payment.status === 'PAID' && payment.amount?.total === order.totalKrw;

  if (!paid) {
    await prisma.order.update({ where: { id: order.id }, data: { status: 'FAILED' } });
    throw new AuthError(402, '결제가 확인되지 않았습니다.');
  }

  const gameIds = order.items.map((i) => i.gameId);
  await prisma.$transaction([
    prisma.order.update({ where: { id: order.id }, data: { status: 'PAID' } }),
    ...gameIds.map((gameId) =>
      prisma.libraryItem.upsert({
        where: { userId_gameId: { userId, gameId } },
        create: { userId, gameId },
        update: {},
      }),
    ),
    prisma.cartItem.deleteMany({ where: { userId, gameId: { in: gameIds } } }),
  ]);

  return { orderId: order.id, status: 'PAID' as const };
}

// ---------------------------------------------------------------
// /api/library — 결제로 보유하게 된 게임 목록. 로그인한 사용자만.
// ---------------------------------------------------------------

async function getLibrary(userId: string) {
  const now = new Date();
  const rows = await prisma.libraryItem.findMany({
    where: { userId },
    orderBy: { ownedAt: 'desc' },
    select: { ownedAt: true, game: { select: cardArgs(now) } },
  });

  // 같은 게임을 얼마에 샀는지는 주문 내역에서 가져온다.
  const paid = await prisma.orderItem.findMany({
    where: { order: { userId, status: 'PAID' } },
    select: { gameId: true, paidKrw: true, order: { select: { createdAt: true } } },
  });
  const paidBy = new Map(paid.map((i) => [i.gameId, i]));

  return rows.map((r) => {
    const card = toCard(r.game, now);
    const bought = paidBy.get((r.game as any).id);
    return {
      ...card,
      ownedAt: r.ownedAt,
      paidKrw: bought?.paidKrw ?? null,
      purchasedAt: bought?.order.createdAt ?? r.ownedAt,
    };
  });
}

// ---------------------------------------------------------------
// /api/wishlist (BE 2 담당) — 로그인한 사용자만. 게스트/병합 없음.
// ---------------------------------------------------------------

async function getWishlist(userId: string) {
  const now = new Date();
  const items = await prisma.wishlistItem.findMany({
    where: { userId },
    orderBy: [{ priority: 'asc' }, { addedAt: 'desc' }],
    select: { addedAt: true, game: { select: cardArgs(now) } },
  });
  return items.map((i) => ({ ...toCard(i.game, now), addedAt: i.addedAt }));
}

/** 드래그로 바꾼 순서를 저장한다. slugs 배열의 순서대로 priority(0부터)를 매긴다. */
async function reorderWishlist(userId: string, slugs: string[]) {
  const games = await prisma.game.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } });
  const idBySlug = new Map(games.map((g) => [g.slug, g.id]));
  await Promise.all(
    slugs.map((slug, i) => {
      const gameId = idBySlug.get(slug);
      if (!gameId) return Promise.resolve();
      return prisma.wishlistItem.updateMany({ where: { userId, gameId }, data: { priority: i } });
    }),
  );
  return getWishlist(userId);
}

async function addToWishlist(userId: string, slug: string) {
  const gameId = await findGameIdBySlug(slug);
  await prisma.wishlistItem.upsert({
    where: { userId_gameId: { userId, gameId } },
    create: { userId, gameId },
    update: {},
  });
  return getWishlist(userId);
}

async function removeFromWishlist(userId: string, slug: string) {
  const gameId = await findGameIdBySlug(slug);
  await prisma.wishlistItem.deleteMany({ where: { userId, gameId } });
  return getWishlist(userId);
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

function html(res: ServerResponse, body: string, status = 200) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf-8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new AuthError(400, '요청 본문이 올바른 JSON이 아닙니다.');
  }
}

/** 세션 쿠키로 로그인된 사용자를 찾는다. 없으면 401. */
async function requireUser(req: IncomingMessage) {
  const cookies = parseCookies(req.headers.cookie);
  const user = await getSessionUser(prisma, cookies[SESSION_COOKIE]);
  if (!user) throw new AuthError(401, '로그인이 필요합니다.');
  return user;
}

function verifyResultPage(tone: 'success' | 'error', headline: string, subMessage: string) {
  const subColor = tone === 'success' ? '#a4d007' : '#e3a13c';
  const title = tone === 'success' ? '인증 완료' : '인증 실패';
  return `<!doctype html><html lang="ko"><meta charset="utf-8">
<title>${title}</title>
<body style="margin:0;background:#1b2838;color:#c7d5e0;font-family:'Motiva Sans','Segoe UI','Malgun Gothic',Arial,sans-serif;">
  <header style="background:#171a21;height:104px;">
    <div style="max-width:940px;margin:0 auto;height:104px;display:flex;align-items:center;">
      <a href="${WEB_ORIGIN}" style="display:flex;align-items:center;gap:8px;margin-right:34px;text-decoration:none;">
        <svg width="38" height="38" viewBox="0 0 89.333 89.333" aria-hidden="true">
          <path fill="#c7d5e0" d="M44.238,0.601C21,0.601,1.963,18.519,0.154,41.29l23.71,9.803c2.009-1.374,4.436-2.179,7.047-2.179
            c0.234,0,0.467,0.008,0.698,0.021l10.544-15.283c0-0.073-0.001-0.144-0.001-0.216c0-9.199,7.483-16.683,16.683-16.683
            c9.199,0,16.682,7.484,16.682,16.683c0,9.199-7.483,16.684-16.682,16.684c-0.127,0-0.253-0.003-0.379-0.006l-15.038,10.73
            c0.008,0.195,0.015,0.394,0.015,0.592c0,6.906-5.617,12.522-12.522,12.522c-6.061,0-11.129-4.326-12.277-10.055L1.678,56.893
            c5.25,18.568,22.309,32.181,42.56,32.181c24.432,0,44.237-19.806,44.237-44.235C88.475,20.406,68.669,0.601,44.238,0.601"/>
          <path fill="#c7d5e0" d="M27.875,67.723l-5.434-2.245c0.963,2.005,2.629,3.684,4.841,4.606c4.782,1.992,10.295-0.277,12.288-5.063
            c0.965-2.314,0.971-4.869,0.014-7.189c-0.955-2.321-2.757-4.131-5.074-5.097c-2.299-0.957-4.762-0.922-6.926-0.105l5.613,2.321
            c3.527,1.47,5.195,5.52,3.725,9.047C35.455,67.526,31.402,69.194,27.875,67.723"/>
          <path fill="#c7d5e0" d="M69.95,33.436c0-6.129-4.986-11.116-11.116-11.116c-6.129,0-11.116,4.987-11.116,11.116
            c0,6.13,4.987,11.115,11.116,11.115C64.964,44.55,69.95,39.565,69.95,33.436 M50.502,33.417c0-4.612,3.739-8.35,8.351-8.35
            c4.612,0,8.351,3.738,8.351,8.35s-3.739,8.35-8.351,8.35C54.241,41.767,50.502,38.028,50.502,33.417"/>
        </svg>
        <span style="font-size:29px;letter-spacing:1px;color:#e8e8e8;">STEAM<sup style="font-size:9px;">®</sup></span>
      </a>
      <nav style="display:flex;gap:20px;padding-top:6px;">
        <a href="${WEB_ORIGIN}" style="font-size:15px;color:#66c0f4;text-decoration:none;">상점</a>
        <a href="#" style="font-size:15px;color:#b8b6b4;text-decoration:none;">커뮤니티</a>
        <a href="#" style="font-size:15px;color:#b8b6b4;text-decoration:none;">정보</a>
        <a href="#" style="font-size:15px;color:#b8b6b4;text-decoration:none;">지원</a>
      </nav>
      <div style="margin-left:auto;display:flex;align-items:center;gap:10px;font-size:12px;">
        <a href="#" style="background:linear-gradient(to bottom,#799905 5%,#536904 95%);color:#fff;
           padding:5px 12px;border-radius:2px;display:flex;align-items:center;gap:6px;text-decoration:none;">
          Steam 설치
        </a>
        <a href="${WEB_ORIGIN}#login" style="color:#b8b6b4;text-decoration:none;">로그인</a>
        <span style="color:#4c5966;">|</span>
        <a href="#" style="color:#b8b6b4;text-decoration:none;">언어 ▾</a>
      </div>
    </div>
  </header>
  <div style="background:linear-gradient(#1b2838,#0e1621);min-height:calc(100vh - 104px);padding:80px 24px;">
    <div style="max-width:940px;margin:0 auto;">
      <h1 style="font-size:34px;font-weight:400;color:#fff;margin:0 0 24px;">${headline}</h1>
      <p style="font-size:16px;color:${subColor};">${subMessage}</p>
    </div>
  </div>
</body></html>`;
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
    // 로그인 안 했어도 상세는 보여야 하므로 세션이 없으면 그냥 null 로 둔다
    const cookies = parseCookies(req.headers.cookie);
    const viewer = await getSessionUser(prisma, cookies[SESSION_COOKIE]).catch(() => null);
    const game = await buildDetail(slug, viewer?.id ?? null);
    return game ? json(res, game) : json(res, { error: 'not found' }, 404);
  }

  // 평가 반응: 네 / 아니요 / 유쾌 / 어워드. 같은 걸 다시 누르면 취소된다.
  if (p.startsWith('/api/review/') && p.endsWith('/vote') && req.method === 'POST') {
    try {
      const user = await requireUser(req);
      const reviewId = decodeURIComponent(p.slice('/api/review/'.length, -'/vote'.length));
      const body = await readJsonBody(req);
      if (!REVIEW_VOTE_KINDS.includes(body.kind)) {
        throw new AuthError(400, `kind 는 ${REVIEW_VOTE_KINDS.join(', ')} 중 하나여야 합니다.`);
      }
      return json(res, await voteReview(user.id, reviewId, body.kind));
    } catch (err) {
      if (err instanceof AuthError) return json(res, { error: err.message }, err.status);
      throw err;
    }
  }

  if (p === '/api/search') {
    return json(res, await search(url.searchParams.get('q') ?? ''));
  }

  if (p.startsWith('/api/category/') && req.method === 'GET') {
    const slug = decodeURIComponent(p.slice('/api/category/'.length));
    const result = await buildCategory(slug);
    return result ? json(res, result) : json(res, { error: 'not found' }, 404);
  }

  if (p === '/api/deals' && req.method === 'GET') {
    return json(res, await buildDeals());
  }

  if (p === '/api/price-search' && req.method === 'GET') {
    const max = Number(url.searchParams.get('max') ?? '10000');
    return json(res, await buildPriceSearch(Number.isFinite(max) && max > 0 ? max : 10000));
  }

  if (p === '/api/auth/signup' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const result = await startSignup(prisma, WEB_ORIGIN, body);
      return json(res, { ok: true, message: '인증 메일을 발송했습니다. 메일함을 확인해 주세요.', ...result }, 201);
    } catch (err) {
      if (err instanceof AuthError) return json(res, { error: err.message }, err.status);
      throw err;
    }
  }

  if (p === '/api/auth/verify' && req.method === 'GET') {
    try {
      await verifyEmail(prisma, url.searchParams.get('token') ?? '');
      return html(res, verifyResultPage('success', '이메일 인증이 완료되었습니다', '원래 탭으로 돌아가 계정 만들기를 마저 진행해 주세요.'));
    } catch (err) {
      if (err instanceof AuthError) return html(res, verifyResultPage('error', '이메일 주소를 인증할 수 없습니다', err.message), err.status);
      throw err;
    }
  }

  if (p === '/api/auth/signup-status' && req.method === 'GET') {
    try {
      const result = await getSignupStatus(prisma, url.searchParams.get('id') ?? '');
      return json(res, result);
    } catch (err) {
      if (err instanceof AuthError) return json(res, { error: err.message }, err.status);
      throw err;
    }
  }

  if (p === '/api/auth/complete-signup' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const result = await completeSignup(prisma, body);
      return json(res, { ok: true, ...result }, 201);
    } catch (err) {
      if (err instanceof AuthError) return json(res, { error: err.message }, err.status);
      throw err;
    }
  }

  if (p === '/api/login' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const result = await login(prisma, body);
      res.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE, result.token, result.maxAgeSec));
      return json(res, result.user);
    } catch (err) {
      if (err instanceof AuthError) return json(res, { error: err.message }, err.status);
      throw err;
    }
  }

  if (p === '/api/logout' && req.method === 'POST') {
    const cookies = parseCookies(req.headers.cookie);
    await logout(prisma, cookies[SESSION_COOKIE]);
    res.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE, '', 0));
    return json(res, { ok: true });
  }

  if (p === '/api/cart' && req.method === 'GET') {
    try {
      const user = await requireUser(req);
      return json(res, await getCart(user.id));
    } catch (err) {
      if (err instanceof AuthError) return json(res, { error: err.message }, err.status);
      throw err;
    }
  }

  if (p === '/api/cart' && req.method === 'POST') {
    try {
      const user = await requireUser(req);
      const body = await readJsonBody(req);
      if (!body.slug) throw new AuthError(400, 'slug가 필요합니다.');
      return json(res, await addToCart(user.id, body.slug), 201);
    } catch (err) {
      if (err instanceof AuthError) return json(res, { error: err.message }, err.status);
      throw err;
    }
  }

  if (p.startsWith('/api/cart/') && p !== '/api/cart/merge' && req.method === 'DELETE') {
    try {
      const user = await requireUser(req);
      const slug = decodeURIComponent(p.slice('/api/cart/'.length));
      return json(res, await removeFromCart(user.id, slug));
    } catch (err) {
      if (err instanceof AuthError) return json(res, { error: err.message }, err.status);
      throw err;
    }
  }

  if (p === '/api/cart/merge' && req.method === 'POST') {
    try {
      const user = await requireUser(req);
      const body = await readJsonBody(req);
      const slugs = Array.isArray(body.slugs) ? body.slugs : [];
      return json(res, await mergeCart(user.id, slugs));
    } catch (err) {
      if (err instanceof AuthError) return json(res, { error: err.message }, err.status);
      throw err;
    }
  }

  if (p === '/api/checkout/prepare' && req.method === 'POST') {
    try {
      const user = await requireUser(req);
      return json(res, await prepareCheckout(user.id), 201);
    } catch (err) {
      if (err instanceof AuthError) return json(res, { error: err.message }, err.status);
      throw err;
    }
  }

  if (p === '/api/checkout/complete' && req.method === 'POST') {
    try {
      const user = await requireUser(req);
      const body = await readJsonBody(req);
      if (!body.orderId) throw new AuthError(400, 'orderId가 필요합니다.');
      return json(res, await completeCheckout(user.id, body.orderId));
    } catch (err) {
      if (err instanceof AuthError) return json(res, { error: err.message }, err.status);
      throw err;
    }
  }

  if (p === '/api/library' && req.method === 'GET') {
    try {
      const user = await requireUser(req);
      return json(res, await getLibrary(user.id));
    } catch (err) {
      if (err instanceof AuthError) return json(res, { error: err.message }, err.status);
      throw err;
    }
  }

  if (p === '/api/wishlist' && req.method === 'GET') {
    try {
      const user = await requireUser(req);
      return json(res, await getWishlist(user.id));
    } catch (err) {
      if (err instanceof AuthError) return json(res, { error: err.message }, err.status);
      throw err;
    }
  }

  if (p === '/api/wishlist' && req.method === 'POST') {
    try {
      const user = await requireUser(req);
      const body = await readJsonBody(req);
      if (!body.slug) throw new AuthError(400, 'slug가 필요합니다.');
      return json(res, await addToWishlist(user.id, body.slug), 201);
    } catch (err) {
      if (err instanceof AuthError) return json(res, { error: err.message }, err.status);
      throw err;
    }
  }

  if (p === '/api/wishlist/reorder' && req.method === 'POST') {
    try {
      const user = await requireUser(req);
      const body = await readJsonBody(req);
      if (!Array.isArray(body.slugs)) throw new AuthError(400, 'slugs 배열이 필요합니다.');
      return json(res, await reorderWishlist(user.id, body.slugs));
    } catch (err) {
      if (err instanceof AuthError) return json(res, { error: err.message }, err.status);
      throw err;
    }
  }

  if (p.startsWith('/api/wishlist/') && req.method === 'DELETE') {
    try {
      const user = await requireUser(req);
      const slug = decodeURIComponent(p.slice('/api/wishlist/'.length));
      return json(res, await removeFromWishlist(user.id, slug));
    } catch (err) {
      if (err instanceof AuthError) return json(res, { error: err.message }, err.status);
      throw err;
    }
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
