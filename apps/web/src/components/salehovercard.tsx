"use client";

import { useEffect, useState } from "react";
import HoverVideo from "@/components/hovervideo";

/**
 * 축제 페이지 "인기 게임" 카드에 마우스를 올리면 뜨는 큰 패널.
 *
 * 위쪽은 트레일러(없으면 스크린샷), 그 아래로 헤더 이미지가 걸치고
 * 이름 / 태그 / 평가 / 플랫폼·출시일이 이어진다.
 *
 * 카드 안에 넣으면 격자에 눌려 잘리므로, 페이지 최상단에 position:fixed 로
 * 하나만 띄우고 어느 카드에 올렸는지에 따라 위치만 옮긴다.
 */

export type SaleHoverInfo = { g: any; rect: DOMRect } | null;

const W = 460; // 패널 폭
const GAP = 10; // 카드와의 간격

function ymd(iso: string | null) {
  if (!iso) return "출시일 미정";
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

const won = (n: number) => "₩ " + Number(n).toLocaleString("ko-KR");

export default function SaleHoverCard({
  info,
  wished,
  onWish,
  onOpenGame,
}: {
  info: SaleHoverInfo;
  wished?: boolean;
  onWish?: (slug: string) => void;
  onOpenGame?: (slug: string) => void;
}) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!info) { setPos(null); return; }
    const { rect } = info;

    // 카드 가운데에 패널 가운데를 맞추고, 화면 밖으로 나가면 안쪽으로 민다.
    let left = rect.left + rect.width / 2 - W / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - W - 8));

    // 카드 위에 띄우는 게 기본. 위가 좁으면 카드 아래로 내린다.
    const H = 420; // 대략적인 패널 높이. 화면 밖으로 나가는지만 보면 되니 어림값이면 된다
    let top = rect.top - GAP - H;
    if (top < 8) top = Math.min(rect.bottom + GAP, window.innerHeight - H - 8);
    top = Math.max(8, top);

    setPos({ left, top });
  }, [info]);

  if (!info || !pos) return null;
  const g = info.g;
  const still = g.screenshots?.[0]?.url || g.headerImage;

  return (
    <div
      className="shc"
      style={{ left: pos.left, top: pos.top, width: W }}
      onClick={() => onOpenGame?.(g.slug)}
    >
      <div className="shc-media" style={{ backgroundImage: `url('${still}')` }}>
        {g.previewVideoUrl && <HoverVideo src={g.previewVideoUrl} className="shc-video" />}

        {onWish && (
          <button
            type="button"
            className={"shc-star" + (wished ? " on" : "")}
            aria-label={wished ? "찜 목록에서 빼기" : "찜 목록에 넣기"}
            onClick={(e) => { e.stopPropagation(); onWish(g.slug); }}
          >
            ★
          </button>
        )}

        {/* 가격은 영상 위 오른쪽 아래에 겹친다 */}
        <div className="shc-price">
          {g.discountPercent > 0 && <span className="disc">-{g.discountPercent}%</span>}
          <span className="pb-body">
            {g.discountPercent > 0 && <span className="was">{won(g.priceKrw)}</span>}
            <span className="now">
              {g.isFree ? "무료 플레이" : g.priceKrw <= 0 ? (g.comingSoon ? "출시 예정" : "가격 미정") : won(g.finalKrw)}
            </span>
          </span>
        </div>
      </div>

      <div className="shc-info">
        {/* 헤더 이미지가 영상 아래쪽에 걸쳐 올라탄다 */}
        <div className="shc-cap" style={{ backgroundImage: `url('${g.headerImage}')` }} />

        <div className="shc-name">{g.name}</div>

        {g.tags?.length > 0 && (
          <div className="shc-tags">
            {g.tags.slice(0, 8).map((t: string) => <span key={t}>{t}</span>)}
          </div>
        )}

        <div className={"shc-review" + ((g.reviewPercent ?? 0) >= 70 ? " positive" : "")}>
          {g.reviewDesc ?? "평가 없음"}
          {g.reviewTotal ? ` (한국어 평가 ${g.reviewTotal.toLocaleString("ko-KR")}개)` : ""}
        </div>

        <div className="shc-meta">
          <span className="shc-plat">
            {g.platforms?.windows && <i title="Windows">⊞</i>}
            {g.platforms?.mac && <i title="macOS"></i>}
            {g.platforms?.linux && <i title="Linux">🐧</i>}
          </span>
          <span>{ymd(g.releaseDate)}</span>
        </div>
      </div>
    </div>
  );
}
