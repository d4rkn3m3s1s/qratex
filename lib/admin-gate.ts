/**
 * ADMIN GİZLİ KAPI ("Boyutlar Arası Geçit") — sunucu (Node) tarafı, P0-01.
 *
 * ADMIN rolü TEK BAŞINA YETMEZ: kullanıcı ayrıca yalnız kurucuların bildiği soruya (cevabı
 * tek rakam) doğru yanıt vermelidir. Kapı deneyimi (uzay ekranı) aynen korunur; bu dosya
 * arkasındaki güvenliği GERÇEK yapar:
 *
 *  1. Cevap DÜZ METİN SAKLANMAZ: `HMAC-SHA256(NEXTAUTH_SECRET, tuz + cevap)` özeti tutulur.
 *     Tek rakamlık cevap uzayı 10 olduğu için tuzlu düz özet DB sızıntısında saniyede
 *     kırılırdı; sunucu sırrıyla (pepper) anahtarlanmış özet sır olmadan kırılamaz.
 *     Hiçbir uç cevabı döndürmez (GET'ler yalnız soru + durum verir).
 *  2. Kapı çerezi `lib/admin-elevation.ts` ile imzalanır/doğrulanır (HMAC + exp + cfgVer +
 *     oturum bağı) — proxy ve API AYNI fonksiyonu kullanır.
 *  3. `requireAuth` ADMIN için çerezi ZORUNLU doğrular (`checkAdminElevation`); muaflar:
 *     kapı ucunun kendisi ve ekip modülü uçları.
 *  4. Kümülatif kilitleme: 1 saatte 3 yanlış → 1 saat; 24 saatte 5 yanlış → 24 saat kilit.
 *     Her yanlış `ADMIN_GATE_FAILED`, her kilit `ADMIN_GATE_LOCKED` audit kaydı + diğer
 *     adminlere bildirim. Sayaç audit kayıtlarından hesaplanır (kalıcı, sunucu yeniden
 *     başlasa da sıfırlanmaz); eşzamanlı denemeler advisory kilitle serileşir.
 *  5. Cevap değişince ya da "tüm kapı oturumlarını sonlandır" basılınca `cfgVer` artar →
 *     bütün kapı çerezleri anında geçersiz olur.
 *  6. Yapılandırma okunamazsa kapı KAPALI kalır (fail-closed, 503) — eskiden DB hatasında
 *     kaynak koddaki varsayılan "7"ye düşüyordu.
 *
 * Gerçek ikinci faktör (TOTP/passkey step-up) F1.2'de gelir; bu kapı onun görsel kabuğu olur.
 */
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { redisGetJson, redisSetJson } from '@/lib/redis';
import {
  ADMIN_GATE_COOKIE,
  ADMIN_GATE_CFGVER_REDIS_KEY,
  getElevationSecret,
  verifyElevation,
  type ElevationCheck,
} from '@/lib/admin-elevation';

export { ADMIN_GATE_COOKIE };

export const ADMIN_GATE_SETTING_KEY = 'admin_gate';
export const ADMIN_GATE_SETTING_CATEGORY = 'security';

/**
 * Genel ayar uçlarının (`/api/admin/settings` GET/PUT/POST, rollback) OKUYAMAYACAĞI ve
 * YAZAMAYACAĞI anahtarlar. Kapı yalnız kendi uçlarından yönetilir.
 */
export const PROTECTED_SETTING_KEYS: ReadonlySet<string> = new Set([ADMIN_GATE_SETTING_KEY]);
export function isProtectedSettingKey(key: unknown): boolean {
  return typeof key === 'string' && PROTECTED_SETTING_KEYS.has(key.trim());
}

export const ADMIN_GATE_AUDIT = {
  PASSED: 'ADMIN_GATE_PASSED',
  FAILED: 'ADMIN_GATE_FAILED',
  LOCKED: 'ADMIN_GATE_LOCKED',
  UNLOCKED: 'ADMIN_GATE_UNLOCKED',
  UPDATED: 'UPDATE_ADMIN_GATE',
  REVOKED: 'ADMIN_GATE_REVOKE_ALL',
} as const;
export const ADMIN_GATE_AUDIT_ENTITY = 'AdminGate';

export const DEFAULT_ADMIN_GATE_QUESTION = 'Evrende bize göre kaç boyut gizlidir?';
const DEFAULT_SALT = 'qratex-default';
const QUESTION_MAX = 200;
const QUESTION_MIN = 5;

/** Varsayılan cevap (satır yokken). `ADMIN_GATE_DEFAULT_ANSWER` tek rakamsa o, değilse "7". */
export function defaultGateAnswer(): string {
  const env = (process.env.ADMIN_GATE_DEFAULT_ANSWER || '').trim();
  return /^[0-9]$/.test(env) ? env : '7';
}

