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

RDS 접속 정보가 없으면(개인 개발 환경) `embedded-postgres`로 로컬 DB를 새로 띄우면 된다.
자격 증명이 필요 없고, 리포에 커밋된 `seed/games.json`만으로 완결된다.

```bash
pnpm install                             # 리포 루트에서
cp apps/api/.env.example apps/api/.env   # 기본값(local DB, PORT=4000)이면 그대로 둬도 됨

pnpm --filter api db:start               # 로컬 postgres 기동 (그대로 켜둘 것. Ctrl+C로 종료)
```

새 터미널을 열어서:

```bash
pnpm --filter api db:push                # 스키마 반영 (최초 1회, Prisma Client도 같이 생성됨)
pnpm --filter api db:seed                # seed/games.json 적재 (최초 1회)
pnpm --filter api dev                    # http://localhost:4000
```

`apps/web`(Next.js) 프론트를 같이 보려면 또 새 터미널에서:

```bash
pnpm --filter web dev                    # http://localhost:3000, /api/*는 4000으로 프록시됨
```

DB 데이터(`apps/api/pgdata/`)는 로컬에 영속 저장되고 `.gitignore`에 걸려 있어서,
다음부터는 `db:push`/`db:seed`를 다시 돌릴 필요 없이 `pnpm --filter api db:start`만 켜면 된다.

RDS를 쓰는 경우엔 `.env`의 RDS 줄 주석을 풀고 실제 값을 채운 뒤, `db:start` 없이 바로
`db:push` → `db:seed` → `dev`를 실행하면 된다.

스크립트들은 모두 `apps/api` 기준 상대경로를 쓴다. 직접 실행할 땐 `cd apps/api` 후 `pnpm tsx ...`.

`seed/games.json`은 리포에 포함돼 있으므로 `fetch-steam.ts`를 다시 돌릴 필요는 없다.
Storefront API는 비공식 API이고 5분당 200요청 제한이 있으니 재수집은 피할 것.

## API

| 엔드포인트 | 설명 |
|---|---|
| `GET /api/home` | 첫 화면 전 섹션 (히어로 · 특집 · 할인 · 스포트라이트 · 탭 · 카테고리 · 저가) |
| `GET /api/game/:slug` | 게임 상세 (스크린샷 · 설명 · 태그 · 리뷰 · 시스템 요구사항) |
| `GET /api/search?q=` | 이름 검색 |
| `POST /api/auth/signup` | 회원가입 1단계: 이메일만 받아 인증 메일 발송 |
| `GET /api/auth/verify?token=` | 이메일의 인증 링크. 브라우저가 직접 열며, 프론트가 호출할 일은 없음 |
| `GET /api/auth/signup-status?id=` | 인증 완료 여부 폴링 |
| `POST /api/auth/complete-signup` | 회원가입 2단계: 계정 이름/비밀번호 입력 → `User` 생성 |

`/api/home` 응답은 서버에서 30초 캐시한다.

## 회원가입 / 이메일 인증 (BE 2)

실제 스팀 가입 플로우와 동일하게 **이메일 인증이 끝나기 전엔 `User`가 생성되지 않는다.**
`PendingSignup`(24시간 TTL)에 이메일 → 인증 → 계정 이름/비밀번호 순서로 정보가 채워지다가,
2단계가 끝나야 비로소 `User`로 승격되고 `PendingSignup` 행은 삭제된다.

**프론트 연동 순서:**

1. **`POST /api/auth/signup`**
   요청: `{ "email": string }`
   성공(201): `{ "ok": true, "signupId": string, "email": string, "message": string }`
   실패: `{ "error": string }` — 400(형식 오류) / 409(이미 가입된 이메일)
   → 같은 이메일로 다시 호출하면 재전송(같은 `signupId` 유지, 토큰/만료시각만 갱신)

2. 프론트는 받은 `signupId`로 **`GET /api/auth/signup-status?id={signupId}`** 를 2초 간격 정도로 폴링
   응답: `{ "email": string, "verified": boolean }`
   사용자가 메일의 인증 링크(`GET /api/auth/verify?token=`)를 클릭하면 서버가 `PendingSignup.verifiedAt`을
   기록하고, 다음 폴링부터 `verified: true`가 내려온다. 이 시점에 프론트는 계정 이름/비밀번호 입력 단계로 넘어가면 됨.

3. **`POST /api/auth/complete-signup`**
   요청: `{ "signupId": string, "nickname": string, "password": string }`
   (닉네임 2~20자, 비밀번호 8자 이상. `signupId`가 아직 미인증 상태면 400)
   성공(201): `{ "ok": true, "email": string, "nickname": string }` — 이 시점에 `User`가 실제로 생성됨
   실패: `{ "error": string }` — 400(미인증/유효성) / 404(잘못된 signupId) / 409(닉네임 중복)

메일 발송은 Gmail SMTP(무료, `lib/mailer.ts`)를 쓴다. `.env`에 `GMAIL_USER`/`GMAIL_APP_PASSWORD`가
없으면 실제 발송 대신 서버 콘솔에 인증 링크를 그대로 찍으므로, 팀원 로컬에 Gmail 계정이 없어도
콘솔에서 링크를 복사해 테스트할 수 있다. 앱 비밀번호는 https://myaccount.google.com/apppasswords
에서 발급(2단계 인증 필요, 비용 없음) — **직접 타이핑하는 값이 아니라 저 페이지가 생성해주는 값을
그대로 복사해야 한다.**

## 가격 규칙

- 모든 가격은 **원 단위 정수**. `Float` 사용 금지.
- 할인가는 저장하지 않는다. 활성 `Discount.percent`로 **서버에서만** 계산해 내려준다.
- 최종가는 10원 단위 반올림.
