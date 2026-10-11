'use client';

/**
 * KVKK merkezi — istemci veri katmanı. Zarf v2 çözülür; hata HİÇBİR ZAMAN boş veri gibi dönmez.
 */
import type { ConsentStats, LogsPage, LogsQuery, PrivacyOverview, RetentionView } from '@/lib/admin-privacy/contract';
import { ApiRequestError } from './requests/api';

export { ApiRequestError };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
  let json: Record<string, unknown> | null = null;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = null;
  }
  if (!res.ok || !json || json.ok === false) {
    const message =
      (json && typeof json.error === 'string' && json.error) ||
      (res.status === 401 || res.status === 403 ? 'Bu bölümü görme yetkiniz yok.' : 'Veri yüklenemedi. Lütfen tekrar deneyin.');
    throw new ApiRequestError(message, res.status, typeof json?.code === 'string' ? json.code : undefined);
  }
  return json.data as T;
}

export const fetchOverview = (fresh = false) =>
  getJson<PrivacyOverview>(`/api/admin/privacy?section=overview${fresh ? '&fresh=1' : ''}`);

export const fetchRetention = () => getJson<RetentionView>('/api/admin/privacy?section=retention');

export const fetchConsent = (days: number) => getJson<ConsentStats>(`/api/admin/privacy?section=consent&days=${days}`);

export function logsSearchParams(q: Partial<LogsQuery>): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== null && v !== '' && !(k === 'source' && v === 'all')) sp.set(k, String(v));
  }
  return sp;
}

export const fetchLogs = (q: Partial<LogsQuery>) => getJson<LogsPage>(`/api/admin/privacy/logs?${logsSearchParams(q).toString()}`);

/** CSV kanıt dışa aktarımı: dosyayı indirir, içerik özetini döner. */
export async function downloadLogsCsv(q: Partial<LogsQuery>): Promise<{ sha256: string | null; rows: number; truncated: boolean }> {
  const sp = logsSearchParams({ ...q, cursor: undefined });
  const res = await fetch(`/api/admin/privacy/logs/export?${sp.toString()}`, { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) {
    let msg = 'Dışa aktarma yapılamadı.';
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* gövde yok */
    }
    throw new ApiRequestError(msg, res.status);
  }
  const blob = await res.blob();
  const dispo = res.headers.get('content-disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(dispo)?.[1] ?? 'qratex-5651-kayitlari.csv';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  return {
    sha256: res.headers.get('x-content-sha256'),
    rows: Number(res.headers.get('x-row-count') ?? '0'),
    truncated: res.headers.get('x-truncated') === '1',
  };
}
