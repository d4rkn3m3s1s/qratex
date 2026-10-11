import { permanentRedirect } from 'next/navigation';

/** /admin/playbooks → Bayi Sağlığı'nın playbook kütüphanesi sekmesi (sorgu parametreleri korunur). */
export default async function AdminPlaybooksRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    else if (v != null) sp.set(k, v);
  }
  // Eski `?dealerId=` bağlantıları ilgili bayinin çekmecesini açar.
  const dealerId = sp.get('dealerId');
  if (dealerId) {
    sp.delete('dealerId');
    sp.set('dealer', dealerId);
  } else {
    sp.set('tab', 'playbooks');
  }
  permanentRedirect(`/admin/dealers-health?${sp.toString()}`);
}