// ───────────────────────────── Saklama biçimi ─────────────────────────────

export interface StoredAdminGate {
  v: 2;
  question: string;
  /** HMAC-SHA256(sır, tuz + cevap) hex. */
  answerHash: string;
  salt: string;
  /** Yapılandırma sürümü — her cevap değişiminde / toplu sonlandırmada artar. */
  cfgVer: number;
  /** Cevap hâlâ varsayılan mı (ayar ekranında kırmızı uyarı). */
  isDefaultAnswer: boolean;
  updatedAt: string | null;
  updatedById: string | null;
}

export class AdminGateConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminGateConfigError';
  }
}

function requireSecret(): string {
  const s = getElevationSecret();
  if (!s) throw new AdminGateConfigError('NEXTAUTH_SECRET tanımlı değil; admin kapısı kapalı');
  return s;
}

/** Cevap özeti (sır ile anahtarlanmış). Cevap yalnız tek rakam olabilir. */
export function hashGateAnswer(answer: string, salt: string): string {
  return crypto
    .createHmac('sha256', requireSecret())
    .update(`qratex-admin-gate-answer|v2|${salt}|${answer}`)
    .digest('hex');
}

export function newGateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

/** Aday cevabı sabit zamanlı karşılaştırır. Biçim dışı aday her zaman yanlıştır. */
export function verifyGateAnswer(gate: Pick<StoredAdminGate, 'answerHash' | 'salt'>, candidate: unknown): boolean {
  if (typeof candidate !== 'string' || !/^[0-9]$/.test(candidate.trim())) {
    // Biçim dışı girdide de bir özet hesapla (zamanlama farkı bırakma).
    hashGateAnswer('x', gate.salt);
    return false;
  }
  const a = Buffer.from(hashGateAnswer(candidate.trim(), gate.salt), 'hex');
  const b = Buffer.from(gate.answerHash, 'hex');
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

/** Satır yokken kullanılan varsayılan kapı (cevap özeti çalışma anında üretilir). */
export function defaultStoredGate(): StoredAdminGate {
  return {
    v: 2,
    question: DEFAULT_ADMIN_GATE_QUESTION,
    answerHash: hashGateAnswer(defaultGateAnswer(), DEFAULT_SALT),
    salt: DEFAULT_SALT,
    cfgVer: 0,
    isDefaultAnswer: true,
    updatedAt: null,
    updatedById: null,
  };
}

function cleanQuestion(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const q = raw.trim().replace(/\s+/g, ' ');
  return q ? q.slice(0, QUESTION_MAX) : null;
}

/**
 * DB değerini yorumlar.
 *  - v2 (özetli) → olduğu gibi.
 *  - ESKİ `{ question, answer: "7" }` (düz metin) → özetlenir, `needsUpgrade: true`
 *    (çağıran satırı özetli biçimle yeniden yazar; düz cevap DB'de kalmaz).
 *  - Bozuk → `AdminGateConfigError` (fail-closed: varsayılana DÜŞÜLMEZ).
 */
export function parseStoredGate(value: unknown): { gate: StoredAdminGate; needsUpgrade: boolean } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AdminGateConfigError('Kapı yapılandırması bozuk');
  }
  const raw = value as Record<string, unknown>;
  const question = cleanQuestion(raw.question) ?? DEFAULT_ADMIN_GATE_QUESTION;

  if (raw.v === 2) {
    const answerHash = typeof raw.answerHash === 'string' ? raw.answerHash : '';
    const salt = typeof raw.salt === 'string' ? raw.salt : '';
    const cfgVer = typeof raw.cfgVer === 'number' && Number.isSafeInteger(raw.cfgVer) && raw.cfgVer >= 0 ? raw.cfgVer : -1;
    if (!/^[a-f0-9]{64}$/.test(answerHash) || !salt || salt.length > 64 || cfgVer < 0) {
      throw new AdminGateConfigError('Kapı yapılandırması bozuk');
    }
    return {
      gate: {
        v: 2,
        question,
        answerHash,
        salt,
        cfgVer,
        isDefaultAnswer: raw.isDefaultAnswer === true,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
        updatedById: typeof raw.updatedById === 'string' ? raw.updatedById : null,
      },
      needsUpgrade: false,
    };
  }

  // Eski düz metin biçimi.
  const legacy = typeof raw.answer === 'string' ? raw.answer.trim() : '';
  if (!/^[0-9]$/.test(legacy)) throw new AdminGateConfigError('Kapı yapılandırması bozuk');
  const salt = newGateSalt();
  return {
    gate: {
      v: 2,
      question,
      answerHash: hashGateAnswer(legacy, salt),
      salt,
      cfgVer: 0,
      isDefaultAnswer: legacy === defaultGateAnswer(),
      updatedAt: null,
      updatedById: null,
    },
    needsUpgrade: true,
  };
}

