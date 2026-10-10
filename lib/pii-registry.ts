/**
 * KİŞİSEL VERİ ENVANTERİ (PII_REGISTRY) — P0-34 / KVKK m.11.
 *
 * Kullanıcıya (User) bağlanan HER şema ilişkisi burada sınıflandırılır: hangi kişisel veriyi
 * taşıdığı, veri sahibine dışa aktarımda hangi bölümde verileceği, silme (anonimleştirme)
 * talebinde ne yapılacağı ve ne kadar saklanacağı. `exportUserData` ve
 * `purgeRegistryPersonalData` (lib/gdpr-core.ts) bu kayıttan çalışır; elle yazılmış ayrı bir
 * liste YOKTUR.
 *
 * Unutma koruması: `__tests__/lib/pii-registry.test.ts` `prisma/schema.prisma`'yı tarar.
 * User'a bağlanan yeni bir ilişki (ya da `userId`/`customerId` gibi ilişkisiz bir kullanıcı
 * referansı) buraya eklenmeden test kırmızıya düşer. Yeni model eklerken yalnız buraya bir
 * satır yazmanız yeterli; dışa aktarma ve silme otomatik kapsar.
 *
 * Saf modül: Prisma'ya bağımlı değildir (istemci bileşenleri de okuyabilir).
 */

/** Kaydın veri sahibiyle ilişkisi. */
export type PiiSubject =
  /** Kayıt doğrudan veri sahibinin kişisel verisidir (müşteri, personel, kullanıcı). */
  | 'self'
  /** Kayıt veri sahibinin İŞLETME hesabına aittir (bayi ticari verisi). */
  | 'business'
  /** Veri sahibi kayıtta yalnız işlemi yapan/oluşturan/onaylayan kişi olarak geçer. */
  | 'actor';

/**
 * Silme talebinde uygulanacak strateji.
 *  - `delete`        satırlar silinir (serbest metin, cihaz, iletişim izleri).
 *  - `redact`        satır kalır (istatistik/ekonomi bütünlüğü), `redact` alanları temizlenir.
 *  - `pseudonymize`  satır kalır; kişisel veri taşımaz, bağlandığı User zaten anonimleşir.
 *  - `retain`        yasal saklama/ispat yükümlülüğü: dokunulmaz, süre sonunda imha edilir.
 *  - `user_row`      User satırının kendisi — `anonymizeUser` yürütür.
 *  - `business`      işletme (tacir) kaydı; kişi silmesinde ticari defter yükümlülüğü gereği kalır.
 */
export type EraseStrategy = 'delete' | 'redact' | 'pseudonymize' | 'retain' | 'user_row' | 'business';

/**
 * Temizleme biçimi:
 *  - `null`        nullable alan → NULL
 *  - `json_null`   nullable Json alan → veritabanı NULL'u
 *  - `placeholder` zorunlu metin alanı → "[silindi]"
 *  - `false`       Boolean alan → false (ör. kodu pasifleştir)
 */
export type RedactValue = 'null' | 'json_null' | 'placeholder' | 'false';

export const REDACTED_TEXT = '[silindi]';

export type PiiCategory =
  | 'kimlik'
  | 'iletişim'
  | 'konum'
  | 'serbest_metin'
  | 'cihaz'
  | 'davranış'
  | 'işlem'
  | 'güvenlik'
  | 'ai'
  | 'tercih';

export interface PiiExportSpec {
  /** Dışa aktarım JSON'undaki bölüm adı (aynı modelin farklı ilişkileri farklı bölümlere düşebilir). */
  section: string;
  /** Seçilecek alanlar — gizli değerler (şifre hash'i, token, anahtar) ASLA listelenmez. */
  select: readonly string[];
  /** Sıralama alanı (yoksa sırasız). */
  orderBy?: string;
  /** Üst sınır; aşılırsa paket `truncated` işaretiyle döner (sessiz kesme yok). */
  max: number;
}

export interface PiiRegistryEntry {
  /** Prisma model adı (PascalCase). */
  model: string;
  /** Kullanıcıya bağlanan alan (ilişkinin `fields` sütunu ya da ilişkisiz kullanıcı referansı). */
  relation: string;
  subject: PiiSubject;
  categories: readonly PiiCategory[];
  /** Kişisel veri taşıyan alanlar (envanter ve aydınlatma için). */
  piiFields: readonly string[];
  /** Veri sahibine verilecek kopya; `null` → dışa aktarılmaz (gerekçe `note`'ta). */
  export: PiiExportSpec | null;
  erase: EraseStrategy;
  /** `erase: 'redact'` için temizlenecek alanlar. */
  redact?: Readonly<Record<string, RedactValue>>;
  /** Saklama süresi (gün) — `null`: hesap yaşadığı sürece / ilgili yasal süre metinde. */
  retentionDays: number | null;
  /**
   * Verilirse saklama süresi OTOMATİK uygulanır: bu tarih alanı `retentionDays`'ten eski satırlar
   * günlük temizlikte silinir (`applyPersonalDataRetention`). Verilmezse süre yalnız politikadır.
   */
  retentionField?: string;
  /** Hukuki sebep (KVKK m.5/2) ve kısa açıklama. */
  legalBasis: string;
  note?: string;
}

const CREATED = 'createdAt';

