/**
 * apps/api/scripts/fetch-library.ts
 *
 * 이미 만들어진 seed/games.json에 세로 대형 이미지(600x900)를 덧붙인다.
 *   - libraryImage: 라이브러리 캡슐. 축제 페이지 "맞춤 추천" 세로 카드용
 *
 * 실행: pnpm tsx scripts/fetch-library.ts
 *
 * 왜 appdetails가 아니라 IStoreBrowseService인가
 * - store.steampowered.com/api/appdetails 는 header/capsule만 주고 라이브러리
 *   캡슐은 주지 않는다. 자산 목록을 통째로 주는 쪽은 IStoreBrowseService/GetItems 다.
 * - 자산 경로에 해시가 들어가서 appid만으로 URL을 조립할 수 없다. 반드시 받아와야 한다.
 *
 * 요청량
 * - GetItems는 한 번에 여러 appid를 받는다. BATCH개씩 묶어 보내므로
 *   94개 기준 두어 번이면 끝난다. 체크포인트가 필요할 만큼 길지 않다.
 * - games.json을 새로 긁지 않는다. 기존 항목에 필드만 추가하고 덮어쓴다.
 */

import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const CC = 'KR';
const LANG = 'koreana';
const BATCH = 50;
const DELAY_MS = 1_500;
const GAMES_FILE = path.join(path.resolve('seed'), 'games.json');

/** 자산 경로 앞에 붙는 CDN 루트. asset_url_format이 이 뒤에 이어진다. */
const ASSET_ROOT = 'https://shared.akamai.steamstatic.com/store_item_assets/';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface StoreItem {
  appid?: number;
  success?: number;
  assets?: {
    /** 예: "steam/apps/4731120/${FILENAME}?t=1785927747" */
    asset_url_format?: string;
    library_capsule?: string;
    library_capsule_2x?: string;
  };
}

/** asset_url_format의 ${FILENAME}을 실제 파일명으로 바꿔 완성된 URL을 만든다 */
function assetUrl(format: string | undefined, filename: string | undefined) {
  if (!format || !filename) return null;
  return ASSET_ROOT + format.replace('${FILENAME}', filename);
}

async function getItems(appIds: number[]): Promise<Map<number, string>> {
  const input = {
    ids: appIds.map((appid) => ({ appid })),
    context: { language: LANG, country_code: CC, steam_realm: 1 },
    data_request: { include_assets: true },
  };
  const url =
    'https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=' +
    encodeURIComponent(JSON.stringify(input));

  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`GetItems ${res.status}`);

  const json = (await res.json()) as { response?: { store_items?: StoreItem[] } };
  const out = new Map<number, string>();
  for (const it of json.response?.store_items ?? []) {
    if (!it.appid || it.success !== 1) continue;
    // 2x(1200x1800)가 있으면 그쪽이 선명하다. 없으면 기본 600x900.
    const u =
      assetUrl(it.assets?.asset_url_format, it.assets?.library_capsule_2x) ??
      assetUrl(it.assets?.asset_url_format, it.assets?.library_capsule);
    if (u) out.set(it.appid, u);
  }
  return out;
}

async function main() {
  const games: any[] = JSON.parse(await readFile(GAMES_FILE, 'utf8'));
  const appIds = games.map((g) => g.steamAppId).filter((n): n is number => typeof n === 'number');
  console.log(`게임 ${games.length}개, appid ${appIds.length}개`);

  const found = new Map<number, string>();
  for (let i = 0; i < appIds.length; i += BATCH) {
    const chunk = appIds.slice(i, i + BATCH);
    try {
      const got = await getItems(chunk);
      for (const [k, v] of got) found.set(k, v);
      console.log(`  ${i + chunk.length}/${appIds.length} — 누적 ${found.size}개`);
    } catch (e) {
      console.error(`  ${i}~ 배치 실패:`, (e as Error).message);
    }
    if (i + BATCH < appIds.length) await sleep(DELAY_MS);
  }

  // 못 받은 게임은 필드를 null로 둔다. 화면 쪽에서 헤더 이미지로 대체한다.
  let filled = 0;
  for (const g of games) {
    const u = found.get(g.steamAppId) ?? null;
    g.libraryImage = u;
    if (u) filled++;
  }

  await writeFile(GAMES_FILE, JSON.stringify(games, null, 2) + '\n', 'utf8');
  console.log(`libraryImage 채움 ${filled}/${games.length} → ${GAMES_FILE}`);
}

main();
