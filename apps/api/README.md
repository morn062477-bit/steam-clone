# apps/api

Steam 상점 클론의 백엔드 + 데이터 파이프라인.
Steam Storefront API에서 수집한 게임 데이터를 PostgreSQL(AWS RDS)에 넣고, 상점 화면에 내려준다.

## 구성

| 경로 | 역할 |
|---|---|
| `prisma/schema.prisma` | DB 스키마 (게임 / 태그 / 할인 / 사용자 / 주문) |
| `prisma/seed.ts` | `seed/games.json` → DB 적재 |
| `scripts/fetch-steam.ts` | Steam Storefront API 수집 → `seed/games.json` |
| `scripts/enrich-steam.ts` | 리뷰 집계 · 시스템 요구사항 등 보강 |
| `scripts/list-games.ts` | 터미널에서 게임 목록 확인 (읽기 전용) |
| `server.ts` | 상점 API 서버 (node:http + Prisma) |
| `public/index.html` | 상점 첫 화면. `/api/home` 으로 DB 데이터를 받아 렌더 |
| `seed/games.json` | 수집 결과 94종. 재수집 불필요 |

## 실행

```bash
pnpm install                             # 리포 루트에서
cp apps/api/.env.example apps/api/.env   # DATABASE_URL 채우기

pnpm --filter api db:push                # 스키마 반영
pnpm --filter api db:seed                # seed/games.json 적재
pnpm --filter api dev                    # http://localhost:3000
```

스크립트들은 모두 `apps/api` 기준 상대경로를 쓴다. 직접 실행할 땐 `cd apps/api` 후 `pnpm tsx ...`.

`seed/games.json`은 리포에 포함돼 있으므로 `fetch-steam.ts`를 다시 돌릴 필요는 없다.
Storefront API는 비공식 API이고 5분당 200요청 제한이 있으니 재수집은 피할 것.

## API

| 엔드포인트 | 설명 |
|---|---|
| `GET /api/home` | 첫 화면 전 섹션 (히어로 · 특집 · 할인 · 스포트라이트 · 탭 · 카테고리 · 저가) |
| `GET /api/game/:slug` | 게임 상세 (스크린샷 · 설명 · 태그 · 리뷰 · 시스템 요구사항) |
| `GET /api/search?q=` | 이름 검색 |

`/api/home` 응답은 서버에서 30초 캐시한다.

## 가격 규칙

- 모든 가격은 **원 단위 정수**. `Float` 사용 금지.
- 할인가는 저장하지 않는다. 활성 `Discount.percent`로 **서버에서만** 계산해 내려준다.
- 최종가는 10원 단위 반올림.
