/**
 * KVKK/GDPR veri sahibi talebi YÜRÜTME motoru (P0-25, P0-34).
 *
 * Bütün kapsam `lib/pii-registry.ts` (PII_REGISTRY) kaydından okunur; burada elle yazılmış
 * ayrı bir model listesi YOKTUR. Kullanıcıya bağlanan yeni bir model kayda eklendiğinde dışa
 * aktarma, sayım, silme ve saklama süresi otomatik kapsar.
 *
 *  - exportUserData           veri sahibinin bütün kişisel verisi (taşınabilir JSON, m.11).
 *  - exportDigest             paketin SHA-256 özeti (kanıt zincirine yazılır; içerik yazılmaz).
 *  - countUserData            bölüm başına kayıt SAYILARI (kişisel veri içermez; önizleme).
 *  - purgeRegistryPersonalData `delete`/`redact` stratejili kayıtları tx içinde temizler.
 *  - deletePersonalObjects    temizlenen dosya kayıtlarının R2 nesnelerini (commit SONRASI) siler.
 *  - applyPersonalDataRetention `retentionField` tanımlı kayıtlarda saklama süresini uygular.
 *  - anonymizeUser            "kullanıcı silme"nin TEK yürütücüsü: User satırı SİLİNMEZ,
 *                             PII geri döndürülemez biçimde maskelenir (P0-25).
 *
 * P0-25 kuralı: hiçbir yol `user.delete` çağırmaz. Önceden admin tekil/toplu silme ve
 * "hesabımı sil" `user.delete` yapıyordu → `AuditLog` (cascade), bayinin QR'ları ve o QR'lara
 * gelmiş BAŞKA müşterilerin yorumları geri dönüşsüz yok oluyordu. Artık:
 *   1. Talep idempotent biçimde `updateMany({ where: { id, anonymizedAt: null } })` ile talep
 *      edilir (count 0 → zaten anonim; ikinci çağrı hiçbir şey yazmaz).
 *   2. PII maskeleme + kayıt temizliği + bayi QR arşivi + denetim satırı + çağıranın kanıt
 *      kaydı (`withinTx`) TEK transaction'dadır; biri düşerse hepsi geri alınır.
 *   3. `sessionVersion` artırılır ve oturum durumu bayatlatılır → açık oturumlar düşer.
 */
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  PII_REGISTRY,
  REDACTED_TEXT,
  delegateName,
  eraseEntries,
  exportEntries,
  registryKey,
  retentionEntries,
  type PiiRegistryEntry,
  type RedactValue,
} from '@/lib/pii-registry';
import { SYSTEM_ACTOR, auditEntry, type AuditActor } from '@/lib/data-safety/audit';
import { invalidateSessionState } from '@/lib/auth/session-state';
import { deleteFromR2, isR2Configured, keyFromPublicUrl } from '@/lib/r2-storage';

// ───────────────────────────── Dinamik temsilci erişimi ─────────────────────────────

type Where = Record<string, unknown>;
interface DynamicDelegate {
  findMany(args: { where: Where; select?: Record<string, boolean>; orderBy?: Record<string, 'asc' | 'desc'>; take?: number }): Promise<Record<string, unknown>[]>;
  count(args: { where: Where }): Promise<number>;
  deleteMany(args: { where: Where }): Promise<{ count: number }>;
  updateMany(args: { where: Where; data: Record<string, unknown> }): Promise<{ count: number }>;
}

/** `prisma` ya da `tx` — bu modül yalnız aşağıdaki temsilci metotlarını kullanır. */
type Db = Prisma.TransactionClient | typeof prisma;

function delegateOf(db: Db, model: string): DynamicDelegate {
  const d = (db as unknown as Record<string, DynamicDelegate | undefined>)[delegateName(model)];
  if (!d) throw new Error(`PII_REGISTRY_UNKNOWN_MODEL:${model}`);
  return d;
}

function whereFor(entry: Pick<PiiRegistryEntry, 'relation'>, userId: string): Where {
  return { [entry.relation]: userId };
}

// ───────────────────────────── Dışa aktarma (m.11) ─────────────────────────────

