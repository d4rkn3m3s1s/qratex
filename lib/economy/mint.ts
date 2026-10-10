/**
 * mintPoints — puan/XP basan HER yolun tek giriş noktası.
 *
 * Tek transaction içinde sıra:
 *   1. Kullanıcı satırı `SELECT … FOR UPDATE` ile kilitlenir (eşzamanlılık guard'ı:
 *      aynı kullanıcıya paralel mint'ler sıraya girer; tavan ve idempotency okuması
 *      kilit SONRASI yapıldığı için iki istek aynı "kalan"ı ya da aynı "yok"u göremez).
 *   2. idempotencyKey varsa PointsLedger'da aranır → varsa kredi YOK, mevcut sonuç döner.
 *   3. Kategori tavanı (lib/economy/caps.ts) → istenen puan kısaltılabilir; XP aynı
 *      oranla kısalır (tavanı XP üzerinden dolanmak mümkün olmasın).
 *   4. Fraud kapısı: `fraudStatus === 'shadow_ban'` → defter satırı `void`, bakiye artmaz
 *      (gölge ban'ın tanımı: kullanıcıya başarı görünür, değer basılmaz).
 *   5. creditPointsAndXp ile atomik artış + seviye.
 *   6. PointsLedger satırı (balanceAfter ile) + `points_credited` analytics olayı
 *      (fraud/velocity/cap görünürlüğü; geçiş döneminde paralel yazılır).
 *
 * `db` kök Prisma istemcisiyse fonksiyon kendi transaction'ını açar; bir transaction
 * istemcisi (tx) verilirse çağıranın transaction'ına katılır (çağıranın diğer yazımları
 * ile birlikte commit/rollback olur).
 */
import type { Prisma } from '@prisma/client';
import type { prisma } from '@/lib/prisma';
import { creditPointsAndXp } from '@/lib/points-wallet';
import { applyCategoryCap, getCapRule, MAX_SINGLE_MINT, MAX_SINGLE_XP, type CapCategory } from './caps';
import { EconomyError, isUniqueViolation } from './errors';

export type EconomyTx = Prisma.TransactionClient;
export type EconomyDb = Prisma.TransactionClient | typeof prisma;

export type LedgerStatus = 'posted' | 'void';

export interface MintInput {
  userId: string;
  /** Harcanabilir puan (≥ 0, tam sayı; ondalık aşağı yuvarlanır). */
  points: number;
  /** Seviye XP'si (≥ 0). */
  xp?: number;
  /** Kaynak: feedback | review | game | dealer_passive | quest | badge | referral | admin_adjust … */
  source: string;
  /** Kaynak kaydın id'si (feedbackId, sessionId, questId …). */
  sourceId?: string | null;
  /**
   * Tek-kez anahtarı (PointsLedger.idempotencyKey @unique). Aynı anahtarla ikinci çağrı
   * kredi YAPMAZ, ilk çağrının sonucunu döndürür. Örn. `game:<sessionId>`, `quest:<id>:<userId>`.
   */
  idempotencyKey?: string | null;
  /** Tetikleyen bayi/admin/personel. dealer_passive için ZORUNLU (müşteri × bayi tavanı). */
  actorId?: string | null;
  reason?: string | null;
  /** Ek bağlam (oyun tipi, rozet id …) — ledger.meta ve points_credited.data'ya eklenir. */
  meta?: Record<string, unknown> | null;
  /**
   * Tavan kategorisi. Verilmezse `source` için tanımlı tavan varsa o uygulanır (güvenli
   * varsayılan). `null` = bilerek tavansız (ör. escrow iadesi, savaş havuzu ödemesi).
   */
  capCategory?: CapCategory | null;
  /**
   * Gölge ban kapısı. Varsayılan true. Kullanıcının KENDİ puanını geri veren yollar
   * (escrow iadesi, iptal) false geçmeli — aksi hâlde net-sıfır kuralı çiğnenir.
   */
  fraudGate?: boolean;
  /** Test/raporlama için "şimdi". */
  now?: Date;
}

