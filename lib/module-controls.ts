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
  { key: 'customer_campaigns', label: 'Müşteri kampanyaları', description: 'Müşteri tarafı kampanya ve davet ekranı', scope: 'customer', severity: 'important', detailHref: '/customer/campaigns' },
  { key: 'squads', label: 'Klanlar / Squads', description: 'Takım, haftalık hedef ve sosyal yarışma akışı', scope: 'customer', severity: 'important', detailHref: '/customer/squads' },
  { key: 'quests', label: 'Görevler', description: 'Müşteri görevleri, claim ve haftalık görev kartı', scope: 'customer', severity: 'important', detailHref: '/customer/quests' },
  { key: 'rewards', label: 'Ödüller', description: 'Ödül kataloğu, kullanım ve claim akışları', scope: 'customer', severity: 'important', detailHref: '/customer/rewards' },
  { key: 'surprise_boxes', label: 'Sürpriz Kutular', description: 'Sürpriz kutu, yumurta ve özel drop modülleri', scope: 'customer', severity: 'optional', detailHref: '/customer/surprise-boxes' },
  { key: 'discovery', label: 'Discovery', description: 'Yakındaki mekanlar, trendler, sponsor kartları', scope: 'customer', severity: 'important', detailHref: '/customer/nearby' },
  { key: 'customer_ai_insights', label: 'Müşteri AI içgörüleri', description: 'AI analiz ve öneri ekranları', scope: 'customer', severity: 'optional', detailHref: '/customer/ai-insights' },
  { key: 'progress_hub', label: 'Gelişim merkezi', description: 'Müşteri ilerleme ve özet hub sayfası', scope: 'customer', severity: 'optional', detailHref: '/customer/progress-hub' },
  { key: 'spending_overview', label: 'Harcama özeti', description: 'Harcama ve özet analitik ekranı', scope: 'customer', severity: 'optional', detailHref: '/customer/spending-overview' },
  { key: 'journey_score', label: 'Yolculuk skoru', description: 'Yolculuk skoru ve zaman çizelgesi', scope: 'customer', severity: 'optional', detailHref: '/customer/journey-score' },
  { key: 'experiences', label: 'Deneyimler', description: 'Müşteri deneyim paylaşımı ve akışı', scope: 'customer', severity: 'optional', detailHref: '/customer/experiences' },
  { key: 'campaigns', label: 'Kampanyalar', description: 'Müşteri/dealer kampanya yayın ve görüntüleme akışı', scope: 'dealer', severity: 'important', detailHref: '/dealer/campaigns' },
  { key: 'business_outcomes', label: 'İş sonuçları', description: 'Bayi iş sonuçları paneli', scope: 'dealer', severity: 'optional', detailHref: '/dealer/business-outcomes' },
  { key: 'growth_hub', label: 'Büyüme merkezi', description: 'Bayi büyüme ve aksiyon hub', scope: 'dealer', severity: 'optional', detailHref: '/dealer/growth-hub' },
  { key: 'operations_brief', label: 'Operasyon özeti', description: 'Günlük operasyon özeti', scope: 'dealer', severity: 'optional', detailHref: '/dealer/operations-brief' },
  { key: 'dealer_innovation', label: 'İnovasyon (bayi)', description: 'Bayi inovasyon ve deneyler', scope: 'dealer', severity: 'optional', detailHref: '/dealer/innovation' },
  { key: 'voc_wall', label: 'VoC Wall', description: 'Müşteri sesi duvarı', scope: 'dealer', severity: 'optional', detailHref: '/dealer/voc-wall' },
  { key: 'heatmap', label: 'Isı haritası', description: 'Yoğunluk ve ısı haritası', scope: 'dealer', severity: 'optional', detailHref: '/dealer/heatmap' },
  { key: 'customer_radar', label: 'Müşteri radarı', description: 'Radar ve sinyal görünümü', scope: 'dealer', severity: 'optional', detailHref: '/dealer/radar' },
  { key: 'benchmark', label: 'Benchmark', description: 'Sektör kıyaslama', scope: 'dealer', severity: 'optional', detailHref: '/dealer/benchmark' },
  { key: 'copilot', label: 'Copilot', description: 'Bayi copilot özeti', scope: 'dealer', severity: 'optional', detailHref: '/dealer/copilot' },
  { key: 'churn_risk', label: 'Churn riski', description: 'Kayıp riski paneli', scope: 'dealer', severity: 'optional', detailHref: '/dealer/churn-risk' },
  { key: 'roi', label: 'ROI', description: 'Yatırım getirisi analitiği', scope: 'dealer', severity: 'optional', detailHref: '/dealer/roi' },
  { key: 'action_items', label: 'Aksiyon kalemleri', description: 'Aksiyon ve görev listesi', scope: 'dealer', severity: 'optional', detailHref: '/dealer/action-items' },
  { key: 'incidents', label: 'Olaylar', description: 'Operasyonel olay kayıtları', scope: 'dealer', severity: 'optional', detailHref: '/dealer/incidents' },
  { key: 'dealer_surveys', label: 'Anketler (bayi)', description: 'Bayi anket oluşturma ve sonuçlar', scope: 'dealer', severity: 'optional', detailHref: '/dealer/surveys' },
  { key: 'remedy_offers', label: 'Telafi Teklifleri', description: 'Telafi teklifleri ve onay süreçleri', scope: 'dealer', severity: 'important' },
  { key: 'ai_features', label: 'AI Özellikleri', description: 'AI analiz, AI dashboard, AI ayarları', scope: 'dealer', severity: 'critical', detailHref: '/admin/ai-dashboard' },
  { key: 'staff_management', label: 'Personel Yönetimi', description: 'Personel, checklist, eğitim, vardiya modülleri', scope: 'dealer', severity: 'important' },
  { key: 'feature_flags', label: 'Feature Flags', description: 'Özellik bayrakları yönetimi', scope: 'admin', severity: 'critical', detailHref: '/admin/features' },
  { key: 'webhooks', label: 'Webhook Yönetimi', description: 'Webhook oluşturma ve event akışı', scope: 'admin', severity: 'important', detailHref: '/admin/webhooks' },
  { key: 'api_keys', label: 'API Anahtarları', description: 'Anahtar üretimi, iptal, listeleme', scope: 'admin', severity: 'critical', detailHref: '/admin/api-keys' },
  { key: 'seo_engine', label: 'SEO Motoru', description: 'SEO ayarları, health check, rollback', scope: 'admin', severity: 'important', detailHref: '/admin/seo' },
  { key: 'landing_pricing', label: 'Ana sayfa fiyatlandırma', description: 'Açık ana sayfadaki fiyatlandırma bölümü ve ilgili şema; kapalıyken landing pricing gizlenir', scope: 'platform', severity: 'optional', detailHref: '/' },
  { key: 'landing_marquee', label: 'Ana sayfa reklam şeridi', description: 'Ana sayfadaki kayan reklam/işletme şeridi; kapalıyken gizlenir', scope: 'platform', severity: 'optional', detailHref: '/' },
  {
    key: 'experience_pulse_studio',
    label: 'Ritim stüdyosu',
    description: 'Müşteri Ritim köşesi ve bayi Vardiya ritmi vitrin içeriklerini yönetir; kayıt denetim günlüğüne düşer',
    scope: 'admin',
    severity: 'optional',
    detailHref: '/admin/experience-pulse',
  },
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