/** Profil — gizli değerler (şifre hash'i, 2FA sırrı, Stripe kimlikleri) ASLA verilmez. */
const PROFILE_SELECT = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  image: true,
  phone: true,
  biography: true,
  role: true,
  points: true,
  level: true,
  xp: true,
  address: true,
  latitude: true,
  longitude: true,
  businessName: true,
  businessDesc: true,
  businessCategory: true,
  preferredLanguage: true,
  notificationPrefs: true,
  twoFactorEnabled: true,
  subscriptionStatus: true,
  loginStreakCount: true,
  loginStreakLongest: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const EXPORT_FORMAT = 'qratex-kvkk-export-v2';

export interface UserDataExport {
  exportedAt: string;
  format: typeof EXPORT_FORMAT;
  profile: Record<string, unknown>;
  /** Bölüm adı → kayıtlar (nokta içeren bölüm adları iç içe nesneye açılır). */
  sections: Record<string, unknown>;
  /** Bölüm adı → verilen kayıt sayısı. */
  counts: Record<string, number>;
  /** Üst sınırı aşan bölümler (sessiz kesme yok). */
  truncated: string[];
  [key: string]: unknown;
}

function setPath(target: Record<string, unknown>, path: string, rows: unknown[]): void {
  const parts = path.split('.');
  let node = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = node[parts[i]];
    if (!next || typeof next !== 'object' || Array.isArray(next)) node[parts[i]] = {};
    node = node[parts[i]] as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1];
  const prev = node[leaf];
  node[leaf] = Array.isArray(prev) ? [...prev, ...rows] : rows;
}

/**
 * Kullanıcının bütün kişisel verisini tek taşınabilir pakette toplar (KVKK m.11).
 * Bir bölüm okunamazsa paket VERİLMEZ (hata fırlatılır) — eksik paket "tam" diye sunulmaz.
 */
export async function exportUserData(userId: string, db: Db = prisma): Promise<UserDataExport> {
  const profile = await db.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT });
  if (!profile) throw new Error('USER_NOT_FOUND');

  const sections: Record<string, unknown> = {};
  const counts: Record<string, number> = {};
  const truncated: string[] = [];

  for (const entry of exportEntries()) {
    const spec = entry.export!;
    const rows = await delegateOf(db, entry.model).findMany({
      where: whereFor(entry, userId),
      select: Object.fromEntries(spec.select.map((f) => [f, true])),
      ...(spec.orderBy ? { orderBy: { [spec.orderBy]: 'desc' as const } } : {}),
      take: spec.max + 1,
    });
    const over = rows.length > spec.max;
    const kept = over ? rows.slice(0, spec.max) : rows;
    if (over && !truncated.includes(spec.section)) truncated.push(spec.section);
    setPath(sections, spec.section, kept);
    counts[spec.section] = (counts[spec.section] ?? 0) + kept.length;
  }

  return {
    exportedAt: new Date().toISOString(),
    format: EXPORT_FORMAT,
    profile: profile as unknown as Record<string, unknown>,
    sections,
    counts,
    truncated,
    notes: [
      'Şifre, oturum, tek kullanımlık bağlantı, kurtarma kodu, kupon kodu ve bildirim anahtarları güvenlik nedeniyle pakete eklenmez.',
      truncated.length > 0
        ? 'Bazı bölümler üst sınıra ulaştı; tamamı için KVKK başvurusu üzerinden ek paket isteyebilirsiniz.'
        : 'Tüm bölümler eksiksiz eklendi.',
    ],
  };
}

/** Paketin SHA-256 özeti (hex). Kanıt zincirine içerik değil bu özet yazılır. */
export function exportDigest(data: unknown): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

/** Bölüm başına kayıt SAYILARI — kişisel veri içermez (yönetici önizlemesi). */
export async function countUserData(userId: string, db: Db = prisma): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const entry of exportEntries()) {
    const n = await delegateOf(db, entry.model).count({ where: whereFor(entry, userId) });
    const key = entry.export!.section;
    out[key] = (out[key] ?? 0) + n;
  }
  return out;
}

// ───────────────────────────── Silme / temizleme ─────────────────────────────

function redactData(redact: Readonly<Record<string, RedactValue>>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [field, how] of Object.entries(redact)) {
    if (how === 'null') data[field] = null;
    else if (how === 'json_null') data[field] = Prisma.DbNull;
    else if (how === 'placeholder') data[field] = REDACTED_TEXT;
    else if (how === 'false') data[field] = false;
  }
  return data;
}

