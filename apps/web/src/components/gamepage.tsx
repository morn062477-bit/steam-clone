"use client";

import { useEffect, useState } from "react";

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

/** 리뷰 요약 색: 긍정 70% 이상이면 파랑, 아니면 주황 */
const reviewCls = (pct: number | null) =>
  "gp-review-sum" + (pct == null ? "" : pct >= 70 ? " positive" : pct >= 40 ? "" : " negative");

export default function GamePage({
  slug,
  onBack,
  onOpenGame,
  onTag,
}: {
  slug: string;
  onBack: () => void;
  onOpenGame: (slug: string) => void;
  onTag: (tag: string) => void;
}) {
  const [g, setG] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState(0);
  const [stripFrom, setStripFrom] = useState(0);
  const [descOpen, setDescOpen] = useState(false);

  useEffect(() => {
    setG(null);
    setError(null);
    setShot(0);
    setStripFrom(0);
    setDescOpen(false);
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
  const STRIP = 6; // 썸네일 줄에 한 번에 보이는 개수
  const platforms = [g.platforms?.windows && "Windows", g.platforms?.mac && "macOS", g.platforms?.linux && "Linux"]
    .filter(Boolean)
    .join(", ");
  const req = g.reqWindows ?? {};

  return (
    <div className="gamepage">
      <div className="wrap">
        {/* ---------- 빵부스러기 ---------- */}
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

        {/* ---------- 갤러리 + 요약 ---------- */}
        <div className="gp-top">
          <div className="gp-media">
            <div className="gp-shot" style={bgStyle(shots[shot]?.url || g.headerImage)} />
            <div className="gp-strip-row">
              <button className="gp-arrow" onClick={() => setStripFrom((v) => Math.max(0, v - 1))} disabled={stripFrom === 0}>‹</button>
              <div className="gp-strip">
                {shots.slice(stripFrom, stripFrom + STRIP).map((s: any, i: number) => {
                  const idx = stripFrom + i;
                  return (
                    <div
                      key={idx}
                      className={"gp-thumb" + (idx === shot ? " on" : "")}
                      style={bgStyle(s.thumb || s.url)}
                      onClick={() => setShot(idx)}
                    />
                  );
                })}
              </div>
              <button
                className="gp-arrow"
                onClick={() => setStripFrom((v) => Math.min(Math.max(0, shots.length - STRIP), v + 1))}
                disabled={stripFrom >= shots.length - STRIP}
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
                <button className="gp-cart" type="button">장바구니에 추가</button>
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

            {/* ---------- 사용자 평가 ---------- */}
            <h2 className="gp-h2 gp-reviews-h">{g.name}에 대한 사용자 평가</h2>
            <div className="gp-review-box">
              <div className="gp-review-total">
                <div className="lbl">종합 평가:</div>
                <div className={reviewCls(g.reviewPercent)}>{g.reviewDesc ?? "평가 없음"}</div>
                <div className="cnt">(평가 {(g.reviewTotal ?? 0).toLocaleString("ko-KR")}개)</div>
              </div>
              <div className="gp-review-bars">
                <div><span>한국어 평가:</span><b>{g.reviewCountLocal ?? 0}</b>개</div>
                <div><span>최근 평가(모든 언어):</span><b>{(g.reviewTotal ?? 0).toLocaleString("ko-KR")}</b></div>
              </div>
            </div>

            <h3 className="gp-h3">가장 유용한 평가</h3>
            {g.reviews?.length ? (
              g.reviews.map((r: any, i: number) => (
                <div className="gp-review" key={i}>
                  <div className="gp-review-user">
                    <div className="ava" style={bgStyle(r.avatarUrl)} />
                    <div>
                      <b>{r.nickname}</b>
                    </div>
                  </div>
                  <div className="gp-review-body">
                    <div className="gp-review-verdict">
                      <span className={"thumb" + (r.isRecommended ? "" : " no")}>{r.isRecommended ? "👍" : "👎"}</span>
                      <div>
                        <b>{r.isRecommended ? "추천" : "비추천"}</b>
                        <small>기록상 {r.playtimeHours}시간</small>
                      </div>
                    </div>
                    <div className="gp-review-date">게시 일시: {ymd(r.createdAt)}</div>
                    <p className="gp-review-text">{r.content}</p>
                    <div className="gp-review-help">
                      이 평가가 유용한가요?
                      <span className="btns"><i>👍 네</i><i>👎 아니요</i><i>유쾌</i></span>
                    </div>
                    <div className="gp-review-count">{r.helpfulCount}명이 이 평가가 유용하다고 함</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="gp-empty">아직 등록된 평가가 없습니다.</div>
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
      </div>
    </div>
  );
}
