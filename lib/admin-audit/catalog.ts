/**
 * Denetim günlüğü kataloğu (saf modül; istemci + sunucu).
 *
 * Kod tabanı ~90 farklı `action` ve ~30 `entity` değeri yazıyor (UPPER_SNAKE, snake_lower,
 * nokta ayraçlı; `settings`/`Settings`, `user`/`User`). Burada her eylem, yalnız eylem kodunun
 * ALT DİZGİLERİNE bakan sıralı kurallarla bir KATEGORİYE ve ÖNEME eşlenir. Kurallar alt dizgi
 * olduğu için sunucu aynı sınıflandırmayı birebir SQL'e çevirebilir (`categoryWhere`,
 * `severityWhere`): istemcideki rozet ile filtrenin döndürdüğü küme hiçbir zaman ayrışmaz.
 */

export const AUDIT_CATEGORIES = ['rollback', 'delete', 'security', 'access', 'economy', 'create', 'update', 'other'] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export const AUDIT_SEVERITIES = ['critical', 'high', 'normal'] as const;
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];

/** Sıra önemli: ilk eşleşen kategori kazanır. Hepsi küçük harf alt dizgi. */
export const CATEGORY_PATTERNS: ReadonlyArray<readonly [Exclude<AuditCategory, 'other'>, readonly string[]]> = [
  ['rollback', ['rollback', 'restore', 'revert', 'unarchive']],
  ['delete', ['delete', 'remove', 'anonymi', 'purge', 'revoke', 'deactivate', 'archive', 'void', 'cancel', 'suspend', 'freeze']],
  ['security', ['password', 'role', 'api_key', 'apikey', 'admin_gate', 'sessions', 'elevation', 'bootstrap', 'permission', 'invit', 'login']],
  ['access', ['export', 'unmask', 'dsr_', 'data_subject']],
  ['economy', ['point', 'reward', 'coupon', 'donation', 'wallet', 'economy', 'consumption', 'badge', 'quest', 'achievement', 'surprise_box', 'offer', 'happy_hour', 'grant']],
  ['create', ['create', 'add', 'insert', 'generate', 'duplicate', 'seed', 'send', 'publish']],
  ['update', ['update', 'edit', 'change', 'set', 'toggle', 'adjust', 'batch', 'assign', 'rename', 'activate', 'approve', 'reject', 'config']],
];

/** Kritik: geri dönüşü zor ya da yetki/güvenlik/para etkili. */
export const CRITICAL_PATTERNS: readonly string[] = [
  'bulk_delete',
  'anonymi',
  'api_key',
  'apikey',
  'role',
  'gate_failed',
  'gate_locked',
  'password',
  'sessions_revoke',
  'bootstrap',
  'points_adjust',
  'purge',
  'gdpr',
  'elevation',
];

/** Yüksek: silme/arşiv/geri alma/dışa aktarma ve platform geneli yapılandırma. */
export const HIGH_PATTERNS: readonly string[] = [
  'delete',
  'remove',
  'revoke',
  'archive',
  'rollback',
  'restore',
  'export',
  'unmask',
  'deactivate',
  'batch',
  'matrix',
  'pricing',
  'webhook',
  'model_routing',
  'ai_settings',
  'void',
  'cancel',
  'freeze',
  'suspend',
];

const has = (code: string, patterns: readonly string[]) => patterns.some((p) => code.includes(p));

export function categoryOf(action: string): AuditCategory {
  const code = action.toLowerCase();
  for (const [cat, patterns] of CATEGORY_PATTERNS) if (has(code, patterns)) return cat;
  return 'other';
}

export function severityOf(action: string): AuditSeverity {
  const code = action.toLowerCase();
  if (has(code, CRITICAL_PATTERNS)) return 'critical';
  if (has(code, HIGH_PATTERNS)) return 'high';
  return 'normal';
}

export const CATEGORY_LABEL: Record<AuditCategory, string> = {
  rollback: 'Geri alma',
  delete: 'Silme ve arşiv',
  security: 'Güvenlik ve yetki',
  access: 'Veri erişimi',
  economy: 'Ekonomi ve ödül',
  create: 'Oluşturma',
  update: 'Güncelleme',
  other: 'Diğer',
};

export const SEVERITY_LABEL: Record<AuditSeverity, string> = {
  critical: 'Kritik',
  high: 'Yüksek',
  normal: 'Normal',
};

const CATEGORY_VERB: Record<AuditCategory, string> = {
  rollback: 'geri yüklendi',
  delete: 'silindi ya da kapatıldı',
  security: 'güvenlik değişikliği',
  access: 'veri dışa aktarıldı',
  economy: 'ekonomi işlemi',
  create: 'oluşturuldu',
  update: 'güncellendi',
  other: 'işlem',
};

