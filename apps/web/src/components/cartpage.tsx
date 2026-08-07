"use client";

import { useState } from "react";

/**
 * 장바구니 페이지. 실제 Steam 장바구니(store.steampowered.com/cart) 구성을 따른다.
 *
 *   빵부스러기 → 제목
 *   왼쪽: 상품 목록(썸네일·이름·플랫폼·소장 방식·가격·추가/제거)
 *         → 쇼핑/결제 계속하기 + 모든 제품 제거 → 맞춤 추천
 *   오른쪽: 예상 합계 → 라이선스 안내 → 제작자 팔로우
 *
 * 결제는 포트원(PortOne) V2로 연동되어 있다. onCheckout은 page.tsx의 checkout()이다.
 * 실제 Steam 에는 없는 결제수단 선택은 우리 쪽 연동에 필요해서 합계 박스에 남겨 둔다.
 */

const won = (n: number) => "₩ " + Number(n).toLocaleString("ko-KR");

function bgStyle(url?: string | null) {
  return url ? { backgroundImage: `url('${url}')` } : undefined;
}

/** 카드/줄에 붙는 가격 표시. 할인이 있으면 뱃지 + 정가 취소선 */
function Price({ g }: { g: any }) {
  if (g.discountPercent > 0) {
    return (
      <div className="cp-price">
        <span className="cp-disc">-{g.discountPercent}%</span>
        <span className="cp-was">{won(g.priceKrw)}</span>
        <span className="cp-now">{won(g.finalKrw)}</span>
      </div>
    );
  }
  return (
    <div className="cp-price">
      <span className="cp-now">{g.isFree ? "무료 플레이" : won(g.priceKrw)}</span>
    </div>
  );
}

/** 오른쪽 안내 박스에 들어가는 그림. 외부 파일 없이 인라인 SVG 로 그린다 */
function LicenseArt() {
  return (
    <svg className="cp-art" viewBox="0 0 300 150" aria-hidden="true">
      <rect x="70" y="20" width="160" height="95" rx="4" fill="#2a3f55" />
      <rect x="80" y="30" width="140" height="75" rx="2" fill="#1b2838" />
      <rect x="90" y="40" width="34" height="34" rx="2" fill="#3d5a77" />
      <rect x="132" y="40" width="78" height="6" rx="3" fill="#3d5a77" />
      <rect x="132" y="52" width="60" height="6" rx="3" fill="#324a63" />
      <rect x="132" y="64" width="70" height="6" rx="3" fill="#324a63" />
      <rect x="90" y="82" width="120" height="6" rx="3" fill="#324a63" />
      <rect x="130" y="115" width="40" height="8" fill="#2a3f55" />
      <rect x="110" y="123" width="80" height="6" rx="3" fill="#3d5a77" />
      <rect x="36" y="96" width="30" height="22" rx="3" fill="#4a6683" />
      <circle cx="51" cy="88" r="9" fill="#4a6683" />
    </svg>
  );
}

