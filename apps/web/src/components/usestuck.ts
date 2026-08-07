"use client";

import { useEffect, useRef, useState } from "react";

/**
 * position:sticky 요소가 지금 상단에 붙어 있는지 알려 준다.
 *
 * CSS 만으로 붙은 순간을 아는 방법이 없어서(:stuck 은 아직 브라우저에 없다) 스크롤을 본다.
 * sticky 요소는 붙는 순간부터 getBoundingClientRect().top 이 자기 top 값과 같아지므로
 * 그걸로 판단한다. top 은 var(--nav-h) 같은 변수일 수 있어 계산된 값을 읽어 쓴다.
 *
 *   const { ref, stuck } = useStuck<HTMLDivElement>();
 *   <div ref={ref} className={"bar" + (stuck ? " stuck" : "")}>
 */
export default function useStuck<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const stickyTop = parseFloat(getComputedStyle(el).top) || 0;
      setStuck(el.getBoundingClientRect().top <= stickyTop + 0.5);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  return { ref, stuck };
}
