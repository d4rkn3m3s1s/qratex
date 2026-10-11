import { permanentRedirect } from 'next/navigation';

/** Emekli: /admin/webhooks → Entegrasyonlar › Webhook'lar. Sorgu parametreleri korunur. */
export default async function LegacyWebhooksRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) sp.append(k, x);
  sp.set('tab', 'webhooklar');
  if (sp.get('new') === '1') {
    sp.delete('new');
    sp.set('create', 'webhook');
  }
  permanentRedirect(`/admin/integrations?${sp.toString()}`);
}
