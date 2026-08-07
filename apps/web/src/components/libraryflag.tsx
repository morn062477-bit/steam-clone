"use client";

/**
 * "라이브러리에 있음" 깃발.
 *
 * 보유한 게임의 안내 배너와 구매 박스 머리 두 곳에 같은 모양으로 붙는다.
 * 실제 스팀 div.ds_owned_flag.ds_flag 값(높이 18px, 바탕 #a3cf06,
 * 글자 10px "Motiva Sans" #111111, 안쪽 여백 0 0 0 18px)을 그대로 따른다.
 *
 * 감싸는 상자의 왼쪽 여백보다 더 왼쪽으로 나가서 살짝 걸쳐 보이는데,
 * 그 들여쓰기는 상자마다 여백이 달라서 globals.css 에서 각각 잡는다.
 */
export default function LibraryFlag() {
  return (
    <span className="gp-lib-tag">
      <i aria-hidden="true">☰</i>
      라이브러리에 있음
    </span>
  );
}
