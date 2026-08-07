"use client";

import { useEffect, useRef, useState } from "react";

// 상세 페이지 영상. Steam appdetails가 mp4/webm 대신 HLS(m3u8)만 주기 때문에
// Safari는 네이티브로, 그 외 브라우저는 hls.js로 재생한다.
function DetailVideo({ src, poster }: { src: string; poster?: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      return;
    }

    let hls: import("hls.js").default | undefined;
    import("hls.js").then(({ default: Hls }) => {
      if (!videoRef.current || !Hls.isSupported()) return;
      hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(videoRef.current);
    });

    return () => hls?.destroy();
  }, [src]);

  return (
    <video
      ref={videoRef}
      className="gp-shot-video"
      poster={poster}
      controls
      autoPlay
      muted
      loop
      playsInline
    />
  );
}

/**
 * 게임 상세 페이지. 실제 Steam 상점 페이지 구성을 따른다.
 *
 *   빵부스러기 → 제목 → 스크린샷 갤러리 + 우측 요약 → 구매 박스
 *   → 게임 정보 → 성인 콘텐츠 → 시스템 요구 사항 → 사용자 평가
 *
 * 데이터는 GET /api/game/:slug 하나로 끝난다. 도전 과제·포인트 상점·이벤트
 * 처럼 DB 에 없는 블록은 만들지 않았다. 있는 값만 그린다.
 */

const won = (n: number) => "₩ " + Number(n).toLocaleString("ko-KR");

// ---------------------------------------------------------------
// 평가 반응 버튼 아이콘. 스팀처럼 20x20 SVG 한 장씩.
// 색은 currentColor 라 버튼 상태(.on)에 따라 CSS 에서 같이 바뀐다.
// ---------------------------------------------------------------

