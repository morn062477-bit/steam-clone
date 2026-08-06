/**
 * apps/api/scripts/fetch-steam.ts
 *
 * Steam Storefront API에서 게임 데이터를 수집해 seed/games.json으로 저장한다.
 * 개발 초기에 한 번만 실행하고, 결과 JSON은 리포에 커밋한다.
 * 팀원들은 이 스크립트를 다시 돌릴 필요 없이 seed 파일만 쓰면 된다.
 *
 * 실행: pnpm tsx scripts/fetch-steam.ts
 *
 * 주의
 * - Storefront API는 Valve가 문서화하지 않은 비공식 API다. 언제든 바뀔 수 있다.
 * - 5분당 200요청 제한. DELAY_MS를 줄이지 말 것. 429를 맞으면 IP 단위로 한동안 막힌다.
 * - 중단되어도 checkpoint에서 이어서 받는다. 무한 재실행 금지.
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const CC = 'kr';
const LANG = 'koreana';
const DELAY_MS = 1_800;        // 5분/200요청 = 1.5초. 여유 두고 1.8초
const MAX_GAMES = 200;         // 시연에 이 정도면 충분
const OUT_DIR = path.resolve('seed');
const OUT_FILE = path.join(OUT_DIR, 'games.json');
const CHECKPOINT = path.join(OUT_DIR, '.checkpoint.json');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------
// 타입
// ---------------------------------------------------------------

export interface SeedGame {
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
}

// ---------------------------------------------------------------
// 유틸
// ---------------------------------------------------------------

function slugify(name: string, appId: number): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return base ? `${base}-${appId}` : `game-${appId}`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Steam은 KRW도 최소단위 x100으로 준다. (21,800원 -> 2180000)
 * 원 단위 정수로 변환.
 */
function toKrw(raw: number | undefined): number {
  if (!raw) return 0;
  return Math.round(raw / 100);
}

/** 429/네트워크 오류에 지수 백오프로 재시도 */
async function fetchJson(url: string, attempt = 0): Promise<any> {
  const res = await fetch(url, {
    headers: { 'Accept-Language': 'ko-KR' },
  });

  if (res.status === 429) {
    const wait = Math.min(60_000 * 2 ** attempt, 300_000);
    console.warn(`  429 rate limited. ${wait / 1000}초 대기 후 재시도`);
    await sleep(wait);
    if (attempt >= 3) throw new Error('rate limit 재시도 초과');
    return fetchJson(url, attempt + 1);
  }

  if (!res.ok) throw new Error(`HTTP ${res.status} - ${url}`);
  return res.json();
}

// ---------------------------------------------------------------
// 1단계: 수집 대상 appid 목록 만들기
// ---------------------------------------------------------------

async function collectAppIds(): Promise<number[]> {
  const ids = new Set<number>();

  // featuredcategories: 인기/신작/할인/출시예정을 한 번에 준다
  const url = `https://store.steampowered.com/api/featuredcategories?cc=${CC}&l=${LANG}`;
  const data = await fetchJson(url);

  for (const key of ['topsellers', 'new_releases', 'specials', 'coming_soon']) {
    for (const item of data?.[key]?.items ?? []) {
      if (typeof item.id === 'number') ids.add(item.id);
    }
  }

  // featured(대형 배너)도 추가
  const featured = await fetchJson(
    `https://store.steampowered.com/api/featured?cc=${CC}&l=${LANG}`,
  );
  for (const item of featured?.large_capsules ?? []) {
    if (typeof item.id === 'number') ids.add(item.id);
  }
  for (const item of featured?.featured_win ?? []) {
    if (typeof item.id === 'number') ids.add(item.id);
  }

  // 목록이 부족하면 잘 알려진 게임을 보강한다.
  // 상점 페이지에 장르가 골고루 보여야 화면이 그럴듯해진다.
  const fallback = [
    730, 570, 440, 578080, 1172470, 271590, 1085660, 1091500, 292030,
    1174180, 1245620, 632360, 105600, 413150, 322170, 646570, 588650,
    367520, 268910, 391540, 504230, 620, 400, 220, 1145360, 1794680,
    1966720, 2050650, 1817070, 1237970, 553850, 236390, 252490, 304930,
    381210, 739630, 892970, 1203220, 227300, 1222670, 1517290, 1938090,
  ];
  for (const id of fallback) ids.add(id);

  return [...ids].slice(0, MAX_GAMES);
}

