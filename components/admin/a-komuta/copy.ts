'use client';

/**
 * a-komuta arayüz metinleri (TR/EN). Bileşenler `useAdminKomutaCopy()` ile nesneyi,
 * ya da kanca kullanılamayan yerlerde (tablo hücresi, koşullu dal) `<AdminKomutaText k="…" />` ile tek metni alır.
 * Kuyruk/sağlık satır etiketleri ve olay cümleleri sunucudan (lib/admin-command) gelir.
 */
import { useDsLocale } from '@/components/ds/a11y/copy';
import type { CommandRange, EventActor, HealthStatus, KpiKey } from '@/lib/admin-command/types';

type Role = 'CUSTOMER' | 'DEALER' | 'STAFF' | 'ADMIN';
type ActorKind = Exclude<EventActor, 'all'>;

const tr = {
  actorType: 'Aktör türü:',
  pulseData: 'Platform nabzı kova verisi',
  records: 'kayıt',
  locale: 'tr-TR',
  eyebrow: 'Genel bakış',
  title: 'Komuta Merkezi',
  description: 'Bir şey yanıyor mu, ne değişti, bugün neyi ele almalı: platform sağlığı, kuyruklar ve son olaylar tek ekranda.',
  platform: 'Platform',
  computedPrefix: 'Veri',
  computedSuffix: 'hesaplandı',
  updating: ' · güncelleniyor…',
  period: 'Dönem',
  refresh: 'Yenile',
  refreshFailed: 'Yenileme başarısız oldu.',
  queues: 'Kuyruklar',
  queuesDesc: 'İnsan kararı bekleyen işler; her satır ilgili kuyruğa gider.',
  metrics: 'metrikler',
  trend: (label: string, range: string) => `${label} eğilimi, ${range}`,
  pulse: 'Platform nabzı',
  pulseDesc: (range: string, hourly: boolean) => `${range} · ${hourly ? 'saatlik' : 'günlük'} kovalar, İstanbul saati`,
  health: 'Platform sağlığı',
  healthDesc: '30 sn’de bir yoklanır (sekme açıkken).',
  events: 'Son olaylar',
  eventsDesc: 'Denetim kayıtları, insan diliyle.',
  ecosystem: 'Ekosistem',
  ecosystemDesc: 'Kayıtlı hesapların rol dağılımı.',
  topDealers: 'En çok geri bildirim alan bayiler',
  topDealersDesc: (range: string) => `${range} · QR + tüketim yorumu`,
  rangeLabel: { '24h': 'Son 24 saat', '7d': 'Son 7 gün', '30d': 'Son 30 gün' } as Record<CommandRange, string>,
  rangeShort: { '24h': '24 sa', '7d': '7 gün', '30d': '30 gün' } as Record<CommandRange, string>,
  kpi: {
    newUsers: 'Yeni kullanıcı',
    feedback: 'Geri bildirim',
    csat: 'Memnuniyet (CSAT)',
    consumptions: 'Tüketim',
    pointsMinted: 'Basılan puan',
    activeDealers: 'Aktif bayi',
  } as Record<KpiKey, string>,
  actorOptions: { all: 'Tümü', admin: 'Yönetim', dealer: 'Bayi ve personel', customer: 'Müşteri', system: 'Sistem' } as Record<EventActor, string>,
  actorKind: { admin: 'Yönetim', dealer: 'Bayi/personel', customer: 'Müşteri', system: 'Sistem' } as Record<ActorKind, string>,
  filterActors: 'Olayları aktöre göre süz',
  noEventsTitle: 'Bu süzgeçte olay yok',
  noEventsDesc: 'Seçili aktör grubundan henüz denetim kaydı düşmemiş.',
  loading: 'Yükleniyor…',
  showMore: 'Daha fazla göster',
  endOfList: 'Listenin sonu',
  auditLog: 'Denetim günlüğü',
  healthStatus: { ok: 'Sağlıklı', warn: 'Dikkat', error: 'Sorun', unknown: 'Bilinmiyor' } as Record<HealthStatus, string>,
  healthChecks: 'Sağlık kontrolleri',
  statusOf: (label: string) => `${label} durumu`,
  probed: 'Yoklama',
  env: 'Ortam',
  region: 'Bölge',
  noAttention: 'Acil müdahale bekleyen kayıt yok: süresi geçen KVKK talebi, yüksek önemli vaka ya da çözülmemiş güvenlik uyarısı bulunmuyor.',
  attention: (n: string) => `${n} kayıt acil müdahale bekliyor.`,
  goToQueue: 'Kuyruğa git',
  role: { CUSTOMER: 'Müşteri', DEALER: 'Bayi', STAFF: 'Personel', ADMIN: 'Yönetici' } as Record<Role, string>,
  totalAccounts: (n: string) => ['Toplam ', n, ' hesap'] as [string, string, string],
  within: (flagged: string, shadow: string, anon: string) => `İçinde: ${flagged} işaretli, ${shadow} gölge yasaklı, ${anon} anonimleştirilmiş hesap.`,
  noDealerFeedbackTitle: 'Bu dönemde geri bildirim yok',
  noDealerFeedbackDesc: (range: string) => `${range} içinde hiçbir bayi geri bildirim ya da tüketim yorumu almadı.`,
  topDealersAria: (range: string) => `En çok geri bildirim alan bayiler, ${range}`,
  avgRating: 'ortalama puan',
};

