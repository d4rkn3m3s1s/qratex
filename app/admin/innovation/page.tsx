import { permanentRedirect } from 'next/navigation';

/**
 * Emekli: /admin/innovation parçalandı (rapor + yol haritası §6.3). Modül anahtarları, davet limitleri
 * ve partner webhook'u → Segmentler → Modüller; segment onayı → Segmentler → Öneriler; sağlık skoru →
 * Bayi Sağlığı; risk sayaçları → Komuta Merkezi; A/B deneyleri → Özellik ve Deney; demo araçları
 * üretimden kaldırıldı (C1). Sorgu parametreleri korunur.
 */
export default async function LegacyInnovationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    else if (v !== undefined) sp.set(k, v);
  }
  sp.set('tab', 'moduller');
  permanentRedirect(`/admin/segments?${sp.toString()}`);
}
