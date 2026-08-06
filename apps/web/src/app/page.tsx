"use client";

import { useEffect, useState } from "react";

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

function PriceBar({ g }: { g: any }) {
  if (g.isFree) return <div className="pricebar"><span className="pb-body"><span className="now">무료 플레이</span></span></div>;
  if (g.priceKrw <= 0) return <div className="pricebar"><span className="pb-body"><span className="now">{g.comingSoon ? "출시 예정" : "가격 미정"}</span></span></div>;
  if (g.discountPercent > 0) {
    return (
      <div className="pricebar">
        <span className="disc">-{g.discountPercent}%</span>
        <span className="pb-body">
          <span className="was">{won(g.priceKrw)}</span>
          <span className="now">{won(g.finalKrw)}</span>
        </span>
      </div>
    );
  }
  return <div className="pricebar"><span className="pb-body"><span className="now">{won(g.priceKrw)}</span></span></div>;
}

export default function Home() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [tabIndex, setTabIndex] = useState(0);

  useEffect(() => {
    fetch("/api/home")
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <>
      {/* ===== 헤더 ===== */}
      <header className="topbar">
        <div className="wrap">
          <a className="logo" href="#">
            <span>STEAM<sup>®</sup></span>
          </a>
          <nav className="mainnav">
            <a className="on" href="#">상점</a>
            <a href="#">커뮤니티</a>
            <a href="#">정보</a>
            <a href="#">지원</a>
          </nav>
        </div>
      </header>

      <div className="storenav">
        <div className="wrap">
          <a className="item" href="#">검색</a>
          <a className="item" href="#">카테고리</a>
        </div>
      </div>

      {error && <div className="err">데이터를 불러오지 못했습니다: {error}</div>}
      {!error && !data && <div className="loading">DB에서 상점 데이터를 불러오는 중…</div>}

      {data && (
        <div className="wrap">
          {/* ===== 히어로 (첫 게임만 간단히) ===== */}
          {data.hero && (
            <section className="hero">
              <h1>{data.hero.name}</h1>
              <p>{data.hero.developer} · {ymd(data.hero.releaseDate)}</p>
              <PriceBar g={data.hero} />
            </section>
          )}

          {/* ===== 특집 및 추천 (캐러셀 대신 그냥 나열) ===== */}
          <section className="section">
            <h2 className="sec-title">특집 및 추천 게임</h2>
            <div className="feat-list" style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              {data.featured.map((g: any) => (
                <div key={g.slug} className="feat-info">
                  <h3>{g.name}</h3>
                  <p>{g.reviewDesc}</p>
                  <PriceBar g={g} />
                </div>
              ))}
            </div>
          </section>

          {/* ===== 할인 및 이벤트 ===== */}
          <section className="section">
            <h2 className="sec-title">할인 및 이벤트</h2>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              {data.deals.map((g: any) => (
                <div key={g.slug} className="deal-sm">
                  <div className="card-name">{g.name}</div>
                  <PriceBar g={g} />
                </div>
              ))}
            </div>
          </section>

          {/* ===== 태그 스포트라이트 ===== */}
          {data.spotlights.map((s: any) => (
            <section className="section" key={s.tag}>
              <h2 className="sec-title">{s.tag} 게임</h2>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                {s.games.map((g: any) => (
                  <div key={g.slug} className="spot-card">
                    <div className="card-name">{g.name}</div>
                    <PriceBar g={g} />
                  </div>
                ))}
              </div>
            </section>
          ))}

          {/* ===== 신규 출시 등 (탭) ===== */}
          <section className="section">
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
            <div className="rel-list">
              {data.tabs[tabIndex].games.map((g: any) => (
                <div key={g.slug} className="rel-row">
                  <h5>{g.name}</h5>
                  <div className="tags">{g.tags.slice(0, 4).join(", ") || "태그 없음"}</div>
                  <div className="date">출시: {ymd(g.releaseDate)}</div>
                  <PriceBar g={g} />
                </div>
              ))}
            </div>
          </section>

          {/* ===== 카테고리 ===== */}
          <section className="section">
            <h2 className="sec-title">카테고리별 검색</h2>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              {data.categories.map((c: any) => (
                <div key={c.slug} className="cat">
                  <b>{c.name}</b>
                  <small>{c.count}종</small>
                </div>
              ))}
            </div>
          </section>

          {/* ===== 1만원 미만 ===== */}
          <section className="section">
            <h2 className="sec-title">₩ 10,000 미만</h2>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              {data.cheap.map((g: any) => (
                <div key={g.slug} className="cheap-card">
                  <div className="card-name">{g.name}</div>
                  <PriceBar g={g} />
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ===== 푸터 ===== */}
      <footer>
        <div className="wrap foot-grid">
          <div className="foot-brand">
            © 2026 Valve Corporation. All rights reserved.
          </div>
        </div>
      </footer>
    </>
  );
}