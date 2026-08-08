/**
 * 홈 전면 배너(Takeover)와 세일 페이지가 같은 버전(사이버펑크/둠)을 보여주도록
 * 랜덤 선택을 여기 한 곳에서만 한다. Home 이 고른 버전을 SalePage 에 그대로 넘겨서,
 * 배너를 눌러 들어갔을 때 다른 버전으로 안 바뀌게(연결되게) 한다.
 */
export const TAKEOVER_VERSIONS = [
  {
    key: "cyberpunk",
    heroBg: "/sale-bg.jpg",
    saleLogo: "/sale-logo.png",
    saleAlt: "2026년 Steam 사이버펑크 게임 축제",
    saleLogoW: 940,
    saleLogoH: 460,
  },
  {
    key: "doom",
    heroBg: "/sale-takeover-2-bg.jpg",
    saleLogo: "/sale-takeover-2-logo.png",
    saleAlt: "BETHESDA SOFTWORKS 40주년 기념 40% 할인",
    saleLogoW: 1200,
    saleLogoH: 460,
  },
] as const;

export type TakeoverVersion = (typeof TAKEOVER_VERSIONS)[number];

export function pickTakeoverVersion(): TakeoverVersion {
  return TAKEOVER_VERSIONS[Math.floor(Math.random() * TAKEOVER_VERSIONS.length)];
}