/** İstemciye/gizli olmayan yerlere gösterilebilir görünüm (özet ve tuz YOK). */
export function publicGateView(gate: StoredAdminGate) {
  return {
    question: gate.question,
    isDefaultAnswer: gate.isDefaultAnswer,
    cfgVer: gate.cfgVer,
    updatedAt: gate.updatedAt,
    updatedById: gate.updatedById,
  };
}

// ───────────────────────────── Okuma / yayın ─────────────────────────────

type SettingsReader = Pick<Prisma.TransactionClient, 'settings'>;

/**
 * Kapı yapılandırmasını DB'den okur. DB hatası FIRLATILIR (çağıran 503 döner — fail-closed).
 * Eski düz metin satır bulunursa özetli biçime yükseltilir (en iyi çaba).
 */
export async function loadAdminGate(db: SettingsReader = prisma): Promise<StoredAdminGate> {
  const row = await db.settings.findUnique({
    where: { key: ADMIN_GATE_SETTING_KEY },
    select: { value: true, updatedAt: true },
  });
  if (!row) return defaultStoredGate();
  const { gate, needsUpgrade } = parseStoredGate(row.value);
  if (needsUpgrade) {
    const upgraded: StoredAdminGate = { ...gate, updatedAt: row.updatedAt?.toISOString?.() ?? null };
    await prisma.settings
      .update({
        where: { key: ADMIN_GATE_SETTING_KEY },
        data: { value: upgraded as unknown as Prisma.InputJsonValue, category: ADMIN_GATE_SETTING_CATEGORY },
      })
      .catch(() => undefined);
    return upgraded;
  }
  return gate;
}

/** Güncel `cfgVer`'i Redis'e yayınlar (proxy hızlı kontrolü + API sıcak katman, 60 sn). */
export async function publishGateCfgVer(cfgVer: number): Promise<void> {
  await redisSetJson(ADMIN_GATE_CFGVER_REDIS_KEY, { cfgVer }, 60);
}

/** Güncel `cfgVer`: Redis (≤ 60 sn) → yoksa DB. DB hatası fırlatılır. */
export async function getGateCfgVer(): Promise<number> {
  const hot = await redisGetJson<{ cfgVer?: unknown }>(ADMIN_GATE_CFGVER_REDIS_KEY);
  if (hot && typeof hot.cfgVer === 'number' && Number.isSafeInteger(hot.cfgVer)) return hot.cfgVer;
  const gate = await loadAdminGate();
  await publishGateCfgVer(gate.cfgVer);
  return gate.cfgVer;
}

export type AdminElevationResult = ElevationCheck | { ok: false; reason: 'unavailable' };

/**
 * İsteğin kapı çerezini TAM doğrular (imza + exp + kullanıcı + oturum + güncel cfgVer).
 * `requireAuth` ADMIN dalında çağırır.
 */
