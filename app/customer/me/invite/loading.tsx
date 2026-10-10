import { InviteSkeleton } from '@/components/customer/m-davet/invite-skeleton';
import { getServerLocale } from '@/lib/server-locale';

export default async function Loading() {
  const locale = await getServerLocale().catch(() => 'tr');
  return (
    <div role="status" aria-busy="true" className="mx-auto w-full max-w-7xl space-y-6">
      <span className="sr-only">{locale === 'en' ? 'Loading…' : 'Yükleniyor…'}</span>
      <div aria-hidden className="h-14 w-2/3 max-w-md rounded-card bg-surface-3" />
      <InviteSkeleton />
    </div>
  );
}
