"use client";

import { useEffect, useRef, useState } from "react";
import StoreNav from "@/components/storenav";
import Auth, { readUser, writeUser, type AuthView, type User } from "@/components/auth";

const won = (n: number) => "₩ " + Number(n).toLocaleString("ko-KR");

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

function chunk<T>(arr: T[], n: number): T[][] {
  return arr.reduce((a: T[][], _: T, i: number) => (i % n ? a : [...a, arr.slice(i, i + n)]), []);
}

const TAGLINE_CLASS: Record<string, string> = {
  "일일 특가": "day",
  "주중 특가": "week",
  "시즌 세일": "season",
  "특별 할인": "season",
};

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
function Carousel({ slides, autoMs = 0, peek = 0 }: { slides: React.ReactNode[]; autoMs?: number; peek?: number }) {
  const n = slides.length;
  const loop = n > 1;
  // 회전문 트릭: 맨 앞엔 마지막 슬라이드 복제, 맨 뒤엔 첫 슬라이드 복제를 붙여둔다.
  // pos(렌더링 인덱스)는 1..n이 진짜 슬라이드, 0과 n+1은 가짜(복제) 자리.
  const rendered = loop ? [slides[n - 1], ...slides, slides[0]] : slides;
  const total = rendered.length;

  const [pos, setPos] = useState(loop ? 1 : 0);
  const [animate, setAnimate] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const realIndex = loop ? (pos - 1 + n) % n : pos;

  const stop = () => { if (timerRef.current) clearInterval(timerRef.current); };
  const step = (dir: number) => {
    setAnimate(true);
    setPos((p) => p + dir);
  };
  const restart = () => {
    stop();
    if (autoMs && n > 1) {
      timerRef.current = setInterval(() => step(1), autoMs);
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
  const slideWidth = 100 - peek * 2;
  const trackWidth = total * slideWidth;
  const translatePercent = ((peek - pos * slideWidth) / trackWidth) * 100;

  return (
    <div className={"carousel" + (peek > 0 ? " carousel-peek" : "")} onMouseEnter={stop} onMouseLeave={restart}>
      <button className="arrow prev" aria-label="이전" onClick={() => { step(-1); restart(); }}>‹</button>
      <button className="arrow next" aria-label="다음" onClick={() => { step(1); restart(); }}>›</button>
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
function Hero({ g, onOpen }: { g: any; onOpen: (slug: string) => void }) {
  if (!g) return null;
  const shot = g.screenshots?.[0]?.url || g.headerImage;
  return (
    <section className="hero">
      <div className="hero-bg-blur" style={bgStyle(shot)} />
      <div className="hero-edge-fade" />
      <div className="hero-bg" style={bgStyle(shot)} />
      <div className="wrap hero-inner">
        <div className="hero-cap" style={bgStyle(g.capsuleImage || g.headerImage)} />
        <div className="hero-txt">
          <span className="hero-kicker">
            {g.discountPercent > 0 ? `${g.discountLabel || "할인"} · -${g.discountPercent}%` : "지금 인기"}
          </span>
          <h1>{g.name}</h1>
          <div className="hero-meta">
            <span>{g.developer}</span>
            <span>·</span>
            <span>{ymd(g.releaseDate)}</span>
            {g.reviewDesc && (
              <>
                <span>·</span>
                <span style={{ color: "var(--blue)" }}>{g.reviewDesc}</span>
              </>
            )}
          </div>
          <div className="hero-buy">
            <a className="hero-cta" href="#" onClick={(e) => { e.preventDefault(); onOpen(g.slug); }}>상점 페이지 보기</a>
            <span className="price-tag">{priceText(g)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------
// 카드들
// ---------------------------------------------------------------
function FeatCard({ g, onOpen }: { g: any; onOpen: (slug: string) => void }) {
  const art = g.screenshots?.[0]?.url || g.headerImage;
  const thumbs = (g.screenshots?.slice(1, 5).length ? g.screenshots.slice(1, 5) : g.screenshots?.slice(0, 4)) ?? [];
  return (
    <div className="feat" onClick={() => onOpen(g.slug)}>
      <div className="feat-art" style={bgStyle(art)}>
        {g.discountPercent > 0 && <span className="badge-live"><i />{g.discountLabel}</span>}
      </div>
      <div className="feat-info">
        <h3>{g.name}</h3>
        <Reviews g={g} />
        <div className="thumbs">
          {thumbs.map((s: any, i: number) => (
            <div key={i} className="thumb" style={bgStyle(s.thumb || s.url)} />
          ))}
        </div>
        <div className="feat-tags">
          {g.tags.slice(0, 5).map((t: string) => <span key={t} className="pill">{t}</span>)}
        </div>
        <div className="feat-meta">
          <div className="rank">
            📈
            <div>
              <b>{g.discountPercent > 0 ? "할인 중" : "최고 인기 게임"}</b>
              <small>Steam 평가 {(g.reviewTotal || 0).toLocaleString("ko-KR")}개</small>
            </div>
          </div>
          <span className="price-tag">{priceText(g)}</span>
        </div>
      </div>
    </div>
  );
}

function DealCard({ g, size, onOpen }: { g: any; size: "big" | "sm"; onOpen: (slug: string) => void }) {
  const art = size === "big" ? (g.capsuleImage || g.headerImage) : g.headerImage;
  const cls = TAGLINE_CLASS[g.discountLabel] || "season";
  return (
    <div className={`deal-${size}`} onClick={() => onOpen(g.slug)}>
      <span className={`tagline ${cls}`}>{g.discountLabel || "할인"}</span>
      <div className="art" style={bgStyle(art)} />
      <div className="card-name">{g.name}</div>
      <PriceBar g={g} />
    </div>
  );
}

function SpotCard({ g, onOpen }: { g: any; onOpen: (slug: string) => void }) {
  return (
    <div className="spot-card" onClick={() => onOpen(g.slug)}>
      <div className="art" style={bgStyle(g.headerImage)} />
      <div className="card-name">{g.name}</div>
      <PriceBar g={g} />
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
  const shots = g.screenshots?.slice(0, 3) ?? [];
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
// 상세 모달
// ---------------------------------------------------------------
function Modal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [g, setG] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [shotIndex, setShotIndex] = useState(0);

  useEffect(() => {
    setG(null);
    setError(null);
    setShotIndex(0);
    fetch("/api/game/" + encodeURIComponent(slug))
      .then((r) => { if (!r.ok) throw new Error("not found"); return r.json(); })
      .then(setG)
      .catch(() => setError("게임을 찾을 수 없습니다."));
  }, [slug]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const plat = g
    ? [g.platforms?.windows && "Windows", g.platforms?.mac && "macOS", g.platforms?.linux && "Linux"].filter(Boolean).join(", ")
    : "";
  const req = g?.reqWindows?.minimum ? String(g.reqWindows.minimum) : null;
  const shots = g?.screenshots ?? [];

  return (
    <div className="modal-back on" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        {!g && !error && <div className="loading">불러오는 중…</div>}
        {error && <div className="err">{error}</div>}
        {g && (
          <>
            <button className="modal-x" aria-label="닫기" onClick={onClose}>×</button>
            <div className="m-head">
              <h2>{g.name}</h2>
              <div className="sub">
                {g.developer} · {ymd(g.releaseDate)}
                {g.steamAppId ? ` · appid ${g.steamAppId}` : ""}
                {g.metacritic ? ` · 메타크리틱 ${g.metacritic}` : ""}
              </div>
            </div>
            <div className="m-body">
              <div className="m-left">
                <div className="m-shot" style={bgStyle(shots[shotIndex]?.url || g.headerImage)} />
                <div className="m-strip">
                  {shots.map((s: any, i: number) => (
                    <div
                      key={i}
                      className={i === shotIndex ? "on" : ""}
                      style={bgStyle(s.thumb || s.url)}
                      onClick={() => setShotIndex(i)}
                    />
                  ))}
                </div>
                <h3 className="m-sec">게임 정보</h3>
                <div className="m-about">{g.description || g.shortDesc}</div>
                {g.reviews?.length > 0 && (
                  <>
                    <h3 className="m-sec">사용자 평가 ({g.reviewCountLocal})</h3>
                    {g.reviews.map((r: any, i: number) => (
                      <div className="m-review" key={i}>
                        <div className="who">
                          <b>{r.nickname}</b> · <span className={r.isRecommended ? "rec" : "norec"}>{r.isRecommended ? "추천" : "비추천"}</span> · {r.playtimeHours}시간 플레이 · 도움됨 {r.helpfulCount}
                        </div>
                        <p>{r.content}</p>
                      </div>
                    ))}
                  </>
                )}
                {req && <><h3 className="m-sec">최소 시스템 요구 사항</h3><div className="m-req">{req}</div></>}
              </div>
              <div className="m-right">
                <div className="m-cap" style={bgStyle(g.headerImage)} />
                <div className="m-desc">{g.shortDesc}</div>
                <div className="m-rows">
                  <div><b>평가</b> {g.reviewDesc || "평가 없음"}{g.reviewPercent != null ? ` (${g.reviewPercent}%)` : ""}</div>
                  <div><b>출시일</b> {ymd(g.releaseDate)}</div>
                  <div><b>개발자</b> {g.developer}</div>
                  <div><b>배급사</b> {g.publisher}</div>
                  <div><b>플랫폼</b> {plat || "-"}</div>
                  <div><b>이용 등급</b> {g.requiredAge ? g.requiredAge + "세 이상" : "전체 이용가"}</div>
                  {g.dlcCount ? <div><b>DLC</b> {g.dlcCount}종</div> : null}
                </div>
                <div className="m-buy">
                  {g.discountPercent > 0 ? (
                    <>
                      <span className="disc">-{g.discountPercent}%</span>
                      <span><span className="was">{won(g.priceKrw)}</span> <span className="now">{won(g.finalKrw)}</span></span>
                    </>
                  ) : (
                    <span className="now">{priceText(g)}</span>
                  )}
                  <button className="btn-green">카트에 추가</button>
                </div>
                <div className="tag-pills">
                  {g.tags?.map((t: string) => <span key={t} className="pill">{t}</span>)}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
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
  const [view, setView] = useState<"store" | AuthView>("store");
  const [user, setUser] = useState<User | null>(null);
  // 로그아웃할 때만 올려서 Auth를 새로 마운트한다 (로그인 직후 뜨는 성공 메시지는 유지해야 하므로
  // user id를 그대로 key로 쓰면 안 됨 - 로그인 순간에도 리마운트되어 메시지가 사라진다).
  const [authResetKey, setAuthResetKey] = useState(0);
  const [modalSlug, setModalSlug] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const OF_HASH: Record<string, "store" | AuthView> = {
      "#login": "login", "#signup": "signup", "#create": "create", "#verified": "done",
    };
    function applyHash() {
      setView(OF_HASH[window.location.hash] ?? "store");
    }
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  useEffect(() => { setUser(readUser()); }, []);

  useEffect(() => { setRelHoverIndex(0); }, [tabIndex]);

  const VIEW_HASH: Record<string, string> = { login: "login", signup: "signup", create: "create", done: "verified" };

  function goView(v: "store" | AuthView, e?: React.MouseEvent) {
    e?.preventDefault();
    window.location.hash = VIEW_HASH[v] ?? "";
    setView(v);
    setModalSlug(null);
    setSearchResults(null);
    window.scrollTo({ top: 0 });
  }

  function openModal(slug: string) {
    setModalSlug(slug);
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

  const dealSlides = data ? chunk(data.deals, 4).filter((c: any[]) => c.length >= 2) : [];
  const catSlides = data ? chunk(data.categories, 5) : [];
  const cheapSlides = data ? chunk(data.cheap, 5) : [];
  const loginPool = data
    ? [...data.featured, ...data.deals, ...data.cheap, ...data.tabs.flatMap((t: any) => t.games)]
        .map((g: any) => g.headerImage)
        .filter(Boolean)
    : [];

  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <a className="logo" href="#" onClick={(e) => goView("store", e)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- 정적 SVG 한 장이라 최적화 대상이 아니다 */}
            <img src="/logo_steam.svg" alt="STEAM" width={145} height={44} />
          </a>
          <nav className="mainnav">
            <a className={view === "store" ? "on" : ""} href="#" onClick={(e) => goView("store", e)}>상점</a>
            <a href="#">커뮤니티</a>
            <a href="#">정보</a>
            <a href="#">지원</a>
          </nav>
          <div className="topright">
            <a className="btn-install" href="#">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="#fff"><path d="M8 11L3 6h3V1h4v5h3z" /><rect x="2" y="12" width="12" height="2" /></svg>
              Steam 설치
            </a>
            {!user && (
              <a href="#login" style={{ visibility: view === "login" ? "hidden" : "visible" }} onClick={(e) => goView("login", e)}>로그인</a>
            )}
            {user && (
              <span className="topuser">
                <b>{user.nickname}</b>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    fetch("/api/logout", { method: "POST" }).finally(() => {
                      writeUser(null);
                      setUser(null);
                      setAuthResetKey((k) => k + 1);
                      goView("store");
                    });
                  }}
                >
                  로그아웃
                </a>
              </span>
            )}
            <span className="sep">|</span>
            <a href="#">언어 ▾</a>
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
      />

      {view === "store" && (
        <>
          {error && <div className="err">데이터를 불러오지 못했습니다: {error}</div>}
          {!error && !data && <div className="loading">DB에서 상점 데이터를 불러오는 중…</div>}

          {data && (
            <>
              <Hero g={data.hero} onOpen={openModal} />

              <section className="section">
                <div className="wrap">
                  <div className="sec-head feat-sec-head">
                    <h2 className="sec-title">특집 및 추천 게임</h2>
                    <a className="giftcard" href="#"><span className="gc-icon" />기프트 카드 보내기</a>
                  </div>
                </div>
                <div className="carousel-bleed">
                  <Carousel autoMs={7000} peek={17} slides={data.featured.map((g: any) => <FeatCard key={g.slug} g={g} onOpen={openModal} />)} />
                </div>
                <div className="wrap">
                <div className="promo">
                  <div className="left">
                    <span className="kicker">STEAM</span>
                    <h4>여름 세일<br />진행 중</h4>
                    <p>현재 {data.stats.discounts}종 할인 중 · 전체 {data.stats.games}종</p>
                  </div>
                  <div className="right"><div className="box">할인 종료<br />{ymd(data.deals[0]?.discountEndsAt)}</div></div>
                </div>
                </div>
              </section>

              <section className="section"><div className="wrap">
                <div className="sec-head">
                  <h2 className="sec-title">할인 및 이벤트</h2>
                  <button className="more-btn">더 보기</button>
                </div>
                <Carousel
                  autoMs={9000}
                  slides={dealSlides.map((chunkItems: any[], i: number) => {
                    const [b1, b2, s1, s2] = chunkItems;
                    return (
                      <div className="deals" key={i}>
                        {b1 && <DealCard g={b1} size="big" onOpen={openModal} />}
                        {b2 && <DealCard g={b2} size="big" onOpen={openModal} />}
                        <div className="deal-col">
                          {s1 && <DealCard g={s1} size="sm" onOpen={openModal} />}
                          {s2 && <DealCard g={s2} size="sm" onOpen={openModal} />}
                        </div>
                      </div>
                    );
                  })}
                />
                <div className="queue">
                  <div className="q-left">
                    <h4>맞춤 대기열 둘러보기</h4>
                    <p>로그인하여 인기 게임, 신규 출시 게임, 추천 게임 보기</p>
                    <a className="btn-blue" href="#login" onClick={(e) => goView("login", e)}>로그인</a>
                  </div>
                  <div className="q-right">
                    {data.featured.slice(0, 4).map((g: any) => <div key={g.slug} style={bgStyle(g.headerImage)} />)}
                  </div>
                </div>
              </div></section>

              <section className="section"><div className="wrap spotlights">
                {data.spotlights.map((s: any) => (
                  <div className="spot" key={s.tag}>
                    <div className="sec-head"><div><h2 className="sec-title">{s.tag} 게임</h2><div className="sec-sub">집중 조명 태그</div></div></div>
                    <div className="spot-body">
                      {s.games.map((g: any) => <SpotCard key={g.slug} g={g} onOpen={openModal} />)}
                    </div>
                    <div className="spot-foot"><button className="more-btn">더 보기</button></div>
                  </div>
                ))}
              </div></section>

              <section className="section"><div className="wrap">
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
                      <button className="more-btn">인기 신규 출시 게임</button>
                      <span>또는</span>
                      <button className="more-btn">신규 출시 게임 전체</button>
                    </div>
                  </div>
                  <aside className="rel-side">
                    <RelSide g={data.tabs[tabIndex].games[relHoverIndex] ?? data.tabs[tabIndex].games[0]} />
                  </aside>
                </div>
              </div></section>

              <section className="section"><div className="wrap">
                <div className="sec-head"><h2 className="sec-title">카테고리별 검색</h2></div>
                <Carousel
                  autoMs={0}
                  slides={catSlides.map((items: any[], i: number) => (
                    <div className="cats" key={i}>
                      {items.map((c: any) => (
                        <div className="cat" key={c.slug} onClick={() => searchByTag(c.name)}>
                          <div className="veil" style={bgStyle(c.image)} />
                          <b>{c.name}</b>
                          <small>{c.count}종</small>
                        </div>
                      ))}
                    </div>
                  ))}
                />
              </div></section>

              <section className="section"><div className="wrap">
                <div className="sec-head">
                  <h2 className="sec-title">₩ 10,000 미만</h2>
                  <div className="headbtns">더 보기: <button className="more-btn">₩ 10,000 미만</button><button className="more-btn">₩ 5,000 미만</button></div>
                </div>
                <Carousel
                  autoMs={0}
                  slides={cheapSlides.map((items: any[], i: number) => (
                    <div className="cheap" key={i}>
                      {items.map((g: any) => (
                        <div className="cheap-card" key={g.slug} onClick={() => openModal(g.slug)}>
                          <div className="art" style={bgStyle(g.capsuleImage || g.headerImage)} />
                          <div className="card-name">{g.name}</div>
                          <PriceBar g={g} />
                        </div>
                      ))}
                    </div>
                  ))}
                />
              </div></section>
            </>
          )}
        </>
      )}

      <Auth
        key={authResetKey}
        view={view}
        pool={loginPool}
        onView={(v) => goView(v)}
        onLogin={(u) => { writeUser(u); setUser(u); }}
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

      {modalSlug && <Modal slug={modalSlug} onClose={() => setModalSlug(null)} />}
    </>
  );
}
