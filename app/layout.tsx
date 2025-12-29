
import type { Metadata } from "next";
import "./globals.css";
import React from "react";

export const metadata: Metadata = {
  title: "算数「考え方」ガイド",
  description: "小学生の算数の文章題を写真で撮ると、解き方のステップを優しく教えてくれるアプリです。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;700;900&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased font-['Zen_Maru_Gothic',_sans-serif] bg-[#f0f9ff]">
        {children}
      </body>
    </html>
  );
}
