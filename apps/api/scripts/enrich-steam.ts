/**
 * apps/api/scripts/enrich-steam.ts
 *
 * 이미 만들어진 seed/games.json에 아래 세 가지를 덧붙인다.
 *   - 유저 리뷰 점수/개수 (appreviews 엔드포인트)
 *   - 시스템 요구사항    (appdetails의 *_requirements)
 *   - DLC 목록           (appdetails의 dlc)
 *
 * 실행: pnpm tsx scripts/enrich-steam.ts
 *
 * 주의
 * - fetch-steam.ts와 같은 5분/200요청 제한을 공유한다. 게임당 요청이 2건이므로
 *   요청 하나마다 DELAY_MS를 둔다. 게임당이 아니라 요청당이다.
 * - games.json을 새로 긁지 않는다. 기존 항목에 필드만 추가하고 덮어쓴다.
 * - 중단되어도 .enrich-checkpoint.json에서 이어서 받는다.
 */

import { writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const CC = 'kr';
const LANG = 'koreana';
const DELAY_MS = 1_800;
const OUT_DIR = path.resolve('seed');
const GAMES_FILE = path.join(OUT_DIR, 'games.json');
const CHECKPOINT = path.join(OUT_DIR, '.enrich-checkpoint.json');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------
// 타입
// ---------------------------------------------------------------

/** 플랫폼별 최소/권장 사양. HTML을 걷어낸 평문. */
export interface SysReq {
  minimum: string | null;
  recommended: string | null;
}

export interface Enrichment {
  /** Steam 리뷰 점수 0~9. 리뷰가 너무 적으면 null */
  reviewScore: number | null;
  /** "매우 긍정적" 같은 한글 설명 */
  reviewScoreDesc: string | null;
  reviewCountTotal: number;
  reviewCountPositive: number;
  reviewCountNegative: number;
  /** 긍정 비율 0~100. 리뷰 0건이면 null */
  reviewPositivePercent: number | null;

  reqWindows: SysReq | null;
  reqMac: SysReq | null;
  reqLinux: SysReq | null;

  /** DLC의 steam appid 목록. 이름은 별도 조회가 필요해 받지 않는다 */
  dlcAppIds: number[];
  dlcCount: number;
}

// ---------------------------------------------------------------
// 유틸
// ---------------------------------------------------------------

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * Steam은 해당 플랫폼을 지원하지 않으면 requirements 자리에 빈 배열을 준다.
 * 객체일 때만 의미가 있다.
 */
function parseReq(raw: any): SysReq | null {
  if (!raw || Array.isArray(raw)) return null;
  const minimum = raw.minimum ? stripHtml(raw.minimum) : null;
  const recommended = raw.recommended ? stripHtml(raw.recommended) : null;
  if (!minimum && !recommended) return null;
  return { minimum, recommended };
}

async function fetchJson(url: string, attempt = 0): Promise<any> {
  const res = await fetch(url, { headers: { 'Accept-Language': 'ko-KR' } });

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
// 조회
// ---------------------------------------------------------------

/** appdetails에서 시스템 요구사항과 DLC만 뽑는다 */
async function fetchDetailBits(appId: number) {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=${CC}&l=${LANG}`;
  const json = await fetchJson(url);
  const d = json?.[String(appId)]?.data;
  if (!d) return null;

  const dlcAppIds: number[] = Array.isArray(d.dlc)
    ? d.dlc.filter((x: any) => typeof x === 'number')
    : [];

  return {
    reqWindows: parseReq(d.pc_requirements),
    reqMac: parseReq(d.mac_requirements),
    reqLinux: parseReq(d.linux_requirements),
    dlcAppIds,
    dlcCount: dlcAppIds.length,
  };
}

/**
 * 리뷰 요약. num_per_page=0으로 리뷰 본문은 받지 않고 집계만 가져온다.
 * language=all이라야 전체 리뷰 기준 점수가 나온다.
 */
async function fetchReviews(appId: number) {
  const url =
    `https://store.steampowered.com/appreviews/${appId}` +
    `?json=1&language=all&purchase_type=all&num_per_page=0&l=${LANG}`;
  const json = await fetchJson(url);
  const q = json?.query_summary;
  if (json?.success !== 1 || !q) return null;

  const positive = q.total_positive ?? 0;
  const negative = q.total_negative ?? 0;
  const total = q.total_reviews ?? positive + negative;

  return {
    reviewScore: typeof q.review_score === 'number' ? q.review_score : null,
    reviewScoreDesc: q.review_score_desc ?? null,
    reviewCountTotal: total,
    reviewCountPositive: positive,
    reviewCountNegative: negative,
    reviewPositivePercent: total > 0 ? Math.round((positive / total) * 100) : null,
  };
}

const EMPTY: Enrichment = {
  reviewScore: null,
  reviewScoreDesc: null,
  reviewCountTotal: 0,
  reviewCountPositive: 0,
  reviewCountNegative: 0,
  reviewPositivePercent: null,
  reqWindows: null,
  reqMac: null,
  reqLinux: null,
  dlcAppIds: [],
  dlcCount: 0,
};

// ---------------------------------------------------------------
// 메인
// ---------------------------------------------------------------

async function main() {
  if (!existsSync(GAMES_FILE)) {
    throw new Error(`${GAMES_FILE} 없음. fetch-steam.ts를 먼저 실행하세요.`);
  }

  const games: any[] = JSON.parse(await readFile(GAMES_FILE, 'utf-8'));

  // 이어받기: appid -> Enrichment
  let cache: Record<string, Enrichment> = {};
  if (existsSync(CHECKPOINT)) {
    cache = JSON.parse(await readFile(CHECKPOINT, 'utf-8'));
    console.log(`체크포인트 발견: ${Object.keys(cache).length}개 이미 보강됨`);
  }

  const todo = games.filter((g) => !cache[String(g.steamAppId)]);
  const reqCount = todo.length * 2;
  console.log(
    `대상 ${todo.length}개 (요청 ${reqCount}건). 예상 소요 ` +
      `${Math.ceil((reqCount * DELAY_MS) / 60000)}분\n`,
  );

  for (const [i, g] of todo.entries()) {
    const tag = `[${i + 1}/${todo.length}] ${g.name}`;
    try {
      const bits = await fetchDetailBits(g.steamAppId);
      await sleep(DELAY_MS); // 요청당 딜레이

      const reviews = await fetchReviews(g.steamAppId);

      cache[String(g.steamAppId)] = { ...EMPTY, ...bits, ...reviews };

      const r = reviews;
      const rTxt = r?.reviewCountTotal
        ? `리뷰 ${r.reviewCountTotal.toLocaleString()}건 ${r.reviewPositivePercent}% ${r.reviewScoreDesc ?? ''}`
        : '리뷰 없음';
      const sTxt = bits?.reqWindows ? '사양O' : '사양X';
      console.log(`${tag} — ${rTxt} / ${sTxt} / DLC ${bits?.dlcCount ?? 0}`);
    } catch (err) {
      console.error(`${tag} 실패:`, (err as Error).message);
    }

    if (i % 10 === 0) {
      await writeFile(CHECKPOINT, JSON.stringify(cache), 'utf-8');
    }
    await sleep(DELAY_MS);
  }

  // 원본 순서 유지하며 필드 병합
  const merged = games.map((g) => ({
    ...g,
    ...(cache[String(g.steamAppId)] ?? EMPTY),
  }));

  await writeFile(GAMES_FILE, JSON.stringify(merged, null, 2), 'utf-8');
  await writeFile(CHECKPOINT, JSON.stringify(cache), 'utf-8');

  const withReviews = merged.filter((g) => g.reviewCountTotal > 0).length;
  const withReq = merged.filter((g) => g.reqWindows).length;
  const withDlc = merged.filter((g) => g.dlcCount > 0).length;
  console.log(`\n완료: ${merged.length}개 -> ${GAMES_FILE}`);
  console.log(`  리뷰 ${withReviews}개 / 사양 ${withReq}개 / DLC보유 ${withDlc}개`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
