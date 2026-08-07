"use client";

import { useEffect, useRef } from "react";

/**
 * 카드 호버 시 트레일러 재생.
 *
 * Steam appdetails는 더 이상 mp4/webm을 주지 않고 HLS(m3u8)만 준다.
 * Safari는 <video>가 HLS를 네이티브로 틀 수 있지만 Chrome/Firefox는 hls.js가 필요하다.
 *
 * 트레일러 앞부분(로고/인트로)을 건너뛰고 바로 게임 화면부터 보여준다.
 * loop는 네이티브 속성 대신 'ended'에서 직접 되감아, 반복될 때도 인트로를 다시 안 보게 한다.
 */
export const HOVER_SKIP_SEC = 4;

export default function HoverVideo({
  src,
  skipSeconds = HOVER_SKIP_SEC,
  className = "hover-video",
}: {
  src: string;
  skipSeconds?: number;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const seekPastIntro = () => {
      if (video.duration > skipSeconds + 1) video.currentTime = skipSeconds;
    };
    const restart = () => { seekPastIntro(); video.play().catch(() => {}); };

    video.addEventListener("loadedmetadata", seekPastIntro);
    video.addEventListener("ended", restart);

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.play().catch(() => {});
      return () => {
        video.removeEventListener("loadedmetadata", seekPastIntro);
        video.removeEventListener("ended", restart);
      };
    }

    let hls: import("hls.js").default | undefined;
    import("hls.js").then(({ default: Hls }) => {
      if (!videoRef.current) return;
      if (!Hls.isSupported()) return;
      hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(videoRef.current);
      hls.on(Hls.Events.MANIFEST_PARSED, () => videoRef.current?.play().catch(() => {}));
    });

    return () => {
      hls?.destroy();
      video.removeEventListener("loadedmetadata", seekPastIntro);
      video.removeEventListener("ended", restart);
    };
  }, [src, skipSeconds]);

  return <video ref={videoRef} className={className} muted playsInline />;
}
