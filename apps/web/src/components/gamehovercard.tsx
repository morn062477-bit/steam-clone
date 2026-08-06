"use client";

import { useEffect, useState } from "react";

/**
 * 게임 카드에 마우스를 올리면 옆에 뜨는 설명 패널.
 *
 * 카드가 캐러셀(overflow:hidden) 안에 있어서 카드 자식으로 넣으면 잘린다.
 * 그래서 페이지 최상단에 position:fixed 로 하나만 띄우고, 어느 카드에
 * 올렸는지에 따라 위치만 옮긴다.
 */

function ymd(iso: string | null) {
  if (!iso) return "출시일 미정";
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export type HoverInfo = { g: any; rect: DOMRect } | null;

const W = 300;   // 패널 폭
const GAP = 12;  // 카드와의 간격

export default function GameHoverCard({ info }: { info: HoverInfo }) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!info) { setPos(null); return; }
    const { rect } = info;

    // 기본은 카드 오른쪽. 화면 밖으로 나가면 왼쪽으로 뒤집는다.
    let left = rect.right + GAP;
    if (left + W > window.innerWidth - 8) left = rect.left - W - GAP;
    if (left < 8) left = Math.min(rect.left, window.innerWidth - W - 8);

    // 위는 카드 상단에 맞추되 화면 아래로 넘치지 않게 끌어올린다.
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - 260));
    setPos({ left, top });
  }, [info]);

  if (!info || !pos) return null;
  const g = info.g;

  return (
    <div className="ghc" style={{ left: pos.left, top: pos.top, width: W }}>
      <h4 className="ghc-title">{g.name}</h4>
      <div className="ghc-date">출시: {ymd(g.releaseDate)}</div>

      {g.shortDesc && <p className="ghc-desc">{g.shortDesc}</p>}

      <div className="ghc-review">
        <div className="ghc-label">전체 사용자 평가</div>
        <div className={"ghc-review-val" + ((g.reviewPercent ?? 0) >= 70 ? " positive" : "")}>
          {g.reviewDesc ?? "평가 없음"}
          {g.reviewTotal ? ` (평가 ${g.reviewTotal.toLocaleString("ko-KR")}개)` : ""}
        </div>
      </div>

      {g.tags?.length > 0 && (
        <div className="ghc-tags">
          <div className="ghc-label">사용자 태그:</div>
          <div className="ghc-tag-list">
            {g.tags.slice(0, 5).map((t: string) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