function self(
  model: string,
  relation: string,
  spec: Omit<PiiRegistryEntry, 'model' | 'relation' | 'subject'>
): PiiRegistryEntry {
  return { model, relation, subject: 'self', ...spec };
}

/** Bayi/işletme hesabının ticari kaydı (dealerId vb.). */
function business(model: string, relation: string, note?: string): PiiRegistryEntry {
  return {
    model,
    relation,
    subject: 'business',
    categories: ['işlem'],
    piiFields: [],
    export: null,
    erase: 'business',
    retentionDays: null,
    legalBasis: 'Sözleşmenin ifası (m.5/2-c) ve ticari defter yükümlülüğü (m.5/2-ç)',
    note: note ?? 'İşletme hesabının ticari verisi; kişi silmesinde işletme kaydı korunur.',
  };
}

/** Veri sahibinin işlemi yapan/oluşturan kişi olarak geçtiği kayıt. */
function actor(model: string, relation: string, note?: string): PiiRegistryEntry {
  return {
    model,
    relation,
    subject: 'actor',
    categories: ['işlem'],
    piiFields: [],
    export: null,
    erase: 'pseudonymize',
    retentionDays: null,
    legalBasis: 'Meşru menfaat (m.5/2-f): hesap verebilirlik ve iş sürekliliği',
    note: note ?? 'Kayıt kişiye ait değil; kişi yalnız aktör. User anonimleşince bağ kimliksizleşir.',
  };
}

const CONTRACT = 'Sözleşmenin kurulması ve ifası (m.5/2-c)';
const LEGITIMATE = 'Meşru menfaat (m.5/2-f)';
const LEGAL_OBLIGATION = 'Hukuki yükümlülük (m.5/2-ç)';
const CONSENT = 'Açık rıza (m.5/1)';

