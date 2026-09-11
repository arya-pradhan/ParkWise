import Link from 'next/link';
import { Container } from '@/components/site/Container';

export default function NotFound() {
  return (
    <Container className="py-20">
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight">No such page</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          Nothing is parked here.
        </p>
        <Link href="/" className="mt-5 inline-block text-sm font-medium underline underline-offset-2">
          Back to the start
        </Link>
      </div>
    </Container>
  );
}
