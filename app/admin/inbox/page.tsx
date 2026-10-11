import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { INBOX_VIEWS, type InboxListPage, type InboxOverview, type InboxView } from '@/lib/mail-center/inbox-contract';
import { listInbox, loadInboxOverview } from '@/lib/mail-center/inbox.server';
import { InboxCenter } from '@/components/admin/a-iletisim/inbox/inbox-center';

/**
 * Admin → İletişim → Gelen kutusu (/admin/inbox). Sunucu önce: sayaçlar, senkron durumu ve ilk
 * liste sayfası sunucuda hazırlanır; istemci adası arama/sayfalama/okuma/yanıtı taşır.
 * URL durumu: `?view=&q=&id=` (derin bağlantı).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Gelen kutusu',
  description: 'Şirket hesabına gelen mailler: stajyer yanıtları, konuşmalar, ekler ve panelden yanıt.',
};

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminInboxPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const rawView = one(sp.view);
  const view: InboxView = (INBOX_VIEWS as readonly string[]).includes(rawView) ? (rawView as InboxView) : 'inbox';
  const q = one(sp.q).trim().slice(0, 120);
  const id = one(sp.id).trim().slice(0, 40) || null;

  let overview: InboxOverview | null = null;
  let list: InboxListPage | null = null;
  const auth = await requireAuth(['ADMIN']);
  if (!('error' in auth)) {
    const [o, l] = await Promise.allSettled([loadInboxOverview(), listInbox({ view, q, cursor: null })]);
    if (o.status === 'fulfilled') overview = o.value;
    else console.error('[admin/inbox] özet ön yüklemesi başarısız:', o.reason);
    if (l.status === 'fulfilled') list = l.value;
    else console.error('[admin/inbox] liste ön yüklemesi başarısız:', l.reason);
  }

  return <InboxCenter initial={{ overview, list, view, q, id }} />;
}
