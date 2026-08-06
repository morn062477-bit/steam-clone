"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 상점 내비 바.
 *
 * 메뉴 6개는 hover 가 아니라 클릭으로 연다. 패널은 눌린 버튼이 아니라
 * 내비 바 전체를 기준으로 펼쳐지므로(globals.css 의 .navdrop 참고)
 * 어느 메뉴를 눌러도 내용이 본문과 같은 세로선에 맞는다.
 *
 * 검색창은 검색어가 없으면 인기 검색어를, 있으면 결과를 같은 줄 모양으로 보여준다.
 */

const won = (n: number) => "₩ " + Number(n).toLocaleString("ko-KR");

function priceText(g: any) {
  if (g.isFree) return "무료 플레이";
  if (g.priceKrw <= 0) return g.comingSoon ? "출시 예정" : "가격 미정";
  if (g.discountPercent > 0) return `-${g.discountPercent}%  ${won(g.finalKrw)}`;
  return won(g.priceKrw);
}

function bgStyle(url?: string | null) {
  return url ? { backgroundImage: `url('${url}')` } : undefined;
}

function SresRow({ g, onPick }: { g: any; onPick: (slug: string) => void }) {
  return (
    <div className="sres-row" onClick={() => onPick(g.slug)}>
      <div className="cap" style={bgStyle(g.headerImage)} />
      <div className="info">
        <div className="nm">{g.name}</div>
        <div className="pr">
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

type Props = {
  data: any;
  searchQuery: string;
  searchResults: any[] | null;
  onSearchInput: (v: string) => void;
  onOpenGame: (slug: string) => void;
  onTag: (tag: string) => void;
  onTab: (key: string) => void;
  onCloseResults: () => void;
  wishlistCount: number | null;
  onOpenCart: (e: React.MouseEvent) => void;
  onOpenWishlist: (e: React.MouseEvent) => void;
};

export default function StoreNav({
  data,
  searchQuery,
  searchResults,
  onSearchInput,
  onOpenGame,
  onTag,
  onTab,
  onCloseResults,
  wishlistCount,
  onOpenCart,
  onOpenWishlist,
}: Props) {
  const [openNav, setOpenNav] = useState<string | null>(null);
  const [showPopular, setShowPopular] = useState(false);
  const [genresOpen, setGenresOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLFormElement>(null);

  // 바깥 클릭 / Esc 로 둘 다 닫는다
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (navRef.current && !navRef.current.contains(t)) setOpenNav(null);
      if (boxRef.current && !boxRef.current.contains(t)) setShowPopular(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOpenNav(null);
      setShowPopular(false);
    }
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function toggle(key: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOpenNav((cur) => (cur === key ? null : key));
  }

  /** 드롭다운 안에서 무언가를 고르면 메뉴를 닫는다 */
  const pick = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    setOpenNav(null);
    fn();
  };

  const cls = (key: string) => "navitem" + (openNav === key ? " open" : "");

  const topGames: any[] = data?.tabs?.find((t: any) => t.key === "top")?.games ?? [];
  const catTiles: any[] = data?.categories?.slice(0, 6) ?? [];
  const catPills: any[] = data?.categories?.slice(6) ?? [];
  const banner1 = topGames[0];
  const banner2 = data?.deals?.[0] ?? topGames[1];

  // 전체 장르 및 테마: 화면에 나온 게임들의 태그를 많이 쓰인 순으로
  const genres: string[] = (() => {
    if (!data) return [];
    const count = new Map<string, number>();
    const all = [...data.featured, ...data.deals, ...data.cheap, ...data.tabs.flatMap((t: any) => t.games)];
    for (const g of all) for (const t of g.tags ?? []) count.set(t, (count.get(t) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  })();

  // 인기 검색어: 할인 중인 게임을 앞세워 4종
  const popular: any[] = (() => {
    if (!data) return [];
    const seen = new Set<string>();
    const rows: any[] = [];
    for (const g of [...data.deals, ...topGames]) {
      if (!g || seen.has(g.slug)) continue;
      seen.add(g.slug);
      rows.push(g);
      if (rows.length === 4) break;
    }
    return rows;
  })();

  const dropOpen = Boolean(searchResults) || (showPopular && !searchQuery.trim() && popular.length > 0);

  function pickGame(slug: string) {
    setShowPopular(false);
    onCloseResults();
    onOpenGame(slug);
  }

  return (
    <div className="storenav" ref={navRef}>
      <div className="wrap">
        {/* ---------- 검색 ---------- */}
        <div className={cls("search")}>
          <button className="item" type="button" onClick={(e) => toggle("search", e)}>
            검색 <i className="caret" />
          </button>
          <div className="navdrop"><div className="navdrop-in nd-search">
            <div className="nd-main nd-panel">
              <div className="nd-guide">
                <a href="#" onClick={pick(() => onTab("top"))}><b>상점 홈</b></a>
                <a href="#" onClick={pick(() => onTab("new"))}><b>신규 출시 게임</b><small>Steam에서 새로운 콘텐츠를 살펴보세요.</small></a>
                <a href="#" onClick={pick(() => onTab("soon"))}><b>출시 예정 게임</b><small>출시 예정 게임을 살펴보세요.</small></a>
                <a href="#" onClick={pick(() => onTab("top"))}><b>전체 차트 및 통계</b><small>주간, 월간, 연간 인기 게임을 살펴보세요.</small></a>
              </div>
              <div className="nd-banners">
                {banner1 && (
                  <div className="nd-banner" style={bgStyle(banner1.headerImage)} onClick={pick(() => onOpenGame(banner1.slug))}>
                    <span className="nd-chip">최고 인기 게임</span>
                  </div>
                )}
                {banner2 && (
                  <div className="nd-banner" style={bgStyle(banner2.headerImage)} onClick={pick(() => onOpenGame(banner2.slug))}>
                    <span className="nd-chip">할인 및 이벤트</span>
                  </div>
                )}
              </div>
            </div>
            <aside className="nd-aside nd-cols">
              <div className="nd-col">
                <b className="nd-colhead">인기 페이지</b>
                <div className="nd-links">
                  <a href="#">무료 플레이</a><a href="#">체험판</a><a href="#">뉴스 및 업데이트</a>
                  <a href="#">포인트 상점</a><a href="#">기프트 카드</a>
                </div>
              </div>
              <div className="nd-col">
                <b className="nd-colhead">내 계정</b>
                <div className="nd-links">
                  <a href="#">환경 설정</a><a href="#">찜 목록</a><a href="#">내 가족</a>
                </div>
              </div>
            </aside>
          </div></div>
        </div>

        {/* ---------- 추천 제품 ---------- */}
        <div className={cls("featured")}>
          <button className="item" type="button" onClick={(e) => toggle("featured", e)}>
            추천 제품 <i className="caret" />
          </button>
          <div className="navdrop"><div className="navdrop-in nd-featured">
            <div className="nd-main">
              <div className="nd-label">최고 인기 게임</div>
              <div className="nd-toprow">
                <div className="nd-toplist">
                  {topGames.slice(0, 3).map((g: any) => (
                    <div key={g.slug} className="nd-top-row" onClick={pick(() => onOpenGame(g.slug))}>
                      <div className="nd-top-cap" style={bgStyle(g.headerImage)} />
                      <div>
                        <div className="nm">{g.name}</div>
                        <div className="pr">{priceText(g)}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <a className="nd-promo" href="#" onClick={pick(() => onTab("new"))}>
                  <span className="nd-promo-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.6}>
                      <rect x="3" y="5" width="18" height="16" rx="2" />
                      <path d="M3 10h18M8 3v4M16 3v4" />
                      <path d="M7 14h3M13 14h4M7 17h3M13 17h4" />
                    </svg>
                  </span>
                  <span className="nd-promo-body">
                    <b>맞춤 캘린더 <i className="nd-badge">신규</i></b>
                    <small>사용자별로 맞춤 설정된 신규 출시 및 출시 예정 게임을 살펴보세요.</small>
                    <span className="nd-cta">맞춤 캘린더 살펴보기 →</span>
                  </span>
                </a>
              </div>
            </div>
            <aside className="nd-aside">
              <div className="nd-links">
                <a href="#">맞춤 대기열</a>
                <a href="#">커뮤니티 추천</a>
                <a href="#" onClick={pick(() => onTab("new"))}>신규 출시 게임 대기열</a>
                <a href="#">인터랙티브 추천기</a>
                <a href="#">친구가 즐기는 게임</a>
                <a href="#">Steam 큐레이터</a>
                <a href="#">추천 DLC</a>
              </div>
            </aside>
          </div></div>
        </div>

        {/* ---------- 카테고리 ---------- */}
        <div className={cls("cats")}>
          <button className="item" type="button" onClick={(e) => toggle("cats", e)}>
            카테고리 <i className="caret" />
          </button>
          <div className="navdrop"><div className="navdrop-in nd-cats">
            <div className="nd-label">선호 카테고리</div>
            <div className="nd-cat-tiles">
              {catTiles.map((c: any) => (
                <div key={c.slug} className="cat" onClick={pick(() => onTag(c.name))}>
                  <div className="veil" style={bgStyle(c.image)} />
                  <b>{c.name}</b>
                </div>
              ))}
            </div>
            <div className="nd-cat-pills">
              {catPills.map((c: any) => (
                <a key={c.slug} href="#" onClick={pick(() => onTag(c.name))}>{c.name}</a>
              ))}
              <a className="nd-allpills" href="#" onClick={(e) => e.preventDefault()}>모든 태그 보기 ›</a>
            </div>
            <div className="nd-label nd-label-row">
              모든 장르 및 테마
              <button className="nd-expand" type="button" onClick={(e) => { e.stopPropagation(); setGenresOpen((v) => !v); }}>
                {genresOpen ? "접기 ⌃" : "펼치기 ⌄"}
              </button>
            </div>
            <div className={"nd-genres" + (genresOpen ? " open" : "")}>
              {genres.map((n) => (
                <a key={n} href="#" onClick={pick(() => onTag(n))}>{n}</a>
              ))}
            </div>
          </div></div>
        </div>

        {/* ---------- 하드웨어 ---------- */}
        <div className={cls("hw")}>
          <button className="item" type="button" onClick={(e) => toggle("hw", e)}>
            하드웨어 <i className="caret" />
          </button>
          <div className="navdrop"><div className="navdrop-in nd-hw">
            <div className="nd-main">
              <div className="nd-label">하드웨어</div>
              <div className="nd-hw-tiles">
                <a className="nd-hw-tile deck" href="#" onClick={(e) => e.preventDefault()}>
                  <svg className="nd-hw-art" viewBox="0 0 120 60" aria-hidden="true">
                    <rect x="26" y="8" width="68" height="44" rx="4" fill="#2b2f36" />
                    <rect x="34" y="14" width="52" height="32" rx="2" fill="#4a6b8a" />
                    <rect x="8" y="10" width="22" height="40" rx="10" fill="#23262b" />
                    <rect x="90" y="10" width="22" height="40" rx="10" fill="#23262b" />
                    <circle cx="19" cy="24" r="5" fill="#3b4048" />
                    <circle cx="101" cy="24" r="5" fill="#3b4048" />
                  </svg>
                  <span className="nd-chip">STEAM DECK</span>
                </a>
                <a className="nd-hw-tile machine" href="#" onClick={(e) => e.preventDefault()}>
                  <svg className="nd-hw-art" viewBox="0 0 120 60" aria-hidden="true">
                    <rect x="34" y="8" width="52" height="44" rx="3" fill="#23262b" />
                    <rect x="40" y="44" width="40" height="3" rx="1.5" fill="#3b4048" />
                    <circle cx="76" cy="16" r="2" fill="#4a6b8a" />
                  </svg>
                  <span className="nd-chip">STEAM MACHINE</span>
                </a>
                <a className="nd-hw-tile frame" href="#" onClick={(e) => e.preventDefault()}>
                  <svg className="nd-hw-art" viewBox="0 0 120 60" aria-hidden="true">
                    <rect x="36" y="16" width="48" height="26" rx="8" fill="#23262b" />
                    <rect x="44" y="22" width="32" height="12" rx="4" fill="#3b4048" />
                    <rect x="10" y="14" width="12" height="32" rx="6" fill="#2b2f36" />
                    <rect x="98" y="14" width="12" height="32" rx="6" fill="#2b2f36" />
                  </svg>
                  <span className="nd-chip">STEAM FRAME</span>
                </a>
              </div>
            </div>
            <aside className="nd-aside">
              <div className="nd-links">
                <a href="#">Steam Deck 도킹 스테이션</a>
                <a href="#">Deck 완벽 호환</a>
                <a href="#">VR 게임</a>
                <a href="#">컨트롤러 지원</a>
              </div>
            </aside>
          </div></div>
        </div>

        {/* ---------- 플레이 모드 ---------- */}
        <div className={cls("play")}>
          <button className="item" type="button" onClick={(e) => toggle("play", e)}>
            플레이 모드 <i className="caret" />
          </button>
          <div className="navdrop"><div className="navdrop-in nd-play">
            <div className="nd-main">
              <div className="nd-label">게임 플레이 모드</div>
              <div className="nd-play-tiles">
                <a className="nd-blue" href="#" onClick={(e) => e.preventDefault()}>
                  <svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="3" /><rect x="5" y="9" width="14" height="6" rx="1" fill="#3c6a9e" /></svg>
                  DECK 완벽 호환
                </a>
                <a className="nd-blue" href="#" onClick={(e) => e.preventDefault()}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} aria-hidden="true"><path d="M3 17a4 4 0 014 4M3 12a9 9 0 019 9" /><rect x="12" y="4" width="9" height="7" rx="1.5" /></svg>
                  REMOTE PLAY
                </a>
                <a className="nd-blue" href="#" onClick={(e) => e.preventDefault()}>
                  <svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M3 9a2 2 0 012-2h14a2 2 0 012 2v4a3 3 0 01-3 3h-2l-2-2h-4l-2 2H6a3 3 0 01-3-3z" /></svg>
                  VR 게임
                </a>
                <a className="nd-blue wide" href="#" onClick={(e) => e.preventDefault()}>
                  <svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><rect x="2" y="8" width="20" height="9" rx="4" /><circle cx="17" cy="11.5" r="1.2" fill="#3c6a9e" /><circle cx="19" cy="14" r="1.2" fill="#3c6a9e" /><rect x="5" y="11" width="5" height="1.6" fill="#3c6a9e" /><rect x="6.7" y="9.3" width="1.6" height="5" fill="#3c6a9e" /></svg>
                  컨트롤러 지원
                </a>
                <a className="nd-blue wide" href="#" onClick={(e) => e.preventDefault()}>
                  <svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><circle cx="8" cy="8" r="3" /><circle cx="16" cy="8" r="3" /><path d="M2 19a6 6 0 0112 0zM12.5 19a6 6 0 019.5-4.9V19z" /></svg>
                  협동
                </a>
              </div>
            </div>
            <aside className="nd-aside">
              <div className="nd-links">
                <a href="#">로컬 지역 네트워크</a>
                <a href="#">로컬 멀티플레이어 및 파티</a>
                <a href="#">대규모 멀티플레이어</a>
                <a href="#">멀티플레이어</a>
                <a href="#">온라인 경쟁</a>
                <a href="#">싱글 플레이어</a>
              </div>
            </aside>
          </div></div>
        </div>

        {/* ---------- 특별 섹션 ---------- */}
        <div className={cls("special")}>
          <button className="item" type="button" onClick={(e) => toggle("special", e)}>
            특별 섹션 <i className="caret" />
          </button>
          <div className="navdrop"><div className="navdrop-in nd-special">
            <div className="nd-main">
              <div className="nd-label">특별 섹션</div>
              <div className="nd-sp-tiles">
                <a className="nd-blue" href="#" onClick={(e) => e.preventDefault()}>
                  <svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" fill="#3c6a9e" /></svg>
                  체험판
                </a>
                <a className="nd-blue" href="#" onClick={(e) => e.preventDefault()}>
                  <svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 0l-3-3m3 3l3-3M8 16h8" stroke="#3c6a9e" strokeWidth={1.8} fill="none" /></svg>
                  DLC
                </a>
                <a className="nd-blue wide" href="#" onClick={pick(() => onTab("deal"))}>
                  <svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M3 11V4h7l11 11-7 7z" /><path d="M9.5 6.5l1 2 2 .3-1.5 1.4.4 2.2-1.9-1-1.9 1 .4-2.2L6.5 8.8l2-.3z" fill="#3c6a9e" /></svg>
                  할인 이벤트
                </a>
              </div>
            </div>
            <aside className="nd-aside nd-cols">
              <div className="nd-col">
                <div className="nd-links">
                  <a href="#">소프트웨어</a><a href="#">사운드트랙</a><a href="#">앞서 해보기</a>
                </div>
                <div className="nd-links nd-links-sep">
                  <a href="#">PC방용</a><a href="#">macOS</a><a href="#">SteamOS + Linux</a>
                </div>
              </div>
              <div className="nd-col">
                <div className="nd-links">
                  <a href="#">Steam Next Fest</a><a href="#">Steam 어워드</a>
                  <a href="#">Steam 돌아보기</a><a href="#">Steam 실험실</a>
                </div>
              </div>
            </aside>
          </div></div>
        </div>

        {/* ---------- 검색창 ---------- */}
        <form
          className={"searchbox" + (dropOpen ? " open" : "")}
          ref={boxRef}
          onSubmit={(e) => e.preventDefault()}
          onMouseEnter={() => { if (!searchQuery.trim()) setShowPopular(true); }}
          onMouseLeave={() => {
            if (document.activeElement !== boxRef.current?.querySelector("input") && !searchQuery.trim()) {
              setShowPopular(false);
            }
          }}
        >
          <input
            type="text"
            placeholder="상점 검색"
            aria-label="상점 검색"
            autoComplete="off"
            value={searchQuery}
            onFocus={() => { if (!searchQuery.trim()) setShowPopular(true); }}
            onChange={(e) => onSearchInput(e.target.value)}
          />
          <button type="submit" aria-label="검색">
            <svg viewBox="0 0 16 16"><path d="M6.5 1a5.5 5.5 0 104.2 9.05l3.6 3.6 1.4-1.4-3.6-3.6A5.5 5.5 0 006.5 1zm0 2a3.5 3.5 0 110 7 3.5 3.5 0 010-7z" /></svg>
          </button>

          <div className={"sresults" + (dropOpen ? " on" : "")}>
            {searchResults ? (
              searchResults.length ? (
                <>
                  {searchResults.map((g: any) => <SresRow key={g.slug} g={g} onPick={pickGame} />)}
                  <div className="sres-adv" role="button" tabIndex={0}>고급 검색</div>
                </>
              ) : (
                <div className="sres-empty">검색 결과가 없습니다.</div>
              )
            ) : (
              <>
                <div className="sres-head">인기 검색어</div>
                {popular.map((g: any) => <SresRow key={g.slug} g={g} onPick={pickGame} />)}
                <div className="sres-adv" role="button" tabIndex={0}>고급 검색</div>
              </>
            )}
          </div>
        </form>

        {/* ---------- 장바구니 / 찜 목록 ---------- */}
        <button type="button" className="nav-cart-btn" onClick={onOpenCart}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.2">
            <path d="M1 1h2l.6 3M3.6 4h10.4l-1.2 6H4.8M3.6 4L4.8 10M4.8 10l-.3 1.5h9M6 14a1 1 0 100-2 1 1 0 000 2zM12 14a1 1 0 100-2 1 1 0 000 2z" />
          </svg>
          장바구니
        </button>
        {wishlistCount !== null && (
          <button type="button" className="nav-cart-btn" onClick={onOpenWishlist}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.2">
              <path d="M8 13.5S1.5 9.8 1.5 5.6C1.5 3.6 3 2 5 2c1.2 0 2.3.6 3 1.6C8.7 2.6 9.8 2 11 2c2 0 3.5 1.6 3.5 3.6 0 4.2-6.5 7.9-6.5 7.9z" />
            </svg>
            찜 목록
          </button>
        )}
      </div>
    </div>
  );
}