export type AdminKomutaCopy = typeof tr;

const en: AdminKomutaCopy = {
  actorType: 'Actor type:',
  pulseData: 'Platform pulse bucket data',
  records: 'records',
  locale: 'en-GB',
  eyebrow: 'Overview',
  title: 'Command Center',
  description: 'Is anything on fire, what changed, what needs handling today: platform health, queues and recent events on one screen.',
  platform: 'Platform',
  computedPrefix: 'Data computed',
  computedSuffix: '',
  updating: ' · updating…',
  period: 'Period',
  refresh: 'Refresh',
  refreshFailed: 'Refresh failed.',
  queues: 'Queues',
  queuesDesc: 'Work waiting on a human decision; each row opens its queue.',
  metrics: 'metrics',
  trend: (label, range) => `${label} trend, ${range}`,
  pulse: 'Platform pulse',
  pulseDesc: (range, hourly) => `${range} · ${hourly ? 'hourly' : 'daily'} buckets, Istanbul time`,
  health: 'Platform health',
  healthDesc: 'Checked every 30 s (while the tab is open).',
  events: 'Recent events',
  eventsDesc: 'Audit records in plain language.',
  ecosystem: 'Ecosystem',
  ecosystemDesc: 'Role breakdown of registered accounts.',
  topDealers: 'Dealers with the most feedback',
  topDealersDesc: (range) => `${range} · QR + consumption reviews`,
  rangeLabel: { '24h': 'Last 24 hours', '7d': 'Last 7 days', '30d': 'Last 30 days' },
  rangeShort: { '24h': '24 h', '7d': '7 days', '30d': '30 days' },
  kpi: {
    newUsers: 'New users',
    feedback: 'Feedback',
    csat: 'Satisfaction (CSAT)',
    consumptions: 'Consumptions',
    pointsMinted: 'Points minted',
    activeDealers: 'Active dealers',
  },
  actorOptions: { all: 'All', admin: 'Admin', dealer: 'Dealers & staff', customer: 'Customers', system: 'System' },
  actorKind: { admin: 'Admin', dealer: 'Dealer/staff', customer: 'Customer', system: 'System' },
  filterActors: 'Filter events by actor',
  noEventsTitle: 'No events for this filter',
  noEventsDesc: 'No audit records from the selected actor group yet.',
  loading: 'Loading…',
  showMore: 'Show more',
  endOfList: 'End of list',
  auditLog: 'Audit log',
  healthStatus: { ok: 'Healthy', warn: 'Attention', error: 'Problem', unknown: 'Unknown' },
  healthChecks: 'Health checks',
  statusOf: (label) => `${label} status`,
  probed: 'Checked',
  env: 'Environment',
  region: 'Region',
  noAttention: 'Nothing needs urgent action: no overdue KVKK requests, high-severity cases or unresolved security alerts.',
  attention: (n) => `${n} records need urgent action.`,
  goToQueue: 'Open queue',
  role: { CUSTOMER: 'Customer', DEALER: 'Dealer', STAFF: 'Staff', ADMIN: 'Admin' },
  totalAccounts: (n) => ['', n, ' accounts in total'],
  within: (flagged, shadow, anon) => `Includes ${flagged} flagged, ${shadow} shadow-banned and ${anon} anonymised accounts.`,
  noDealerFeedbackTitle: 'No feedback in this period',
  noDealerFeedbackDesc: (range) => `No dealer received feedback or consumption reviews in the ${range}.`,
  topDealersAria: (range) => `Dealers with the most feedback, ${range}`,
  avgRating: 'average rating',
};

