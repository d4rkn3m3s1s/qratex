export type ModuleScope = 'customer' | 'dealer' | 'admin' | 'platform';
export type ModuleSeverity = 'critical' | 'important' | 'optional';

export type ModuleControlItem = {
  key: string;
  label: string;
  description: string;
  scope: ModuleScope;
  severity: ModuleSeverity;
  detailHref?: string;
};

export type ModuleControlsMap = Record<string, boolean>;

export const MODULE_CONTROLS_SETTINGS_KEY = 'moduleControls';

export const MODULE_CATALOG: ModuleControlItem[] = [
  { key: 'donations', label: 'Bağışlar', description: 'Bağış toplama ve bağış geçmişi modülleri', scope: 'customer', severity: 'important', detailHref: '/customer/donations' },
  { key: 'referrals', label: 'Davetler / Referans', description: 'Arkadaş daveti ve referans ödülleri', scope: 'customer', severity: 'important', detailHref: '/customer/campaigns' },
  { key: 'squads', label: 'Klanlar / Squads', description: 'Takım, haftalık hedef ve sosyal yarışma akışı', scope: 'customer', severity: 'important', detailHref: '/customer/squads' },
  { key: 'quests', label: 'Görevler', description: 'Müşteri görevleri, claim ve haftalık görev kartı', scope: 'customer', severity: 'important', detailHref: '/customer/quests' },
  { key: 'rewards', label: 'Ödüller', description: 'Ödül kataloğu, kullanım ve claim akışları', scope: 'customer', severity: 'important', detailHref: '/customer/rewards' },
  { key: 'surprise_boxes', label: 'Sürpriz Kutular', description: 'Sürpriz kutu, yumurta ve özel drop modülleri', scope: 'customer', severity: 'optional', detailHref: '/customer/surprise-boxes' },
  { key: 'discovery', label: 'Discovery', description: 'Yakındaki mekanlar, trendler, sponsor kartları', scope: 'customer', severity: 'important', detailHref: '/admin/discovery' },
  { key: 'campaigns', label: 'Kampanyalar', description: 'Müşteri/dealer kampanya yayın ve görüntüleme akışı', scope: 'dealer', severity: 'important', detailHref: '/dealer/campaigns' },
  { key: 'remedy_offers', label: 'Telafi Teklifleri', description: 'Telafi teklifleri ve onay süreçleri', scope: 'dealer', severity: 'important' },
  { key: 'ai_features', label: 'AI Özellikleri', description: 'AI analiz, AI dashboard, AI ayarları', scope: 'dealer', severity: 'critical', detailHref: '/admin/ai-dashboard' },
  { key: 'staff_management', label: 'Personel Yönetimi', description: 'Personel, checklist, eğitim, vardiya modülleri', scope: 'dealer', severity: 'important' },
  { key: 'feature_flags', label: 'Feature Flags', description: 'Özellik bayrakları yönetimi', scope: 'admin', severity: 'critical', detailHref: '/admin/features' },
  { key: 'webhooks', label: 'Webhook Yönetimi', description: 'Webhook oluşturma ve event akışı', scope: 'admin', severity: 'important', detailHref: '/admin/webhooks' },
  { key: 'api_keys', label: 'API Anahtarları', description: 'Anahtar üretimi, iptal, listeleme', scope: 'admin', severity: 'critical', detailHref: '/admin/api-keys' },
  { key: 'seo_engine', label: 'SEO Motoru', description: 'SEO ayarları, health check, rollback', scope: 'admin', severity: 'important', detailHref: '/admin/seo' },
  { key: 'fraud_prevention', label: 'Fraud Prevention', description: 'Sahtekarlık tespiti ve güvenlik kayıtları', scope: 'admin', severity: 'critical', detailHref: '/admin/fraud-prevention' },
  { key: 'insights_global', label: 'Global Insights', description: 'Sektörel benchmark ve global içgörü paneli', scope: 'admin', severity: 'important', detailHref: '/admin/insights' },
  { key: 'ab_testing', label: 'A/B Testing', description: 'Cohort atama ve performans karşılaştırma', scope: 'admin', severity: 'important', detailHref: '/admin/ab-testing' },
  { key: 'admin_bootstrap', label: 'Demo Bootstrap', description: 'Demo veri üretim/silme ve demo merkez', scope: 'admin', severity: 'optional' },
  { key: 'audit_logs', label: 'Audit Kayıtları', description: 'Yönetim denetim kayıtları ve geri alma', scope: 'platform', severity: 'critical', detailHref: '/admin/audit' },
  { key: 'observability', label: 'Gözlemlenebilirlik', description: 'Sistem health, monitoring ve teknik özet ekranları', scope: 'platform', severity: 'important', detailHref: '/admin/observability' },
];

export function getDefaultModuleControls(): ModuleControlsMap {
  return MODULE_CATALOG.reduce<ModuleControlsMap>((acc, item) => {
    acc[item.key] = true;
    return acc;
  }, {});
}

export function normalizeModuleControls(raw: unknown): ModuleControlsMap {
  const defaults = getDefaultModuleControls();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
  const src = raw as Record<string, unknown>;
  for (const key of Object.keys(defaults)) {
    if (typeof src[key] === 'boolean') {
      defaults[key] = src[key] as boolean;
    }
  }
  return defaults;
}
