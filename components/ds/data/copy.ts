'use client';

import { useDsLocale } from '../a11y/copy';
import type { Severity } from './status-meta';

/** `components/ds/data` varsayılan metinleri (TR/EN). */
const COPY = {
  tr: {
    noValue: 'Veri yok',
    sample: (n: string) => `n = ${n}`,
    lowSample: 'Düşük örneklem',
    lowSampleHint: (min: string) => `Güvenilir yorum için en az ${min} kayıt gerekir.`,
    deltaUp: 'arttı',
    deltaDown: 'azaldı',
    deltaFlat: 'değişmedi',
    better: 'iyileşme',
    worse: 'kötüleşme',
    vsPrevious: 'önceki döneme göre',
    points: 'puan',
    selectRow: 'Satırı seç',
    selectPage: 'Bu sayfadaki tüm satırları seç',
    selectedRows: (n: number) => (n === 1 ? '1 satır seçildi' : `${n} satır seçildi`),
    clearSelection: 'Seçimi temizle',
    bulkActions: 'Toplu işlemler',
    columns: 'Sütunlar',
    visibleColumns: 'Görünen sütunlar',
    rowsPerPage: 'Sayfa başına',
    pageOf: (p: number, total: number) => `Sayfa ${p} / ${total}`,
    rangeOf: (a: string, b: string, total: string) => `${a}–${b} / ${total}`,
    firstPage: 'İlk sayfa',
    prevPage: 'Önceki sayfa',
    nextPage: 'Sonraki sayfa',
    lastPage: 'Son sayfa',
    pagination: 'Sayfalama',
    sortedAsc: 'artan sıralı',
    sortedDesc: 'azalan sıralı',
    open: 'Aç',
    close: 'Kapat',
    prevItem: 'Önceki kayıt',
    nextItem: 'Sonraki kayıt',
    copy: 'Kopyala',
    copied: 'Kopyalandı',
    chartView: 'Grafik',
    tableView: 'Tablo',
    viewAs: 'Görünüm',
    chartFailed: 'Grafik yüklenemedi. Veriler tablo olarak gösteriliyor.',
    chartData: 'Grafik verileri',
    today: 'Bugün',
    yesterday: 'Dün',
    timelineEmpty: 'Henüz olay yok',
    severity: {
      critical: 'Kritik',
      high: 'Yüksek',
      medium: 'Orta',
      low: 'Düşük',
      info: 'Bilgi',
    } satisfies Record<Severity, string>,
    severityPrefix: 'Önem',
  },
  en: {
    noValue: 'No data',
    sample: (n: string) => `n = ${n}`,
    lowSample: 'Low sample',
    lowSampleHint: (min: string) => `At least ${min} records are needed for a reliable reading.`,
    deltaUp: 'up',
    deltaDown: 'down',
    deltaFlat: 'unchanged',
    better: 'improvement',
    worse: 'decline',
    vsPrevious: 'vs previous period',
    points: 'pts',
    selectRow: 'Select row',
    selectPage: 'Select all rows on this page',
    selectedRows: (n: number) => (n === 1 ? '1 row selected' : `${n} rows selected`),
    clearSelection: 'Clear selection',
    bulkActions: 'Bulk actions',
    columns: 'Columns',
    visibleColumns: 'Visible columns',
    rowsPerPage: 'Rows per page',
    pageOf: (p: number, total: number) => `Page ${p} of ${total}`,
    rangeOf: (a: string, b: string, total: string) => `${a}–${b} of ${total}`,
    firstPage: 'First page',
    prevPage: 'Previous page',
    nextPage: 'Next page',
    lastPage: 'Last page',
    pagination: 'Pagination',
    sortedAsc: 'sorted ascending',
    sortedDesc: 'sorted descending',
    open: 'Open',
    close: 'Close',
    prevItem: 'Previous record',
    nextItem: 'Next record',
    copy: 'Copy',
    copied: 'Copied',
    chartView: 'Chart',
    tableView: 'Table',
    viewAs: 'View',
    chartFailed: 'The chart could not be loaded. Showing the data as a table.',
    chartData: 'Chart data',
    today: 'Today',
    yesterday: 'Yesterday',
    timelineEmpty: 'No events yet',
    severity: {
      critical: 'Critical',
      high: 'High',
      medium: 'Medium',
      low: 'Low',
      info: 'Info',
    } satisfies Record<Severity, string>,
    severityPrefix: 'Severity',
  },
};

export type DataCopy = (typeof COPY)['tr'];

export function useDataCopy(): DataCopy {
  // useDsLocale: AppLocaleProvider yoksa (önizleme/test) `tr` — tüm DS katmanlarında aynı kaynak.
  return COPY[useDsLocale()];
}

export function useLocaleInfo(): { locale: 'tr' | 'en'; tag: 'tr-TR' | 'en-US' } {
  const en = useDsLocale() === 'en';
  return { locale: en ? 'en' : 'tr', tag: en ? 'en-US' : 'tr-TR' };
}