export default function CartPage({
  cart,
  onBack,
  onRemove,
  onOpenGame,
  onCheckout,
  checkoutBusy,
  checkoutError,
  payMethods,
  payMethodId,
  onSelectPayMethod,
  recommend = [],
  onWish,
}: {
  cart: any[];
  onBack: () => void;
  onRemove: (slug: string) => void;
  onOpenGame: (slug: string) => void;
  onCheckout: () => void;
  checkoutBusy: boolean;
  checkoutError: string | null;
  payMethods: { id: string; label: string }[];
  payMethodId: string;
  onSelectPayMethod: (id: string) => void;
  /** 목록 아래 "맞춤 추천"에 깔 게임들. 없으면 그 구획을 통째로 숨긴다 */
  recommend?: any[];
  /** "추가" 링크 = 찜 목록에 담기. 없으면 링크를 그리지 않는다 */
  onWish?: (slug: string) => void;
}) {
  const total = cart.reduce((sum, g) => sum + (g.finalKrw ?? 0), 0);
  const checkoutLabel = checkoutBusy ? "처리 중…" : "결제 계속하기";

  // 소장 방식은 화면 표시용. 선물 기능이 없어서 고른 값을 서버로 보내지는 않는다.
  const [giftFor, setGiftFor] = useState<Record<string, string>>({});

  // 제작자 팔로우: 장바구니에 담긴 게임의 배급사/개발사를 중복 없이 모은다
  const makers: { name: string; image: string | null }[] = [];
  const seen = new Set<string>();
  for (const g of cart) {
    for (const name of [g.publisher, g.developer]) {
      if (!name || seen.has(name)) continue;
      seen.add(name);
      makers.push({ name, image: g.capsuleImage || g.headerImage || null });
    }
  }

  return (
    <div className="cartpage">
      <div className="wrap">
        <div className="cp-crumb">
          <a href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>홈</a>
          <span>&gt;</span>
          <span className="cur">장바구니(제품 {cart.length}개)</span>
        </div>

        <h1 className="cp-title">장바구니(제품 {cart.length}개)</h1>

        {cart.length === 0 ? (
          <div className="cp-empty">
            <p>장바구니가 비어 있습니다.</p>
            <a className="btn-blue" href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>쇼핑 계속하기</a>
          </div>
        ) : (
          <div className="cp-body">
            <div className="cp-main">
              <div className="cp-panel">
                {cart.map((g: any) => (
                  <div className="cp-row" key={g.slug}>
                    <div className="cp-thumb" style={bgStyle(g.headerImage)} onClick={() => onOpenGame(g.slug)} />

                    <div className="cp-info">
                      <div className="cp-name" onClick={() => onOpenGame(g.slug)}>{g.name}</div>
                      <select
                        className="cp-gift"
                        value={giftFor[g.slug] ?? "self"}
                        onChange={(e) => setGiftFor((m) => ({ ...m, [g.slug]: e.target.value }))}
                      >
                        <option value="self">개인 소장용</option>
                        <option value="gift">선물용</option>
                      </select>
                    </div>

                    <div className="cp-rowside">
                      <Price g={g} />
                      <div className="cp-links">
                        {onWish && (
                          <>
                            <a
                              href="#"
                              title="찜 목록에 추가"
                              onClick={(e) => { e.preventDefault(); onWish(g.slug); }}
                            >
                              추가
                            </a>
                            <span>|</span>
                          </>
                        )}
                        <a href="#" onClick={(e) => { e.preventDefault(); onRemove(g.slug); }}>제거</a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="cp-actions">
                <div className="cp-actions-btns">
                  <a className="btn-grey" href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>쇼핑 계속하기</a>
                  <a
                    className="btn-blue cp-checkout-btn"
                    href="#"
                    aria-disabled={checkoutBusy}
                    onClick={(e) => { e.preventDefault(); if (!checkoutBusy) onCheckout(); }}
                  >
                    {checkoutLabel}
                  </a>
                </div>
                <a
                  className="cp-clear"
                  href="#"
                  onClick={(e) => { e.preventDefault(); cart.forEach((g: any) => onRemove(g.slug)); }}
                >
                  모든 제품 제거
                </a>
              </div>

              {recommend.length > 0 && (
                <section className="cp-rec">
                  <h2 className="cp-h2">맞춤 추천</h2>
                  <div className="cp-rec-grid">
                    {recommend.slice(0, 3).map((g: any) => (
                      <div className="cp-rec-card" key={g.slug} onClick={() => onOpenGame(g.slug)}>
                        <div className="art" style={bgStyle(g.headerImage)} />
                        <Price g={g} />
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <aside className="cp-side">
              <div className="cp-summary">
                <div className="cp-summary-row">
                  <span>예상 합계</span>
                  <b>{won(total)}</b>
                </div>
                <p className="cp-summary-note">해당되는 지역의 경우 계산 시 판매세가 부과됩니다.</p>
                <div className="cp-paymethods">
                  {payMethods.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={"cp-paymethod" + (m.id === payMethodId ? " on" : "")}
                      onClick={() => onSelectPayMethod(m.id)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                {checkoutError && <p className="cp-summary-note cp-checkout-error">{checkoutError}</p>}
                <a
                  className="btn-blue cp-checkout cp-checkout-btn"
                  href="#"
                  aria-disabled={checkoutBusy}
                  onClick={(e) => { e.preventDefault(); if (!checkoutBusy) onCheckout(); }}
                >
                  {checkoutLabel}
                </a>
              </div>

              <div className="cp-license">
                <LicenseArt />
                <p>디지털 제품을 구매하면 Steam에서 해당 제품에 대한 라이선스를 부여합니다.</p>
                <p>전체 이용 약관은 Steam 이용 약관에서 확인하세요.</p>
              </div>

              {makers.length > 0 && (
                <div className="cp-follow">
                  <h3>제작자 팔로우</h3>
                  <p className="cp-follow-note">
                    구매한 게임의 제작자를 팔로우하면 향후 새로운 게임이 출시될 때 알림을 받을 수 있습니다.
                  </p>
                  {makers.map((m) => (
                    <div className="cp-follow-row" key={m.name}>
                      <div className="cp-follow-logo" style={bgStyle(m.image)} />
                      <div className="cp-follow-body">
                        <div className="cp-follow-name">{m.name}</div>
                        <button type="button" className="cp-follow-btn">팔로우</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
