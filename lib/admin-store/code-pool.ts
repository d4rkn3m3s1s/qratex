/**
 * Partner kupon KOD HAVUZU — `Reward.metadata` içinde (şema değişikliği yok):
 *   { codePoolEnabled: true, codePool: string[] }   // dağıtılmamış kodlar, ilk giren ilk çıkar
 *
 * Değişmezler:
 *  - Havuz açıkken stok = havuzdaki kod sayısı (admin kod ekleyip çıkarınca senkronlanır;
 *    talep stoku ve havuzu AYNI tx'te birer düşürür).
 *  - Kodlar istemciye yalnız admin ucundan gider; müşteri GET'lerinde `stripPrivateMetadata`.
 *  - `takePoolCode` talep tx'inde, stok koşullu `updateMany` satırı kilitledikten SONRA çağrılır:
 *    iki eşzamanlı talep aynı kodu alamaz.
 */
import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export type PoolState = { enabled: boolean; codes: string[] };

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function readPool(metadata: unknown): PoolState {
  const m = asRecord(metadata);
  const enabled = m.codePoolEnabled === true;
  const codes = Array.isArray(m.codePool) ? m.codePool.filter((c): c is string => typeof c === 'string' && c.length > 0) : [];
  return { enabled, codes };
}

export function writePool(metadata: unknown, pool: PoolState): Record<string, unknown> {
  const m = { ...asRecord(metadata) };
  if (!pool.enabled) {
    delete m.codePool;
    delete m.codePoolEnabled;
    return m;
  }
  m.codePoolEnabled = true;
  m.codePool = pool.codes;
  return m;
}

/** Müşteriye/genel GET'e gidecek metadata: havuz kodları ÇIKARILIR. */
export function stripPrivateMetadata<T extends { metadata?: unknown }>(row: T): T {
  if (!row || row.metadata === undefined || row.metadata === null) return row;
  const m = { ...asRecord(row.metadata) };
  if (!('codePool' in m) && !('codePoolEnabled' in m)) return row;
  delete m.codePool;
  delete m.codePoolEnabled;
  return { ...row, metadata: m };
}

/** Admin metadata yazarken havuz anahtarlarını korur (genel PATCH havuzu ezmesin). */
export function preservePool(nextMetadata: unknown, prevMetadata: unknown): Record<string, unknown> {
  const pool = readPool(prevMetadata);
  const base = { ...asRecord(nextMetadata) };
  delete base.codePool;
  delete base.codePoolEnabled;
  return writePool(base, pool);
}

/**
 * Talep tx'inde havuzdan bir kod al. Havuz kapalıysa `{ code: null }` (çağıran kendi kodunu
 * üretir). Havuz açık ama boşsa `{ exhausted: true }` → çağıran "stok tükendi" atar.
 */
export async function takePoolCode(tx: Tx, rewardId: string): Promise<{ code: string | null; exhausted: boolean }> {
  const row = await tx.reward.findUnique({ where: { id: rewardId }, select: { metadata: true } });
  const pool = readPool(row?.metadata);
  if (!pool.enabled) return { code: null, exhausted: false };
  const [code, ...rest] = pool.codes;
  if (!code) return { code: null, exhausted: true };
  await tx.reward.update({
    where: { id: rewardId },
    data: { metadata: writePool(row?.metadata, { enabled: true, codes: rest }) as Prisma.InputJsonValue },
  });
  return { code, exhausted: false };
}
