import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Nav } from '@/components/site/Nav';
import { Footer } from '@/components/site/Footer';
import './globals.css';

// Self-hosted at build time by next/font, which matters here: the COEP header
// in next.config.ts would block a cross-origin font request.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://parkwise.vercel.app'),
  title: {
    default: 'ParkWise — find open parking spaces',
    template: '%s · ParkWise',
  },
  description:
    'Detects open and occupied parking spaces in a photo. A YOLOv5s model running entirely in your browser — nothing is uploaded.',
  openGraph: {
    title: 'ParkWise',
    description:
      'Parking space detection that runs entirely in your browser. Nothing is uploaded.',
    type: 'website',
  },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafa' },
    { media: '(prefers-color-scheme: dark)', color: '#1c1d21' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:px-3 focus:py-2"
          style={{ background: 'var(--bg-raised)', boxShadow: 'var(--shadow)' }}
        >
          Skip to content
        </a>
        <Nav />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
