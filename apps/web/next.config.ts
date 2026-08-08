import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 개발 중 화면 왼쪽 아래에 뜨던 Next 표시등을 끈다.
  // 꺼도 컴파일/런타임 오류는 그대로 화면에 표시된다.
  devIndicators: false,

  // 기본적으로 dev 서버는 localhost 이외의 origin에서 오는 요청은 JS 번들/데이터
  // 요청을 막는다. QR 로그인을 폰(LAN IP로 접속)에서 테스트하려면 그 origin을
  // 허용해야 하는데, PC마다/네트워크마다 LAN IP가 다르므로 하드코딩하지 않고
  // .env.local의 DEV_LAN_ORIGIN(커밋 안 됨, 예시는 .env.local.example 참고)에서 읽는다.
  allowedDevOrigins: process.env.DEV_LAN_ORIGIN ? [process.env.DEV_LAN_ORIGIN] : undefined,

  async rewrites() {
    // 배포된 API 서버 주소는 API_ORIGIN(예: Railway 도메인)으로 넣는다.
    // 안 넣으면 로컬 개발용 기본값(localhost:4000)을 쓴다.
    const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:4000";
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
