import { permanentRedirect } from 'next/navigation';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Emekli: geçmiş artık konsey çalışma alanının "Geçmiş" sekmesi. Sorgu parametreleri korunur. */
export default async function AgentCouncilHistoryRedirect({ searchParams }: PageProps) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of Array.isArray(v) ? v : v != null ? [v] : []) qs.append(k, x);
  qs.set('tab', 'gecmis');
  permanentRedirect(`/admin/agent-council?${qs.toString()}`);
}