export interface MintResult {
  /** Bu çağrıyla (ya da duplicate ise ilk çağrıda) kredilenen puan. */
  credited: number;
  /** Kredilenen XP. */
  xpCredited: number;
  /** İstenen (tavan öncesi) puan. */
  requestedPoints: number;
  /** Güncel puan bakiyesi. */
  points: number;
  /** Güncel toplam XP. */
  xp: number;
  level: number;
  isLevelUp: boolean;
  /** Tavan puanı kısalttı mı. */
  capped: boolean;
  /** Aynı idempotencyKey daha önce işlenmiş; bu çağrıda kredi yapılmadı. */
  duplicate: boolean;
  /** `void` = gölge ban: kullanıcıya başarı görünür, bakiye artmadı. */
  status: LedgerStatus;
  ledgerId: string | null;
}

const SOURCE_RE = /^[a-z][a-z0-9_.:-]{0,63}$/;
const MAX_KEY_LEN = 200;

function isRootClient(db: EconomyDb): db is typeof prisma {
  return typeof (db as { $transaction?: unknown }).$transaction === 'function';
}

function toNonNegativeInt(v: unknown, field: string): number {
  if (v === undefined || v === null) return 0;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new EconomyError('INVALID_AMOUNT', 'Geçersiz puan miktarı.', { field });
  }
  return Math.max(0, Math.floor(v));
}

type NormalizedMint = {
  userId: string;
  points: number;
  xp: number;
  source: string;
  sourceId: string | null;
  idempotencyKey: string | null;
  actorId: string | null;
  reason: string | null;
  meta: Record<string, unknown> | null;
  capCategory: string | null;
  fraudGate: boolean;
  now: Date;
};

function normalize(input: MintInput): NormalizedMint {
  if (!input || typeof input.userId !== 'string' || input.userId.length === 0) {
    throw new EconomyError('INVALID_INPUT', 'Kullanıcı belirtilmedi.');
  }
  if (typeof input.source !== 'string' || !SOURCE_RE.test(input.source)) {
    throw new EconomyError('INVALID_INPUT', 'Geçersiz puan kaynağı.', { source: input.source });
  }
  const points = toNonNegativeInt(input.points, 'points');
  const xp = toNonNegativeInt(input.xp, 'xp');
  if (points > MAX_SINGLE_MINT || xp > MAX_SINGLE_XP) {
    throw new EconomyError('INVALID_AMOUNT', 'Tek işlemde verilebilecek puan sınırı aşıldı.', {
      points,
      xp,
      max: MAX_SINGLE_MINT,
    });
  }
  const key = input.idempotencyKey ?? null;
  if (key !== null && (typeof key !== 'string' || key.length === 0 || key.length > MAX_KEY_LEN)) {
    throw new EconomyError('INVALID_INPUT', 'Geçersiz tek-kez anahtarı.');
  }
  // capCategory: undefined → source'un tavanı (varsa); null → bilerek tavansız.
  const capCategory =
    input.capCategory === undefined ? (getCapRule(input.source) ? input.source : null) : input.capCategory;
  const rule = getCapRule(capCategory);
  if (rule?.requiresActor && !input.actorId) {
    throw new EconomyError('INVALID_INPUT', 'Bu puan kaynağı için işletme (aktör) zorunlu.', {
      capCategory,
    });
  }
  return {
    userId: input.userId,
    points,
    xp,
    source: input.source,
    sourceId: input.sourceId ?? null,
    idempotencyKey: key,
    actorId: input.actorId ?? null,
    reason: input.reason ? String(input.reason).slice(0, 500) : null,
    meta: input.meta ?? null,
    capCategory,
    fraudGate: input.fraudGate !== false,
    now: input.now ?? new Date(),
  };
}

type LockedUser = { id: string; fraudStatus: string | null };

/**
 * Kullanıcı satırını transaction sonuna kadar kilitler. Aynı tx'te zaten kilitliyse
 * (çağıran daha önce user.update yaptıysa) Postgres yeniden girişe izin verir.
 */