/** 엄지. up=false 면 위아래를 뒤집어 그대로 엄지척 반대로 쓴다 */
function ThumbIcon({ up = true }: { up?: boolean }) {
  return (
    <svg className="gp-vote-icon" viewBox="0 0 20 20" aria-hidden="true">
      <g transform={up ? undefined : "translate(0,20) scale(1,-1)"}>
        <path d="M2.6 8.6h3.1v8.6H3.6a1 1 0 0 1-1-1V8.6Z" fill="currentColor" />
        <path
          d="M7.1 8.4 10.2 2a1.6 1.6 0 0 1 2.9 1.2l-.8 3.4h4.1a1.6 1.6 0 0 1 1.6 2l-1.4 6a2 2 0 0 1-1.9 1.6H7.1V8.4Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

/** 유쾌: 웃는 얼굴 */
function FunnyIcon() {
  return (
    <svg className="gp-vote-icon" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="8.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="7.2" cy="8" r="1.2" fill="currentColor" />
      <circle cx="12.8" cy="8" r="1.2" fill="currentColor" />
      <path
        d="M6 12.2a4.6 4.6 0 0 0 8 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 어워드: 금색 꽃 모양 훈장 */
function AwardIcon() {
  return (
    <svg className="gp-vote-icon gp-vote-icon-award" viewBox="0 0 20 20" aria-hidden="true">
      {[0, 72, 144, 216, 288].map((deg) => (
        <circle key={deg} cx="10" cy="4.6" r="3.6" fill="currentColor" transform={`rotate(${deg} 10 10)`} />
      ))}
      <circle cx="10" cy="10" r="3.4" fill="#f7b91b" />
    </svg>
  );
}

/** 반응 종류. 화면 순서 그대로 */
const VOTE_BUTTONS = [
  { kind: "HELPFUL", label: "네", icon: <ThumbIcon /> },
  { kind: "NOT_HELPFUL", label: "아니요", icon: <ThumbIcon up={false} /> },
  { kind: "FUNNY", label: "유쾌", icon: <FunnyIcon /> },
  { kind: "AWARD", label: "어워드", icon: <AwardIcon /> },
] as const;

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

/** 긍정 70% 이상이면 파랑, 40% 미만이면 주황, 그 사이는 중립(회색) */
const sentimentTone = (pct: number | null) => (pct == null ? "" : pct >= 70 ? " positive" : pct >= 40 ? "" : " negative");
const reviewCls = (pct: number | null) => "gp-review-sum" + sentimentTone(pct);
const pillCls = (pct: number | null) => "gp-review-pill" + sentimentTone(pct);

export default function GamePage({
  slug,
  onBack,
  onOpenGame,
  onTag,
  inCart,
  onToggleCart,
  user,
  inWishlist,
  onToggleWishlist,
}: {
  slug: string;
  onBack: () => void;
  onOpenGame: (slug: string) => void;
  onTag: (tag: string) => void;
  inCart: boolean;
  onToggleCart: (slug: string) => void;
  user?: unknown;
  inWishlist?: boolean;
  onToggleWishlist?: (slug: string) => void;
}) {
  const [g, setG] = useState<any>(null);
  const similarRowRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState(0);
  const [stripFrom, setStripFrom] = useState(0);
  // 평가 유형/날짜 범위/플레이 시간은 가진 데이터로 클라이언트에서 거를 수 있어 실제로 작동한다.
  // 구매 형식/언어는 DB에 해당 필드가 없어 지금은 비활성 버튼으로만 둔다.
  const [reviewTypeFilter, setReviewTypeFilter] = useState<"all" | "positive" | "negative">("all");
  const [dateRangeFilter, setDateRangeFilter] = useState<"all" | "30d" | "90d" | "365d">("all");
  const [playtimeFilter, setPlaytimeFilter] = useState<"all" | "0-10" | "10-100" | "100+">("all");
  const [descOpen, setDescOpen] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);

  /**
   * 평가에 반응을 남긴다. 서버가 갱신된 평가 하나를 돌려주므로
   * reviews / recentReviews 양쪽에서 같은 id 를 갈아끼운다.
   * 같은 걸 다시 누르면 서버가 알아서 취소하니 여기서 토글을 따로 다루지 않는다.
   */
  async function voteReview(reviewId: string, kind: string) {
    setVoteError(null);
    const res = await fetch(`/api/review/${encodeURIComponent(reviewId)}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setVoteError(res.status === 401 ? "로그인 후 이용할 수 있습니다." : body.error ?? "반응을 남기지 못했습니다.");
      return;
    }
    const updated = await res.json();
    const swap = (list: any[]) => list?.map((r: any) => (r.id === updated.id ? updated : r));
    setG((prev: any) =>
      prev ? { ...prev, reviews: swap(prev.reviews), recentReviews: swap(prev.recentReviews) } : prev,
    );
  }

  useEffect(() => {
    setG(null);
    setError(null);
    setShot(0);
    setStripFrom(0);
    setDescOpen(false);
    setReviewTypeFilter("all");
    setDateRangeFilter("all");
    setPlaytimeFilter("all");
    fetch("/api/game/" + encodeURIComponent(slug))
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(setG)
      .catch((e) => setError(e.message));
  }, [slug]);

  if (error) return <div className="err">게임을 불러오지 못했습니다: {error}</div>;
  if (!g) return <div className="loading">불러오는 중…</div>;

  const shots: any[] = g.screenshots ?? [];
  // 영상(있으면)을 맨 앞에 두고 스크린샷을 잇는다. gp-shot/gp-strip/화살표가
  // 이 하나의 목록만 보고 동작하면 종류 구분 없이 다 같이 움직인다.
  const media: { type: "video" | "image"; url: string; thumb?: string }[] = [
    ...(g.detailVideoUrl ? [{ type: "video" as const, url: g.detailVideoUrl }] : []),
    ...shots.map((s: any) => ({ type: "image" as const, url: s.url, thumb: s.thumb })),
  ];
  const current = media[shot];
  const STRIP = 6; // 썸네일 줄에 한 번에 보이는 개수
  const maxStripFrom = Math.max(0, media.length - STRIP);
  const canScrollStrip = media.length > STRIP;
  // 화살표로 넘기면 shot도 같이 순환하며 이동하고, 그 shot이 안 보이면 스트립도 따라 스크롤한다.
  // 썸네일 직접 클릭은 그냥 setShot만으로 충분하다(이미 화면에 보이는 항목이라).
  const goShot = (dir: 1 | -1) => {
    if (!media.length) return;
    const next = (shot + dir + media.length) % media.length;
    setShot(next);
    setStripFrom((from) => {
      if (next < from) return next;
      if (next >= from + STRIP) return Math.min(maxStripFrom, next - STRIP + 1);
      return from;
    });
  };
  const platforms = [g.platforms?.windows && "Windows", g.platforms?.mac && "macOS", g.platforms?.linux && "Linux"]
    .filter(Boolean)
    .join(", ");
  const req = g.reqWindows ?? {};
  const DAY_MS = 24 * 60 * 60 * 1000;
  const filteredReviews: any[] = (g.reviews ?? []).filter((r: any) => {
    if (reviewTypeFilter !== "all" && r.isRecommended !== (reviewTypeFilter === "positive")) return false;
    if (dateRangeFilter !== "all") {
      const days = { "30d": 30, "90d": 90, "365d": 365 }[dateRangeFilter];
      if (Date.now() - new Date(r.createdAt).getTime() > days * DAY_MS) return false;
    }
    if (playtimeFilter !== "all") {
      const h = r.playtimeHours;
      if (playtimeFilter === "0-10" && !(h < 10)) return false;
      if (playtimeFilter === "10-100" && !(h >= 10 && h < 100)) return false;
      if (playtimeFilter === "100+" && !(h >= 100)) return false;
    }
    return true;
  });

  return (
    <div className="gamepage">
      <div className="wrap">
                 <div className="gp-crumb">
          <a href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>모든 게임</a>
          {g.genres?.[0] && (
            <>
              <span>&gt;</span>
              <a href="#" onClick={(e) => { e.preventDefault(); onTag(g.genres[0]); }}>{g.genres[0]} 게임</a>
            </>
          )}
          <span>&gt;</span>
          <span className="cur">{g.name}</span>
        </div>
              <div className="gp-title-row">
          <h1 className="gp-title">{g.name}</h1>
          <a className="gp-hub" href="#" onClick={(e) => e.preventDefault()}>커뮤니티 허브</a>
        </div>

        <div className="promoBox">
          <img className="promo" src="https://clan.fastly.steamstatic.com/images/46141020/07c258a25dcf7d2a04fa20da6749d9aa7d6d8d19.jpg" alt="" />
        </div>
        {/* ---------- 빵부스러기 ---------- */}

        {/* ---------- 갤러리 + 요약 ---------- */}
        <div className="gp-top">
          <div className="gp-media">
            <div className="gp-shot" style={current?.type === "image" ? bgStyle(current.url || g.headerImage) : bgStyle(g.headerImage)}>
              {current?.type === "video" && <DetailVideo src={current.url} poster={g.headerImage} />}
            </div>
            <div className="gp-strip-row">
              <button className="gp-arrow" onClick={() => goShot(-1)} disabled={!canScrollStrip}>‹</button>
              <div className="gp-strip">
                {media.slice(stripFrom, stripFrom + STRIP).map((m, i) => {
                  const idx = stripFrom + i;
                  if (m.type === "video") {
                    return (
                      <div
                        key="video"
                        className={"gp-thumb gp-thumb-video" + (idx === shot ? " on" : "")}
                        style={bgStyle(g.headerImage)}
                        onClick={() => setShot(idx)}
                      >
                        <span className="gp-play">▶</span>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={idx}
                      className={"gp-thumb" + (idx === shot ? " on" : "")}
                      style={bgStyle(m.thumb || m.url)}
                      onClick={() => setShot(idx)}
                    />
                  );
                })}
              </div>
              <button
                className="gp-arrow"
                onClick={() => goShot(1)}
                disabled={!canScrollStrip}
              >
                ›
              </button>
            </div>
          </div>

          <aside className="gp-side">
            <div className="gp-cap" style={bgStyle(g.headerImage)} />
            <p className="gp-short">{g.shortDesc}</p>

            <div className="gp-facts">
              <div><b>최근 평가:</b><span className={reviewCls(g.reviewPercent)}>{g.reviewDesc ?? "평가 없음"}{g.reviewCountLocal ? ` (${g.reviewCountLocal})` : ""}</span></div>
              <div><b>모든 평가:</b><span className={reviewCls(g.reviewPercent)}>{g.reviewDesc ?? "평가 없음"}{g.reviewTotal ? ` (${g.reviewTotal.toLocaleString("ko-KR")})` : ""}</span></div>
              <div><b>출시일:</b><span>{ymd(g.releaseDate)}</span></div>
              <div><b>개발자:</b><a href="#" onClick={(e) => e.preventDefault()}>{g.developer}</a></div>
              <div><b>배급사:</b><a href="#" onClick={(e) => e.preventDefault()}>{g.publisher}</a></div>
            </div>

            <div className="gp-tags">
              <div className="gp-tags-label">이 제품의 인기 태그:</div>
              <div className="gp-tag-list">
                {g.tags?.map((t: string) => (
                  <a key={t} href="#" onClick={(e) => { e.preventDefault(); onTag(t); }}>{t}</a>
                ))}
              </div>
            </div>
          </aside>
        </div>

        {/* ---------- 구매 ---------- */}
        <div className="gp-body">
          <div className="gp-main">
            <div className="gp-buy">
              <div className="gp-buy-head">
                <h2>{g.name} 구매</h2>
                {g.discountPercent > 0 && (
                  <div className="gp-buy-sub">
                    {g.discountLabel ?? "할인"}! 종료일: {ymd(g.discountEndsAt)}
                  </div>
                )}
              </div>
              <div className="gp-buy-foot">
                {g.discountPercent > 0 ? (
                  <>
                    <span className="gp-disc">-{g.discountPercent}%</span>
                    <span className="gp-prices">
                      <span className="was">{won(g.priceKrw)}</span>
                      <span className="now">{won(g.finalKrw)}</span>
                    </span>
                  </>
                ) : (
                  <span className="gp-prices"><span className="now">{priceText(g)}</span></span>
                )}
                <button
                  className={"gp-cart" + (inCart ? " on" : "")}
                  type="button"
                  onClick={() => onToggleCart(slug)}
                >
                  {inCart ? "장바구니에서 제거" : "장바구니에 추가"}
                </button>
                {!!user && onToggleWishlist && (
                  <button
                    className={"gp-wish" + (inWishlist ? " on" : "")}
                    type="button"
                    onClick={() => onToggleWishlist(slug)}
                  >
                    {inWishlist ? "찜 목록에서 제거" : "찜 목록에 추가"}
                  </button>
                )}
              </div>
            </div>

            {/* ---------- 게임 정보 ---------- */}
            <h2 className="gp-h2">게임 정보</h2>
            <div className={"gp-desc" + (descOpen ? " open" : "")}>{g.description || g.shortDesc}</div>
            {(g.description || "").length > 600 && (
              <button className="gp-more" type="button" onClick={() => setDescOpen((v) => !v)}>
                {descOpen ? "접기" : "더 보기"}
              </button>
            )}

            {g.requiredAge > 0 && (
              <>
                <h2 className="gp-h2">성인 콘텐츠 설명</h2>
                <p className="gp-adult">이 게임은 {g.requiredAge}세 이상 이용가입니다.</p>
              </>
            )}

            {(req.minimum || req.recommended) && (
              <>
                <h2 className="gp-h2">시스템 요구 사항</h2>
                <div className="gp-req">
                  {req.minimum && (
                    <div className="gp-req-col">
                      <h4>최소:</h4>
                      <pre>{String(req.minimum)}</pre>
                    </div>
                  )}
                  {req.recommended && (
                    <div className="gp-req-col">
                      <h4>권장:</h4>
                      <pre>{String(req.recommended)}</pre>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ---------- 우측 정보 ---------- */}
          <aside className="gp-info">
            <div className="gp-info-box">
              <div className="gp-info-row"><span>플랫폼</span><b>{platforms || "-"}</b></div>
              <div className="gp-info-row"><span>이용 등급</span><b>{g.requiredAge ? `${g.requiredAge}세 이상` : "전체 이용가"}</b></div>
              {g.metacritic != null && <div className="gp-info-row"><span>메타크리틱</span><b>{g.metacritic}</b></div>}
              {g.dlcCount > 0 && <div className="gp-info-row"><span>DLC</span><b>{g.dlcCount}종</b></div>}
              {g.steamAppId && <div className="gp-info-row"><span>appid</span><b>{g.steamAppId}</b></div>}
            </div>

            <div className="gp-info-box">
              <div className="gp-info-title">제목: {g.name}</div>
              <div className="gp-info-line">장르: {g.genres?.join(", ") || "-"}</div>
              <div className="gp-info-line">개발자: {g.developer}</div>
              <div className="gp-info-line">배급사: {g.publisher}</div>
              <div className="gp-info-line">출시일: {ymd(g.releaseDate)}</div>
            </div>
          </aside>
        </div>

        {/* ---------- 비슷한 게임 (같은 장르 태그 겹침 순) ---------- */}
        {g.similarGames?.length > 0 && (
          <section className="gp-similar-section">
            <div className="gp-similar-head">
              <h2 className="gp-h2">비슷한 게임 더 보기</h2>
            </div>
            <div className="gp-similar-wrap">
              <button
                className="arrow prev"
                onClick={() => similarRowRef.current?.scrollBy({ left: -300, behavior: "smooth" })}
              >
                ‹
              </button>
              <div className="gp-similar-row" ref={similarRowRef}>
                {g.similarGames.map((sg: any) => (
                  <div key={sg.slug} className="gp-similar-card" onClick={() => onOpenGame(sg.slug)}>
                    <div className="art" style={bgStyle(sg.headerImage || sg.capsuleImage)} />
                    <div className="gp-similar-price">{priceText(sg)}</div>
                  </div>
                ))}
              </div>
              <button
                className="arrow next"
                onClick={() => similarRowRef.current?.scrollBy({ left: 300, behavior: "smooth" })}
              >
                ›
              </button>
            </div>
          </section>
        )}

        {/* ---------- 사용자 평가 (wrap 전체 폭) ---------- */}
        <h2 className="gp-h2 gp-reviews-h">{g.name}에 대한 사용자 평가</h2>
        <div className="gp-review-box">
          <div className="gp-review-summary">
            <div className="gp-review-total">
              <div className="lbl">종합 평가:</div>
              <div className={reviewCls(g.reviewPercent)}>{g.reviewDesc ?? "평가 없음"}</div>
              <div className="cnt">(평가 {(g.reviewTotal ?? 0).toLocaleString("ko-KR")}개)</div>
            </div>
            <div className="gp-review-bars">
              <div>
                <span>전체 평가(모든 언어): <b>{(g.reviewTotal ?? 0).toLocaleString("ko-KR")}</b></span>
                <span className={pillCls(g.reviewPercent)}>{g.reviewDesc ?? "평가 없음"}</span>
              </div>
              <div>
                <span>한국어 평가: <b>{(g.reviewCountLocal ?? 0).toLocaleString("ko-KR")}</b>개</span>
                <span className={pillCls(g.reviewPercent)}>{g.reviewDesc ?? "평가 없음"}</span>
              </div>
            </div>
          </div>

          <div className="gp-review-filters">
            <select
              className="gp-filter"
              value={reviewTypeFilter}
              onChange={(e) => setReviewTypeFilter(e.target.value as "all" | "positive" | "negative")}
            >
              <option value="all">평가 유형: 전체</option>
              <option value="positive">평가 유형: 추천</option>
              <option value="negative">평가 유형: 비추천</option>
            </select>
            <select className="gp-filter" defaultValue="all">
              <option value="all">구매 형식: 전체</option>
              <option value="steam">Steam 구매</option>
              <option value="key">기타 활성화</option>
            </select>
            <select className="gp-filter" defaultValue="all">
              <option value="all">언어: 내 언어</option>
              <option value="ko">한국어</option>
              <option value="en">영어</option>
              <option value="all-lang">모든 언어</option>
            </select>
            <select
              className="gp-filter"
              value={dateRangeFilter}
              onChange={(e) => setDateRangeFilter(e.target.value as "all" | "30d" | "90d" | "365d")}
            >
              <option value="all">날짜 범위: 전체</option>
              <option value="30d">최근 30일</option>
              <option value="90d">최근 90일</option>
              <option value="365d">최근 1년</option>
            </select>
            <select
              className="gp-filter"
              value={playtimeFilter}
              onChange={(e) => setPlaytimeFilter(e.target.value as "all" | "0-10" | "10-100" | "100+")}
            >
              <option value="all">플레이 시간: 전체</option>
              <option value="0-10">10시간 미만</option>
              <option value="10-100">10~100시간</option>
              <option value="100+">100시간 이상</option>
            </select>
            <select className="gp-filter" defaultValue="useful">
              <option value="useful">표시: 유용한 순</option>
              <option value="recent">최신순</option>
              <option value="funny">재밌음 순</option>
            </select>
          </div>
        </div>

        <div className="gp-reviews-cols">
          <div className="gp-reviews-main">
            <h3 className="gp-h3">가장 유용한 평가</h3>
            {filteredReviews.length ? (
              filteredReviews.map((r: any, i: number) => (
                <div className="gp-review" key={i}>
                  <div className="gp-review-user">
                    <div className="ava" style={bgStyle(r.avatarUrl)} />
                    <div>
                      <b>{r.nickname}</b>
                    </div>
                  </div>
                  <div className="gp-review-body">
                    <div className="gp-review-verdict">
                      {/* eslint-disable-next-line @next/next/no-img-element -- 정적 아이콘 40x40 */}
                      <img
                        className="gp-verdict-thumb"
                        src={r.isRecommended ? "/icon_thumbsUp.png" : "/icon_thumbsDown.png"}
                        alt={r.isRecommended ? "추천" : "비추천"}
                        width={40}
                        height={40}
                      />
                      <div>
                        <b>{r.isRecommended ? "추천" : "비추천"}</b>
                        <small>기록상 {r.playtimeHours}시간</small>
                      </div>
                      <span className="gp-review-star">★</span>
                    </div>
                    <div className="gp-review-date">게시 일시: {ymd(r.createdAt)}</div>
                    <p className="gp-review-text">{r.content}</p>
                    <div className="gp-review-help">
                      이 평가가 유용한가요?
                      <span className="btns">
                        {VOTE_BUTTONS.map((b) => (
                          <button
                            key={b.kind}
                            type="button"
                            className={"gp-vote" + (r.myVotes?.includes(b.kind) ? " on" : "")}
                            aria-pressed={r.myVotes?.includes(b.kind) ?? false}
                            onClick={() => voteReview(r.id, b.kind)}
                          >
                            {b.icon}
                            {b.label}
                          </button>
                        ))}
                      </span>
                    </div>
                    {voteError && <div className="gp-vote-error">{voteError}</div>}
                    <div className="gp-review-count">
                      {r.helpfulCount > 0 && <div>{r.helpfulCount}명이 이 평가가 유용하다고 함</div>}
                      {r.funnyCount > 0 && <div>{r.funnyCount}명이 이 평가가 재미있다고 함</div>}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="gp-empty">아직 등록된 평가가 없습니다.</div>
            )}
          </div>

          <div className="gp-reviews-recent">
            <h3 className="gp-h3">최근 평가</h3>
            {g.recentReviews?.length ? (
              <div className="gp-recent-list">
                {g.recentReviews.map((r: any, i: number) => (
                  <div className="gp-recent-review" key={i}>
                    <div className="gp-recent-head">
                      <div className="ava" style={bgStyle(r.avatarUrl)} />
                      <div>
                        <b>{r.nickname}</b>
                        <small>기록상 {r.playtimeHours}시간</small>
                      </div>
                    </div>
                    <div className="gp-review-date">게시 일시: {ymd(r.createdAt)}</div>
                    <p className="gp-recent-text">{r.content}</p>
                    <div className="gp-review-help">이 평가가 유용한가요?</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="gp-empty">최근 평가가 없습니다.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
