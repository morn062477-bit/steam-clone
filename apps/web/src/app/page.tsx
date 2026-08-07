"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import StoreNav from "@/components/storenav";
import Auth, { readUser, writeUser, type AuthView, type User } from "@/components/auth";
import GamePage from "@/components/gamepage";
import GameHoverCard, { type HoverInfo } from "@/components/gamehovercard";
import SalePage from "@/components/salepage";
import CartPage from "@/components/cartpage";
import WishlistPage from "@/components/wishlistpage";

const won = (n: number) => "₩ " + Number(n).toLocaleString("ko-KR");

/** 결제창에서 고를 결제수단. 카카오페이는 간편결제(EASY_PAY)라 요청 형태가 카드결제와 다르다. */
const PAY_METHODS = [
  {
    id: "kakaopay",
    label: "카카오페이",
    channelKey: process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_KAKAOPAY,
    payMethod: "EASY_PAY" as const,
    easyPayProvider: "KAKAOPAY" as const,
  },
  {
    id: "inicis",
    label: "KG이니시스",
    channelKey: process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_INICIS,
    payMethod: "CARD" as const,
  },
  {
    id: "toss",
    label: "토스페이먼츠",
    channelKey: process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_TOSS,
    payMethod: "CARD" as const,
  },
];

function ymd(iso: string | null) {
  if (!iso) return "출시일 미정";
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function priceText(g: any) {
  if (g.isFree) return "무료 플레이";
  if (g.priceKrw <= 0) return g.comingSoon ? "출시 예정" : "가격 미정";
  if (g.discountPercent > 0) return `-${g.discountPercent}%  ${won(g.finalKrw)}`;
  return won(g.priceKrw);
}

function bgStyle(url?: string | null) {
  return url ? { backgroundImage: `url('${url}')` } : undefined;
}

// 로그인 전 장바구니. 슬러그 목록만 로컬에 들고 있다가 로그인 시 서버 카트로 병합한다.
const GUEST_CART_KEY = "steam-clone:guestCart";
const RECENT_KEY = "steam-clone:recent";

function readRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

function readGuestCart(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const v = JSON.parse(localStorage.getItem(GUEST_CART_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeGuestCart(slugs: string[]) {
  localStorage.setItem(GUEST_CART_KEY, JSON.stringify(slugs));
}

function chunk<T>(arr: T[], n: number): T[][] {
  return arr.reduce((a: T[][], _: T, i: number) => (i % n ? a : [...a, arr.slice(i, i + n)]), []);
}

const TAGLINE_CLASS: Record<string, string> = {
  "일일 특가": "day",
  "주중 특가": "week",
  "시즌 세일": "season",
  "특별 할인": "season",
};

const HoverCtx = createContext<{ show: (g: any, el: HTMLElement) => void; hide: () => void }>({
  show: () => {},
  hide: () => {},
});

/** 카드에 붙이는 호버 핸들러. 확대/영상용 로컬 state 와 설명 패널을 같이 다룬다.
   특집 카드처럼 자체 정보 패널이 있는 경우엔 floating=false 로 띄우지 않는다. */
function useCardHover(g: any, floating = true) {
  const [hover, setHover] = useState(false);
  const ctx = useContext(HoverCtx);
  return {
    hover,
    bind: {
      onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
        setHover(true);
        if (floating) ctx.show(g, e.currentTarget);
      },
      onMouseLeave: () => { setHover(false); if (floating) ctx.hide(); },
    },
  };
}

function PriceBar({ g, className = "pricebar" }: { g: any; className?: string }) {
  if (g.isFree) return <div className={className}><span className="pb-body"><span className="now">무료 플레이</span></span></div>;
  if (g.priceKrw <= 0) return <div className={className}><span className="pb-body"><span className="now">{g.comingSoon ? "출시 예정" : "가격 미정"}</span></span></div>;
  if (g.discountPercent > 0) {
    return (
      <div className={className}>
        <span className="disc">-{g.discountPercent}%</span>
        <span className="pb-body">
          <span className="was">{won(g.priceKrw)}</span>
          <span className="now">{won(g.finalKrw)}</span>
        </span>
      </div>
    );
  }
  return <div className={className}><span className="pb-body"><span className="now">{won(g.priceKrw)}</span></span></div>;
}

function Reviews({ g }: { g: any }) {
  if (!g.reviewDesc) return <div className="reviews"><span>평가 없음</span></div>;
  const cls = "reviews" + ((g.reviewPercent ?? 0) >= 70 ? " positive" : "");
  return (
    <div className={cls}>
      {g.reviewDesc}
      {g.reviewTotal ? <span> (평가 {g.reviewTotal.toLocaleString("ko-KR")}개)</span> : null}
    </div>
  );
}

// ---------------------------------------------------------------
// 캐러셀
// ---------------------------------------------------------------
function Carousel({ slides, autoMs = 0, peek = 0, peekRight = false, arrowInset, className }: { slides: React.ReactNode[]; autoMs?: number; peek?: number; peekRight?: boolean; arrowInset?: number; className?: string }) {
  const n = slides.length;
  const loop = n > 1;
  // 회전문 트릭: 맨 앞엔 마지막 슬라이드 복제, 맨 뒤엔 첫 슬라이드 복제를 붙여둔다.
  // pos(렌더링 인덱스)는 1..n이 진짜 슬라이드, 0과 n+1은 가짜(복제) 자리.
  const rendered = loop ? [slides[n - 1], ...slides, slides[0]] : slides;
  const total = rendered.length;

  const [pos, setPos] = useState(loop ? 1 : 0);
  const [animate, setAnimate] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hoveringRef = useRef(false);

  const realIndex = loop ? (pos - 1 + n) % n : pos;

  const clearTimer = () => { if (timerRef.current) clearInterval(timerRef.current); };
  const stop = () => { hoveringRef.current = true; clearTimer(); };
  const step = (dir: number) => {
    setAnimate(true);
    setPos((p) => p + dir);
  };
  const restart = () => {
    hoveringRef.current = false;
    clearTimer();
    if (autoMs && n > 1) {
      // 타이머가 이미 예약된 순간 마우스가 들어와도, 콜백 실행 시점에 다시 확인해 건너뛴다.
      timerRef.current = setInterval(() => { if (!hoveringRef.current) step(1); }, autoMs);
    }
  };
  const goDot = (idx: number) => {
    setAnimate(true);
    setPos(loop ? idx + 1 : idx);
    restart();
  };

  useEffect(() => {
    restart();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMs, n]);

  // 복제 슬라이드(0 또는 total-1)에 도착하면, 트랜지션이 끝나자마자
  // 애니메이션 없이 진짜 위치(1 또는 n)로 순간이동시켜서 티 안 나게 이어붙인다.
  const handleTransitionEnd = () => {
    if (!loop) return;
    if (pos === total - 1) { setAnimate(false); setPos(1); }
    else if (pos === 0) { setAnimate(false); setPos(n); }
  };

  if (!n) return null;

  // 슬라이드 폭 = 컨테이너의 (100 - peek*2)%. car-track 자체 폭을 total배로 잡아두고
  // 그 기준(%) 안에서 이동/폭을 계산해야 각 슬라이드가 정확히 peek%만큼 옆으로 삐져나온다.
  // peekRight면 왼쪽은 안 보이고 오른쪽에만 peek%만큼 다음 슬라이드가 보이도록,
  // 활성 슬라이드를 왼쪽에 딱 붙인다.
  const slideWidth = peekRight ? 100 - peek : 100 - peek * 2;
  const trackWidth = total * slideWidth;
  const translatePercent = peekRight
    ? (-(pos * slideWidth) / trackWidth) * 100
    : ((peek - pos * slideWidth) / trackWidth) * 100;

  return (
    <div className={"carousel" + (peek > 0 ? " carousel-peek" : "") + (className ? ` ${className}` : "")} onMouseEnter={stop} onMouseLeave={restart}>
      <button className="arrow prev" style={peek > 0 && !peekRight ? { left: `${arrowInset ?? peek}%` } : undefined} aria-label="이전" onClick={() => { step(-1); restart(); }}>‹</button>
      <button className="arrow next" style={peek > 0 ? { right: `${arrowInset ?? peek}%` } : undefined} aria-label="다음" onClick={() => { step(1); restart(); }}>›</button>
      <div className="car-view">
        <div
          className="car-track"
          onTransitionEnd={handleTransitionEnd}
          style={{
            width: `${trackWidth}%`,
            transform: `translateX(${translatePercent}%)`,
            transition: animate ? undefined : "none",
          }}
        >
          {rendered.map((slide, idx) => {
            const peekCls = idx === pos ? " active" : idx === pos - 1 ? " peek-prev" : idx === pos + 1 ? " peek-next" : "";
            return (
              <div className={"car-slide" + peekCls} key={idx} style={{ flex: `0 0 ${100 / total}%` }}>
                {slide}
              </div>
            );
          })}
        </div>
      </div>
      <div className="dots">
        {slides.map((_, idx) => (
          <span key={idx} className={"dot" + (idx === realIndex ? " on" : "")} onClick={() => goDot(idx)} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// 히어로
// ---------------------------------------------------------------
/**
 * 상단 전면 배너(테이크오버).
 *
 * 실제 Steam 은 배경 이미지를 페이지 뒤에 깔고, 그 위에 1467x450 링크 영역만
 * 얹는다(a.home_page_takeover_sizer). 여기서도 같은 구조로 두어 배너 문구가
 * 이미지 안에 들어간 채로 보이고, 클릭 영역만 따로 관리한다.
 */
const TAKEOVER_BG =
  "https://shared.fastly.steamstatic.com/store_item_assets/steam/clusters/frontpage/ae2e81fa141f42bb9e61c3c9/71904d199e17e504a8bf076e0c64e673447c34a1/page_bg_koreana.jpg?t=1785175462";
const TAKEOVER_BG_MOBILE =
  "https://shared.fastly.steamstatic.com/store_item_assets/steam/clusters/frontpage/ae2e81fa141f42bb9e61c3c9/7babd82c14405609c9e75ea71bdc1953c08297c3/page_bg_mobile_koreana.jpg?t=1785175462";

function Takeover({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="takeover">
      <div className="takeover-bg" style={{ backgroundImage: `url('${TAKEOVER_BG}')` }} />
      <div className="takeover-bg-mobile" style={{ backgroundImage: `url('${TAKEOVER_BG_MOBILE}')` }} />
      <a
        className="takeover-sizer"
        href="#"
        role="button"
        aria-label="2026년 Steam 사이버펑크 게임 축제"
        onClick={(e) => { e.preventDefault(); onOpen(); }}
      />
    </div>
  );
}

// ---------------------------------------------------------------
// 카드 호버 시 트레일러 재생
// Steam appdetails는 더 이상 mp4/webm을 주지 않고 HLS(m3u8)만 준다.
// Safari는 <video>가 HLS를 네이티브로 틀 수 있지만 Chrome/Firefox는 hls.js가 필요하다.
// ---------------------------------------------------------------
// 트레일러 앞부분(로고/인트로)을 건너뛰고 바로 게임 화면부터 보여준다.
// loop는 네이티브 속성 대신 'ended'에서 직접 되감아, 반복될 때도 인트로를 다시 안 보게 한다.
const HOVER_SKIP_SEC = 4;

function HoverVideo({ src, skipSeconds = HOVER_SKIP_SEC }: { src: string; skipSeconds?: number }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const seekPastIntro = () => {
      if (video.duration > skipSeconds + 1) video.currentTime = skipSeconds;
    };
    const restart = () => { seekPastIntro(); video.play().catch(() => {}); };

    video.addEventListener("loadedmetadata", seekPastIntro);
    video.addEventListener("ended", restart);

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.play().catch(() => {});
      return () => {
        video.removeEventListener("loadedmetadata", seekPastIntro);
        video.removeEventListener("ended", restart);
      };
    }

    let hls: import("hls.js").default | undefined;
    import("hls.js").then(({ default: Hls }) => {
      if (!videoRef.current) return;
      if (!Hls.isSupported()) return;
      hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(videoRef.current);
      hls.on(Hls.Events.MANIFEST_PARSED, () => videoRef.current?.play().catch(() => {}));
    });

    return () => {
      hls?.destroy();
      video.removeEventListener("loadedmetadata", seekPastIntro);
      video.removeEventListener("ended", restart);
    };
  }, [src, skipSeconds]);

  return <video ref={videoRef} className="hover-video" muted playsInline />;
}

// ---------------------------------------------------------------
// 카드들
// ---------------------------------------------------------------
function FeatCard({ g, onOpen }: { g: any; onOpen: (slug: string) => void }) {
  // 우리 훅(호버 확대·설명) + 브랜치의 썸네일 미리보기를 함께 쓴다.
  // 특집 카드는 자체 정보 패널이 있어 떠 있는 설명 패널은 띄우지 않는다(false).
  const { hover, bind } = useCardHover(g, false);
  const [activeShot, setActiveShot] = useState<string | null>(null);
  const art = g.screenshots?.[0]?.url || g.headerImage;
  const thumbs = (g.screenshots?.slice(1, 5).length ? g.screenshots.slice(1, 5) : g.screenshots?.slice(0, 4)) ?? [];
  return (
    <div
      className="feat"
      onClick={() => onOpen(g.slug)}
      {...bind}
      onMouseLeave={(e) => { bind.onMouseLeave(); setActiveShot(null); }}
    >
      <div className="feat-art" style={bgStyle(activeShot || art)}>
        {/* 썸네일을 고르는 동안엔 영상 대신 그 스크린샷을 보여준다 */}
        {hover && !activeShot && g.previewVideoUrl && (
          <HoverVideo src={g.previewVideoUrl} />
        )}
        {g.discountPercent > 0 && <span className="badge-live"><i />{g.discountLabel}</span>}
      </div>
      <div className="feat-info">
        <h3>{g.name}</h3>
        <Reviews g={g} />
        {/* 호버하면 스크린샷 자리에 게임 설명을 보여준다 */}
        {hover && g.shortDesc && <p className="feat-desc">{g.shortDesc}</p>}
        <div className="thumbs">
          {thumbs.map((s: any, i: number) => (
            <div
              key={i}
              className="thumb"
              style={bgStyle(s.thumb || s.url)}
              onMouseEnter={() => setActiveShot(s.url || s.thumb)}
              onMouseLeave={() => setActiveShot(null)}
            />
          ))}
        </div>
        <div className="feat-tags">
          {g.tags.slice(0, 5).map((t: string) => <span key={t} className="pill">{t}</span>)}
        </div>
        <div className="rank">
          <span className="rank-icon">📈</span>
          <div>
            <b>{g.discountPercent > 0 ? "할인 중" : "최고 인기 게임"}</b>
            <small>Steam 평가 {(g.reviewTotal || 0).toLocaleString("ko-KR")}개</small>
          </div>
        </div>
        <div className="feat-meta">
          <PriceBar g={g} className="price-tag" />
        </div>
      </div>
    </div>
  );
}

function DealCard({ g, size, onOpen }: { g: any; size: "big" | "sm"; onOpen: (slug: string) => void }) {
  const { hover, bind } = useCardHover(g);
  const art = size === "big" ? (g.capsuleImage || g.headerImage) : g.headerImage;
  const cls = TAGLINE_CLASS[g.discountLabel] || "season";
  return (
    <div className={`deal-${size}`} onClick={() => onOpen(g.slug)} {...bind}>
      <span className={`tagline ${cls}`}>{g.discountLabel || "할인"}</span>
      <div className="art" style={bgStyle(art)}>
        {hover && g.previewVideoUrl && (
          <HoverVideo src={g.previewVideoUrl} />
        )}
      </div>
      <PriceBar g={g} />
    </div>
  );
}

function SpotCard({ g, onOpen }: { g: any; onOpen: (slug: string) => void }) {
  const { hover, bind } = useCardHover(g);
  return (
    <div className="spot-card" onClick={() => onOpen(g.slug)} {...bind}>
      <div className="art" style={bgStyle(g.headerImage)}>
        {hover && g.previewVideoUrl && (
          <HoverVideo src={g.previewVideoUrl} />
        )}
      </div>
    </div>
  );
}

function CheapCard({ g, onOpen }: { g: any; onOpen: (slug: string) => void }) {
  const { hover, bind } = useCardHover(g);
  return (
    <div className="cheap-card" onClick={() => onOpen(g.slug)} {...bind}>
      <div className="art" style={bgStyle(g.capsuleImage || g.headerImage)}>
        {hover && g.previewVideoUrl && (
          <HoverVideo src={g.previewVideoUrl} />
        )}
      </div>
      <PriceBar g={g} />
    </div>
  );
}

// ---------------------------------------------------------------
// 카테고리(장르) 페이지
// ---------------------------------------------------------------
function CategoryPage({
  slug,
  user,
  wishlist,
  onOpenGame,
  onLogin,
  onToggleWishlist,
}: {
  slug: string;
  user: User | null;
  wishlist: any[];
  onOpenGame: (slug: string) => void;
  onLogin: (e: React.MouseEvent) => void;
  onToggleWishlist: (slug: string) => void;
}) {
  const [cat, setCat] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<string | null>(null);

  useEffect(() => {
    setCat(null);
    setError(null);
    setSubTab(null);
    fetch("/api/category/" + encodeURIComponent(slug))
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(setCat)
      .catch((e) => setError(e.message));
  }, [slug]);

  if (error) return <div className="err">카테고리를 불러오지 못했습니다: {error}</div>;
  if (!cat) return <div className="loading">불러오는 중…</div>;

  const filtered = subTab ? cat.popular.filter((g: any) => g.tags.includes(subTab)) : cat.popular;
  const wishInCat = wishlist.filter((w: any) => w.tags?.includes(cat.name));

  return (
    <div className="catpage">
      <div className="wrap">
        <Carousel autoMs={7000} slides={cat.hero.map((g: any) => (
          <DealsHeroSlide
            key={g.slug}
            g={g}
            onOpen={onOpenGame}
            user={user}
            isWishlisted={wishlist.some((w: any) => w.slug === g.slug)}
            onToggleWishlist={onToggleWishlist}
          />
        ))} />
      </div>
      <div className="wrap">
        <h1 className="cp-title">{cat.name}</h1>

        <div className="cat-tabs">
          <button type="button" className={"cat-tab" + (!subTab ? " on" : "")} onClick={() => setSubTab(null)}>특집</button>
          {cat.subTags.map((t: string) => (
            <button
              key={t}
              type="button"
              className={"cat-tab" + (subTab === t ? " on" : "")}
              onClick={() => setSubTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <section className="section">
          <div className="sec-head"><h2 className="sec-title">찜 목록에 있는 게임</h2></div>
          {user ? (
            wishInCat.length ? (
              <div className="cheap">
                {wishInCat.slice(0, 5).map((g: any) => <DealCard key={g.slug} g={g} size="sm" onOpen={onOpenGame} />)}
              </div>
            ) : (
              <div className="cp-empty"><p>이 카테고리에서 찜한 게임이 없습니다.</p></div>
            )
          ) : (
            <div className="cp-empty">
              <p>나만을 위해 엄선된 추가 제품을 보려면 로그인하세요.</p>
              <a className="btn-blue" href="#login" onClick={onLogin}>로그인</a>
            </div>
          )}
        </section>

        <section className="section">
          <div className="sec-head"><h2 className="sec-title">인기 게임</h2></div>
          {filtered.length ? (
            <div className="cheap">
              {filtered.slice(0, 10).map((g: any) => (
                <DealCard key={g.slug} g={g} size="sm" onOpen={onOpenGame} />
              ))}
            </div>
          ) : (
            <div className="cp-empty"><p>해당하는 게임이 없습니다.</p></div>
          )}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// 가격대별 검색 페이지
// ---------------------------------------------------------------
const PRICE_PRESETS = [5000, 10000, 20000, 50000];
const PRICE_SLIDER_MAX = 60000;

const PRICE_SORTS = [
  { key: "relevance", label: "연관성" },
  { key: "priceAsc", label: "가격: 낮은 순" },
  { key: "priceDesc", label: "가격: 높은 순" },
  { key: "discount", label: "할인율 높은 순" },
] as const;

function PriceSearchPage({ max, onOpenGame, onChangeMax }: { max: number; onOpenGame: (slug: string) => void; onChangeMax: (max: number) => void }) {
  const [slider, setSlider] = useState(max);
  const [games, setGames] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<(typeof PRICE_SORTS)[number]["key"]>("relevance");
  const [onlyDiscount, setOnlyDiscount] = useState(false);
  const [genre, setGenre] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setSlider(max), [max]);

  useEffect(() => {
    setGames(null);
    fetch("/api/price-search?max=" + max)
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then((d) => setGames(d.games))
      .catch((e) => setError(e.message));
  }, [max]);

  function handleSlide(v: number) {
    setSlider(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onChangeMax(v), 300);
  }

  const genreCounts = (() => {
    const m = new Map<string, number>();
    for (const g of games ?? []) for (const t of g.genres ?? []) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  })();

  const shown = (() => {
    let rows = games ?? [];
    if (q.trim()) rows = rows.filter((g: any) => g.name.toLowerCase().includes(q.trim().toLowerCase()));
    if (onlyDiscount) rows = rows.filter((g: any) => g.discountPercent > 0);
    if (genre) rows = rows.filter((g: any) => (g.genres ?? []).includes(genre));
    rows = [...rows];
    if (sort === "priceAsc") rows.sort((a, b) => a.finalKrw - b.finalKrw);
    else if (sort === "priceDesc") rows.sort((a, b) => b.finalKrw - a.finalKrw);
    else if (sort === "discount") rows.sort((a, b) => b.discountPercent - a.discountPercent);
    return rows;
  })();

  if (error) return <div className="err">가격대별 검색 결과를 불러오지 못했습니다: {error}</div>;

  return (
    <div className="catpage">
      <div className="wrap">
        <h1 className="cp-title">모든 제품</h1>

        {games === null ? (
          <div className="loading">불러오는 중…</div>
        ) : (
          <>
            <div className="price-toolbar">
              <input
                type="text"
                className="price-search-input"
                placeholder="검색어 입력"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <label className="price-sort">
                정렬 기준:
                <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                  {PRICE_SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </label>
            </div>

            <div className="price-body">
              <div className="price-list">
                <div className="price-count">검색 결과가 {shown.length}개 있습니다.</div>
                {shown.length ? (
                  <div className="rel-list">
                    {shown.map((g: any) => (
                      <RelRow key={g.slug} g={g} onOpen={onOpenGame} onHover={() => {}} />
                    ))}
                  </div>
                ) : (
                  <div className="cp-empty"><p>조건에 맞는 게임이 없습니다.</p></div>
                )}
              </div>

              <aside className="price-sidebar">
                <h3 className="price-side-h">가격대</h3>
                <input
                  type="range"
                  min={1000}
                  max={PRICE_SLIDER_MAX}
                  step={1000}
                  value={slider}
                  onChange={(e) => handleSlide(Number(e.target.value))}
                  className="price-slider"
                />
                <div className="price-slider-val">₩ {slider.toLocaleString("ko-KR")} 미만</div>
                <div className="price-presets">
                  {PRICE_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={"cat-tab" + (max === p ? " on" : "")}
                      onClick={() => onChangeMax(p)}
                    >
                      ₩ {p.toLocaleString("ko-KR")} 미만
                    </button>
                  ))}
                </div>
                <label className="price-check-row">
                  <input type="checkbox" checked={onlyDiscount} onChange={(e) => setOnlyDiscount(e.target.checked)} />
                  할인 및 이벤트
                </label>

                {genreCounts.length > 0 && (
                  <>
                    <h3 className="price-side-h">장르</h3>
                    <div className="price-genre-list">
                      {genreCounts.map(([name, n]) => (
                        <button
                          key={name}
                          type="button"
                          className={"price-genre-row" + (genre === name ? " on" : "")}
                          onClick={() => setGenre(genre === name ? null : name)}
                        >
                          <span>{name}</span>
                          <b>{n}</b>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                <h3 className="price-side-h">언어</h3>
                <label className="price-lang-row">
                  <input type="checkbox" checked readOnly />
                  한국어
                </label>
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// 할인 및 이벤트 페이지
// ---------------------------------------------------------------
function DealsHeroSlide({
  g, onOpen, user, isWishlisted, onToggleWishlist,
}: {
  g: any; onOpen: (slug: string) => void; user: User | null; isWishlisted: boolean; onToggleWishlist: (slug: string) => void;
}) {
  return (
    <div className="deals-hero-slide">
      <div className="deals-hero-media">
        {g.previewVideoUrl ? (
          <HoverVideo src={g.previewVideoUrl} />
        ) : (
          <div className="deals-hero-img" style={bgStyle(g.headerImage)} />
        )}
      </div>
      <div className="deals-hero-card">
        <div className="deals-hero-thumb" onClick={() => onOpen(g.slug)} style={bgStyle(g.capsuleImage || g.headerImage)}>
          {user && (
            <button
              type="button"
              className={"deals-hero-wish" + (isWishlisted ? " on" : "")}
              onClick={(e) => { e.stopPropagation(); onToggleWishlist(g.slug); }}
              aria-label="찜하기"
            >
              {isWishlisted ? "★" : "☆"}
            </button>
          )}
        </div>
        <div className="deals-hero-tags">
          {g.tags.slice(0, 5).map((t: string) => <span key={t} className="pill">{t}</span>)}
        </div>
        <p className="deals-hero-desc">{g.shortDesc}</p>
        <div className="deals-hero-meta">출시일: {ymd(g.releaseDate)}</div>
        <div className="deals-hero-price">
          {g.discountPercent > 0 ? (
            <>
              <span className="disc">-{g.discountPercent}%</span>
              <span className="was">{won(g.priceKrw)}</span>
              <span className="now">{won(g.finalKrw)}</span>
            </>
          ) : (
            <span className="now">{priceText(g)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function DealsPage({
  categories,
  user,
  wishlist,
  onOpenGame,
  onOpenCategory,
  onLogin,
  onToggleWishlist,
}: {
  categories: any[];
  user: User | null;
  wishlist: any[];
  onOpenGame: (slug: string) => void;
  onOpenCategory: (slug: string) => void;
  onLogin: (e: React.MouseEvent) => void;
  onToggleWishlist: (slug: string) => void;
}) {
  const [subTab, setSubTab] = useState<string | null>(null);
  const [deals, setDeals] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/deals")
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then((d) => setDeals(d.deals))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="err">할인 정보를 불러오지 못했습니다: {error}</div>;
  if (!deals) return <div className="loading">불러오는 중…</div>;

  const heroGames = deals.slice(0, 6);
  const filtered = subTab ? deals.filter((g: any) => g.tags.includes(subTab)) : deals;
  const wishDeals = wishlist.filter((w: any) => w.discountPercent > 0);

  const subTags = (() => {
    const count = new Map<string, number>();
    for (const g of deals) for (const t of g.tags) count.set(t, (count.get(t) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 9).map(([n]) => n);
  })();

  return (
    <div className="catpage">
      <div className="wrap">
        <Carousel autoMs={8000} slides={heroGames.map((g: any) => (
          <DealsHeroSlide
            key={g.slug}
            g={g}
            onOpen={onOpenGame}
            user={user}
            isWishlisted={wishlist.some((w: any) => w.slug === g.slug)}
            onToggleWishlist={onToggleWishlist}
          />
        ))} />
      </div>
      <div className="wrap">
        <h1 className="cp-title">할인 및 이벤트</h1>

        <div className="cat-tabs">
          <button type="button" className={"cat-tab" + (!subTab ? " on" : "")} onClick={() => setSubTab(null)}>특집</button>
          {subTags.map((t) => (
            <button
              key={t}
              type="button"
              className={"cat-tab" + (subTab === t ? " on" : "")}
              onClick={() => setSubTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <section className="section">
          <div className="sec-head"><h2 className="sec-title">찜 목록에 있는 할인 게임</h2></div>
          {user ? (
            wishDeals.length ? (
              <div className="cheap">
                {wishDeals.slice(0, 5).map((g: any) => <DealCard key={g.slug} g={g} size="sm" onOpen={onOpenGame} />)}
              </div>
            ) : (
              <div className="cp-empty"><p>찜한 게임 중 할인 중인 게임이 없습니다.</p></div>
            )
          ) : (
            <div className="cp-empty">
              <p>나만을 위해 엄선된 추가 제품을 보려면 로그인하세요.</p>
              <a className="btn-blue" href="#login" onClick={onLogin}>로그인</a>
            </div>
          )}
        </section>

        <section className="section">
          <div className="sec-head"><h2 className="sec-title">할인 게임</h2></div>
          {filtered.length ? (
            <div className="rel-list">
              {filtered.slice(0, 20).map((g: any) => (
                <RelRow key={g.slug} g={g} onOpen={onOpenGame} onHover={() => {}} />
              ))}
            </div>
          ) : (
            <div className="cp-empty"><p>해당하는 할인 게임이 없습니다.</p></div>
          )}
        </section>

        <section className="section">
          <div className="sec-head"><h2 className="sec-title">카테고리별 검색</h2></div>
          <div className="cats">
            {categories.map((c: any) => (
              <div className="cat" key={c.slug} onClick={() => onOpenCategory(c.slug)}>
                <div className="veil" style={bgStyle(c.image)} />
                <b>{c.name}</b>
                <small>{c.count}종</small>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function RelRow({ g, onOpen, onHover }: { g: any; onOpen: (slug: string) => void; onHover: () => void }) {
  return (
    <div className="rel-row" onClick={() => onOpen(g.slug)} onMouseEnter={onHover}>
      <div className="rel-cap" style={bgStyle(g.headerImage)} />
      <div className="rel-meta">
        <h5>{g.name}</h5>
        <div className="tags">{g.tags.slice(0, 4).join(", ") || "태그 없음"}</div>
        <div className="date">출시: {ymd(g.releaseDate)}</div>
      </div>
      <PriceBar g={g} className="rel-price" />
    </div>
  );
}

function RelSide({ g }: { g: any }) {
  if (!g) return null;
  const shots = g.screenshots?.slice(0, 4) ?? [];
  return (
    <>
      <h4>{g.name}</h4>
      <div className="lang">Steam 사용자 평가</div>
      <div className="score">
        {g.reviewDesc || "평가 없음"}
        {g.reviewTotal ? ` (${g.reviewTotal.toLocaleString("ko-KR")})` : ""}
      </div>
      <div className="tag-pills">
        {g.tags.slice(0, 6).map((t: string) => <span key={t} className="pill">{t}</span>)}
      </div>
      {shots.map((s: any, i: number) => <div key={i} className="side-shot" style={bgStyle(s.thumb || s.url)} />)}
    </>
  );
}

// ---------------------------------------------------------------
// 메인
// ---------------------------------------------------------------
export default function Home() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [tabIndex, setTabIndex] = useState(0);
  const [relHoverIndex, setRelHoverIndex] = useState(0);
  const [view, setView] = useState<"store" | AuthView | "game" | "cart" | "wishlist" | "category" | "sale" | "deals" | "price">("store");
  const [categorySlug, setCategorySlug] = useState<string | null>(null);
  const [priceMax, setPriceMax] = useState(10000);
  const [user, setUser] = useState<User | null>(null);
  // 로그아웃할 때만 올려서 Auth를 새로 마운트한다 (로그인 직후 뜨는 성공 메시지는 유지해야 하므로
  // user id를 그대로 key로 쓰면 안 됨 - 로그인 순간에도 리마운트되어 메시지가 사라진다).
  const [authResetKey, setAuthResetKey] = useState(0);
  const [modalSlug, setModalSlug] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cart, setCart] = useState<any[]>([]);
  const [wishlist, setWishlist] = useState<any[]>([]);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [payMethodId, setPayMethodId] = useState(PAY_METHODS[0].id);
  const [lang, setLang] = useState("한국어");
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/home")
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    const OF_HASH: Record<string, "store" | AuthView | "game" | "cart" | "wishlist" | "category" | "sale" | "deals" | "price"> = {
      "#login": "login", "#signup": "signup", "#create": "create", "#verified": "done",
      "#cart": "cart", "#wishlist": "wishlist", "#sale": "sale", "#deals": "deals",
    };
    function applyHash() {
      const h = window.location.hash;
      // #app/<slug> 는 게임 상세 페이지
      if (h.startsWith("#app/")) {
        setModalSlug(decodeURIComponent(h.slice("#app/".length)));
        setView("game");
        return;
      }
      // #category/<slug> 는 카테고리(장르) 페이지
      if (h.startsWith("#category/")) {
        setCategorySlug(decodeURIComponent(h.slice("#category/".length)));
        setView("category");
        return;
      }
      // #price/<max> 는 가격대별 검색 페이지
      if (h.startsWith("#price/")) {
        const n = Number(h.slice("#price/".length));
        setPriceMax(Number.isFinite(n) && n > 0 ? n : 10000);
        setView("price");
        return;
      }
      setModalSlug(null);
      setView(OF_HASH[h] ?? "store");
    }
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  useEffect(() => {
    const u = readUser();
    setUser(u);
    if (u) {
      fetch("/api/cart").then((r) => (r.ok ? r.json() : [])).then(setCart).catch(() => setCart([]));
      fetch("/api/wishlist").then((r) => (r.ok ? r.json() : [])).then(setWishlist).catch(() => setWishlist([]));
    } else {
      loadGuestCart();
    }
  }, []);

  useEffect(() => { setRelHoverIndex(0); }, [tabIndex]);

  useEffect(() => {
    if (!langOpen && !userMenuOpen) return;
    // 로그인 상태에선 언어 드롭다운이 사용자 메뉴 안에서 열리므로 같은 컨테이너로 판단한다.
    function onDocClick(e: MouseEvent) {
      const container = user ? userMenuRef.current : langRef.current;
      if (container && !container.contains(e.target as Node)) {
        setLangOpen(false);
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [langOpen, userMenuOpen, user]);

  /** 게스트 장바구니(슬러그만 로컬 저장)를 화면에 보여줄 카드 데이터로 채운다. */
  async function loadGuestCart() {
    const slugs = readGuestCart();
    if (slugs.length === 0) { setCart([]); return; }
    const rows = await Promise.all(
      slugs.map((s) => fetch("/api/game/" + encodeURIComponent(s)).then((r) => (r.ok ? r.json() : null))),
    );
    setCart(rows.filter(Boolean));
  }

  async function addToCart(slug: string) {
    if (user) {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      if (res.ok) setCart(await res.json());
      return;
    }
    const slugs = readGuestCart();
    if (!slugs.includes(slug)) writeGuestCart([...slugs, slug]);
    await loadGuestCart();
  }

  async function removeFromCart(slug: string) {
    if (user) {
      const res = await fetch("/api/cart/" + encodeURIComponent(slug), { method: "DELETE" });
      if (res.ok) setCart(await res.json());
      return;
    }
    writeGuestCart(readGuestCart().filter((s) => s !== slug));
    await loadGuestCart();
  }

  /**
   * 결제하기. 흐름:
   *   1) 서버에 PENDING 주문 생성 (/api/checkout/prepare)
   *   2) 포트원 결제창 (@portone/browser-sdk)
   *   3) 결제 성공 콜백 → 서버가 실제 결제 결과를 재검증하며 확정 (/api/checkout/complete)
   * 게스트는 로그인부터 시켜야 한다 (결제는 로그인 필요).
   */
  async function checkout() {
    if (!user) { goView("login"); return; }
    const method = PAY_METHODS.find((m) => m.id === payMethodId) ?? PAY_METHODS[0];
    if (!method.channelKey) {
      setCheckoutError(`${method.label} 채널 키가 설정되어 있지 않습니다 (apps/web/.env.local).`);
      return;
    }
    setCheckoutError(null);
    setCheckoutBusy(true);
    try {
      const prepRes = await fetch("/api/checkout/prepare", { method: "POST" });
      const prep = await prepRes.json();
      if (!prepRes.ok) throw new Error(prep.error ?? "주문 생성에 실패했습니다.");

      const { requestPayment } = await import("@portone/browser-sdk/v2");
      const response = await requestPayment({
        storeId: process.env.NEXT_PUBLIC_PORTONE_STORE_ID!,
        channelKey: method.channelKey,
        paymentId: prep.paymentId,
        orderName: prep.orderName,
        totalAmount: prep.totalKrw,
        currency: "KRW",
        payMethod: method.payMethod,
        ...(method.payMethod === "EASY_PAY" ? { easyPayProvider: method.easyPayProvider } : {}),
      });
      if (!response || response.code) {
        throw new Error(response?.message ?? "결제가 취소되었습니다.");
      }

      const completeRes = await fetch("/api/checkout/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: prep.orderId }),
      });
      const complete = await completeRes.json();
      if (!completeRes.ok) throw new Error(complete.error ?? "결제 확인에 실패했습니다.");

      setCart([]);
      alert("결제가 완료됐습니다. 라이브러리에서 확인하세요.");
    } catch (err: any) {
      setCheckoutError(err.message ?? "결제 중 오류가 발생했습니다.");
    } finally {
      setCheckoutBusy(false);
    }
  }

  // 찜 목록은 로그인했을 때만 쓸 수 있다. 게스트용 로컬 저장은 없음.
  async function addToWishlist(slug: string) {
    if (!user) return;
    const res = await fetch("/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    if (res.ok) setWishlist(await res.json());
  }

  async function removeFromWishlist(slug: string) {
    if (!user) return;
    const res = await fetch("/api/wishlist/" + encodeURIComponent(slug), { method: "DELETE" });
    if (res.ok) setWishlist(await res.json());
  }

  /** 찜 목록 드래그로 바꾼 순서를 저장한다. 서버 응답이 오기 전에 화면부터 먼저 바꿔서(낙관적 업데이트) 딜레이 없이 반영한다. */
  async function reorderWishlist(slugs: string[]) {
    if (!user) return;
    const bySlug = new Map(wishlist.map((g: any) => [g.slug, g]));
    setWishlist(slugs.map((s) => bySlug.get(s)).filter(Boolean));
    const res = await fetch("/api/wishlist/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slugs }),
    });
    if (res.ok) setWishlist(await res.json());
  }

  /** 로그인 성공 시: 게스트 카트가 있으면 서버 카트로 병합, 없으면 그냥 서버 카트를 불러온다. 찜 목록도 같이 불러온다. */
  async function handleLogin(u: User) {
    writeUser(u);
    setUser(u);
    const guestSlugs = readGuestCart();
    if (guestSlugs.length > 0) {
      const res = await fetch("/api/cart/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slugs: guestSlugs }),
      });
      if (res.ok) setCart(await res.json());
      writeGuestCart([]);
    } else {
      const res = await fetch("/api/cart");
      if (res.ok) setCart(await res.json());
    }
    const wres = await fetch("/api/wishlist");
    if (wres.ok) setWishlist(await wres.json());
  }

  function handleLogout() {
    fetch("/api/logout", { method: "POST" }).finally(() => {
      writeUser(null);
      setUser(null);
      setCart([]);
      setWishlist([]);
      writeGuestCart([]);
      setAuthResetKey((k) => k + 1);
      goView("store");
    });
  }

  const VIEW_HASH: Record<string, string> = {
    login: "login", signup: "signup", create: "create", done: "verified", cart: "cart", wishlist: "wishlist",
    sale: "sale", deals: "deals",
  };

  function goView(v: "store" | AuthView | "game" | "cart" | "wishlist" | "category" | "sale" | "deals" | "price", e?: React.MouseEvent) {
    e?.preventDefault();
    window.location.hash = VIEW_HASH[v] ?? "";
    setView(v);
    setModalSlug(null);
    setSearchResults(null);
    window.scrollTo({ top: 0 });
  }

  /** 게임 카드 클릭. 모달 대신 상세 페이지(#app/<slug>)로 넘어간다. */
  function openModal(slug: string) {
    // 최근에 본 게임 목록 갱신 (최신순, 최대 6개)
    const next = [slug, ...readRecent().filter((x) => x !== slug)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    setRecent(next);

    window.location.hash = "app/" + encodeURIComponent(slug);
    setModalSlug(slug);
    setView("game");
    window.scrollTo({ top: 0 });
  }

  /** 카테고리(장르) 타일 클릭 -> 전용 페이지(#category/<slug>)로 이동 */
  function openCategory(slug: string) {
    window.location.hash = "category/" + encodeURIComponent(slug);
    setCategorySlug(slug);
    setView("category");
    window.scrollTo({ top: 0 });
  }

  /** 가격대별 검색 페이지(#price/<max>)로 이동 */
  function openPriceSearch(max: number) {
    window.location.hash = "price/" + max;
    setPriceMax(max);
    setView("price");
    window.scrollTo({ top: 0 });
  }

  /** 태그 이름(예: "RPG")으로 카테고리 페이지 슬러그를 찾는다. 못 찾으면 이름을 그대로 슬러그로 쓴다. */
  function catSlugByName(name: string) {
    return data?.categories?.find((c: any) => c.name === name)?.slug ?? name;
  }

  function handleSearchInput(v: string) {
    setSearchQuery(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!v.trim()) { setSearchResults(null); return; }
    searchTimer.current = setTimeout(async () => {
      const rows = await (await fetch("/api/search?q=" + encodeURIComponent(v))).json();
      setSearchResults(rows);
    }, 220);
  }

  /** 내비 드롭다운에서 신규 출시 섹션의 탭으로 보낸다 */
  function goTab(key: string) {
    if (!data) return;
    const i = data.tabs.findIndex((t: any) => t.key === key);
    if (i < 0) return;
    setView("store");
    setTabIndex(i);
    document.getElementById("relTabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function searchByTag(tag: string) {
    if (!data) return;
    const seen = new Set<string>();
    const rows: any[] = [];
    const pools = [...data.tabs.flatMap((t: any) => t.games), ...data.deals, ...data.featured, ...data.cheap, data.hero];
    for (const g of pools) {
      if (!g || seen.has(g.slug) || !g.tags.includes(tag)) continue;
      seen.add(g.slug);
      rows.push(g);
    }
    setSearchQuery(tag);
    setSearchResults(rows.slice(0, 12));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const dealSlides = data ? chunk(data.deals, 6).filter((c: any[]) => c.length >= 2) : [];
  const catSlides = data ? chunk(data.categories, 5) : [];
  const cheapSlides = data ? chunk(data.cheap, 5) : [];
  const loginPool = data
    ? [...data.featured, ...data.deals, ...data.cheap, ...data.tabs.flatMap((t: any) => t.games)]
        .map((g: any) => g.headerImage)
        .filter(Boolean)
    : [];

  const hoverCtx = {
    show: (g: any, el: HTMLElement) => setHoverInfo({ g, rect: el.getBoundingClientRect() }),
    hide: () => setHoverInfo(null),
  };

  return (
    <HoverCtx.Provider value={hoverCtx}>
      <header className="topbar">
        <div className="wrap">
          {/* 좁은 화면에서만 보이는 햄버거. 상점 내비의 "메뉴" 를 연다 */}
          <button className="nav-burger" type="button" aria-label="메뉴" onClick={() => {
            document.querySelector<HTMLButtonElement>(".nav-all > .item")?.click();
          }}>
            <span /><span /><span />
          </button>
          <a className="logo" href="#" onClick={(e) => goView("store", e)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- 정적 SVG 한 장이라 최적화 대상이 아니다 */}
            <img src="/logo_steam.svg" alt="STEAM" width={145} height={44} />
          </a>
          <nav className="mainnav">
            {/* 실제 Steam 처럼 hover 로 열린다. 항목마다 하위 메뉴가 붙는다. */}
            <div className="mn-item">
              <a className={view === "store" ? "on" : ""} href="#" onClick={(e) => goView("store", e)}>상점</a>
              <div className="mn-drop">
                <a href="#" onClick={(e) => goView("store", e)}>홈</a>
                <a href="#" onClick={(e) => e.preventDefault()}>맞춤 대기열</a>
                <a href="#" onClick={(e) => user ? goView("wishlist", e) : goView("login", e)}>찜 목록</a>
                <a href="#" onClick={(e) => e.preventDefault()}>포인트 상점</a>
                <a href="#" onClick={(e) => e.preventDefault()}>뉴스</a>
                <a href="#" onClick={(e) => e.preventDefault()}>차트</a>
                <a href="#" onClick={(e) => e.preventDefault()}>정보</a>
              </div>
            </div>

            <div className="mn-item">
              <a href="#" onClick={(e) => e.preventDefault()}>커뮤니티</a>
              <div className="mn-drop">
                <a href="#" onClick={(e) => e.preventDefault()}>홈</a>
                <a href="#" onClick={(e) => e.preventDefault()}>토론</a>
                <a href="#" onClick={(e) => e.preventDefault()}>창작마당</a>
                <a href="#" onClick={(e) => e.preventDefault()}>장터</a>
                <a href="#" onClick={(e) => e.preventDefault()}>방송</a>
              </div>
            </div>

            {user ? (
              <>
                <div className="mn-item">
                  <a href="#" className="mainnav-me" onClick={(e) => e.preventDefault()}>{user.nickname.toUpperCase()}</a>
                  <div className="mn-drop">
                    <a href="#" onClick={(e) => e.preventDefault()}>활동</a>
                    <a href="#" onClick={(e) => e.preventDefault()}>프로필</a>
                    <a href="#" onClick={(e) => e.preventDefault()}>친구</a>
                    <a href="#" onClick={(e) => e.preventDefault()}>게임</a>
                    <a href="#" onClick={(e) => e.preventDefault()}>그룹</a>
                    <a href="#" onClick={(e) => e.preventDefault()}>콘텐츠</a>
                    <a href="#" onClick={(e) => e.preventDefault()}>배지</a>
                    <a href="#" onClick={(e) => e.preventDefault()}>보관함</a>
                    <a href="#" onClick={(e) => e.preventDefault()}>Steam 돌아보기</a>
                  </div>
                </div>
                <div className="mn-item"><a href="#" onClick={(e) => e.preventDefault()}>채팅</a></div>
              </>
            ) : (
              <div className="mn-item"><a href="#" onClick={(e) => e.preventDefault()}>정보</a></div>
            )}
            <div className="mn-item"><a href="#" onClick={(e) => e.preventDefault()}>지원</a></div>
          </nav>
          <div className="topright">
            {/* 로그인하면 설치 버튼이 초록에서 반투명 회색으로 바뀐다 (실측 #67707B33) */}
            <a className={"btn-install" + (user ? " gray" : "")} href="#">
              <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 10.6L4.4 7h2.1V1.6h3V7h2.1L8 10.6z" />
                <path d="M2.6 11.4v2a1 1 0 001 1h8.8a1 1 0 001-1v-2h-1.6v1.4H4.2v-1.4H2.6z" />
              </svg>
              Steam 설치
            </a>

            {!user ? (
              <>
                <a className="top-login" href="#login" style={{ visibility: view === "login" ? "hidden" : "visible" }} onClick={(e) => goView("login", e)}>로그인</a>
                <span className="sep">|</span>
                <div className="lang-wrap" ref={langRef}>
                  {/* ▾ 는 실제 Steam 처럼 오른쪽 여백(18px) 안에 ::after 로 그린다 */}
                  <button type="button" className="top-lang" onClick={() => setLangOpen((v) => !v)}>{lang}</button>
                  {langOpen && (
                    <div className="lang-drop">
                      {["한국어", "English", "日本語", "中文(简体)", "Русский", "Español"].map((l) => (
                        <button
                          key={l}
                          type="button"
                          className={"lang-opt" + (l === lang ? " on" : "")}
                          onClick={() => { setLang(l); setLangOpen(false); }}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="user-wrap" ref={userMenuRef}>
                <button className="top-bell" type="button" aria-label="알림">
                  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M8 1.4a1 1 0 011 1v.5a3.9 3.9 0 013 3.8v2.2l1.2 1.9a.6.6 0 01-.5.9H3.3a.6.6 0 01-.5-.9L4 8.9V6.7a3.9 3.9 0 013-3.8v-.5a1 1 0 011-1z" />
                    <path d="M6.4 12.5h3.2a1.6 1.6 0 01-3.2 0z" />
                  </svg>
                </button>
                {/* 계정 이름을 누르면 메뉴가 열린다 */}
                <button type="button" className="top-name" onClick={() => setUserMenuOpen((v) => !v)}>{user.nickname}</button>
                <span className="top-avatar" aria-hidden="true">?</span>

                {userMenuOpen && (
                  <div className="user-drop">
                    <a href="#" onClick={(e) => e.preventDefault()}>프로필 보기</a>
                    <div className="user-drop-info">계정 정보: <a href="#" onClick={(e) => e.preventDefault()}>{user.nickname}</a></div>
                    <a href="#" onClick={(e) => e.preventDefault()}>상점 환경 설정</a>
                    <a href="#" onClick={(e) => { e.preventDefault(); setUserMenuOpen(false); setLangOpen(true); }}>언어 변경</a>
                    <a href="#" onClick={(e) => { e.preventDefault(); handleLogout(); }}>계정에서 로그아웃...</a>
                  </div>
                )}
                {langOpen && (
                  <div className="lang-drop">
                    {["한국어", "English", "日本語", "中文(简体)", "Русский", "Español"].map((l) => (
                      <button
                        key={l}
                        type="button"
                        className={"lang-opt" + (l === lang ? " on" : "")}
                        onClick={() => { setLang(l); setLangOpen(false); }}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <StoreNav
        data={data}
        searchQuery={searchQuery}
        searchResults={searchResults}
        onSearchInput={handleSearchInput}
        onOpenGame={openModal}
        onTag={searchByTag}
        onTab={goTab}
        onCloseResults={() => setSearchResults(null)}
        wishlistCount={user ? wishlist.length : null}
        cartCount={cart.length}
        recentSlugs={recent}
        onOpenCart={(e) => goView("cart", e)}
        onOpenWishlist={(e) => goView("wishlist", e)}
        onOpenCategory={openCategory}
      />

      {view === "store" && (
        <>
          {error && <div className="err">데이터를 불러오지 못했습니다: {error}</div>}
          {!error && !data && <div className="loading">DB에서 상점 데이터를 불러오는 중…</div>}

          {data && (
            <>
              {/* 상단 히어로는 사이버펑크 전면 배너가 대신한다. */}
              <Takeover onOpen={() => goView("sale")} />

              <section className="section">
                <div className="wrap">
                  <div className="sec-head feat-sec-head">
                    <h2 className="sec-title">특집 및 추천 게임</h2>
                    <a className="giftcard" href="#"><span className="gc-icon" />기프트 카드 보내기</a>
                  </div>
                </div>
                <div className="carousel-bleed">
                  <Carousel autoMs={7000} peek={12} arrowInset={9} slides={data.featured.map((g: any) => <FeatCard key={g.slug} g={g} onOpen={openModal} />)} />
                </div>
              </section>

              <section className="section"><div className="wrap align-feat">
                <div className="sec-head">
                  <h2 className="sec-title">할인 및 이벤트</h2>
                  <button className="more-btn" onClick={() => goView("deals")}>더 보기</button>
                </div>
                <Carousel
                  autoMs={9000}
                  peek={6}
                  peekRight
                  arrowInset={-3.5}
                  className="deals-carousel"
                  slides={dealSlides.map((chunkItems: any[], i: number) => (
                    <div className="deals" key={i}>
                      {chunkItems.map((g: any) => (
                        <DealCard key={g.slug} g={g} size="sm" onOpen={openModal} />
                      ))}
                    </div>
                  ))}
                />
                <div className="queue">
                  <div className="q-left">
                    <h4>맞춤 대기열 둘러보기</h4>
                    {/* 로그인 상태면 로그인 버튼을 감춘다 */}
                    <p>
                      {user
                        ? "인기 게임, 신규 출시 게임, 추천 게임을 살펴보세요"
                        : "로그인하여 인기 게임, 신규 출시 게임, 추천 게임 보기"}
                    </p>
                    {!user && (
                      <a className="btn-blue" href="#login" onClick={(e) => goView("login", e)}>로그인</a>
                    )}
                  </div>
                  <div className="q-right">
                    {data.featured.slice(0, 4).map((g: any) => <div key={g.slug} style={bgStyle(g.headerImage)} />)}
                  </div>
                </div>
              </div></section>

              <section className="section"><div className="wrap spotlights align-feat">
                {data.spotlights.map((s: any) => (
                  <div className="spot" key={s.tag}>
                    <div className="sec-head"><div><h2 className="sec-title">{s.tag} 게임</h2><div className="sec-sub">집중 조명 태그</div></div></div>
                    <div className="spot-body">
                      {s.games.map((g: any) => <SpotCard key={g.slug} g={g} onOpen={openModal} />)}
                    </div>
                    <div className="spot-foot">
                      <button className="more-btn" onClick={() => openCategory(catSlugByName(s.tag))}>더 보기</button>
                    </div>
                  </div>
                ))}
              </div></section>

              <section className="section"><div className="wrap align-feat">
                <div className="tabs" id="relTabs">
                  {data.tabs.map((t: any, i: number) => (
                    <button
                      key={t.key}
                      className={"tab" + (i === tabIndex ? " on" : "")}
                      onClick={() => setTabIndex(i)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="releases">
                  <div className="rel-list">
                    {data.tabs[tabIndex].games.length
                      ? data.tabs[tabIndex].games.map((g: any, i: number) => (
                        <RelRow key={g.slug} g={g} onOpen={openModal} onHover={() => setRelHoverIndex(i)} />
                      ))
                      : <div className="loading">해당하는 게임이 없습니다.</div>}
                    <div className="rel-foot">
                      더 보기:
                      <button className="more-btn" onClick={() => openCategory(catSlugByName("대규모 멀티플레이어"))}>멀티플레이 게임</button>
                      <span>또는</span>
                      <button className="more-btn" onClick={() => openCategory(catSlugByName("무료 플레이"))}>무료 플레이 게임</button>
                    </div>
                  </div>
                  <aside className="rel-side">
                    <RelSide g={data.tabs[tabIndex].games[relHoverIndex] ?? data.tabs[tabIndex].games[0]} />
                  </aside>
                </div>
              </div></section>

              <section className="section"><div className="wrap align-feat">
                <div className="sec-head"><h2 className="sec-title">카테고리별 검색</h2></div>
                <Carousel
                  autoMs={0}
                  slides={catSlides.map((items: any[], i: number) => (
                    <div className="cats" key={i}>
                      {items.map((c: any) => (
                        <div className="cat" key={c.slug} onClick={() => openCategory(c.slug)}>
                          <div className="veil" style={bgStyle(c.image)} />
                          <b>{c.name}</b>
                          <small>{c.count}종</small>
                        </div>
                      ))}
                    </div>
                  ))}
                />
              </div></section>

              <section className="section"><div className="wrap align-feat">
                <div className="sec-head">
                  <h2 className="sec-title">₩ 10,000 미만</h2>
                  <div className="headbtns">
                    더 보기:
                    <button className="more-btn" onClick={() => openPriceSearch(10000)}>₩ 10,000 미만</button>
                    <button className="more-btn" onClick={() => openPriceSearch(5000)}>₩ 5,000 미만</button>
                  </div>
                </div>
                <Carousel
                  autoMs={0}
                  slides={cheapSlides.map((items: any[], i: number) => (
                    <div className="cheap" key={i}>
                      {items.map((g: any) => (
                        <CheapCard key={g.slug} g={g} onOpen={openModal} />
                      ))}
                    </div>
                  ))}
                />
              </div></section>
            </>
          )}
        </>
      )}

      {view === "game" && modalSlug && (
        <GamePage
          slug={modalSlug}
          onBack={() => goView("store")}
          onOpenGame={openModal}
          onTag={(t) => { goView("store"); searchByTag(t); }}
          inCart={cart.some((c: any) => c.slug === modalSlug)}
          onToggleCart={(slug) =>
            cart.some((c: any) => c.slug === slug) ? removeFromCart(slug) : addToCart(slug)
          }
          user={user}
          inWishlist={wishlist.some((w: any) => w.slug === modalSlug)}
          onToggleWishlist={(slug) =>
            wishlist.some((w: any) => w.slug === slug) ? removeFromWishlist(slug) : addToWishlist(slug)
          }
        />
      )}

      {view === "cart" && (
        <CartPage
          cart={cart}
          onBack={() => goView("store")}
          onRemove={removeFromCart}
          onOpenGame={openModal}
          onCheckout={checkout}
          checkoutBusy={checkoutBusy}
          checkoutError={checkoutError}
          payMethods={PAY_METHODS}
          payMethodId={payMethodId}
          onSelectPayMethod={setPayMethodId}
        />
      )}

      {view === "wishlist" && (
        user ? (
          <WishlistPage
            wishlist={wishlist}
            cart={cart}
            user={user}
            onBack={() => goView("store")}
            onOpenGame={openModal}
            onRemove={removeFromWishlist}
            onAddToCart={addToCart}
            onReorder={reorderWishlist}
          />
        ) : (
          <div className="cartpage"><div className="wrap cp-empty">
            <p>찜 목록은 로그인 후 이용할 수 있습니다.</p>
            <a className="btn-blue" href="#login" onClick={(e) => goView("login", e)}>로그인</a>
          </div></div>
        )
      )}

      {view === "sale" && (
        <SalePage
          data={data}
          bg={TAKEOVER_BG}
          onOpenGame={openModal}
          onTag={(t) => { goView("store"); searchByTag(t); }}
        />
      )}

      {view === "category" && categorySlug && (
        <CategoryPage
          slug={categorySlug}
          user={user}
          wishlist={wishlist}
          onOpenGame={openModal}
          onLogin={(e) => goView("login", e)}
          onToggleWishlist={(slug) =>
            wishlist.some((w: any) => w.slug === slug) ? removeFromWishlist(slug) : addToWishlist(slug)
          }
        />
      )}

      {view === "deals" && data && (
        <DealsPage
          categories={data.categories}
          user={user}
          wishlist={wishlist}
          onOpenGame={openModal}
          onOpenCategory={openCategory}
          onLogin={(e) => goView("login", e)}
          onToggleWishlist={(slug) =>
            wishlist.some((w: any) => w.slug === slug) ? removeFromWishlist(slug) : addToWishlist(slug)
          }
        />
      )}

      {view === "price" && (
        <PriceSearchPage max={priceMax} onOpenGame={openModal} onChangeMax={openPriceSearch} />
      )}

      <Auth
        key={authResetKey}
        view={view}
        pool={loginPool}
        onView={(v) => goView(v)}
        onLogin={handleLogin}
      />

      <footer>
        <div className="wrap foot-grid">
          <div className="foot-brand">
            <div className="foot-logos">
              <span className="lg">STEAM®</span>
              <span className="lg">VALVE</span>
            </div>
            © 2026 Valve Corporation. All rights reserved. 모든 상표는 미국 및 기타 국가에서 해당 소유자의 재산입니다.<br />
            해당하는 경우 모든 가격에 부가가치세가 포함되어 있습니다.
            <div className="socials"><i /><i /><i /><i /></div>
          </div>
          <div className="foot-col">
            <h6>STEAM</h6>
            <a href="#">Steam 정보</a><a href="#">Steam 이용 약관</a><a href="#">Steamworks</a><a href="#">Steam 배포</a><a href="#">기프트 카드</a>
          </div>
          <div className="foot-col">
            <h6>VALVE</h6>
            <a href="#">Valve 소개</a><a href="#">채용 정보</a><a href="#">하드웨어</a><a href="#">재활용</a>
          </div>
          <div className="foot-col">
            <h6>법적 고지</h6>
            <a href="#">개인정보 처리방침</a><a href="#">접근성</a><a href="#">고지 및 정책</a><a href="#">쿠키</a><a href="#">환불</a>
          </div>
          <div className="foot-col">
            <h6>더 보기</h6>
            <a href="#">Steam 다운로드</a><a href="#">모바일 앱 다운로드</a><a href="#">Steam 고객지원</a><a href="#">내 계정</a>
          </div>
        </div>
      </footer>

      <GameHoverCard info={hoverInfo} />
    </HoverCtx.Provider>
  );
}
