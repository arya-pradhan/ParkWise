'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/detect', label: 'Detect' },
  { href: '/detect/video', label: 'Video' },
  { href: '/model', label: 'Model' },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header
      className="sticky top-0 z-50 border-b backdrop-blur-md"
      style={{ background: 'color-mix(in oklch, var(--bg) 82%, transparent)' }}
    >
      <nav
        className="mx-auto flex h-14 max-w-6xl items-center gap-1 px-4 sm:px-6"
        aria-label="Main"
      >
        <Link
          href="/"
          className="mr-auto flex items-center gap-2 text-[15px] font-semibold tracking-tight"
        >
          <Logomark />
          ParkWise
        </Link>

        {LINKS.map(({ href, label }) => {
          // /detect must not light up while on /detect/video.
          const active = href === '/detect'
            ? pathname === '/detect'
            : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className="rounded-md px-3 py-1.5 text-sm transition-colors"
              style={{
                color: active ? 'var(--text)' : 'var(--text-muted)',
                background: active ? 'var(--bg-sunken)' : 'transparent',
                fontWeight: active ? 550 : 450,
              }}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

/** A parking "P" in a rounded square, split open/occupied. */
export function Logomark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="var(--color-occupied)" />
      <path d="M0 6a6 6 0 0 1 6-6h6v24H6a6 6 0 0 1-6-6Z" fill="var(--color-open)" />
      <path
        d="M9 6.5h4.2a3.9 3.9 0 0 1 0 7.8H11.4V18H9V6.5Zm2.4 5.6h1.6a1.7 1.7 0 0 0 0-3.4h-1.6v3.4Z"
        fill="white"
      />
    </svg>
  );
}
