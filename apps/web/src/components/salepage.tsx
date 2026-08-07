"use client";

import { useMemo, useState, type CSSProperties } from "react";
import SaleHoverCard, { type SaleHoverInfo } from "@/components/salehovercard";

/**
 * 사이버펑크 게임 축제 이벤트 페이지.
 *
 * 실제 Steam 의 축제 페이지 구성을 따른다.
 *   전면 배너 → 고정 탭 바 → 문구 → 맞춤 추천 → 포인트 상점 배너
 *   → 인기 게임 → 게임 검색(필터 + 목록) → 예정된 이벤트 및 뉴스
 *
 * 별도 API 없이 /api/home 으로 받은 데이터를 그대로 재료로 쓴다.
 * 페이지 배경은 실제 Steam 축제 페이지와 같은 이미지를 세로 반복으로 깐다(globals.css).
 */

const won = (n: number) => "₩ " + Number(n).toLocaleString("ko-KR");

function ymd(iso: string | null) {
  if (!iso) return "출시일 미정";
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function bgStyle(url?: string | null) {
  return url ? { backgroundImage: `url('${url}')` } : undefined;
}

function priceText(g: any) {
  if (g.isFree) return "무료 플레이";
  if (g.priceKrw <= 0) return g.comingSoon ? "출시 예정" : "가격 미정";
  return won(g.priceKrw);
}

/** 할인 뱃지 + 정가/판매가. 할인이 없으면 가격만 */
function Price({ g }: { g: any }) {
  if (g.discountPercent > 0) {
    return (
      <div className="sp-price">
        <span className="disc">-{g.discountPercent}%</span>
        <span className="pb-body">
          <span className="was">{won(g.priceKrw)}</span>
          <span className="now">{won(g.finalKrw)}</span>
        </span>
      </div>
    );
  }
  return (
    <div className="sp-price">
      <span className="pb-body"><span className="now">{priceText(g)}</span></span>
    </div>
  );
}

const TABS = ["특집", "게임 검색", "STEAM DECK", "무료 체험판", "출시 예정"] as const;
type Tab = (typeof TABS)[number];

/** 인기 게임 줄당 칸 수. 이 순서를 끝까지 돌려 쓴다 */
const GRID_PATTERN = [2, 3, 4, 3, 2, 3, 4];

/**
 * 목록을 GRID_PATTERN 대로 줄 단위로 자른다.
 * 마지막 줄이 덜 차도 cols 는 패턴 값 그대로 둔다.
 * 그래야 남은 카드가 늘어나지 않고 원래 크기로 왼쪽에 붙는다.
 */
function rowsByPattern<T>(items: T[]) {
  const rows: { cols: number; items: T[] }[] = [];
  let i = 0;
  while (i < items.length) {
    const cols = GRID_PATTERN[rows.length % GRID_PATTERN.length];
    rows.push({ cols, items: items.slice(i, i + cols) });
    i += cols;
  }
  return rows;
}

export default function SalePage({
  data,
  onOpenGame,
  onTag,
  wishedSlugs,
  onWish,
}: {
  data: any;
  onOpenGame: (slug: string) => void;
  onTag: (tag: string) => void;
  /** 찜한 게임 slug 집합. 호버 패널의 별 버튼 상태에 쓴다 */
  wishedSlugs?: Set<string>;
  onWish?: (slug: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("특집");
  const [more, setMore] = useState(false);
  const [q, setQ] = useState("");
  const [genre, setGenre] = useState<string | null>(null);
  const [recPage, setRecPage] = useState(0);
  const [hover, setHover] = useState<SaleHoverInfo>(null);

  /** 화면에 쓸 전체 게임 목록 (중복 제거) */
  const all: any[] = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    const rows: any[] = [];
    for (const g of [...data.deals, ...data.featured, ...data.cheap, ...data.tabs.flatMap((t: any) => t.games)]) {
      if (!g || seen.has(g.slug)) continue;
      seen.add(g.slug);
      rows.push(g);
    }
    return rows;
  }, [data]);

  /** 상위 장르별 개수 (게임 검색 왼쪽 필터) */
  const genreCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of all) for (const t of g.genres ?? []) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);

  if (!data) return <div className="loading">불러오는 중…</div>;

  const discounted = all.filter((g) => g.discountPercent > 0);
  const popular = more ? discounted : discounted.slice(0, 12);

  // 맞춤 추천은 3개씩 넘기는 캐러셀. 화살표로 페이지를 바꾸고 아래 막대가 위치를 보여준다.
  const REC_PER_PAGE = 3;
  const recPool = all.slice(0, 24);
  const recPages = Math.max(1, Math.ceil(recPool.length / REC_PER_PAGE));
  const page = Math.min(recPage, recPages - 1);
  const recommend = recPool.slice(page * REC_PER_PAGE, page * REC_PER_PAGE + REC_PER_PAGE);

  // 탭별로 목록을 바꾼다
  const byTab = (rows: any[]) => {
    if (tab === "무료 체험판") return rows.filter((g) => g.isFree);
    if (tab === "출시 예정") return rows.filter((g) => g.comingSoon);
    if (tab === "STEAM DECK") return rows.filter((g) => g.platforms?.linux ?? true);
    return rows;
  };

  const searchRows = byTab(all)
    .filter((g) => (genre ? (g.genres ?? []).includes(genre) : true))
    .filter((g) => (q.trim() ? g.name.toLowerCase().includes(q.trim().toLowerCase()) : true));

  const news = all.slice(0, 4);

  return (
    <div className="salepage">
      {/* 전면 배너. 로고 PNG 가 public/ 에 있으면 그 위에 얹는다. */}
      <div className="sp-takeover">
        {/* eslint-disable-next-line @next/next/no-img-element -- 정적 PNG 한 장 */}
        <img
          className="sp-logo"
          src="/sale-logo.png"
          alt="2026년 Steam 사이버펑크 게임 축제"
          width={940}
          height={460}
        />
      </div>

      {/* 고정 탭 바 */}
      <div className="sp-tabbar">
        <div className="sp-tabbar-in">
          {TABS.map((t) => (
            <button key={t} type="button" className={"sp-tab" + (t === tab ? " on" : "")} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="sp-quote">
        절대 뒤돌아보지 말라고 하죠. 사이버펑크는 언제나 미래를 살아가라고 합니다. 한번 생각해 보세요.
      </div>

      <div className="sp-body">
        {tab === "특집" && (
          <>
            {/* 맞춤 추천. 세로 카드 3장을 좌우 화살표로 넘기고, 아래 막대가 현재 위치를 보여준다. */}
            <section className="sp-panel sp-rec-panel">
              <h2 className="sp-h2">맞춤 추천</h2>
              <div className="sp-rec-wrap">
                <button
                  type="button"
                  className="sp-rec-arrow left"
                  aria-label="이전 추천"
                  disabled={page === 0}
                  onClick={() => setRecPage((p) => Math.max(0, p - 1))}
                >
                  ‹
                </button>

                <div className="sp-rec">
                  {recommend.map((g) => (
                    <div key={g.slug} className="sp-rec-card" onClick={() => onOpenGame(g.slug)}>
                      {/* 600x900 세로 이미지. 스팀이 안 주는 게임은 가로 헤더로 대체 */}
                      <div className="art" style={bgStyle(g.libraryImage || g.headerImage)} />
                      {/* 카드 아래쪽에 겹쳐 놓는 줄. 왼쪽 플랫폼 아이콘, 오른쪽 가격 */}
                      <div className="sp-rec-foot">
                        <div className="sp-plat">
                          {g.platforms?.windows && <span title="Windows">⊞</span>}
                          {g.platforms?.mac && <span title="macOS"></span>}
                          {g.platforms?.linux && <span title="Linux">🐧</span>}
                        </div>
                        <Price g={g} />
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="sp-rec-arrow right"
                  aria-label="다음 추천"
                  disabled={page >= recPages - 1}
                  onClick={() => setRecPage((p) => Math.min(recPages - 1, p + 1))}
                >
                  ›
                </button>
              </div>

              <div className="sp-rec-track">
                <div
                  className="sp-rec-thumb"
                  style={{ width: `${100 / recPages}%`, left: `${(100 / recPages) * page}%` }}
                />
              </div>
            </section>

            {/* 포인트 상점 배너. 문구/그림이 한 장에 다 들어 있는 PNG 를 그대로 얹는다. */}
            <section className="sp-panel sp-points">
              {/* eslint-disable-next-line @next/next/no-img-element -- 정적 PNG 한 장 */}
              <img
                className="sp-points-img"
                src="/sale-points.png"
                alt="새로운 포인트 상점 아이템을 확인해 보세요"
                width={1100}
                height={240}
              />
            </section>

            {/* 인기 게임 */}
            <section className="sp-panel">
              <h2 className="sp-h2">인기 게임</h2>
              {/* 줄마다 칸 수가 2-3-4-3-2-3-4 로 바뀐다. 칸이 적은 줄일수록 카드가 커진다 */}
              <div className="sp-grid">
                {rowsByPattern(popular).map((row, i) => (
                  <div
                    key={i}
                    className="sp-grid-row"
                    style={{ "--cols": row.cols } as CSSProperties}
                  >
                    {row.items.map((g) => (
                      <div
                        key={g.slug}
                        className="sp-cap"
                        onClick={() => onOpenGame(g.slug)}
                        onMouseEnter={(e) => setHover({ g, rect: e.currentTarget.getBoundingClientRect() })}
                        onMouseLeave={() => setHover((h) => (h?.g.slug === g.slug ? null : h))}
                      >
                        <div className="art" style={bgStyle(g.headerImage)} />
                        <Price g={g} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              {discounted.length > 12 && (
                <button className="sp-more" type="button" onClick={() => setMore((v) => !v)}>
                  {more ? "접기" : "더 보기"}
                </button>
              )}
            </section>
          </>
        )}

        {/* 게임 검색: 왼쪽 필터 + 목록. 다른 탭에서도 목록은 같은 모양으로 보여준다 */}
        <section className="sp-search">
          <aside className="sp-filter">
            <h3>필터</h3>
            <div className="sp-filter-count">{searchRows.length}개 일치</div>
            <input
              className="sp-filter-input"
              placeholder="태그 또는 옵션 검색"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="sp-filter-head">상위 장르</div>
            <div className="sp-filter-list">
              {genreCounts.map(([name, n]) => (
                <button
                  key={name}
                  type="button"
                  className={"sp-filter-row" + (genre === name ? " on" : "")}
                  onClick={() => setGenre(genre === name ? null : name)}
                >
                  <span>{name}</span>
                  <b>{n}</b>
                </button>
              ))}
            </div>
          </aside>

          <div className="sp-list">
            <h2 className="sp-h2">게임 검색</h2>
            {searchRows.length === 0 && <div className="sp-empty">조건에 맞는 게임이 없습니다.</div>}
            {searchRows.map((g) => (
              <div key={g.slug} className="sp-row" onClick={() => onOpenGame(g.slug)}>
                <div className="cap" style={bgStyle(g.headerImage)} />
                <div className="sp-row-info">
                  <div className="nm">{g.name}</div>
                  <div className="tags">
                    {(g.tags ?? []).slice(0, 5).map((t: string) => (
                      <span
                        key={t}
                        onClick={(e) => { e.stopPropagation(); onTag(t); }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <div className="date">{ymd(g.releaseDate)}</div>
                  <div className="rev">
                    {g.reviewDesc ?? "평가 없음"}
                    {g.reviewTotal ? ` (평가 ${g.reviewTotal.toLocaleString("ko-KR")}개)` : ""}
                  </div>
                </div>
                <Price g={g} />
              </div>
            ))}
          </div>
        </section>

        {/* 예정된 이벤트 및 뉴스 */}
        <section className="sp-panel">
          <div className="sp-news-head">
            <h2 className="sp-h2">예정된 이벤트 및 뉴스</h2>
            <button className="sp-allnews" type="button">모든 이벤트 보기</button>
          </div>
          <div className="sp-news">
            {news.map((g) => (
              <div key={g.slug} className="sp-news-card" onClick={() => onOpenGame(g.slug)}>
                <div className="art" style={bgStyle(g.headerImage)} />
                <div className="ttl">{g.name} 업데이트 소식</div>
                <div className="dt">{ymd(g.releaseDate)}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 인기 게임 카드 호버 패널. 격자에 잘리지 않게 페이지 최상단에 하나만 띄운다 */}
      <SaleHoverCard
        info={hover}
        wished={hover ? wishedSlugs?.has(hover.g.slug) : false}
        onWish={onWish}
        onOpenGame={onOpenGame}
      />
    </div>
  );
}
