import type { Metadata } from 'next';
import { AcceptTeamInvite } from '@/components/team/invite/accept-invite';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Ekip daveti', robots: { index: false, follow: false } };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Ekip daveti kabul sayfası — token sunucuda (POST) doğrulanır; burada yalnız iletilir. */
export default async function TeamInvitePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.token) ? sp.token[0] : sp.token;
  const token = typeof raw === 'string' ? raw.slice(0, 300) : '';
  return (
    <div className="px-4 py-10">
      <AcceptTeamInvite token={token} nextHref="/admin/ekip" />
    </div>
  );
}