export interface PurgeResult {
  /** `Model.alan` → etkilenen satır sayısı. */
  counts: Record<string, number>;
  /** Commit SONRASI silinecek R2 nesne URL'leri (`deletePersonalObjects`). */
  objectUrls: string[];
}

/**
 * KVKK yürütme kanıtı olan denetim satırları (anonimleştirme, DSR kanıt aynası, başvuru)
 * silme talebinde de KORUNUR (P0-34): aksi halde kişinin kendi self-servis silmesi, kendi
 * başvurusunun ve yürütmenin kanıtını redakte ederdi.
 */
export const PROTECTED_AUDIT_ACTIONS: ReadonlyArray<Prisma.AuditLogWhereInput> = [
  { action: { startsWith: 'gdpr_' } },
  { action: { startsWith: 'dsr_' } },
  { action: 'data_subject_request' },
];

/** Silme kapsamının `where`'i. AuditLog: kişinin kendi işlemleri + kişinin profiline yazılmış yükler. */
export function eraseWhere(entry: Pick<PiiRegistryEntry, 'model' | 'relation'>, userId: string): Where {
  if (entry.model === 'AuditLog') {
    return {
      OR: [{ [entry.relation]: userId }, { entity: 'User', entityId: userId }],
      NOT: [...PROTECTED_AUDIT_ACTIONS],
    };
  }
  return whereFor(entry, userId);
}

/** Json/dizi içinden R2'ye işaret edebilecek URL'leri toplar (ör. `Feedback.media`). */
function collectUrls(value: unknown, out: string[], depth = 0): void {
  if (depth > 4 || value == null) return;
  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value)) out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectUrls(v, out, depth + 1);
    return;
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) collectUrls(v, out, depth + 1);
  }
}

/**
 * Kayıttaki `delete` / `redact` stratejili kişisel kayıtları temizler. Transaction içinde
 * (`tx`) çağrılmalıdır; idempotenttir (ikinci çağrı 0 satır etkiler).
 */
export async function purgeRegistryPersonalData(db: Db, userId: string): Promise<PurgeResult> {
  const counts: Record<string, number> = {};
  const objectUrls: string[] = [];

  for (const entry of eraseEntries()) {
    const delegate = delegateOf(db, entry.model);
    const where = eraseWhere(entry, userId);
    const key = registryKey(entry);

    // Redakte edilecek Json medya alanlarındaki dosyalar (yorum fotoğrafları) R2'den de silinir.
    if (entry.model === 'Feedback' && entry.redact?.media) {
      const rows = await delegate.findMany({ where: { ...where, media: { not: Prisma.DbNull } }, select: { media: true } });
      for (const r of rows ?? []) collectUrls(r.media, objectUrls);
    }

    if (entry.erase === 'delete') {
      if (entry.model === 'FileUpload') {
        const files = await delegate.findMany({ where, select: { url: true, thumbnail: true } });
        for (const f of files ?? []) {
          for (const u of [f.url, f.thumbnail]) if (typeof u === 'string' && u) objectUrls.push(u);
        }
      }
      const res = await delegate.deleteMany({ where });
      counts[key] = res?.count ?? 0;
    } else if (entry.erase === 'redact' && entry.redact && Object.keys(entry.redact).length > 0) {
      const res = await delegate.updateMany({ where, data: redactData(entry.redact) });
      counts[key] = res?.count ?? 0;
    }
  }

  return { counts, objectUrls };
}

/** R2 nesnelerini siler (en iyi çaba; commit SONRASI çağrılır). Silinen anahtar sayısı döner. */
export async function deletePersonalObjects(urls: readonly string[]): Promise<number> {
  if (!urls.length || !isR2Configured()) return 0;
  let deleted = 0;
  for (const url of Array.from(new Set(urls))) {
    const key = keyFromPublicUrl(url);
    if (!key) continue;
    try {
      await deleteFromR2(key);
      deleted++;
    } catch {
      /* tek nesne hatası diğerlerini durdurmaz */
    }
  }
  return deleted;
}