/** Varlık adları (küçük harf anahtar). Bilinmeyen varlık kod hâliyle gösterilir. */
export const ENTITY_LABEL: Record<string, string> = {
  settings: 'Ayarlar',
  user: 'Kullanıcı',
  physicalcard: 'Fiziksel kart',
  coupon: 'Kupon',
  reward: 'Ödül',
  badge: 'Rozet',
  quest: 'Görev',
  feature: 'Özellik',
  page: 'Sayfa',
  webhook: 'Webhook',
  apikey: 'API anahtarı',
  pricingplan: 'Fiyat planı',
  donationproject: 'Bağış kampanyası',
  seasonalcampaign: 'Sezonluk kampanya',
  seasonalconcept: 'Sezon konsepti',
  staff: 'Personel',
  qrcode: 'QR kod',
  cosmeticitem: 'Kozmetik ürün',
  flashoffer: 'Anlık teklif',
  pointtransaction: 'Puan işlemi',
  wallet: 'Cüzdan',
  dealer: 'Bayi',
  businessprofile: 'İşletme profili',
  consumption: 'Tüketim',
  feedback: 'Geri bildirim',
  segment: 'Segment',
  aiprompt: 'AI istemi',
  aitone: 'AI üslubu',
  minigame: 'Mini oyun',
  automationrule: 'Otomasyon kuralı',
  auditlog: 'Denetim günlüğü',
};

const ACTION_LABEL: Record<string, string> = {
  batch_update: 'Ayarlar toplu güncellendi',
  bulk_delete_users: 'Kullanıcılar toplu silindi',
  bulk_anonymize_users: 'Kullanıcılar toplu anonimleştirildi',
  bulk_update_user_role: 'Kullanıcı rolleri toplu değiştirildi',
  user_role_change: 'Kullanıcı rolü değiştirildi',
  user_sessions_revoke: 'Kullanıcı oturumları kapatıldı',
  change_password: 'Şifre değiştirildi',
  password_reset: 'Şifre sıfırlandı',
  set_initial_password: 'İlk şifre belirlendi',
  forgot_password: 'Şifre sıfırlama istendi',
  gdpr_anonymize: 'Kullanıcı anonimleştirildi (KVKK)',
  data_subject_request: 'KVKK veri talebi',
  create_api_key: 'API anahtarı oluşturuldu',
  delete_api_key: 'API anahtarı silindi',
  update_points_matrix: 'Puan matrisi güncellendi',
  update_league_rules: 'Lig kuralları güncellendi',
  admin_points_adjust: 'Puan düzeltmesi',
  admin_points_adjust_approval: 'Puan düzeltmesi onaya gönderildi',
  admin_points_adjust_approved: 'Puan düzeltmesi onaylandı',
  admin_bootstrap: 'İlk yönetici oluşturuldu',
  role_elevation_approved: 'Yetki yükseltme onaylandı',
  role_elevation_rejected: 'Yetki yükseltme reddedildi',
  users_export: 'Kullanıcı listesi dışa aktarıldı',
  feedbacks_export: 'Geri bildirimler dışa aktarıldı',
  audit_export: 'Denetim günlüğü dışa aktarıldı',
  rollback: 'Önceki sürüme geri dönüldü',
  claim_reward: 'Ödül alındı',
  claim_quest_reward: 'Görev ödülü alındı',
  completed_achievement: 'Başarım tamamlandı',
  create_coupon: 'Kupon oluşturuldu',
  create_coupon_batch: 'Toplu kupon oluşturuldu',
  deactivate_coupon: 'Kupon pasifleştirildi',
  update_profile: 'Profil güncellendi',
  dealer_plan_assigned: 'Bayiye plan atandı',
};

export function entityKey(entity: string): string {
  return entity.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function entityLabel(entity: string): string {
  return ENTITY_LABEL[entityKey(entity)] ?? entity;
}

/** İnsan-okur özet: bilinen eylemde sabit etiket; değilse "<Varlık> <fiil>". */
export function actionLabel(action: string, entity: string): string {
  const known = ACTION_LABEL[action.toLowerCase()];
  if (known) return known;
  return `${entityLabel(entity)} · ${CATEGORY_VERB[categoryOf(action)]}`;
}

/** Hedef kayda admin bağlantısı (yalnız kimliği doğrudan açan rotalar). */
export function entityHref(entity: string, entityId: string | null): string | null {
  const key = entityKey(entity);
  if (key === 'user' && entityId && /^[A-Za-z0-9_-]{6,64}$/.test(entityId)) return `/admin/users/${encodeURIComponent(entityId)}`;
  if (key === 'settings') return '/admin/settings';
  return null;
}
