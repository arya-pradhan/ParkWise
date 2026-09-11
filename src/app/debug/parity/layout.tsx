import type { Metadata } from 'next';

// Deliberately reachable in production — it demonstrates the verification —
// but not something search engines should index.
export const metadata: Metadata = {
  title: 'Parity check',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
