"use client";

/**
 * 장바구니 페이지. 실제 Steam 장바구니(store.steampowered.com/cart) 구성을 따른다.
 *
 *   빵부스러기 → 제목 → 상품 목록(썸네일·이름·가격·제거) → 쇼핑/결제 계속하기
 *   → 우측 예상 합계 박스
 *
 * 결제는 이 프로젝트 범위 밖이라 "결제 계속하기" 버튼은 눌러도 아무 일도 안 한다
 * (다른 장식용 버튼들과 같은 패턴 - onClick={(e) => e.preventDefault()}).
 */

const won = (n: number) => "₩ " + Number(n).toLocaleString("ko-KR");

function bgStyle(url?: string | null) {
  return url ? { backgroundImage: `url('${url}')` } : undefined;
}

export default function CartPage({
  cart,
  onBack,
  onRemove,
  onOpenGame,
}: {
  cart: any[];
  onBack: () => void;
  onRemove: (slug: string) => void;
  onOpenGame: (slug: string) => void;
}) {
  const total = cart.reduce((sum, g) => sum + (g.finalKrw ?? 0), 0);

  return (
    <div className="cartpage">
      <div className="wrap">
        <div className="cp-crumb">
          <a href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>홈</a>
          <span>&gt;</span>
          <span className="cur">장바구니({cart.length}개 제품)</span>
        </div>

        <h1 className="cp-title">장바구니({cart.length}개 제품)</h1>

        {cart.length === 0 ? (
          <div className="cp-empty">
            <p>장바구니가 비어 있습니다.</p>
            <a className="btn-blue" href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>쇼핑 계속하기</a>
          </div>
        ) : (
          <div className="cp-body">
            <div className="cp-main">
              {cart.map((g: any) => (
                <div className="cp-row" key={g.slug}>
                  <div className="cp-thumb" style={bgStyle(g.headerImage)} onClick={() => onOpenGame(g.slug)} />
                  <div className="cp-info">
                    <div className="cp-name" onClick={() => onOpenGame(g.slug)}>{g.name}</div>
                    <a
                      className="cp-remove"
                      href="#"
                      onClick={(e) => { e.preventDefault(); onRemove(g.slug); }}
                    >
                      제거
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
                </div>
              ))}

              <div className="cp-actions">
                <a className="btn-blue-outline" href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>쇼핑 계속하기</a>
                <a className="btn-blue" href="#" onClick={(e) => e.preventDefault()}>결제 계속하기</a>
              </div>
            </div>

            <aside className="cp-side">
              <div className="cp-summary">
                <div className="cp-summary-row">
                  <span>예상 합계</span>
                  <b>{won(total)}</b>
                </div>
                <p className="cp-summary-note">해당되는 지역의 경우 계산 시 판매세가 부과됩니다.</p>
                <a className="btn-blue cp-checkout" href="#" onClick={(e) => e.preventDefault()}>결제 계속하기</a>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
