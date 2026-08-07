"use client";

import { useMemo, useState } from "react";

/**
 * 찜 목록 페이지. 로그인한 사용자만 접근한다 (page.tsx 라우팅에서 걸러줌).
 * 실제 Steam 찜 목록 페이지처럼 큰 캡슐 이미지 + 태그 + 평가가 보이는 목록형 UI.
 */

const won = (n: number) => "₩ " + Number(n).toLocaleString("ko-KR");

function ymd(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

function bgStyle(url?: string | null) {
  return url ? { backgroundImage: `url('${url}')` } : undefined;
}

const SORTS = [
  { key: "rank", label: "순위" },
  { key: "recent", label: "최근 찜한 순" },
  { key: "name", label: "이름순" },
  { key: "priceAsc", label: "가격 낮은 순" },
  { key: "priceDesc", label: "가격 높은 순" },
] as const;

export default function WishlistPage({
  wishlist,
  cart,
  user,
  onBack,
  onOpenGame,
  onRemove,
  onAddToCart,
  onReorder,
}: {
  wishlist: any[];
  cart: any[];
  user: { nickname: string; avatarUrl: string | null } | null;
  onBack: () => void;
  onOpenGame: (slug: string) => void;
  onRemove: (slug: string) => void;
  onAddToCart: (slug: string) => void;
  onReorder: (slugs: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<(typeof SORTS)[number]["key"]>("rank");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const cartSlugs = new Set(cart.map((g: any) => g.slug));
  // 검색/다른 정렬이 걸려 있으면 화면 순서와 실제 저장 순서가 어긋나므로, "순위" 정렬 + 검색어 없을 때만 드래그를 허용한다.
  const canDrag = sort === "rank" && !q.trim();

  const shown = useMemo(() => {
    let rows = wishlist;
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      rows = rows.filter(
        (g: any) =>
          g.name.toLowerCase().includes(needle) ||
          (g.tags ?? []).some((t: string) => t.toLowerCase().includes(needle)) ||
          (g.shortDesc ?? "").toLowerCase().includes(needle),
      );
    }
    rows = [...rows];
    if (sort === "name") rows.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "priceAsc") rows.sort((a, b) => a.finalKrw - b.finalKrw);
    else if (sort === "priceDesc") rows.sort((a, b) => b.finalKrw - a.finalKrw);
    else if (sort === "recent") rows.sort((a, b) => +new Date(b.addedAt) - +new Date(a.addedAt));
    // "rank"(순위)는 서버가 내려준 기본 순서(찜한 최신순) 그대로 둔다.
    return rows;
  }, [wishlist, q, sort]);

  function handleDrop(dropIndex: number) {
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const reordered = [...shown];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    setDragIndex(null);
    setOverIndex(null);
    onReorder(reordered.map((g: any) => g.slug));
  }

  return (
    <div className="wishpage">
      <div className="wrap">
        <div className="cp-crumb">
          <a href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>홈</a>
          <span>&gt;</span>
          <span className="cur">찜 목록</span>
        </div>

        <div className="wl-header">
          <div className="wl-avatar">
            {user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span>?</span>}
          </div>
          <h1 className="cp-title">{user?.nickname ?? "게스트"} 님의 찜 목록</h1>
        </div>

        {wishlist.length === 0 ? (
          <div className="cp-empty">
            <p>찜한 게임이 없습니다.</p>
            <a className="btn-blue" href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>상점 둘러보기</a>
          </div>
        ) : (
          <>
            <div className="wl-toolbar">
              <input
                type="text"
                className="wl-search"
                placeholder="이름, 태그 또는 설명으로 검색"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <label className="wl-sort">
                정렬 기준:
                <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                  {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </label>
            </div>

            <div className="wl-count">제품 {shown.length}개</div>

            <div className="wl-list">
              {shown.map((g: any, i: number) => (
                <div
                  className={"wl-row" + (dragIndex === i ? " dragging" : "") + (overIndex === i ? " drag-over" : "")}
                  key={g.slug}
                  draggable={canDrag}
                  onDragStart={() => setDragIndex(i)}
                  onDragOver={(e) => { if (canDrag) { e.preventDefault(); setOverIndex(i); } }}
                  onDragLeave={() => setOverIndex((v) => (v === i ? null : v))}
                  onDrop={(e) => { e.preventDefault(); handleDrop(i); }}
                  onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
                >
                  <div className={"wl-rank" + (canDrag ? " draggable" : "")}>
                    <span className="wl-drag" aria-hidden="true">☰</span>
                    <b>{i + 1}</b>
                  </div>

                  <div className="wl-thumb" style={bgStyle(g.headerImage)} onClick={() => onOpenGame(g.slug)} />

                  <div className="wl-main">
                    <h3 className="wl-title" onClick={() => onOpenGame(g.slug)}>{g.name}</h3>

                    <div className="wl-meta">
                      출시일: {ymd(g.releaseDate)}
                      {g.reviewDesc && (
                        <>
                          <span className="wl-dot">·</span>
                          평가: {g.reviewDesc}
                        </>
                      )}
                    </div>

                    {g.tags?.length > 0 && (
                      <div className="wl-tags">
                        <span className="wl-tags-label">사용자 태그:</span>
                        {g.tags.slice(0, 5).map((t: string) => <span key={t} className="pill">{t}</span>)}
                      </div>
                    )}
                  </div>

                  <div className="wl-buy">
                    <div className="wl-added">
                      찜한 날짜: {ymd(g.addedAt)}
                      <a
                        className="wl-remove"
                        href="#"
                        onClick={(e) => { e.preventDefault(); onRemove(g.slug); }}
                      >
                        ✕ 삭제
                      </a>
                    </div>
                    <div className="wl-buy-row">
                      {g.discountPercent > 0 ? (
                        <div className="wl-price">
                          <span className="cp-disc">-{g.discountPercent}%</span>
                          <span className="cp-was">{won(g.priceKrw)}</span>
                          <span className="cp-now">{won(g.finalKrw)}</span>
                        </div>
                      ) : g.isFree ? (
                        <div className="wl-price"><span className="cp-now">무료 플레이</span></div>
                      ) : (
                        <div className="wl-price"><span className="cp-now">{won(g.priceKrw)}</span></div>
                      )}
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
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
