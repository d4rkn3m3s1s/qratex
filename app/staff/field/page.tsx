import { permanentRedirect } from 'next/navigation';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** EMEKLİ: saha bildirimi artık /staff "Bugün" ekranında alt sayfa olarak açılır. Sorgu parametreleri korunur. */
export default async function StaffFieldRedirect({ searchParams }: PageProps) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else if (v != null) qs.set(k, v);
  }
  qs.set('bildir', '1');
  permanentRedirect(`/staff?${qs.toString()}`);
}
