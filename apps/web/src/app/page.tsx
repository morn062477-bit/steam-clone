"use client";

import { useEffect, useRef, useState } from "react";

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
function Carousel({ slides, autoMs = 0 }: { slides: React.ReactNode[]; autoMs?: number }) {
  const [i, setI] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => { if (timerRef.current) clearInterval(timerRef.current); };
  const restart = () => {
    stop();
    if (autoMs && slides.length > 1) {
      timerRef.current = setInterval(() => setI((v) => (v + 1) % slides.length), autoMs);
    }
  };
  const go = (n: number) => {
    setI(((n % slides.length) + slides.length) % slides.length);
    restart();
  };

  useEffect(() => {
    restart();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMs, slides.length]);

  if (!slides.length) return null;

  return (
    <div className="carousel" onMouseEnter={stop} onMouseLeave={restart}>
      <button className="arrow prev" aria-label="이전" onClick={() => go(i - 1)}>‹</button>
      <button className="arrow next" aria-label="다음" onClick={() => go(i + 1)}>›</button>
      <div className="car-view">
        <div className="car-track" style={{ transform: `translateX(${-i * 100}%)` }}>
          {slides}
        </div>
      </div>
      <div className="dots">
        {slides.map((_, n) => (
          <span key={n} className={"dot" + (n === i ? " on" : "")} onClick={() => go(n)} />
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
    <div className="car-slide">
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
// 로그인 화면
// ---------------------------------------------------------------
function LoginView({ active, pool, onStore }: { active: boolean; pool: string[]; onStore: (e: React.MouseEvent) => void }) {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const id = (form.elements.namedItem("account") as HTMLInputElement).value.trim();
    const pw = (form.elements.namedItem("password") as HTMLInputElement).value;
    if (!id || !pw) {
      setMsg({ text: "계정 이름과 비밀번호를 모두 입력하세요.", ok: false });
      return;
    }
    setMsg({ text: `${id} 님, 화면만 있는 데모입니다. 로그인 API는 아직 없습니다.`, ok: true });
  }

  return (
    <section id="loginView" className={active ? "on" : ""}>
      <div className="login-bg">
        {Array.from({ length: 40 }, (_, i) => (
          <span key={i} style={pool.length ? bgStyle(pool[i % pool.length]) : undefined} />
        ))}
      </div>
      <div className="login-veil" />

      <div className="login-inner">
        <div className="wrap">
          <h1 className="login-title">로그인</h1>

          <form className="login-box" autoComplete="off" onSubmit={handleSubmit}>
            <div className="login-left">
              <label className="field-label" htmlFor="account">계정 이름으로 로그인</label>
              <input className="login-input" type="text" id="account" name="account" />

              <label className="field-label" htmlFor="password" style={{ color: "var(--text)" }}>비밀번호</label>
              <input className="login-input" type="password" id="password" name="password" />

              <label className="checkbox-row">
                <input type="checkbox" defaultChecked />
                로그인 정보 저장
              </label>

              <button className="btn-login" type="submit">로그인</button>
              <div className={"login-msg" + (msg?.ok ? " ok" : "")}>{msg?.text}</div>
              <p className="help-link"><a href="#">로그인 관련 문제</a></p>
            </div>

            <div className="login-right">
              <p className="qr-title">또는 <strong>QR 코드로 로그인</strong></p>
              <div className="qr-code">
                <svg viewBox="0 0 21 21" shapeRendering="crispEdges" role="img" aria-label="QR 코드 자리 표시자">
                  <rect width="21" height="21" fill="#fff" />
                  <g fill="#000">
                    <path d="M0 0h7v7H0z" /><path d="M1 1h5v5H1z" fill="#fff" /><path d="M2 2h3v3H2z" />
                    <path d="M14 0h7v7h-7z" /><path d="M15 1h5v5h-5z" fill="#fff" /><path d="M16 2h3v3h-3z" />
                    <path d="M0 14h7v7H0z" /><path d="M1 15h5v5H1z" fill="#fff" /><path d="M2 16h3v3H2z" />
                    <path d="M9 0h1v1H9zM11 1h1v1h-1zM9 2h1v1H9zM12 3h1v1h-1zM9 4h1v1H9zM11 5h1v1h-1z" />
                    <path d="M0 9h1v1H0zM2 9h1v1H2zM4 10h1v1H4zM1 11h1v1H1zM5 11h1v1H5zM3 12h1v1H3z" />
                    <path d="M9 9h1v1H9zM11 9h1v1h-1zM13 10h1v1h-1zM10 11h1v1h-1zM12 12h1v1h-1zM9 13h1v1H9z" />
                    <path d="M16 9h1v1h-1zM18 10h1v1h-1zM20 11h1v1h-1zM17 12h1v1h-1zM19 13h1v1h-1z" />
                    <path d="M9 16h1v1H9zM11 17h1v1h-1zM13 16h1v1h-1zM10 18h1v1h-1zM12 19h1v1h-1zM9 20h1v1H9z" />
                    <path d="M16 16h1v1h-1zM18 17h1v1h-1zM20 16h1v1h-1zM17 19h1v1h-1zM19 20h1v1h-1z" />
                  </g>
                </svg>
              </div>
              <p className="qr-caption"><a href="#">Steam 모바일 앱을 사용하여 QR 코드로 로그인</a></p>
            </div>
          </form>

          <section className="join">
            <div className="join-left">
              <h2>Steam에 처음 오셨나요?</h2>
              <a href="#" className="btn-join">가입하기</a>
            </div>
            <p className="join-right">
              무료로 쉽게 가입할 수 있습니다. 수천 종류의 게임을 전 세계 새로운 친구들과 함께 즐겨보세요.
              <a href="#" onClick={onStore}>상점 둘러보기</a>
            </p>
          </section>
        </div>
      </div>
    </section>
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
  const [view, setView] = useState<"store" | "login">("store");
  const [modalSlug, setModalSlug] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);

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
    function applyHash() {
      setView(window.location.hash === "#login" ? "login" : "store");
    }
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  useEffect(() => { setRelHoverIndex(0); }, [tabIndex]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchResults(null);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  function goView(v: "store" | "login", e?: React.MouseEvent) {
    e?.preventDefault();
    window.location.hash = v === "login" ? "login" : "";
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
            <svg viewBox="0 0 64 64" aria-hidden="true">
              <circle cx="32" cy="32" r="30" fill="#2a3f5a" />
              <circle cx="40" cy="24" r="10" fill="none" stroke="#c7d5e0" strokeWidth="3" />
              <circle cx="40" cy="24" r="4" fill="#c7d5e0" />
              <circle cx="22" cy="42" r="8" fill="none" stroke="#c7d5e0" strokeWidth="3" />
              <line x1="26" y1="38" x2="38" y2="27" stroke="#c7d5e0" strokeWidth="3" />
            </svg>
            <span>STEAM<sup>®</sup></span>
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
            <a href="#login" style={{ visibility: view === "login" ? "hidden" : "visible" }} onClick={(e) => goView("login", e)}>로그인</a>
            <span className="sep">|</span>
            <a href="#">언어 ▾</a>
          </div>
        </div>
      </header>

      <div className="storenav">
        <div className="wrap">
          <a className="item" href="#">검색<i className="caret" /></a>
          <a className="item" href="#">추천 제품<i className="caret" /></a>
          <a className="item" href="#">카테고리<i className="caret" /></a>
          <a className="item" href="#">하드웨어<i className="caret" /></a>
          <a className="item" href="#">플레이 모드<i className="caret" /></a>
          <a className="item" href="#">특별 섹션<i className="caret" /></a>
          <form className="searchbox" ref={searchBoxRef} onSubmit={(e) => e.preventDefault()}>
            <input
              type="text"
              placeholder="상점 검색"
              aria-label="상점 검색"
              autoComplete="off"
              value={searchQuery}
              onChange={(e) => handleSearchInput(e.target.value)}
            />
            <button type="submit" aria-label="검색">
              <svg viewBox="0 0 16 16"><path d="M6.5 1a5.5 5.5 0 104.2 9.05l3.6 3.6 1.4-1.4-3.6-3.6A5.5 5.5 0 006.5 1zm0 2a3.5 3.5 0 110 7 3.5 3.5 0 010-7z" /></svg>
            </button>
            <div className={"sresults" + (searchResults ? " on" : "")}>
              {searchResults && (
                searchResults.length
                  ? searchResults.map((g: any) => (
                    <div key={g.slug} className="sres-row" onClick={() => { setSearchResults(null); openModal(g.slug); }}>
                      <div className="cap" style={bgStyle(g.headerImage)} />
                      <div className="nm">{g.name}</div>
                      <div className="pr">{priceText(g)}</div>
                    </div>
                  ))
                  : <div className="sres-empty">검색 결과가 없습니다.</div>
              )}
            </div>
          </form>
        </div>
      </div>

      {view === "store" && (
        <>
          {error && <div className="err">데이터를 불러오지 못했습니다: {error}</div>}
          {!error && !data && <div className="loading">DB에서 상점 데이터를 불러오는 중…</div>}

          {data && (
            <>
              <Hero g={data.hero} onOpen={openModal} />

              <section className="section"><div className="wrap">
                <div className="sec-head">
                  <h2 className="sec-title">특집 및 추천 게임</h2>
                  <a className="giftcard" href="#"><span className="gc-icon" />기프트 카드 보내기</a>
                </div>
                <Carousel autoMs={7000} slides={data.featured.map((g: any) => <FeatCard key={g.slug} g={g} onOpen={openModal} />)} />
                <div className="promo">
                  <div className="left">
                    <span className="kicker">STEAM</span>
                    <h4>여름 세일<br />진행 중</h4>
                    <p>현재 {data.stats.discounts}종 할인 중 · 전체 {data.stats.games}종</p>
                  </div>
                  <div className="right"><div className="box">할인 종료<br />{ymd(data.deals[0]?.discountEndsAt)}</div></div>
                </div>
              </div></section>

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
                      <div className="car-slide" key={i}><div className="deals">
                        {b1 && <DealCard g={b1} size="big" onOpen={openModal} />}
                        {b2 && <DealCard g={b2} size="big" onOpen={openModal} />}
                        <div className="deal-col">
                          {s1 && <DealCard g={s1} size="sm" onOpen={openModal} />}
                          {s2 && <DealCard g={s2} size="sm" onOpen={openModal} />}
                        </div>
                      </div></div>
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
                <div className="tabs">
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
                    <div className="car-slide" key={i}><div className="cats">
                      {items.map((c: any) => (
                        <div className="cat" key={c.slug} onClick={() => searchByTag(c.name)}>
                          <div className="veil" style={bgStyle(c.image)} />
                          <b>{c.name}</b>
                          <small>{c.count}종</small>
                        </div>
                      ))}
                    </div></div>
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
                    <div className="car-slide" key={i}><div className="cheap">
                      {items.map((g: any) => (
                        <div className="cheap-card" key={g.slug} onClick={() => openModal(g.slug)}>
                          <div className="art" style={bgStyle(g.capsuleImage || g.headerImage)} />
                          <div className="card-name">{g.name}</div>
                          <PriceBar g={g} />
                        </div>
                      ))}
                    </div></div>
                  ))}
                />
              </div></section>
            </>
          )}
        </>
      )}

      <LoginView active={view === "login"} pool={loginPool} onStore={(e) => goView("store", e)} />

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
