"use client";

import { useEffect, useRef, useState } from "react";

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
  paused = false,
  seekBar = false,
}: {
  src: string;
  skipSeconds?: number;
  className?: string;
  /** true면 재생 중이던 위치 그대로 멈추고, false로 돌아오면 이어서 재생한다 */
  paused?: boolean;
  /** 진행 바를 켠다. 마우스를 올려도 바로 안 뜨고 2초 이상 머물러야 나타나고,
   * 벗어나는 순간 바로 사라진다. */
  seekBar?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [barActive, setBarActive] = useState(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    if (showTimerRef.current) clearTimeout(showTimerRef.current);
    showTimerRef.current = setTimeout(() => setBarActive(true), 2000);
  };
  const handleMouseLeave = () => {
    if (showTimerRef.current) clearTimeout(showTimerRef.current);
    setBarActive(false);
  };

  useEffect(() => {
    return () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!seekBar) return;
    const video = videoRef.current;
    if (!video) return;
    const onTimeUpdate = () => {
      if (video.duration) setProgress((video.currentTime / video.duration) * 100);
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, [seekBar]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    video.currentTime = ratio * video.duration;
  };

  /** 영상 자체를 클릭하면 카드 이동(게임 페이지로 넘어가기) 대신 재생/일시정지만 한다 */
  const handleVideoClick = (e: React.MouseEvent<HTMLVideoElement>) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (paused) video.pause();
    else video.play().catch(() => {});
  }, [paused]);

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

  if (!seekBar) {
    return <video ref={videoRef} className={className} muted playsInline />;
  }

  return (
    <div
      className="hover-video-wrap"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <video ref={videoRef} className={className} muted playsInline onClick={handleVideoClick} />
      <div
        className={"hover-video-seek" + (barActive ? " active" : "")}
        onClick={handleSeek}
      >
        <div className="hover-video-seek-track">
          <div className="hover-video-seek-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}
