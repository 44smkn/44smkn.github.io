import type { Metadata } from "next";
import Header from "@/components/Header";
import "highlight.js/styles/github-dark.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL('https://44smkn.github.io'),
  title: {
    default: '44smknのブログ',
    template: '%s | 44smknのブログ',
  },
  description: "Software Engineering, Readings, and Misc.",
  openGraph: {
    title: '44smknのブログ',
    description: 'Software Engineering, Readings, and Misc.',
    url: 'https://44smkn.github.io',
    siteName: '44smknのブログ',
    locale: 'ja_JP',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '44smknのブログ',
    description: 'Software Engineering, Readings, and Misc.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <link href="https://cdn.jsdelivr.net/npm/line-seed-jp/line-seed-jp.css" rel="stylesheet" />
      </head>
      <body className="antialiased mx-auto max-w-3xl px-6">
        <Header />
        <main className="min-h-screen pb-20">
            {children}
        </main>
      </body>
    </html>
  );
}
