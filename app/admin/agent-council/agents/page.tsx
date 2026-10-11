import { permanentRedirect } from 'next/navigation';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Emekli: ajan yapılandırması artık konsey çalışma alanının "Ayarlar" sekmesi. Sorgu parametreleri korunur. */
export default async function AgentCouncilAgentsRedirect({ searchParams }: PageProps) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of Array.isArray(v) ? v : v != null ? [v] : []) qs.append(k, x);
  qs.set('tab', 'ayarlar');
  permanentRedirect(`/admin/agent-council?${qs.toString()}`);
}
