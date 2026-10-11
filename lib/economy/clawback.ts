/**
 * Moderasyon geri alımı (clawback) — oyunlaştırma-ekonomi Y4.
 *
 * Önceki durum: yönetici spam/sahte yorumu çöp kutusuna attığında (`deletedAt`) o yorumdan
 * basılan puan bakiyede kalıyordu. "Yorum yaz → puan al → silinse de puan kalır" döngüsü
 * moderasyonu ekonomik olarak etkisiz bırakıyordu.
 *
 * Kural:
 *  - Silme: yorumun kredi satırı (`feedback:<id>` / `consumption_review:<tüketimId>`) bulunur;
 *    o kayıttan hâlâ bakiyede duran net tutar (kredi − daha önce yapılmış "ayrıntı farkı"
 *    geri alımı) `debitPoints(source: 'reversal')` ile düşülür. Bakiye yetmezse bakiye kadar
 *    (eksi bakiye yok). Satır `meta.reversesId` ile krediye bağlıdır.
 *  - Geri yükleme: son geri alımda düşülen tutar `mintPoints(source: 'reversal')` ile iade
 *    edilir (tavansız, gölge ban kapısı kapalı — kullanıcının kendi puanının iadesi).
 *  - Tek-kez + döngü güvenliği: anahtarlar `moderation_clawback:<krediId>:<n>` ve
 *    `moderation_restore:<krediId>:<n>`; n = o kredi için şimdiye kadarki geri alım sayısı.
 *    Geri alım yalnız (geri alım sayısı == iade sayısı) iken, iade yalnız (geri alım > iade)
 *    iken yapılır → sil/geri yükle/sil döngüsü her adımda doğru net bakiyeyi verir, aynı
 *    istek tekrarlansa da çift düşüm/iade olmaz.
 *  - `reversal` kaynağı liderlik, "Benim Yılım", yönetici akış serisi ve lig sıralamasında
 *    "kazanç/harcama" sayılmaz (NON_EARNING listeleri).
 *  - Kapsam: yalnız PUAN. Krediyle birlikte verilen XP geri alınmaz (seviye düşürülmez;
 *    XP harcanabilir değer değildir). Klan gücü/savaş skoru katkısı da olduğu gibi kalır.
 *
 * Çağıran kendi transaction'ını verir; silme/geri yükleme yazımı ile aynı tx'te çalışır.
 */
import type { Prisma } from '@prisma/client';
import { debitPoints } from '@/lib/points-wallet';
import { lockUserForUpdate, mintPoints } from './mint';

type Tx = Prisma.TransactionClient;

export type ModerationItem =
  | { kind: 'feedback'; feedbackId: string }
  | { kind: 'consumption_review'; consumptionId: string };

export interface ModerationLedgerResult {
  /** İşlem yapılan kredi sayısı (atlananlar hariç). */
  affected: number;
  /** Toplam düşülen (clawback) ya da iade edilen (restore) puan. */
  points: number;
}

const CLAWBACK_PREFIX = 'moderation_clawback:';
const RESTORE_PREFIX = 'moderation_restore:';

export function creditKeyOf(item: ModerationItem): string {
  return item.kind === 'feedback' ? `feedback:${item.feedbackId}` : `consumption_review:${item.consumptionId}`;
}

/** Tüketim yorumunda metin kısaltılınca yapılan "ayrıntı farkı" geri alımının anahtarı. */
function shrinkKeyOf(item: ModerationItem): string | null {
  return item.kind === 'consumption_review' ? `consumption_review_shrink:${item.consumptionId}` : null;
}

type CreditRow = { id: string; userId: string | null; delta: number; status: string };
type CycleRow = { idempotencyKey: string | null; delta: number };

async function loadCredit(tx: Tx, item: ModerationItem): Promise<CreditRow | null> {
  const row = await tx.pointsLedger.findUnique({
    where: { idempotencyKey: creditKeyOf(item) },
    select: { id: true, userId: true, delta: true, status: true },
  });
  if (!row || !row.userId || row.status !== 'posted' || row.delta <= 0) return null;
  return row;
}

async function loadCycle(tx: Tx, creditId: string): Promise<{ clawbacks: CycleRow[]; restores: CycleRow[] }> {
  const rows = await tx.pointsLedger.findMany({
    where: {
      sourceId: creditId,
      OR: [
        { idempotencyKey: { startsWith: `${CLAWBACK_PREFIX}${creditId}:` } },
        { idempotencyKey: { startsWith: `${RESTORE_PREFIX}${creditId}:` } },
      ],
    },
    select: { idempotencyKey: true, delta: true },
  });
  return {
    clawbacks: rows.filter((r) => r.idempotencyKey?.startsWith(CLAWBACK_PREFIX)),
    restores: rows.filter((r) => r.idempotencyKey?.startsWith(RESTORE_PREFIX)),
  };
}

