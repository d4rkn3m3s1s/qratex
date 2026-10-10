import type { Metadata } from 'next';
import { AuthErrorView } from './auth-error-view';

export const metadata: Metadata = {
  title: 'Giriş hatası',
  robots: { index: false, follow: false },
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = sp.error;
  const code = typeof raw === 'string' ? raw.slice(0, 64) : null;
  return <AuthErrorView code={code} />;
}