export const PII_REGISTRY: readonly PiiRegistryEntry[] = [
  // ───────────── Hesap ve kimlik ─────────────
  self('Account', 'userId', {
    categories: ['kimlik', 'güvenlik'],
    piiFields: ['provider', 'providerAccountId'],
    export: { section: 'connectedAccounts', select: ['provider', 'type'], max: 20 },
    erase: 'delete',
    retentionDays: null,
    legalBasis: CONTRACT,
    note: 'OAuth token alanları dışa aktarılmaz (gizli değer).',
  }),
  self('Session', 'userId', {
    categories: ['güvenlik'],
    piiFields: ['sessionToken'],
    export: null,
    erase: 'delete',
    retentionDays: 30,
    legalBasis: CONTRACT,
    note: 'Oturum anahtarı gizli değerdir; dışa aktarılmaz.',
  }),
  self('AuthEmailToken', 'userId', {
    categories: ['güvenlik'],
    piiFields: ['tokenHash'],
    export: null,
    erase: 'delete',
    retentionDays: 30,
    legalBasis: CONTRACT,
    note: 'Tek kullanımlık giriş/sıfırlama bağlantıları; gizli değer.',
  }),
  self('TwoFactorRecoveryCode', 'userId', {
    categories: ['güvenlik'],
    piiFields: ['codeHash'],
    export: null,
    erase: 'delete',
    retentionDays: null,
    legalBasis: CONTRACT,
    note: 'Kurtarma kodları gizli değer; dışa aktarılmaz.',
  }),
  self('ConsentRecord', 'userId', {
    categories: ['tercih', 'cihaz'],
    piiFields: ['ipHash', 'userAgent'],
    export: {
      section: 'consentHistory',
      select: ['version', 'analytics', 'replay', 'marketing', 'source', 'createdAt'],
      orderBy: CREATED,
      max: 500,
    },
    erase: 'retain',
    retentionDays: 3650,
    legalBasis: `${LEGAL_OBLIGATION}: rızanın ispatı`,
    note: 'Rıza kaydı ispat yükü nedeniyle zamanaşımı süresince saklanır; IP ham tutulmaz.',
  }),
  self('DataSubjectRequest', 'userId', {
    categories: ['iletişim', 'serbest_metin'],
    piiFields: ['email', 'message'],
    export: {
      section: 'privacyRequests',
      select: ['id', 'type', 'status', 'createdAt', 'processedAt', 'dueAt'],
      orderBy: CREATED,
      max: 200,
    },
    erase: 'retain',
    retentionDays: 3650,
    legalBasis: `${LEGAL_OBLIGATION}: başvurunun yanıtlandığının ispatı (KVKK m.13)`,
    note: 'Başvuru ve yürütme kanıtı (DsrEvent) zamanaşımı süresince saklanır.',
  }),
  self('DashboardLayout', 'userId', {
    categories: ['tercih'],
    piiFields: ['widgets'],
    export: { section: 'preferences.dashboardLayout', select: ['widgets'], max: 5 },
    erase: 'delete',
    retentionDays: null,
    legalBasis: CONTRACT,
  }),

  // ───────────── Geri bildirim, yorum ve serbest metin ─────────────
  self('Feedback', 'userId', {
    categories: ['serbest_metin', 'davranış', 'ai'],
    piiFields: ['text', 'media', 'entities', 'statementSentiments', 'aiAnalysis', 'utmSource', 'utmCampaign', 'utmMedium'],
    export: {
      section: 'feedbacks',
      select: ['id', 'rating', 'text', 'npsScore', 'sentiment', 'characterCategory', 'dealerReply', 'isPublic', 'createdAt'],
      orderBy: CREATED,
      max: 5000,
    },
    erase: 'redact',
    redact: {
      text: 'null',
      media: 'json_null',
      entities: 'json_null',
      statementSentiments: 'json_null',
      aiAnalysis: 'json_null',
      utmSource: 'null',
      utmCampaign: 'null',
      utmMedium: 'null',
    },
    retentionDays: null,
    legalBasis: `${CONTRACT}; işletme istatistiği için ${LEGITIMATE}`,
    note: 'Puan/duygu istatistiği işletme için kalır; metin, medya ve AI çıkarımları silinir.',
  }),
  self('ConsumptionReview', 'customerId', {
    categories: ['serbest_metin', 'ai'],
    piiFields: ['text', 'dimensions'],
    export: {
      section: 'consumptionReviews',
      select: ['id', 'rating', 'text', 'dimensions', 'dealerReply', 'createdAt'],
      orderBy: CREATED,
      max: 5000,
    },
    erase: 'redact',
    redact: { text: 'null' },
    retentionDays: null,
    legalBasis: CONTRACT,
  }),
  self('Consumption', 'customerId', {
    categories: ['işlem', 'serbest_metin'],
    piiFields: ['note', 'amount'],
    export: {
      section: 'consumptions',
      select: ['id', 'dealerId', 'amount', 'note', 'createdAt'],
      orderBy: CREATED,
      max: 5000,
    },
    erase: 'redact',
    redact: { note: 'null' },
    retentionDays: null,
    legalBasis: `${CONTRACT}; işletmenin ticari kaydı için ${LEGAL_OBLIGATION}`,
  }),
  self('QraChatLog', 'userId', {
    categories: ['serbest_metin', 'ai'],
    piiFields: ['userMessage', 'assistantMessage', 'ipFingerprint'],
    export: {
      section: 'qraChatLogs',
      select: ['id', 'userMessage', 'assistantMessage', 'model', 'createdAt'],
      orderBy: CREATED,
      max: 5000,
    },
    erase: 'delete',
    retentionDays: 180,
    retentionField: 'createdAt',
    legalBasis: `${CONTRACT}: yapay zekâ asistanı hizmeti`,
    note: 'QRA asistan sohbetleri; silme talebinde tamamen silinir.',
  }),
  self('Donation', 'userId', {
    categories: ['işlem', 'serbest_metin'],
    piiFields: ['message'],
    export: {
      section: 'donations',
      select: ['id', 'projectId', 'points', 'message', 'isPublic', 'createdAt'],
      orderBy: CREATED,
      max: 2000,
    },
    erase: 'redact',
    redact: { message: 'null', isPublic: 'false' },
    retentionDays: null,
    legalBasis: CONTRACT,
  }),
  self('ImprovementRequest', 'userId', {
    categories: ['serbest_metin'],
    piiFields: ['message'],
    export: {
      section: 'improvementRequests',
      select: ['id', 'dealerId', 'templateKey', 'message', 'status', 'createdAt'],
      orderBy: CREATED,
      max: 2000,
    },
    erase: 'redact',
    redact: { message: 'placeholder' },
    retentionDays: null,
    legalBasis: CONTRACT,
  }),
  self('RemedyOffer', 'userId', {
    categories: ['serbest_metin', 'işlem'],
    piiFields: ['message'],
    export: {
      section: 'remedyOffers',
      select: ['id', 'dealerId', 'message', 'status', 'selectedType', 'createdAt', 'acceptedAt'],
      orderBy: CREATED,
      max: 2000,
    },
    erase: 'redact',
    redact: { message: 'placeholder' },
    retentionDays: null,
    legalBasis: CONTRACT,
  }),
  self('TablePulse', 'customerId', {
    categories: ['serbest_metin', 'davranış'],
    piiFields: ['note', 'mood'],
    export: {
      section: 'tablePulses',
      select: ['id', 'dealerId', 'mood', 'note', 'createdAt'],
      orderBy: CREATED,
      max: 2000,
    },
    erase: 'redact',
    redact: { note: 'null' },
    retentionDays: null,
    legalBasis: CONTRACT,
  }),
  self('ExperienceShareToken', 'creatorId', {
    categories: ['serbest_metin'],
    piiFields: ['caption', 'token'],
    export: {
      section: 'experienceShares',
      select: ['id', 'dealerId', 'caption', 'mood', 'expiresAt', 'viewCount', 'createdAt'],
      orderBy: CREATED,
      max: 1000,
    },
    erase: 'delete',
    retentionDays: null,
    legalBasis: CONSENT,
    note: 'Paylaşım bağlantıları silinir; bağlantı artık açılmaz.',
  }),
  self('SurveyResponse', 'userId', {
    categories: ['serbest_metin'],
    piiFields: ['answers'],
    export: {
      section: 'surveyResponses',
      select: ['id', 'surveyId', 'answers', 'createdAt'],
      orderBy: CREATED,
      max: 2000,
    },
    erase: 'delete',
    retentionDays: null,
    legalBasis: CONTRACT,
    note: 'İlişkisiz kullanıcı referansı (FK yok).',
  }),

  // ───────────── Bildirim, cihaz ve iletişim izleri ─────────────
  self('Notification', 'userId', {
    categories: ['iletişim'],
    piiFields: ['title', 'message', 'data'],
    export: {
      section: 'notifications',
      select: ['id', 'title', 'message', 'type', 'isRead', 'createdAt'],
      orderBy: CREATED,
      max: 2000,
    },
    erase: 'delete',
    retentionDays: 365,
    retentionField: 'createdAt',
    legalBasis: CONTRACT,
  }),
  self('PushSubscription', 'userId', {
    categories: ['cihaz'],
    piiFields: ['endpoint', 'p256dh', 'auth', 'userAgent'],
    export: {
      section: 'pushDevices',
      select: ['id', 'userAgent', 'isActive', 'lastUsedAt', 'createdAt'],
      orderBy: CREATED,
      max: 50,
    },
    erase: 'delete',
    retentionDays: null,
    legalBasis: CONSENT,
    note: 'Anlık bildirim abonelikleri; silme sonrası cihaz bildirim almaz. Anahtarlar dışa aktarılmaz.',
  }),
  self('PushNotificationLog', 'userId', {
    categories: ['iletişim'],
    piiFields: ['title', 'body', 'data'],
    export: {
      section: 'pushNotifications',
      select: ['id', 'title', 'body', 'status', 'sentAt', 'clickedAt'],
      orderBy: 'sentAt',
      max: 2000,
    },
    erase: 'delete',
    retentionDays: 180,
    retentionField: 'sentAt',
    legalBasis: CONTRACT,
  }),
  self('FileUpload', 'userId', {
    categories: ['kimlik', 'serbest_metin'],
    piiFields: ['filename', 'url', 'thumbnail'],
    export: {
      section: 'uploads',
      select: ['id', 'filename', 'mimetype', 'size', 'url', 'createdAt'],
      orderBy: CREATED,
      max: 2000,
    },
    erase: 'delete',
    retentionDays: null,
    legalBasis: CONTRACT,
    note: 'Dosya kaydı silinir; R2 nesneleri yürütme sonrası ayrıca silinir.',
  }),
  self('AnalyticsEvent', 'userId', {
    categories: ['davranış'],
    piiFields: ['data'],
    export: {
      section: 'analyticsEvents',
      select: ['event', 'category', 'createdAt'],
      orderBy: CREATED,
      max: 5000,
    },
    erase: 'delete',
    retentionDays: null,
    legalBasis: LEGITIMATE,
  }),
  self('AuditLog', 'userId', {
    categories: ['güvenlik', 'cihaz'],
    piiFields: ['newData', 'oldData', 'ipAddress', 'userAgent', 'actorSnapshot'],
    export: {
      section: 'auditTrail',
      select: ['action', 'entity', 'createdAt'],
      orderBy: CREATED,
      max: 5000,
    },
    erase: 'redact',
    redact: { newData: 'json_null', oldData: 'json_null', ipAddress: 'null', userAgent: 'null', actorSnapshot: 'json_null' },
    retentionDays: null,
    legalBasis: `${LEGAL_OBLIGATION} (5651 / KVKK m.12 veri güvenliği)`,
    note: 'İşlem satırı hesap verebilirlik için kalır; profil güncellemelerinin taşıdığı ad/telefon/adres ve IP/UA temizlenir. KVKK yürütme kayıtları (gdpr_*, dsr_*) korunur.',
  }),
  self('CardAuditLog', 'userId', {
    categories: ['güvenlik', 'cihaz'],
    piiFields: ['ipAddress', 'userAgent', 'metadata'],
    export: {
      section: 'cardActivity',
      select: ['action', 'cardId', 'createdAt'],
      orderBy: CREATED,
      max: 2000,
    },
    erase: 'redact',
    redact: { ipAddress: 'null', userAgent: 'null' },
    retentionDays: null,
    legalBasis: LEGAL_OBLIGATION,
  }),
  self('SuspiciousActivity', 'userId', {
    categories: ['güvenlik', 'cihaz'],
    piiFields: ['ipAddress', 'userAgent', 'description', 'metadata'],
    export: {
      section: 'securityFlags',
      select: ['type', 'severity', 'isResolved', 'createdAt'],
      orderBy: CREATED,
      max: 500,
    },
    erase: 'redact',
    redact: { ipAddress: 'null', userAgent: 'null' },
    retentionDays: null,
    legalBasis: `${LEGITIMATE}: dolandırıcılık önleme`,
    note: 'Sahtecilik kaydı meşru menfaatle kalır; IP/UA temizlenir. Otomatik karara itiraz hakkı (m.11/1-g) aydınlatma metninde.',
  }),

  // ───────────── Oyunlaştırma ve ekonomi (kimliksiz istatistik) ─────────────
  self('UserBadge', 'userId', {
    categories: ['davranış'],
    piiFields: [],
    export: { section: 'badges', select: ['badgeId', 'isPinned', 'earnedAt'], orderBy: 'earnedAt', max: 2000 },
    erase: 'pseudonymize',
    retentionDays: null,
    legalBasis: CONTRACT,
  }),
  self('UserQuest', 'userId', {
    categories: ['davranış'],
    piiFields: [],
    export: { section: 'quests', select: ['questId', 'progress', 'completedAt', 'createdAt'], orderBy: CREATED, max: 2000 },
    erase: 'pseudonymize',
    retentionDays: null,
    legalBasis: CONTRACT,
  }),
  self('UserReward', 'userId', {
    categories: ['işlem'],
    piiFields: ['code'],
    export: { section: 'rewards', select: ['rewardId', 'redeemedAt', 'claimedAt'], orderBy: 'redeemedAt', max: 2000 },
    erase: 'pseudonymize',
    retentionDays: null,
    legalBasis: CONTRACT,
    note: 'Kupon kodu gizli değer kabul edilir; dışa aktarılmaz.',
  }),
  self('UserCosmetic', 'userId', {
    categories: ['tercih', 'serbest_metin'],
    piiFields: ['giftMessage'],
    export: { section: 'cosmetics', select: ['cosmeticId', 'isEquipped', 'giftMessage', 'acquiredAt'], orderBy: 'acquiredAt', max: 2000 },
    erase: 'redact',
    redact: { giftMessage: 'null' },
    retentionDays: null,
    legalBasis: CONTRACT,
  }),
  actor('UserCosmetic', 'giftedByUserId', 'Hediye eden kişi; hediye mesajı alıcının kaydıyla birlikte temizlenir.'),
  self('UserSurpriseBox', 'userId', {
    categories: ['serbest_metin', 'işlem'],
    piiFields: ['message', 'couponCode'],
    export: { section: 'surpriseBoxes', select: ['title', 'message', 'points', 'rewardType', 'openedAt', 'createdAt'], orderBy: CREATED, max: 2000 },
    erase: 'redact',
    redact: { message: 'null' },
    retentionDays: null,
    legalBasis: CONTRACT,
  }),
  actor('UserSurpriseBox', 'sentByUserId', 'Kutuyu gönderen işletme/yönetici.'),
  self('DailySpin', 'userId', {
    categories: ['davranış'],
    piiFields: [],
    export: { section: 'dailySpins', select: ['day', 'count'], orderBy: 'day', max: 2000 },
    erase: 'pseudonymize',
    retentionDays: null,
    legalBasis: CONTRACT,
  }),
  self('MiniGameSession', 'userId', {
    categories: ['davranış'],
    piiFields: [],
    export: { section: 'gameSessions', select: ['gameType', 'dayKey', 'status', 'rewardPoints', 'startedAt', 'completedAt'], orderBy: 'startedAt', max: 2000 },
    erase: 'pseudonymize',
    retentionDays: null,
    legalBasis: CONTRACT,
  }),
  self('GameStreakClaim', 'userId', {
    categories: ['davranış'],
    piiFields: [],
    export: { section: 'gameStreakClaims', select: ['dayKey', 'createdAt'], orderBy: CREATED, max: 2000 },
    erase: 'pseudonymize',
    retentionDays: null,
    legalBasis: CONTRACT,
    note: 'İlişkisiz kullanıcı referansı (FK yok).',
  }),
  self('TournamentRewardClaim', 'userId', {
    categories: ['davranış'],
    piiFields: [],
    export: { section: 'tournamentRewards', select: ['gameType', 'weekKey', 'rank', 'points', 'createdAt'], orderBy: CREATED, max: 2000 },
    erase: 'pseudonymize',
    retentionDays: null,
    legalBasis: CONTRACT,
    note: 'İlişkisiz kullanıcı referansı (FK yok).',
  }),
  self('SeasonalChallengeClaim', 'userId', {
    categories: ['davranış'],
    piiFields: [],
    export: { section: 'seasonalChallenges', select: ['campaignId', 'points', 'createdAt'], orderBy: CREATED, max: 2000 },
    erase: 'pseudonymize',
    retentionDays: null,
    legalBasis: CONTRACT,
    note: 'İlişkisiz kullanıcı referansı (FK yok).',
  }),
  self('CouponRedemption', 'userId', {
    categories: ['işlem'],
    piiFields: [],
    export: { section: 'couponRedemptions', select: ['couponId', 'createdAt'], orderBy: CREATED, max: 2000 },
    erase: 'pseudonymize',
    retentionDays: null,
    legalBasis: CONTRACT,
    note: 'İlişkisiz kullanıcı referansı (FK yok).',
  }),
  self('UserStreak', 'userId', {
    categories: ['davranış'],
    piiFields: [],
    export: { section: 'streak', select: ['currentStreak', 'longestStreak', 'totalActiveDays', 'lastActivityAt'], max: 5 },
    erase: 'pseudonymize',
    retentionDays: null,
    legalBasis: CONTRACT,
  }),
  self('UserVIPStatus', 'userId', {
    categories: ['işlem'],
    piiFields: ['totalSpent'],
    export: { section: 'vipStatus', select: ['tierId', 'totalSpent', 'lifetimePoints', 'tierExpiry', 'upgradedAt'], max: 5 },
    erase: 'pseudonymize',
    retentionDays: null,
    legalBasis: CONTRACT,
  }),
  self('UserBirthday', 'userId', {
    categories: ['kimlik'],
    piiFields: ['birthDate'],
    export: { section: 'birthday', select: ['birthDate', 'createdAt'], max: 5 },
    erase: 'delete',
    retentionDays: null,
    legalBasis: CONSENT,
  }),
  self('CustomerLifetimeValue', 'userId', {
    categories: ['işlem', 'ai'],
    piiFields: ['totalSpent', 'predictedChurn', 'churnRisk'],
    export: { section: 'lifetimeValue', select: ['totalSpent', 'totalVisits', 'avgOrderValue', 'churnRisk', 'calculatedAt'], max: 5 },
    erase: 'delete',
    retentionDays: null,
    legalBasis: LEGITIMATE,
    note: 'Profilleme çıktısı (churn tahmini); silmede kaldırılır.',
  }),
  self('DealerCustomerStats', 'customerId', {
    categories: ['işlem', 'ai'],
    piiFields: ['totalSpend', 'churnRisk', 'segmentKey'],
    export: { section: 'dealerRelationships', select: ['dealerId', 'visitCount', 'reviewCount', 'avgRating', 'firstVisitAt', 'lastVisitAt', 'segmentKey'], max: 2000 },
    erase: 'delete',
    retentionDays: null,
    legalBasis: LEGITIMATE,
    note: 'İşletme bazlı müşteri özeti ve segment (profilleme); silmede kaldırılır.',
  }),
  self('CustomerMoment', 'userId', {
    categories: ['davranış'],
    piiFields: ['payload'],
    export: { section: 'moments', select: ['kind', 'payload', 'createdAt', 'seenAt'], orderBy: CREATED, max: 2000 },
    erase: 'delete',
    retentionDays: 90,
    legalBasis: CONTRACT,
  }),
  self('PointsLedger', 'userId', {
    categories: ['işlem'],
    piiFields: ['reason', 'meta'],
    export: { section: 'pointsLedger', select: ['currency', 'delta', 'xpDelta', 'balanceAfter', 'source', 'status', 'createdAt'], orderBy: CREATED, max: 10000 },
    erase: 'pseudonymize',
    retentionDays: null,
    legalBasis: `${CONTRACT}; ekonomi bütünlüğü için ${LEGITIMATE}`,
    note: 'Puan defteri değişmezdir (net-sıfır denetimi); kimliksizleşmiş hesaba bağlı kalır.',
  }),
  actor('PointsLedger', 'actorId', 'Puan düzeltmesini yapan yönetici.'),
  self('Referral', 'referrerId', {
    categories: ['davranış'],
    piiFields: ['referralCode'],
    export: { section: 'referralsMade', select: ['status', 'pointsEarned', 'createdAt', 'completedAt'], orderBy: CREATED, max: 2000 },
    erase: 'pseudonymize',
    retentionDays: null,
    legalBasis: CONTRACT,
  }),
  self('Referral', 'referredId', {
    categories: ['davranış'],
    piiFields: ['referralCode'],
    export: { section: 'referralReceived', select: ['status', 'createdAt', 'completedAt'], orderBy: CREATED, max: 20 },
    erase: 'pseudonymize',
    retentionDays: null,
    legalBasis: CONTRACT,
  }),
  self('ReferralCode', 'userId', {
    categories: ['kimlik'],
    piiFields: ['code'],
    export: { section: 'referralCodes', select: ['code', 'usageCount', 'isActive', 'createdAt'], max: 20 },
    erase: 'redact',
    redact: { isActive: 'false' },
    retentionDays: null,
    legalBasis: CONTRACT,
    note: 'Kod pasifleştirilir; geçmiş davet istatistiği bozulmasın diye satır kalır.',
  }),
  self('CustomerFavoriteDealer', 'userId', {
    categories: ['tercih'],
    piiFields: [],
    export: { section: 'favoriteDealers', select: ['dealerId', 'createdAt'], orderBy: CREATED, max: 2000 },
    erase: 'delete',
    retentionDays: null,
    legalBasis: CONTRACT,
  }),
  business('CustomerFavoriteDealer', 'dealerId', 'Müşterinin favorisi olan işletme tarafı.'),
  self('PhysicalCard', 'customerId', {
    categories: ['kimlik', 'işlem'],
    piiFields: ['token'],
    export: { section: 'cards', select: ['id', 'status', 'activatedAt', 'createdAt'], max: 50 },
    erase: 'pseudonymize',
    retentionDays: null,
    legalBasis: CONTRACT,
    note: 'Fiziksel kart işletmeye aittir; kart token\'ı gizli değer olarak dışa aktarılmaz.',
  }),

  // ───────────── Takım (squad) ─────────────
  self('Squad', 'ownerId', {
    categories: ['davranış'],
    piiFields: ['name', 'description'],
    export: { section: 'squadsOwned', select: ['id', 'name', 'description', 'createdAt'], max: 20 },
    erase: 'pseudonymize',
    retentionDays: null,
    legalBasis: CONTRACT,
    note: 'Takım diğer üyelerin de ortak kaydıdır; sahiplik anonim hesaba bağlı kalır.',
  }),
  self('SquadMember', 'userId', {
    categories: ['davranış'],
    piiFields: [],
    export: { section: 'squadMemberships', select: ['squadId', 'joinedAt'], max: 50 },
    erase: 'delete',
    retentionDays: null,
    legalBasis: CONTRACT,
  }),
  self('SquadBattleParticipant', 'userId', {
    categories: ['davranış'],
    piiFields: [],
    export: { section: 'squadBattles', select: ['battleId', 'squadId', 'score', 'createdAt'], orderBy: CREATED, max: 2000 },
    erase: 'pseudonymize',
    retentionDays: null,
    legalBasis: CONTRACT,
  }),

  // ───────────── Personel (çalışan verisi) ─────────────
  self('DealerStaff', 'userId', {
    categories: ['kimlik', 'güvenlik'],
    piiFields: ['jobTitle', 'pinCode'],
    export: { section: 'staffEmployments', select: ['dealerId', 'jobTitle', 'isActive', 'createdAt'], max: 50 },
    erase: 'redact',
    redact: { pinCode: 'null' },
    retentionDays: 3650,
    legalBasis: `${LEGAL_OBLIGATION}: iş ilişkisi kayıtları`,
    note: 'PIN gizli değer; dışa aktarılmaz, silmede temizlenir.',
  }),
  business('DealerStaff', 'dealerId'),
  self('StaffShift', 'userId', {
    categories: ['işlem', 'serbest_metin'],
    piiFields: ['note', 'clockInAt', 'clockOutAt'],
    export: { section: 'staffShifts', select: ['dealerId', 'date', 'startTime', 'endTime', 'clockInAt', 'clockOutAt', 'note'], orderBy: 'date', max: 5000 },
    erase: 'retain',
    retentionDays: 3650,
    legalBasis: `${LEGAL_OBLIGATION}: çalışma süresi kayıtları`,
  }),
  business('StaffShift', 'dealerId'),
  self('StaffLeaveRequest', 'userId', {
    categories: ['serbest_metin'],
    piiFields: ['reason'],
    export: { section: 'staffLeaveRequests', select: ['dealerId', 'startDate', 'endDate', 'reason', 'status', 'createdAt'], orderBy: CREATED, max: 2000 },
    erase: 'retain',
    retentionDays: 3650,
    legalBasis: `${LEGAL_OBLIGATION}: izin kayıtları`,
  }),
  business('StaffLeaveRequest', 'dealerId'),
  self('StaffTask', 'assignedTo', {
    categories: ['işlem'],
    piiFields: [],
    export: { section: 'staffTasks', select: ['id', 'dealerId', 'title', 'status', 'dueAt', 'completedAt', 'createdAt'], orderBy: CREATED, max: 2000 },
    erase: 'pseudonymize',
    retentionDays: null,
    legalBasis: CONTRACT,
  }),
  business('StaffTask', 'dealerId'),
  self('StaffTrainingCompletion', 'userId', {
    categories: ['işlem'],
    piiFields: [],
    export: { section: 'staffTrainings', select: ['moduleId', 'completedAt'], orderBy: 'completedAt', max: 2000 },
    erase: 'pseudonymize',
    retentionDays: null,
    legalBasis: CONTRACT,
  }),
  self('StaffChecklistCompletion', 'userId', {
    categories: ['işlem'],
    piiFields: [],
    export: { section: 'staffChecklists', select: ['templateId', 'shiftId', 'completedAt'], orderBy: 'completedAt', max: 2000 },
    erase: 'pseudonymize',
    retentionDays: null,
    legalBasis: CONTRACT,
  }),
  business('StaffInvitation', 'dealerId'),
  actor('StaffInvitation', 'invitedById'),
  actor('StaffInvitation', 'acceptedUserId', 'Daveti kabul eden personel; davet e-postası işletmenin kaydıdır.'),

  // ───────────── İç ekip modülü (yönetici çalışanları) ─────────────
  self('UserDepartment', 'userId', {
    categories: ['kimlik'],
    piiFields: [],
    export: { section: 'departments', select: ['departmentSlug', 'createdAt'], max: 50 },
    erase: 'retain',
    retentionDays: 3650,
    legalBasis: `${LEGAL_OBLIGATION}: iş ilişkisi kayıtları`,
  }),
  actor('CompanyTask', 'assignedToId'),
  actor('CompanyTask', 'createdById'),
  actor('CompanyTask', 'approvedById'),
  actor('TaskTemplate', 'createdById'),
  actor('TaskChecklistItem', 'assignedToId'),
  self('TaskComment', 'authorId', {
    categories: ['serbest_metin'],
    piiFields: ['text', 'attachmentName'],
    export: { section: 'teamComments', select: ['taskId', 'text', 'createdAt'], orderBy: CREATED, max: 5000 },
    erase: 'retain',
    retentionDays: null,
    legalBasis: `${LEGITIMATE}: iş kayıtlarının bütünlüğü`,
    note: 'İç ekip yazışması işverenin iş kaydıdır.',
  }),
  actor('TaskCommentReaction', 'userId'),
  self('TeamSavedView', 'userId', {
    categories: ['tercih'],
    piiFields: [],
    export: null,
    erase: 'delete',
    retentionDays: null,
    legalBasis: CONTRACT,
    note: 'Yalnız görünüm filtresi; kişisel veri yok.',
  }),
  actor('TeamAutomation', 'createdById'),
  actor('TaskActivity', 'actorId'),
  actor('TaskAttachment', 'uploadedById'),

  // ───────────── Yönetim ve otomasyon aktörlüğü ─────────────
  actor('UserAutomationRule', 'createdById'),
  actor('UserAutomationRule', 'updatedById'),
  actor('UserAutomationRule', 'approvedById'),
  actor('UserAutomationRun', 'triggeredById'),
  actor('Webhook', 'createdById'),
  actor('ApiKey', 'createdById'),
  actor('CardBatch', 'createdById'),
  actor('Incident', 'assignedToId'),
  actor('CSMTask', 'assignedToId'),
  actor('ActionItem', 'assignedToId'),
  actor('SuspiciousActivity', 'resolvedBy'),
  actor('InternEmailSend', 'sentByUserId'),
  actor('FeatureFlag', 'ownerId'),
  actor('AgentRun', 'createdById'),
  actor('DsrEvent', 'actorId', 'KVKK yürütme kanıtındaki yönetici; kanıt zinciri kalır.'),

  // ───────────── İşletme (bayi) ticari kayıtları ─────────────
  business('QRCode', 'dealerId'),
  business('DealerLocation', 'dealerId'),
  business('DealerOnboardingEvent', 'dealerId'),
  business('DailyDealerStats', 'dealerId'),
  business('Incident', 'dealerId'),
  business('CSMTask', 'dealerId'),
  business('ActionItem', 'dealerId'),
  business('RemedyOffer', 'dealerId'),
  business('RemedyTemplate', 'dealerId'),
  business('ProductCategory', 'dealerId'),
  business('Product', 'dealerId'),
  business('Consumption', 'dealerId'),
  business('HappyHour', 'dealerId'),
  business('SuspiciousActivity', 'dealerId'),
  business('OfflineQueue', 'dealerId'),
  business('DealerFavoriteProduct', 'dealerId'),
  business('QuickScanPreset', 'dealerId'),
  business('HeatmapData', 'dealerId'),
  business('AIConversation', 'dealerId', 'İşletmenin AI asistan sohbetleri (işletme verisi).'),
  business('AISettings', 'dealerId'),
  business('AIEmbedding', 'dealerId'),
  business('AIFeedbackCorrection', 'dealerId'),
  business('AIDealerLearningProfile', 'dealerId'),
  business('AIThemeCluster', 'dealerId'),
  business('AIInsightReport', 'dealerId'),
  business('AIUsageLog', 'dealerId'),
  business('TrainingModule', 'dealerId'),
  business('ChecklistTemplate', 'dealerId'),
  business('AutoReplyRule', 'dealerId'),
  business('Survey', 'dealerId'),
  business('Campaign', 'dealerId'),
  business('TablePulse', 'dealerId'),
  business('DealerFlashOffer', 'dealerId'),
  business('DealerWeeklyBrief', 'dealerId'),
  business('SegmentCampaignProposal', 'dealerId'),
  business('ExperienceShareToken', 'dealerId'),
  business('ImprovementRequest', 'dealerId'),
  business('DealerCustomerStats', 'dealerId'),
];

