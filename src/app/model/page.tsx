import { Container } from '@/components/site/Container';

export const metadata = { title: 'Model' };

export default function Page() {
  return (
    <Container className="py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Model card</h1>
      <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
        Coming in the next phase.
      </p>
    </Container>
  );
}
