import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Internet Olympics — Chaotic Multiplayer Party Games',
  description: 'The most chaotic multiplayer party game platform. Play instantly with friends, no download required. Up to 50 players, streamer-ready, mobile-friendly.',
  keywords: ['party game', 'multiplayer', 'browser game', 'online game', 'friends'],
  openGraph: {
    title: 'Internet Olympics',
    description: 'Chaotic multiplayer party games for friends 🏆',
    type: 'website',
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
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
