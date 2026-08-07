"use client";

/**
 * 찜 목록 페이지. 로그인한 사용자만 접근한다 (page.tsx 라우팅에서 걸러줌).
 * 실제 Steam 찜 목록(store.steampowered.com/wishlist) 레이아웃을 따른다.
 *
 * 실제로 동작하는 것: 검색(이름/태그), 정렬(순위·이름·가격·출시일·찜한 날짜), 제거, 장바구니 담기.
 * 시각적으로만 있는 것(백엔드에 대응 기능이 없음): 드래그 정렬, 카테고리 태그, 설정/공유 버튼.
 * "앞서 해보기" 배지는 우리 DB에 얼리 액세스 여부 데이터가 없어서 넣지 않았다.
 */

import { useMemo, useState } from "react";

const won = (n: number) => "₩ " + Number(n).toLocaleString("ko-KR");

function dotDate(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

function bgStyle(url?: string | null) {
  return url ? { backgroundImage: `url('${url}')` } : undefined;
}

type SortKey = "rank" | "name" | "price" | "release" | "added";

const SORT_LABEL: Record<SortKey, string> = {
  rank: "순위",
  name: "이름",
  price: "가격",
  release: "출시일",
  added: "찜한 날짜",
};

export default function WishlistPage({
  wishlist,
  cart,
  userName,
  onBack,
  onOpenGame,
  onRemove,
  onAddToCart,
}: {
  wishlist: any[];
  cart: any[];
  userName?: string;
  onBack: () => void;
  onOpenGame: (slug: string) => void;
  onRemove: (slug: string) => void;
  onAddToCart: (slug: string) => void;
}) {
  const cartSlugs = new Set(cart.map((g: any) => g.slug));
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("rank");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = !q
      ? wishlist
      : wishlist.filter((g: any) =>
          g.name?.toLowerCase().includes(q) || (g.tags ?? []).some((t: string) => t.toLowerCase().includes(q)),
        );
    if (sort === "rank") return filtered;
    const sorted = [...filtered];
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    else if (sort === "price") sorted.sort((a, b) => (a.finalKrw ?? 0) - (b.finalKrw ?? 0));
    else if (sort === "release") sorted.sort((a, b) => new Date(b.releaseDate ?? 0).getTime() - new Date(a.releaseDate ?? 0).getTime());
    else if (sort === "added") sorted.sort((a, b) => new Date(b.addedAt ?? 0).getTime() - new Date(a.addedAt ?? 0).getTime());
    return sorted;
  }, [wishlist, query, sort]);

  return (
    <div className="wishpage">
      <div className="wrap">
        <div className="cp-crumb">
          <a href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>홈</a>
          <span>&gt;</span>
          <span className="cur">찜 목록</span>
        </div>

        <div className="wish-head">
          <div className="wish-head-icon">?</div>
          <h1 className="wish-head-title">{userName ? `${userName} 님의 찜 목록` : "찜 목록"}</h1>
        </div>

        {wishlist.length === 0 ? (
          <div className="cp-empty">
            <p>찜한 게임이 없습니다.</p>
            <a className="btn-blue" href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>상점 둘러보기</a>
          </div>
        ) : (
          <>
            <div className="wish-toolbar">
              <input
                className="wish-search"
                placeholder="이름, 태그 또는 설명으로 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button type="button" className="wish-tool-btn" title="준비 중인 기능입니다" disabled>설정 ▾</button>
              <div className="wish-sortbox">
                <span>정렬 기준:</span>
                <select className="wish-sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                  {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                    <option key={k} value={k}>{SORT_LABEL[k]}</option>
                  ))}
                </select>
              </div>
              <button type="button" className="wish-tool-btn wish-share-btn" title="준비 중인 기능입니다" disabled>🔗</button>
            </div>

            <div className="wish-count">제품 {shown.length}개</div>

            <div className="wish-list">
              {shown.map((g: any, i: number) => (
                <div className="wish-row" key={g.slug}>
                  <div className="wish-drag" title="정렬은 준비 중인 기능입니다">☰</div>
                  <div className="wish-rank">{i + 1}</div>
                  <div className="cp-thumb" style={bgStyle(g.headerImage)} onClick={() => onOpenGame(g.slug)} />

                  <div className="wish-info">
                    <div className="wish-toprow">
                      <div className="cp-name" onClick={() => onOpenGame(g.slug)}>{g.name}</div>
                      <div className="wish-added">찜한 날짜: {dotDate(g.addedAt)}</div>
                    </div>
                    <div className="wish-actions-row">
                      <a className="cp-remove" href="#" onClick={(e) => { e.preventDefault(); onRemove(g.slug); }}>
                        제거
                      </a>
                      <button type="button" className="wish-cat-btn" title="준비 중인 기능입니다" disabled>
                        카테고리: <span>+</span>
                      </button>
                    </div>
                    <div className="wish-meta">
                      출시일: {dotDate(g.releaseDate)}
                      {g.reviewDesc && (
                        <>
                          {" · "}평가: <span className={"wish-review" + ((g.reviewPercent ?? 0) >= 70 ? " positive" : "")}>{g.reviewDesc}</span>
                        </>
                      )}
                    </div>
                    {g.tags?.length > 0 && (
                      <div className="wish-tags">
                        <span className="wish-tags-label">사용자 태그:</span>
                        {g.tags.slice(0, 5).map((t: string) => <span key={t} className="pill">{t}</span>)}
                      </div>
                    )}
                  </div>

                  <div className="wish-side">
                    <div className="cp-price">
                      {g.discountPercent > 0 ? (
                        <>
                          <span className="cp-disc">-{g.discountPercent}%</span>
                          <span className="cp-was">{won(g.priceKrw)}</span>
                          <span className="cp-now">{won(g.finalKrw)}</span>
                        </>
                      ) : g.isFree ? (
                        <span className="cp-now">무료 플레이</span>
                      ) : (
                        <span className="cp-now">{won(g.priceKrw)}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      className={"wish-cart-btn" + (cartSlugs.has(g.slug) ? " on" : "")}
                      onClick={() => onAddToCart(g.slug)}
                      disabled={cartSlugs.has(g.slug)}
                    >
                      {cartSlugs.has(g.slug) ? "장바구니에 있음" : "장바구니에 담기"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
