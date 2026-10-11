/**
 * Modül başına yönetim sayfası ve son kullanıcı ekranı (denetim raporu modules B2).
 * Eski `detailHref` müşteri/bayi ekranlarına gidiyordu ve ADMIN'i proxy `/admin`'e geri
 * atıyordu. Artık: `adminHref` yalnız var olan admin yönetim sayfası; `previewPath` yalnız
 * bilgi (kopyalanabilir metin), tıklanabilir link değil.
 */
import { MODULE_CATALOG } from '@/lib/module-controls';

const ADMIN_HREF: Record<string, string> = {
  donations: '/admin/donations',
  referrals: '/admin/referrals',
  customer_campaigns: '/admin/campaigns-calendar',
  squads: '/admin/squads',
  quests: '/admin/quests',
  rewards: '/admin/rewards',
  surprise_boxes: '/admin/surprise-boxes',
  discovery: '/admin/discovery',
  campaigns: '/admin/campaigns-calendar',
  ai_features: '/admin/ai',
  customer_ai_insights: '/admin/ai',
  webhooks: '/admin/integrations',
  api_keys: '/admin/integrations',
  seo_engine: '/admin/seo',
  fraud_prevention: '/admin/trust',
  insights_global: '/admin/analytics?tab=sectors',
  ab_testing: '/admin/features?tab=deneyler',
  feature_flags: '/admin/features?tab=acilis',
  audit_logs: '/admin/audit',
  observability: '/admin/observability',
};

export function adminHrefFor(key: string): string | null {
  return ADMIN_HREF[key] ?? null;
}

/** Son kullanıcı ekran yolu (müşteri/bayi); admin/platform modüllerinde null. */
export function previewPathFor(key: string): string | null {
  const item = MODULE_CATALOG.find((m) => m.key === key);
  if (!item?.detailHref) return null;
  if (item.detailHref.startsWith('/customer/') || item.detailHref.startsWith('/dealer/') || item.detailHref === '/') return item.detailHref;
  return null;
}
