"use client";

import { useMemo, useState } from "react";

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

export default function SalePage({
  data,
  bg,
  onOpenGame,
  onTag,
}: {
  data: any;
  bg: string;
  onOpenGame: (slug: string) => void;
  onTag: (tag: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("특집");
  const [more, setMore] = useState(false);
  const [q, setQ] = useState("");
  const [genre, setGenre] = useState<string | null>(null);

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
  const recommend = all.slice(0, 3);

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
      {/* 전면 배너 */}
      <div className="sp-takeover" style={bgStyle(bg)} />

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
            {/* 맞춤 추천 */}
            <section className="sp-panel">
              <h2 className="sp-h2">맞춤 추천</h2>
              <div className="sp-rec">
                {recommend.map((g) => (
                  <div key={g.slug} className="sp-rec-card" onClick={() => onOpenGame(g.slug)}>
                    <div className="art" style={bgStyle(g.headerImage)} />
                    <div className="sp-rec-info">
                      <div className="nm">{g.name}</div>
                      <Price g={g} />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 포인트 상점 배너 */}
            <section className="sp-points">
              <div className="sp-points-box">
                새로운 포인트 상점 아이템을<br />확인해 보세요
              </div>
              <span className="sp-points-icon" aria-hidden="true">🛰️</span>
            </section>

            {/* 인기 게임 */}
            <section className="sp-panel">
              <h2 className="sp-h2">인기 게임</h2>
              <div className="sp-grid">
                {popular.map((g) => (
                  <div key={g.slug} className="sp-cap" onClick={() => onOpenGame(g.slug)}>
                    <div className="art" style={bgStyle(g.headerImage)} />
                    <Price g={g} />
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
    </div>
  );
}
