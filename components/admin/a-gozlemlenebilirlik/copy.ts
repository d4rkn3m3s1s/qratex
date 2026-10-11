'use client';

/**
 * a-gozlemlenebilirlik arayüz metinleri (TR/EN). Bileşenler `useAdminGozlemlenebilirlikCopy()` ile nesneyi,
 * ya da kanca kullanılamayan yerlerde (tablo hücresi, koşullu dal) `<AdminGozlemlenebilirlikText k="…" />` ile tek metni alır.
 */
import { useDsLocale } from '@/components/ds/a11y/copy';

const tr = {
  jobsUnreadable: 'İş durumu okunamadı; aşağıda yalnız kayıt defteri görünüyor.',
  title: 'Gözlemlenebilirlik',
  newTab: '(yeni sekmede açılır)',
  backgroundJobs: 'Arka plan işleri',
  hourly: 'Saatlik döküm',
  topErrors: 'En çok hata veren uçlar',
  noErrors: 'Bu pencerede 5xx dönen uç yok.',
  slowest: 'En yavaş uçlar (p95, en az 5 istek)',
  notEnough: 'Sıralama için yeterli istek yok.',
  noPages: 'Sayfa kırılımı için en az 5 örnekli sayfa yok.',
  idsNote: 'Kimlikler yoldan çıkarılır (`/admin/users/:id`); derece sunucuda değerden hesaplanır. Örnekler sayfa başına tek istekte gelir.',
  components: 'Bileşenler',
  searchComponents: 'Bileşen ara',
};

export type AdminGozlemlenebilirlikCopy = Record<keyof typeof tr, string>;

const en: AdminGozlemlenebilirlikCopy = {
  jobsUnreadable: 'Couldn\'t read job status; only the registry is shown below.',
  title: 'Observability',
  newTab: '(opens in a new tab)',
  backgroundJobs: 'Background jobs',
  hourly: 'Hourly breakdown',
  topErrors: 'Endpoints with the most errors',
  noErrors: 'No endpoints returned 5xx in this window.',
  slowest: 'Slowest endpoints (p95, at least 5 requests)',
  notEnough: 'Not enough requests to rank.',
  noPages: 'No pages with at least 5 samples for a breakdown.',
  idsNote: 'IDs are stripped from paths (`/admin/users/:id`); ratings are computed from values on the server. Samples arrive in one request per page.',
  components: 'Components',
  searchComponents: 'Search components',
};

export function useAdminGozlemlenebilirlikCopy(): AdminGozlemlenebilirlikCopy {
  return useDsLocale() === 'en' ? en : tr;
}

/** Tek bir metni etkin dilde basar. */
export function AdminGozlemlenebilirlikText({ k }: { k: keyof AdminGozlemlenebilirlikCopy }): string {
  return useAdminGozlemlenebilirlikCopy()[k];
}
