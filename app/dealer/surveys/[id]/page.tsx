import { permanentRedirect } from 'next/navigation';

/** `/dealer/surveys/[id]` → anket detay merkezi (sonuçlar). Sorgu parametreleri korunur. */
export default async function SurveyDetailRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else if (v !== undefined) qs.set(k, v);
  }
  const query = qs.toString();
  permanentRedirect(`/dealer/surveys/${encodeURIComponent(id)}/results${query ? `?${query}` : ''}`);
}
