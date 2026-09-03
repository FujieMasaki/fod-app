import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 開発時のオーバーレイ（左下バッジ）を非表示にし、UI を素の状態で確認する
  devIndicators: false,
};

export default nextConfig;