export async function lockUserForUpdate(tx: EconomyTx, userId: string): Promise<LockedUser> {
  const rows = await tx.$queryRaw<LockedUser[]>`SELECT "id", "fraudStatus" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row) {
    throw new EconomyError('USER_NOT_FOUND', 'Kullanıcı bulunamadı.', { userId });
  }
  return row;
}

async function readWallet(tx: EconomyTx, userId: string) {
  const w = await tx.user.findUnique({
    where: { id: userId },
    select: { points: true, xp: true, level: true },
  });
  if (!w) throw new EconomyError('USER_NOT_FOUND', 'Kullanıcı bulunamadı.', { userId });
  return w;
}

async function duplicateResult(
  tx: EconomyTx,
  existing: { id: string; userId: string | null; delta: number; xpDelta: number; status: string; meta: unknown },
  userId: string
): Promise<MintResult> {
  if (existing.userId !== userId) {
    throw new EconomyError('IDEMPOTENCY_CONFLICT', 'Bu işlem anahtarı başka bir kullanıcıya ait.');
  }
  const wallet = await readWallet(tx, userId);
  const meta = (existing.meta ?? {}) as { requestedPoints?: unknown; capped?: unknown };
  return {
    credited: Math.max(0, existing.delta),
    xpCredited: Math.max(0, existing.xpDelta),
    requestedPoints: typeof meta.requestedPoints === 'number' ? meta.requestedPoints : Math.max(0, existing.delta),
    points: wallet.points,
    xp: wallet.xp,
    level: wallet.level,
    isLevelUp: false,
    capped: meta.capped === true,
    duplicate: true,
    status: existing.status === 'void' ? 'void' : 'posted',
    ledgerId: existing.id,
  };
}

async function mintInTx(tx: EconomyTx, m: NormalizedMint): Promise<MintResult> {
  // 1. Eşzamanlılık guard'ı: bundan sonraki her okuma, aynı kullanıcıya ait paralel
  //    mint'lerin commit'lenmiş sonucunu görür.
  const locked = await lockUserForUpdate(tx, m.userId);

  // 2. Tek-kez.
  if (m.idempotencyKey) {
    const existing = await tx.pointsLedger.findUnique({
      where: { idempotencyKey: m.idempotencyKey },
      select: { id: true, userId: true, delta: true, xpDelta: true, status: true, meta: true },
    });
    if (existing) return duplicateResult(tx, existing, m.userId);
  }

  // 3. Tavan.
  let grantedPoints = m.points;
  let capped = false;
  if (m.capCategory && m.points > 0) {
    const decision = await applyCategoryCap(tx, {
      userId: m.userId,
      category: m.capCategory,
      points: m.points,
      actorId: m.actorId,
      now: m.now,
    });
    grantedPoints = decision.granted;
    capped = decision.capped;
  }
  const grantedXp = capped && m.points > 0 ? Math.floor((m.xp * grantedPoints) / m.points) : m.xp;

  const ledgerMeta = {
    ...(m.meta ?? {}),
    requestedPoints: m.points,
    requestedXp: m.xp,
    capped,
    capCategory: m.capCategory,
  } as Prisma.InputJsonObject;

  // 4. Gölge ban: değer basılmaz, iz kalır.
  if (m.fraudGate && locked.fraudStatus === 'shadow_ban') {
    const wallet = await readWallet(tx, m.userId);
    const voidRow = await tx.pointsLedger.create({
      data: {
        userId: m.userId,
        delta: grantedPoints,
        xpDelta: grantedXp,
        balanceAfter: wallet.points,
        source: m.source,
        sourceId: m.sourceId,
        idempotencyKey: m.idempotencyKey,
        status: 'void',
        actorId: m.actorId,
        reason: m.reason ?? 'shadow_ban',
        meta: ledgerMeta,
      },
      select: { id: true },
    });
    return {
      credited: grantedPoints,
      xpCredited: grantedXp,
      requestedPoints: m.points,
      points: wallet.points,
      xp: wallet.xp,
      level: wallet.level,
      isLevelUp: false,
      capped,
      duplicate: false,
      status: 'void',
      ledgerId: voidRow.id,
    };
  }

  // Tavan tamamen doldu ve XP de yok: bakiye değişmez. Anahtar varsa sonucu yine de
  // deftere kilitle — yarın tekrar denenince (tavan sıfırlanmışken) kredi verilmesin.
  if (grantedPoints === 0 && grantedXp === 0) {
    const wallet = await readWallet(tx, m.userId);
    let ledgerId: string | null = null;
    if (m.idempotencyKey) {
      const row = await tx.pointsLedger.create({
        data: {
          userId: m.userId,
          delta: 0,
          xpDelta: 0,
          balanceAfter: wallet.points,
          source: m.source,
          sourceId: m.sourceId,
          idempotencyKey: m.idempotencyKey,
          status: 'posted',
          actorId: m.actorId,
          reason: m.reason,
          meta: ledgerMeta,
        },
        select: { id: true },
      });
      ledgerId = row.id;
    }
    return {
      credited: 0,
      xpCredited: 0,
      requestedPoints: m.points,
      points: wallet.points,
      xp: wallet.xp,
      level: wallet.level,
      isLevelUp: false,
      capped,
      duplicate: false,
      status: 'posted',
      ledgerId,
    };
  }

  // 5. Atomik kredi + seviye.
  const wallet = await creditPointsAndXp(tx, { userId: m.userId, points: grantedPoints, xp: grantedXp });

  // 6. Defter + görünürlük (aynı tx).
  const ledger = await tx.pointsLedger.create({
    data: {
      userId: m.userId,
      delta: grantedPoints,
      xpDelta: grantedXp,
      balanceAfter: wallet.points,
      source: m.source,
      sourceId: m.sourceId,
      idempotencyKey: m.idempotencyKey,
      status: 'posted',
      actorId: m.actorId,
      reason: m.reason,
      meta: ledgerMeta,
    },
    select: { id: true },
  });

  if (grantedPoints > 0) {
    await tx.analyticsEvent.create({
      data: {
        userId: m.userId,
        event: 'points_credited',
        // Tavan kovası ile aynı kategori: cap ve velocity sorguları bu alana bakar.
        category: m.capCategory ?? m.source,
        data: {
          ...(m.meta ?? {}),
          // Çekirdek alanlar meta'dan SONRA: meta `points`/`actorId`'yi taklit edemez.
          points: grantedPoints,
          xp: grantedXp,
          source: m.source,
          sourceId: m.sourceId,
          actorId: m.actorId,
          ledgerId: ledger.id,
          ...(capped ? { capped: true, requestedPoints: m.points } : {}),
        } as Prisma.InputJsonObject,
      },
    });
  }

  return {
    credited: grantedPoints,
    xpCredited: grantedXp,
    requestedPoints: m.points,
    points: wallet.points,
    xp: wallet.xp,
    level: wallet.level,
    isLevelUp: wallet.isLevelUp,
    capped,
    duplicate: false,
    status: 'posted',
    ledgerId: ledger.id,
  };
}

/**
 * Puan/XP basar. Bkz. dosya başı. Hatalar:
 *  - EconomyError(INVALID_INPUT | INVALID_AMOUNT | USER_NOT_FOUND | IDEMPOTENCY_CONFLICT)
 *  - Çağıranın tx'i içinde nadir bir çapraz-kullanıcı anahtar yarışında Prisma P2002
 *    fırlar ve tx geri alınır (fail-closed: çift kredi imkânsız).
 */
export async function mintPoints(db: EconomyDb, input: MintInput): Promise<MintResult> {
  const m = normalize(input);

  if (!isRootClient(db)) {
    return mintInTx(db, m);
  }

  try {
    return await db.$transaction((tx) => mintInTx(tx, m));
  } catch (e) {
    // Kilit aynı kullanıcı yarışını önler; buraya yalnız eşzamanlı ve farklı
    // bağlamdan gelen aynı anahtar düşer → ilk yazılanın sonucunu döndür.
    if (m.idempotencyKey && isUniqueViolation(e)) {
      return db.$transaction(async (tx) => {
        const existing = await tx.pointsLedger.findUnique({
          where: { idempotencyKey: m.idempotencyKey as string },
          select: { id: true, userId: true, delta: true, xpDelta: true, status: true, meta: true },
        });
        if (!existing) throw e;
        return duplicateResult(tx, existing, m.userId);
      });
    }
    throw e;
  }
}
