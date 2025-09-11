import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "회의실 예약 시스템",
  description: "Next.js + Supabase 최소 모듈화 구현",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <header className="px-6 py-4 border-b bg-white sticky top-0 z-10">
          <nav className="max-w-5xl mx-auto flex items-center justify-between">
            <Link href="/" className="font-semibold">홈</Link>
            <div className="flex items-center gap-4 text-sm">
              <Link href="/rooms" className="hover:underline">회의실</Link>
              <Link href="/reserve" className="hover:underline">예약 확정</Link>
              <Link href="/my" className="hover:underline">내 예약</Link>
            </div>
          </nav>
        </header>
        <div className="max-w-5xl mx-auto">
          {children}
        </div>
      </body>
    </html>
  );
}