export async function checkAdminElevation(userId: string, jti: string | null | undefined): Promise<AdminElevationResult> {
  let value: string | undefined;
  try {
    value = (await cookies()).get(ADMIN_GATE_COOKIE)?.value;
  } catch {
    value = undefined;
  }
  if (!value) return { ok: false, reason: 'missing' };
  let cfgVer: number;
  try {
    cfgVer = await getGateCfgVer();
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  return verifyElevation(value, { userId, jti, cfgVer });
}

// ───────────────────────────── Kilitleme ─────────────────────────────

export const GATE_LOCK_POLICY = {
  shortWindowMs: 60 * 60 * 1000,
  shortMaxFailures: 3,
  shortLockMs: 60 * 60 * 1000,
  longWindowMs: 24 * 60 * 60 * 1000,
  longMaxFailures: 5,
  longLockMs: 24 * 60 * 60 * 1000,
} as const;

export interface GateLockState {
  locked: boolean;
  lockedUntil: Date | null;
  /** Kilide kadar kalan deneme hakkı (kilitliyse 0). */
  attemptsLeft: number;
  failures24h: number;
}

/** Saf kilit hesabı: başarısız deneme zamanları (sırasız) → kilit durumu. */
export function computeGateLock(failures: ReadonlyArray<Date>, nowMs: number = Date.now()): GateLockState {
  const p = GATE_LOCK_POLICY;
  const times = failures
    .map((d) => d.getTime())
    .filter((t) => Number.isFinite(t) && t <= nowMs + 60_000)
    .sort((a, b) => b - a);
  const long = times.filter((t) => nowMs - t < p.longWindowMs);
  const short = times.filter((t) => nowMs - t < p.shortWindowMs);
  let lockedUntil: number | null = null;
  if (long.length >= p.longMaxFailures) lockedUntil = long[0] + p.longLockMs;
  else if (short.length >= p.shortMaxFailures) lockedUntil = short[0] + p.shortLockMs;
  const locked = lockedUntil !== null && lockedUntil > nowMs;
  return {
    locked,
    lockedUntil: locked ? new Date(lockedUntil!) : null,
    attemptsLeft: locked ? 0 : Math.max(0, Math.min(p.shortMaxFailures - short.length, p.longMaxFailures - long.length)),
    failures24h: long.length,
  };
}

type AuditReader = Pick<Prisma.TransactionClient, 'auditLog'>;

/**
 * Kullanıcının kapı kilidi: son başarılı geçişten / son kilit kaldırmadan (hangisi yeniyse)
 * ve son 24 saatten sonraki `ADMIN_GATE_FAILED` kayıtlarından hesaplanır.
 */
export async function readGateLock(db: AuditReader, userId: string, nowMs: number = Date.now()): Promise<GateLockState> {
  const [lastPass, lastUnlock] = await Promise.all([
    db.auditLog.findFirst({
      where: { userId, action: ADMIN_GATE_AUDIT.PASSED },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    db.auditLog.findFirst({
      where: { action: ADMIN_GATE_AUDIT.UNLOCKED, entity: ADMIN_GATE_AUDIT_ENTITY, entityId: userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ]);
  const since = Math.max(
    nowMs - GATE_LOCK_POLICY.longWindowMs,
    lastPass?.createdAt?.getTime?.() ?? 0,
    lastUnlock?.createdAt?.getTime?.() ?? 0
  );
  const failures = await db.auditLog.findMany({
    where: { userId, action: ADMIN_GATE_AUDIT.FAILED, createdAt: { gt: new Date(since) } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
    take: 20,
  });
  return computeGateLock(
    failures.map((f) => f.createdAt),
    nowMs
  );
}

/** Kilit olayında diğer adminlere uygulama içi bildirim (en iyi çaba; hata yutulur). */
export async function notifyAdminsOfGateLock(lockedUserId: string, lockedUntil: Date): Promise<void> {
  try {
    const [admins, who] = await Promise.all([
      prisma.user.findMany({
        where: { role: 'ADMIN', id: { not: lockedUserId } },
        select: { id: true },
        take: 50,
      }),
      prisma.user.findUnique({ where: { id: lockedUserId }, select: { name: true, email: true } }),
    ]);
    if (admins.length === 0) return;
    const label = who?.name || who?.email || 'Bir yönetici hesabı';
    const until = lockedUntil.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        title: 'Gizli kapıda art arda yanlış deneme',
        message: `${label} gizli kapıda çok sayıda yanlış cevap verdi; kapı ${until} saatine kadar kilitlendi. Siz değilseniz hesabı inceleyin.`,
        type: 'warning',
        data: { kind: 'admin_gate_locked', userId: lockedUserId, lockedUntil: lockedUntil.toISOString() } as Prisma.InputJsonValue,
      })),
    });
  } catch {
    /* bildirim başarısızlığı güvenlik kararını etkilemez */
  }
}

// ───────────────────────────── Ayar girdisi ─────────────────────────────

export const adminGateUpdateSchema = z
  .object({
    question: z
      .string({ required_error: 'Soru zorunludur.', invalid_type_error: 'Soru metin olmalıdır.' })
      .trim()
      .min(QUESTION_MIN, `Soru en az ${QUESTION_MIN} karakter olmalıdır.`)
      .max(QUESTION_MAX, `Soru en fazla ${QUESTION_MAX} karakter olabilir.`),
    /** Yeni cevap (yalnız yazılır, hiçbir uç geri döndürmez). Boş bırakılırsa cevap değişmez. */
    newAnswer: z
      .string()
      .trim()
      .regex(/^[0-9]$/, 'Cevap 0-9 arası tek bir rakam olmalıdır.')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    /** Cevap değişirken ZORUNLU: mevcut cevap (oturumu açık bırakılmış bilgisayara karşı). */
    currentAnswer: z.string().trim().max(8).optional(),
    /** İyimser kilit: istemcinin gördüğü sürüm. Uyuşmazsa 409. */
    expectedCfgVer: z.number().int().min(0).optional(),
  })
  .strict();

export type AdminGateUpdateInput = z.infer<typeof adminGateUpdateSchema>;

/** Cevabın parmak izi (audit için; sır olmadan cevaba geri döndürülemez, cevap ASLA yazılmaz). */
export function answerFingerprint(gate: Pick<StoredAdminGate, 'answerHash'>): string {
  return gate.answerHash.slice(0, 6);
}