/** Saf: kredinin hâlâ bakiyede sayılan kısmı (kredi − ayrıntı farkı geri alımı). */
export function netCreditAfterShrink(credit: number, shrinkDelta: number | null | undefined): number {
  return Math.max(0, credit - Math.max(0, -(shrinkDelta ?? 0)));
}

/**
 * Silinen (moderasyon) yorumların puanını geri alır. Kredi satırı olmayan (puan almamış,
 * güven işaretli, eski defter öncesi) yorumlar sessizce atlanır.
 */
export async function clawBackModeratedCredits(
  tx: Tx,
  items: readonly ModerationItem[],
  ctx: { actorId: string; reason?: string }
): Promise<ModerationLedgerResult> {
  let affected = 0;
  let points = 0;
  for (const item of items) {
    const credit = await loadCredit(tx, item);
    if (!credit?.userId) continue;
    const cycle = await loadCycle(tx, credit.id);
    // Hâlâ geri alınmış durumda (önceki silme iade edilmedi) → ikinci düşüm yok.
    if (cycle.clawbacks.length > cycle.restores.length) continue;

    const shrinkKey = shrinkKeyOf(item);
    const shrink = shrinkKey
      ? await tx.pointsLedger.findUnique({ where: { idempotencyKey: shrinkKey }, select: { delta: true } })
      : null;
    const net = netCreditAfterShrink(credit.delta, shrink?.delta);
    if (net <= 0) continue;

    await lockUserForUpdate(tx, credit.userId);
    const wallet = await tx.user.findUnique({ where: { id: credit.userId }, select: { points: true } });
    const amount = Math.min(net, Math.max(0, wallet?.points ?? 0));
    const n = cycle.clawbacks.length;
    // Bakiye sıfırsa düşülecek bir şey yok (eksi bakiye yok); geri alım satırı yazılmadığı için
    // geri yüklemede de iade edilmez — net sonuç tutarlı.
    if (amount <= 0) continue;
    await debitPoints(tx, {
      userId: credit.userId,
      points: amount,
      source: 'reversal',
      sourceId: credit.id,
      idempotencyKey: `${CLAWBACK_PREFIX}${credit.id}:${n}`,
      actorId: ctx.actorId,
      reason: ctx.reason ?? 'Moderasyon: içerik kaldırıldı, puanı geri alındı',
      meta: { reversesId: credit.id, kind: 'moderation_clawback', creditKey: creditKeyOf(item), net, applied: amount },
    });
    affected++;
    points += amount;
  }
  return { affected, points };
}

/**
 * Çöp kutusundan geri yüklenen yorumların, son geri alımda düşülen puanını iade eder.
 * Geri alımı olmayan (puansız ya da hiç düşülmemiş) kayıtlar atlanır.
 */
export async function restoreModeratedCredits(
  tx: Tx,
  items: readonly ModerationItem[],
  ctx: { actorId: string; reason?: string }
): Promise<ModerationLedgerResult> {
  let affected = 0;
  let points = 0;
  for (const item of items) {
    const credit = await loadCredit(tx, item);
    if (!credit?.userId) continue;
    const cycle = await loadCycle(tx, credit.id);
    if (cycle.clawbacks.length <= cycle.restores.length) continue;
    const n = cycle.restores.length;
    const last = cycle.clawbacks.find((r) => r.idempotencyKey === `${CLAWBACK_PREFIX}${credit.id}:${n}`);
    const amount = Math.max(0, -(last?.delta ?? 0));
    if (amount <= 0) continue;
    const r = await mintPoints(tx, {
      userId: credit.userId,
      points: amount,
      source: 'reversal',
      sourceId: credit.id,
      idempotencyKey: `${RESTORE_PREFIX}${credit.id}:${n}`,
      actorId: ctx.actorId,
      reason: ctx.reason ?? 'Moderasyon: içerik geri yüklendi, puanı iade edildi',
      meta: { reversesId: credit.id, kind: 'moderation_restore', creditKey: creditKeyOf(item) },
      capCategory: null,
      fraudGate: false,
    });
    if (!r.duplicate) {
      affected++;
      points += r.credited;
    }
  }
  return { affected, points };
}
