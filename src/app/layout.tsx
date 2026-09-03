import type { Metadata, Viewport } from "next";
import { Zen_Old_Mincho, Zen_Kaku_Gothic_New } from "next/font/google";
import "@/design-system/tokens/tokens.css";
import "./globals.css";
import { Providers } from "./providers";

// 感情を象徴する「声」＝明朝
const serif = Zen_Old_Mincho({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

// UI＝ゴシック
const sans = Zen_Kaku_Gothic_New({
  weight: ["300", "400", "500"],
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Focus on Dot",
  description: "話すだけで、AIと一緒に今日を振り返る音声ジャーナリング。",
};

export const viewport: Viewport = {
  themeColor: "#e7edf1",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" className={`${serif.variable} ${sans.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
