import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 개발 중 화면 왼쪽 아래에 뜨던 Next 표시등을 끈다.
  // 꺼도 컴파일/런타임 오류는 그대로 화면에 표시된다.
  devIndicators: false,

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:4000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