export interface RetentionOptions {
  now?: Date;
  /** Yalnız say, silme (yönetici önizlemesi / test). */
  dryRun?: boolean;
  db?: Db;
}

export interface RetentionResult {
  /** `Model.alan` → silinen (dryRun'da silinecek) satır sayısı. */
  counts: Record<string, number>;
  /** Başarısız modeller; biri düşerse diğerleri yine uygulanır. */
  errors: string[];
}

/**
 * SAKLAMA SÜRESİ UYGULAYICISI (KVKK m.4/2-d, m.7): PII_REGISTRY'de `retentionField` +
 * `retentionDays` verilmiş kayıtlarda (QRA sohbetleri 180 gün, anlık bildirim kayıtları
 * 180 gün, bildirimler 365 gün) süresi dolan satırları siler. Süre metinde yazılı kalmaz;
 * günlük temizlik işi (`/api/cron/db-cleanup`) çağırır. Bir modelde hata diğerlerini durdurmaz.
 */
export async function applyPersonalDataRetention(options: RetentionOptions = {}): Promise<RetentionResult> {
  const now = options.now ?? new Date();
  const db = options.db ?? prisma;
  const counts: Record<string, number> = {};
  const errors: string[] = [];
  for (const entry of retentionEntries()) {
    const key = registryKey(entry);
    const cutoff = new Date(now.getTime() - (entry.retentionDays as number) * 24 * 60 * 60 * 1000);
    const where = { [entry.retentionField as string]: { lt: cutoff } };
    try {
      const delegate = delegateOf(db, entry.model);
      counts[key] = options.dryRun ? await delegate.count({ where }) : ((await delegate.deleteMany({ where }))?.count ?? 0);
    } catch (e) {
      errors.push(`${key}: ${e instanceof Error ? e.message.slice(0, 200) : 'hata'}`);
    }
  }
  return { counts, errors };
}

// ───────────────────────────── Anonimleştirme (P0-25) ─────────────────────────────

/** Anonimleştirilmiş kullanıcı için deterministik, geri döndürülemez yer tutucu e-posta. */
export function anonymizedEmail(userId: string): string {
  return `anonymized+${userId}@deleted.qratex.local`;
}

export const ANONYMIZED_NAME = 'Anonim Kullanıcı';

/** User satırının maskelenen alanları (kimlik, iletişim, konum, gizli değerler). */
function userPiiMask(userId: string, now: Date): Prisma.UserUpdateManyMutationInput {
  return {
    name: ANONYMIZED_NAME,
    email: anonymizedEmail(userId),
    emailVerified: null,
    image: null,
    phone: null,
    password: null,
    biography: null,
    address: null,
    latitude: null,
    longitude: null,
    businessName: null,
    businessLogo: null,
    businessDesc: null,
    businessHours: null,
    defaultReplyTemplate: null,
    notificationPrefs: Prisma.DbNull,
    customFrameColor: null,
    twoFactorSecret: null,
    twoFactorEnabled: false,
    twoFactorVerifiedAt: null,
    isHallOfFame: false,
    anonymizedAt: now,
    // Açık oturumlar `sv` uyuşmazlığıyla düşer (lib/auth/session-state).
    sessionVersion: { increment: 1 },
  };
}

export type AnonymizeReason = 'admin_delete' | 'admin_bulk_delete' | 'self_service' | 'dsr_erasure' | (string & {});

export interface AnonymizeOptions {
  /** İşlemi yapan (denetim izi). Verilmezse sistem. */
  actor?: AuditActor;
  reason?: AnonymizeReason;
  /** IP / user-agent denetim satırına yazılır. */
  request?: { headers: { get(name: string): string | null } } | null;
  now?: Date;
  /**
   * Aynı transaction'da çalışır (KVKK kanıt kaydı vb.). Fırlatırsa BÜTÜN anonimleştirme
   * geri alınır. Zaten anonim kullanıcıda çağrılmaz.
   */
  withinTx?: (tx: Prisma.TransactionClient, ctx: { counts: Record<string, number> }) => Promise<void>;
}

export interface AnonymizeResult {
  anonymized: true;
  /** true → kullanıcı daha önce anonimleşmişti; bu çağrı hiçbir şey yazmadı. */
  alreadyAnonymized: boolean;
  /** `Model.alan` → temizlenen satır + `QRCode.dealerId` arşivi. */
  counts: Record<string, number>;
  archivedQrCodes: number;
  clearedSessions: number;
}