export function useAdminKomutaCopy(): AdminKomutaCopy {
  return useDsLocale() === 'en' ? en : tr;
}

type StringKey = { [K in keyof AdminKomutaCopy]: AdminKomutaCopy[K] extends string ? K : never }[keyof AdminKomutaCopy];

/** Tek bir metni etkin dilde basar. */
export function AdminKomutaText({ k }: { k: StringKey }): string {
  return useAdminKomutaCopy()[k];
}

/** Göreli zaman ("az önce" / "just now"), arayüz dilinde. */
export function relativeFor(iso: string, locale: string, now: Date = new Date()): string {
  const enMode = locale.startsWith('en');
  const diff = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return enMode ? 'at an unknown time' : 'bilinmeyen zamanda';
  const s = Math.max(0, Math.round(diff / 1000));
  if (s < 60) return enMode ? 'just now' : 'az önce';
  const m = Math.round(s / 60);
  if (m < 60) return enMode ? `${m} min ago` : `${m} dk önce`;
  const h = Math.round(m / 60);
  if (h < 48) return enMode ? `${h} h ago` : `${h} sa önce`;
  const d = Math.round(h / 24);
  return enMode ? `${d} days ago` : `${d} gün önce`;
}

/**
 * Sunucunun (lib/admin-command/server.ts) ürettiği sabit etiketlerin EN karşılıkları; kimliğe göre
 * eşlenir. Dinamik ayrıntı metinleri (gecikme, hata oranı) ve olay cümleleri sunucu dilinde kalır.
 */
const SERVER_EN = {
  group: {
    dsr: { title: 'KVKK requests', description: 'Legal response time: 30 days' },
    cases: { title: 'Cases', description: 'Suspicious activity, security alerts, dealer incidents' },
    review: { title: 'Review', description: 'Records waiting on a human decision' },
  } as Record<string, { title: string; description: string }>,
  row: {
    'dsr-overdue': 'Overdue',
    'dsr-soon': 'Due within 7 days',
    'dsr-open': 'Open requests',
    'sus-high': 'High/critical suspicious activity',
    'sus-open': 'Unresolved suspicious activity',
    sec: 'Unresolved security alerts',
    inc: 'Open dealer incidents',
    flagged: 'Flagged users',
    points: 'Held points transactions',
    'ai-quality': 'AI quality samples',
    segment: 'Segment suggestions',
  } as Record<string, string>,
  health: {
    database: 'Database',
    redis: 'Cache (Redis)',
    cron: 'Daily job (cron)',
    ai: 'AI provider',
    mail: 'Email',
  } as Record<string, string>,
  footnote: {
    'QR geri bildirimi + tüketim yorumu': 'QR feedback + consumption reviews',
    '4-5 yıldız oranı': 'Share of 4–5 star ratings',
    'En az bir tüketim ya da geri bildirim alan': 'Received at least one consumption or feedback',
  } as Record<string, string>,
  detail: {
    'Yapılandırılmamış; önbellek ve hız sınırı DB’ye düşüyor': 'Not configured; cache and rate limiting fall back to the DB',
    'Yazma/okuma sınaması başarısız': 'Write/read check failed',
    'Ulaşılamıyor': 'Unreachable',
    'Okunamadı': 'Couldn’t be read',
    'Gönderici yapılandırılmamış': 'No sender configured',
    'Henüz kayıtlı koşu yok': 'No recorded runs yet',
  } as Record<string, string>,
};

type ServerKind = 'row' | 'health' | 'footnote' | 'detail';

/** EN arayüzde sunucu etiketini kimliğe/metne göre çevirir; eşleşme yoksa olduğu gibi döner. */
export function useServerLabel() {
  const isEn = useDsLocale() === 'en';
  return {
    isEn,
    t: (kind: ServerKind, key: string, fallback: string) => (isEn ? SERVER_EN[kind][key] ?? fallback : fallback),
    group: (id: string, title: string, description: string) =>
      isEn && SERVER_EN.group[id] ? SERVER_EN.group[id]! : { title, description },
  };
}
