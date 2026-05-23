import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: 'Internet Olympics — Chaotic Multiplayer Party Games',
  description: 'The most chaotic multiplayer party game platform. Play instantly with friends, no download required. Up to 50 players, streamer-ready, mobile-friendly.',
  keywords: ['party game', 'multiplayer', 'browser game', 'online game', 'friends', 'mario race', 'knockback arena', 'floor is lava', 'physics soccer'],
  metadataBase: new URL('https://internet-olympics-frontend.vercel.app'),
  alternates: {
    canonical: '/',
  },
  verification: {
    google: 'pcVS_vGLQEy0ZRJ7LnPtesENfhUShWe1niY_T7Bd_fQ',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    title: 'Internet Olympics — Chaotic Multiplayer Party Games',
    description: 'Play free multiplayer party games instantly in your browser. No download needed. Up to 50 players!',
    type: 'website',
    url: 'https://internet-olympics-frontend.vercel.app',
    siteName: 'Internet Olympics',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Internet Olympics',
    description: 'Chaotic multiplayer party games for friends 🏆',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#7C3AED',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7122200972002580"
          crossOrigin="anonymous"
          strategy="beforeInteractive"
        />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
