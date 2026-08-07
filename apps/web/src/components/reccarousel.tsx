"use client";

import { useState } from "react";

/**
 * "맞춤 추천" 세로 포스터 캐러셀.
 *
 * 한 화면에 카드 4장, 좌우 화살표로 넘기고 아래 막대가 현재 위치를 보여 준다.
 * 카드 그림은 600x900 라이브러리 캡슐(libraryImage)을 쓰고, 없으면 가로 헤더로 대체한다.
 * 가격은 카드 아래 검은 띠에 오른쪽 정렬로 얹는다.
 */

const won = (n: number) => "₩ " + Number(n).toLocaleString("ko-KR");

function bgStyle(url?: string | null) {
  return url ? { backgroundImage: `url('${url}')` } : undefined;
}

const PER_PAGE = 4;

export default function RecCarousel({
  title = "맞춤 추천",
  games,
  onOpenGame,
}: {
  title?: string;
  games: any[];
  onOpenGame: (slug: string) => void;
}) {
  const [page, setPage] = useState(0);

  const pages = Math.max(1, Math.ceil(games.length / PER_PAGE));
  const cur = Math.min(page, pages - 1);
  const shown = games.slice(cur * PER_PAGE, cur * PER_PAGE + PER_PAGE);

  if (!games.length) return null;

  return (
    <section className="rc">
      <h2 className="rc-title">{title}</h2>

      <div className="rc-wrap">
        <button
          type="button"
          className="rc-arrow left"
          aria-label="이전 추천"
          disabled={cur === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          ‹
        </button>

        <div className="rc-grid">
          {shown.map((g: any) => (
            <div className="rc-card" key={g.slug} onClick={() => onOpenGame(g.slug)}>
              {/* 세로 이미지가 없는 게임만 가로 헤더로 대체된다 */}
              <div className="art" style={bgStyle(g.libraryImage || g.headerImage)} />
              <div className="rc-price">
                {g.discountPercent > 0 ? (
                  <>
                    <span className="disc">-{g.discountPercent}%</span>
                    <span className="was">{won(g.priceKrw)}</span>
                    <span className="now">{won(g.finalKrw)}</span>
                  </>
                ) : (
                  <span className="now">{g.isFree ? "무료 플레이" : won(g.priceKrw)}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="rc-arrow right"
          aria-label="다음 추천"
          disabled={cur >= pages - 1}
          onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
        >
          ›
        </button>
      </div>

      <div className="rc-track">
        <div
          className="rc-thumb"
          style={{ width: `${100 / pages}%`, left: `${(100 / pages) * cur}%` }}
        />
      </div>
    </section>
  );
}