/**
 * Kullanıcıyı anonimleştirir — "kullanıcı silme"nin tek yürütücüsü (P0-25).
 * User satırı, denetim izi, puan/istatistik ve başka kişilerin verisi KORUNUR; kişiyle bağ
 * kopar. Bayi ise QR kodları arşivlenir (yorumlar korunur). Kullanıcı yoksa `USER_NOT_FOUND`.
 */
export async function anonymizeUser(userId: string, opts: AnonymizeOptions = {}): Promise<AnonymizeResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, anonymizedAt: true },
  });
  if (!user) throw new Error('USER_NOT_FOUND');

  const idle: AnonymizeResult = {
    anonymized: true,
    alreadyAnonymized: true,
    counts: {},
    archivedQrCodes: 0,
    clearedSessions: 0,
  };
  if (user.anonymizedAt) return idle;

  const now = opts.now ?? new Date();
  const actor = opts.actor ?? SYSTEM_ACTOR;
  // Kişi kendi hesabını siliyorsa denetim satırına onun e-postası/adı yazılmaz (silinen PII
  // denetim izinden geri sızmasın); rol ve kimlik kalır.
  const auditActor: AuditActor = actor.id === userId ? { ...actor, email: null, name: null } : actor;

  const outcome = await prisma.$transaction(async (tx) => {
    // İdempotent talep: yarışan ikinci çağrı (çift tık, toplu + tekil) count 0 görür.
    const claim = await tx.user.updateMany({
      where: { id: userId, anonymizedAt: null },
      data: userPiiMask(userId, now),
    });
    if (claim.count === 0) return null;

    const purge = await purgeRegistryPersonalData(tx, userId);
    const counts: Record<string, number> = { ...purge.counts };

    // Kişiye bağlı Settings satırları (FK'siz anahtar-değer; veri modeli B7/B10): dil, erişilebilirlik,
    // liderlik görünürlüğü ve bayi tercihleri anahtarla bağlı olduğu için cascade ile gitmez,
    // yetim kalıyordu. Anonimleştirmede kişiyle birlikte silinir.
    const settingsRows = await tx.settings.deleteMany({
      where: { key: { in: [`user_settings_${userId}`, `innovation_dealer_prefs_${userId}`] } },
    });
    counts['Settings.key'] = settingsRows?.count ?? 0;

    let archivedQrCodes = 0;
    if (String(user.role) === 'DEALER') {
      // QR silinmez (Feedback.qrCode onDelete: Restrict, P0-24): arşivlenir, yorumlar kalır.
      const qr = await tx.qRCode.updateMany({
        where: { dealerId: userId, archivedAt: null },
        data: { isActive: false, archivedAt: now },
      });
      archivedQrCodes = qr?.count ?? 0;
      counts['QRCode.dealerId'] = archivedQrCodes;
    }

    // Denetim satırı TEMİZLİKTEN SONRA yazılır (kendi kendini silmede redakte edilmesin).
    await tx.auditLog.create({
      data: auditEntry(
        auditActor,
        {
          action: 'gdpr_anonymize',
          entity: 'User',
          entityId: userId,
          oldData: { role: String(user.role) },
          newData: { anonymized: true, reason: opts.reason ?? null, counts },
        },
        opts.request ?? null
      ),
    });

    if (opts.withinTx) await opts.withinTx(tx, { counts });

    return { counts, archivedQrCodes, objectUrls: purge.objectUrls };
  });

  if (!outcome) return idle;

  // Commit SONRASI yan etkiler (en iyi çaba; anonimleştirmeyi geri almaz).
  await invalidateSessionState(userId).catch(() => undefined);
  await deletePersonalObjects(outcome.objectUrls).catch(() => 0);

  return {
    anonymized: true,
    alreadyAnonymized: false,
    counts: outcome.counts,
    archivedQrCodes: outcome.archivedQrCodes,
    clearedSessions: outcome.counts[registryKey({ model: 'Session', relation: 'userId' })] ?? 0,
  };
}

/** Kayıt bütünlüğü için dışa açık (envanter ekranları/testler). */
export { PII_REGISTRY };