/** Model + ilişki anahtarı (`Feedback.userId`). */
export function registryKey(entry: Pick<PiiRegistryEntry, 'model' | 'relation'>): string {
  return `${entry.model}.${entry.relation}`;
}

/** Veri sahibine verilecek bölümler (kendi kişisel verisi). */
export function exportEntries(registry: readonly PiiRegistryEntry[] = PII_REGISTRY): PiiRegistryEntry[] {
  return registry.filter((e) => e.subject === 'self' && e.export !== null);
}

/** Silme talebinde dokunulacak kayıtlar (`delete` ve `redact`), yürütme sırasıyla. */
export function eraseEntries(registry: readonly PiiRegistryEntry[] = PII_REGISTRY): PiiRegistryEntry[] {
  return registry.filter((e) => e.subject === 'self' && (e.erase === 'delete' || e.erase === 'redact'));
}

/** Saklama süresi otomatik uygulanan kayıtlar (günlük temizlik). */
export function retentionEntries(registry: readonly PiiRegistryEntry[] = PII_REGISTRY): PiiRegistryEntry[] {
  return registry.filter((e) => e.retentionField && typeof e.retentionDays === 'number' && e.retentionDays > 0);
}

/** Prisma istemci temsilcisi adı (`QraChatLog` → `qraChatLog`). */
export function delegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/** Aydınlatma ve envanter ekranları için kategori başına özet. */
export function categorySummary(registry: readonly PiiRegistryEntry[] = PII_REGISTRY): Record<PiiCategory, string[]> {
  const out = {} as Record<PiiCategory, string[]>;
  for (const e of registry) {
    if (e.subject !== 'self') continue;
    for (const c of e.categories) {
      (out[c] ??= []).includes(e.model) || out[c].push(e.model);
    }
  }
  return out;
}

/** Ekranlarda gösterilen Türkçe kategori adları. */
export const PII_CATEGORY_LABELS: Readonly<Record<PiiCategory, string>> = {
  kimlik: 'Kimlik',
  iletişim: 'İletişim',
  konum: 'Konum',
  serbest_metin: 'Yazdığınız metinler',
  cihaz: 'Cihaz ve bağlantı',
  davranış: 'Kullanım ve oyun etkinliği',
  işlem: 'İşlem ve puan',
  güvenlik: 'Güvenlik kayıtları',
  ai: 'Yapay zekâ çıkarımları',
  tercih: 'Tercihler',
};
