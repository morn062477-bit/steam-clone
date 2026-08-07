"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * 사용자 보관함(구매한 게임) 화면.
 *
 * 실제 Steam 의 프로필 > 게임 페이지 구성을 따른다.
 *   프로필 바 → 탭 → 검색/정렬 → 원격 다운로드 상태 → 게임 목록
 *
 * 데이터는 GET /api/library 하나로 끝난다. 결제(checkout/complete)가 끝나면
 * LibraryItem 이 쌓이고, 주문 내역에서 실제 결제 금액을 함께 가져온다.
 */

const won = (n: number) => "₩ " + Number(n).toLocaleString("ko-KR");

function ymd(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function bgStyle(url?: string | null) {
  return url ? { backgroundImage: `url('${url}')` } : undefined;
}

type Sort = "purchased" | "name";

/** 상단 내비와 같은 모양의 화살표. 열리면 180도 돈다. */
function Caret() {
  return (
    <svg className="lib-caret" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M3.5 5.5L7 9l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const STAT_ITEMS = ["도전 과제", "전 세계 도전 과제"];
const CONTENT_ITEMS = [
  "커뮤니티 허브",
  "내 스크린샷",
  "게임을 플레이하는 친구",
  "내 노트",
  "내 트레이딩 카드(0/5)",
  "내 평가",
];

export default function LibraryPage({
  user,
  wishlistCount,
  onOpenGame,
  onWishlist,
}: {
  user: { nickname: string } | null;
  wishlistCount: number;
  onOpenGame: (slug: string) => void;
  onWishlist: () => void;
}) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("purchased");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  // "<slug>:stats" 또는 "<slug>:content" 형태로 어느 게임의 어느 메뉴가 열렸는지 담는다
  const [openAction, setOpenAction] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setRows(null);
    setError(null);
    fetch("/api/library")
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(setRows)
      .catch((e) => setError(e.message));
  }, [user]);

  const list = useMemo(() => {
    const rs = (rows ?? []).filter((g) =>
      q.trim() ? g.name.toLowerCase().includes(q.trim().toLowerCase()) : true,
    );
    if (sort === "name") return [...rs].sort((a, b) => a.name.localeCompare(b.name, "ko"));
    return rs; // 서버가 이미 최신 구매순으로 준다
  }, [rows, q, sort]);

  if (!user) {
    return (
      <div className="libpage"><div className="wrap lib-empty">
        <p>보관함은 로그인 후 이용할 수 있습니다.</p>
      </div></div>
    );
  }

  return (
    <div className="libpage">
      {/* 프로필 바 */}
      <div className="lib-profile">
        <div className="wrap lib-profile-in">
          {/* eslint-disable-next-line @next/next/no-img-element -- 외부 CDN 이미지 한 장 */}
          <img className="lib-avatar" src="https://avatars.fastly.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg" alt="" width={62} height={62} />
          <h1>
            {user.nickname} <span className="sep">»</span> <span className="cur">게임</span>
          </h1>
        </div>
      </div>

      <div className="wrap lib-body">
        {/* 탭 */}
        <div className="lib-tabs">
          <button type="button" className="lib-tab">최근 플레이한 게임(0)</button>
          <button type="button" className="lib-tab on">모든 게임({rows?.length ?? 0})</button>
          <button type="button" className="lib-tab">완전 정복한 게임(0)</button>
          <button type="button" className="lib-tab">팔로우한 게임</button>
          <button type="button" className="lib-tab">작성한 평가</button>
          <button type="button" className="lib-tab" onClick={onWishlist}>찜 목록{wishlistCount ? `(${wishlistCount})` : ""}</button>
        </div>

        {/* 검색 + 정렬 */}
        <div className="lib-toolbar">
          <div className="lib-search">
            <input placeholder="게임 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M6.5 1a5.5 5.5 0 104.2 9.05l3.6 3.6 1.4-1.4-3.6-3.6A5.5 5.5 0 006.5 1zm0 2a3.5 3.5 0 110 7 3.5 3.5 0 010-7z" />
            </svg>
          </div>
          <div className="lib-sort">
            <span className="gear" aria-hidden="true">⚙</span>
            <button type="button" className={sort === "purchased" ? "on" : ""} onClick={() => setSort("purchased")}>
              구매일
            </button>
            <button type="button" className={sort === "name" ? "on" : ""} onClick={() => setSort("name")}>
              이름
            </button>
            <button type="button" className="dim">도전 과제 달성 완료</button>
          </div>
        </div>

        {/* 원격 다운로드 상태 */}
        <div className="lib-remote">
          <span>원격 다운로드 상태: PC에 연결 불가</span>
          <button type="button">더 알아보기 ⌄</button>
        </div>

        {error && <div className="err">보관함을 불러오지 못했습니다: {error}</div>}
        {!error && rows === null && <div className="loading">불러오는 중…</div>}
        {rows !== null && list.length === 0 && (
          <div className="lib-none">
            {q.trim() ? "검색 결과가 없습니다." : "아직 구매한 게임이 없습니다. 상점에서 게임을 구매해 보세요."}
          </div>
        )}

        {/* 게임 목록 */}
        {list.map((g) => (
          <div className="lib-row" key={g.slug}>
            <div className="lib-cap" style={bgStyle(g.headerImage)} onClick={() => onOpenGame(g.slug)} />
            <div className="lib-info">
              <div className="lib-name" onClick={() => onOpenGame(g.slug)}>{g.name}</div>

              <div className="lib-ach">
                <span>도전 과제</span>
                <b>0/{(g.tags?.length ?? 0) * 8 + 3}</b>
              </div>
              <div className="lib-bar"><i style={{ width: "0%" }} /></div>

              <div className="lib-actions">
                {([
                  ["stats", "내 게임 통계", STAT_ITEMS],
                  ["content", "내 게임 콘텐츠", CONTENT_ITEMS],
                ] as const).map(([key, label, items]) => {
                  const id = `${g.slug}:${key}`;
                  const open = openAction === id;
                  return (
                    <div className="lib-act" key={key}>
                      <button
                        type="button"
                        className={"lib-act-btn" + (open ? " on" : "")}
                        onClick={() => setOpenAction(open ? null : id)}
                      >
                        <span>{label}</span>
                        <i className="lib-act-div" />
                        <Caret />
                      </button>
                      {open && (
                        <div className="lib-act-drop">
                          {items.map((it) => (
                            <button key={it} type="button" onClick={() => setOpenAction(null)}>{it}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="lib-side">
              <button
                type="button"
                className="lib-dots"
                aria-label="더 보기"
                onClick={() => setOpenMenu(openMenu === g.slug ? null : g.slug)}
              >
                •••
              </button>
              {openMenu === g.slug && (
                <div className="lib-menu">
                  <div className="lib-menu-row"><span>구매일</span><b>{ymd(g.purchasedAt)}</b></div>
                  <div className="lib-menu-row">
                    <span>결제 금액</span>
                    <b>{g.paidKrw != null ? won(g.paidKrw) : "-"}</b>
                  </div>
                  <button type="button" onClick={() => onOpenGame(g.slug)}>상점 페이지 보기</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
