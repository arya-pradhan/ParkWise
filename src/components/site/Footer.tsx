import Link from 'next/link';

export function Footer() {
  return (
    <footer className="mt-24 border-t" style={{ background: 'var(--bg-sunken)' }}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-center sm:px-6">
        <p style={{ color: 'var(--text-muted)' }}>
          Detection runs in your browser. Images never leave your device.
        </p>
        <nav className="flex gap-5 sm:ml-auto" aria-label="Footer">
          <Link href="/model" style={{ color: 'var(--text-muted)' }}>
            Model card
          </Link>
          <a
            href="https://github.com/arya-pradhan/ParkWise"
            target="_blank"
            rel="noreferrer noopener"
            style={{ color: 'var(--text-muted)' }}
          >
            Source
          </a>
        </nav>
      </div>
    </footer>
  );
}
