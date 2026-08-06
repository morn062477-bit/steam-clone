"use client";

/**
 * 찜 목록 페이지. 로그인한 사용자만 접근한다 (page.tsx 라우팅에서 걸러줌).
 * 각 줄: 썸네일 · 이름 · 가격 · 장바구니에 담기 · 찜 목록에서 제거.
 */

const won = (n: number) => "₩ " + Number(n).toLocaleString("ko-KR");

function bgStyle(url?: string | null) {
  return url ? { backgroundImage: `url('${url}')` } : undefined;
}

export default function WishlistPage({
  wishlist,
  cart,
  onBack,
  onOpenGame,
  onRemove,
  onAddToCart,
}: {
  wishlist: any[];
  cart: any[];
  onBack: () => void;
  onOpenGame: (slug: string) => void;
  onRemove: (slug: string) => void;
  onAddToCart: (slug: string) => void;
}) {
  const cartSlugs = new Set(cart.map((g: any) => g.slug));

  return (
    <div className="wishpage">
      <div className="wrap">
        <div className="cp-crumb">
          <a href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>홈</a>
          <span>&gt;</span>
          <span className="cur">찜 목록</span>
        </div>

        <h1 className="cp-title">찜 목록({wishlist.length}개)</h1>

        {wishlist.length === 0 ? (
          <div className="cp-empty">
            <p>찜한 게임이 없습니다.</p>
            <a className="btn-blue" href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>상점 둘러보기</a>
          </div>
        ) : (
          <div className="wish-list">
            {wishlist.map((g: any) => (
              <div className="wish-row" key={g.slug}>
                <div className="cp-thumb" style={bgStyle(g.headerImage)} onClick={() => onOpenGame(g.slug)} />
                <div className="cp-info">
                  <div className="cp-name" onClick={() => onOpenGame(g.slug)}>{g.name}</div>
                  <a
                    className="cp-remove"
                    href="#"
                    onClick={(e) => { e.preventDefault(); onRemove(g.slug); }}
                  >
                    찜 목록에서 제거
                  </a>
                </div>
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