// ---------------------------------------------------------------
// 2단계: appdetails 상세 조회
// ---------------------------------------------------------------

async function fetchGame(appId: number): Promise<SeedGame | null> {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=${CC}&l=${LANG}`;
  const json = await fetchJson(url);
  const entry = json?.[String(appId)];

  if (!entry?.success || !entry.data) return null;
  const d = entry.data;

  // DLC, 사운드트랙, 데모는 제외
  if (d.type !== 'game') return null;

  const price = d.price_overview;

  return {
    steamAppId: appId,
    slug: slugify(d.name, appId),
    name: d.name,
    shortDesc: stripHtml(d.short_description ?? '').slice(0, 300),
    description: stripHtml(d.detailed_description ?? '').slice(0, 4000),
    headerImage: d.header_image ?? '',
    capsuleImage: d.capsule_imagev5 ?? d.capsule_image ?? d.header_image ?? '',
    priceKrw: d.is_free ? 0 : toKrw(price?.initial),
    isFree: Boolean(d.is_free),
    discountPercent: price?.discount_percent ?? 0,
    releaseDate: d.release_date?.date || null,
    comingSoon: Boolean(d.release_date?.coming_soon),
    developer: d.developers?.[0] ?? 'Unknown',
    publisher: d.publishers?.[0] ?? 'Unknown',
    requiredAge: Number(d.required_age) || 0,
    metacritic: d.metacritic?.score ?? null,
    supportsWindows: Boolean(d.platforms?.windows),
    supportsMac: Boolean(d.platforms?.mac),
    supportsLinux: Boolean(d.platforms?.linux),
    genres: (d.genres ?? []).map((g: any) => g.description),
    categories: (d.categories ?? []).map((c: any) => c.description),
    screenshots: (d.screenshots ?? [])
      .slice(0, 6)
      .map((s: any) => ({ url: s.path_full, thumbUrl: s.path_thumbnail })),
  };
}

// ---------------------------------------------------------------
// 메인
// ---------------------------------------------------------------

async function main() {
  if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });

  // 이어받기
  let done: SeedGame[] = [];
  let doneIds = new Set<number>();
  if (existsSync(CHECKPOINT)) {
    done = JSON.parse(await readFile(CHECKPOINT, 'utf-8'));
    doneIds = new Set(done.map((g) => g.steamAppId));
    console.log(`체크포인트 발견: ${done.length}개 이미 수집됨`);
  }

  console.log('appid 목록 수집 중...');
  const appIds = (await collectAppIds()).filter((id) => !doneIds.has(id));
  console.log(`대상 ${appIds.length}개. 예상 소요 ${Math.ceil((appIds.length * DELAY_MS) / 60000)}분\n`);

  for (const [i, appId] of appIds.entries()) {
    try {
      const game = await fetchGame(appId);
      if (game) {
        done.push(game);
        console.log(`[${i + 1}/${appIds.length}] ${game.name}`);
      } else {
        console.log(`[${i + 1}/${appIds.length}] ${appId} 건너뜀 (게임 아님/미출시)`);
      }
    } catch (err) {
      console.error(`[${i + 1}/${appIds.length}] ${appId} 실패:`, (err as Error).message);
    }

    // 20개마다 체크포인트 저장
    if (i % 20 === 0) {
      await writeFile(CHECKPOINT, JSON.stringify(done), 'utf-8');
    }
    await sleep(DELAY_MS);
  }

  await writeFile(OUT_FILE, JSON.stringify(done, null, 2), 'utf-8');
  console.log(`\n완료: ${done.length}개 -> ${OUT_FILE}`);
  console.log('이 파일을 커밋하세요. 팀원은 pnpm db:seed 만 실행하면 됩니다.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
