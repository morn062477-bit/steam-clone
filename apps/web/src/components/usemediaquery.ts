"use client";

import { useEffect, useState } from "react";

/**
 * 미디어 쿼리가 맞는지 알려 준다. CSS 로는 못 바꾸는 값(예: 캐러셀의 peek 비율)을
 * 화면 폭에 따라 다르게 줄 때 쓴다.
 *
 * 서버 렌더에는 window 가 없으므로 처음에는 항상 false 로 시작하고,
 * 붙자마자 실제 값으로 맞춘다. 그래야 서버와 첫 렌더 결과가 어긋나지 않는다.
 */
export default function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
