import { permanentRedirect } from 'next/navigation';

/** Emekli: `/dealer/ask-analytics` ("Veriye Sor") → AI Asistan; `?q=` ilk soru olarak taşınır, diğer parametreler korunur. */
export default async function LegacyAskAnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const item of Array.isArray(v) ? v : v ? [v] : []) sp.append(k, item);
  const qs = sp.toString();
  permanentRedirect(qs ? `/dealer/assistant?${qs}` : '/dealer/assistant');
}
