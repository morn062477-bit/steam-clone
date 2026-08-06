/**
 * apps/api/scripts/fetch-movies.ts
 *
 * 이미 만들어진 seed/games.json에 트레일러 영상(movies) URL을 덧붙인다.
 * Steam이 appdetails에서 더 이상 mp4/webm 직접 링크를 주지 않고
 * DASH/HLS 스트림만 준다. HLS(m3u8)는 hls.js로 어디서나 재생 가능해
 * movies[0].hls_h264를 trailerUrl로 저장한다.
 *
 * 실행: pnpm tsx scripts/fetch-movies.ts
 *
 * 주의
 * - fetch-steam.ts와 같은 5분/200요청 제한을 공유한다.
 * - games.json을 새로 긁지 않는다. 기존 항목에 필드만 추가하고 덮어쓴다.
 * - 중단되어도 .movies-checkpoint.json에서 이어서 받는다.
 */

import { writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const CC = 'kr';
const LANG = 'koreana';
const DELAY_MS = 1_800;
const OUT_DIR = path.resolve('seed');
const GAMES_FILE = path.join(OUT_DIR, 'games.json');
const CHECKPOINT = path.join(OUT_DIR, '.movies-checkpoint.json');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface MovieInfo {
  /** HLS(m3u8) 스트림. hls.js로 재생한다. 호버용/상세용 모두 같은 어댑티브 스트림을 쓴다 */
  previewVideoUrl: string | null;
  detailVideoUrl: string | null;
  trailerThumb: string | null;
}

const EMPTY: MovieInfo = { previewVideoUrl: null, detailVideoUrl: null, trailerThumb: null };

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

async function fetchMovie(appId: number): Promise<MovieInfo> {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=${CC}&l=${LANG}`;
  const json = await fetchJson(url);
  const d = json?.[String(appId)]?.data;
  const movie = d?.movies?.[0];
  if (!movie) return EMPTY;

  const hls = movie.hls_h264 ?? null;
  return {
    previewVideoUrl: hls,
    detailVideoUrl: hls,
    trailerThumb: movie.thumbnail ?? null,
  };
}

async function main() {
  if (!existsSync(GAMES_FILE)) {
    throw new Error(`${GAMES_FILE} 없음. fetch-steam.ts를 먼저 실행하세요.`);
  }

  const games: any[] = JSON.parse(await readFile(GAMES_FILE, 'utf-8'));

  let cache: Record<string, MovieInfo> = {};
  if (existsSync(CHECKPOINT)) {
    cache = JSON.parse(await readFile(CHECKPOINT, 'utf-8'));
    console.log(`체크포인트 발견: ${Object.keys(cache).length}개 이미 수집됨`);
  }

  const todo = games.filter((g) => !cache[String(g.steamAppId)]);
  console.log(`대상 ${todo.length}개. 예상 소요 ${Math.ceil((todo.length * DELAY_MS) / 60000)}분\n`);

  for (const [i, g] of todo.entries()) {
    const tag = `[${i + 1}/${todo.length}] ${g.name}`;
    try {
      const info = await fetchMovie(g.steamAppId);
      cache[String(g.steamAppId)] = info;
      console.log(`${tag} — ${info.previewVideoUrl ? '영상 있음' : '영상 없음'}`);
    } catch (err) {
      console.error(`${tag} 실패:`, (err as Error).message);
      cache[String(g.steamAppId)] = EMPTY;
    }

    if (i % 10 === 0) {
      await writeFile(CHECKPOINT, JSON.stringify(cache), 'utf-8');
    }
    await sleep(DELAY_MS);
  }

  const merged = games.map((g) => ({
    ...g,
    ...(cache[String(g.steamAppId)] ?? EMPTY),
  }));

  await writeFile(GAMES_FILE, JSON.stringify(merged, null, 2), 'utf-8');
  await writeFile(CHECKPOINT, JSON.stringify(cache), 'utf-8');

  const withMovie = merged.filter((g) => g.previewVideoUrl).length;
  console.log(`\n완료: ${merged.length}개 -> ${GAMES_FILE}`);
  console.log(`  영상 보유 ${withMovie}개`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
