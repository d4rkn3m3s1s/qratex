/**
 * İkinci yönetici onayı (dört göz) — sahtelenemez onay belirteci.
 *
 * Neden: onaylayan kimliği istemciden (`secondApproverId`) alınırsa tek bir admin
 * herhangi bir başka adminin id'sini yazıp eşik üstü düzeltmeyi tek başına yapabilir.
 *
 * Akış:
 *   1. İkinci admin KENDİ oturumuyla `POST /api/admin/economy/adjust-approvals` çağırır
 *      (userId, delta, xp). Sunucu onaylayanı oturumdan alır ve bu fonksiyonla
 *      HMAC imzalı, 15 dk geçerli, tek kullanımlık bir belirteç üretir.
 *   2. Talep eden admin düzeltmeyi bu belirteçle gönderir. `adjustPointsByAdmin`
 *      imzayı, süreyi, kullanıcı/miktar eşleşmesini, onaylayanın talep edenden ve hedef
 *      kullanıcıdan farklı olduğunu doğrular; onaylayanın ADMIN rolü tx içinde DB'den okunur.
 *   3. Tek kullanım: düzeltmenin defter idempotency anahtarı `admin-approval:<nonce>`
 *      olur (PointsLedger.idempotencyKey @unique). Aynı belirteç ikinci kez kredi üretmez.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { EconomyError } from './errors';

export const ADJUST_APPROVAL_TTL_MS = 15 * 60_000;
const VERSION = 'v1';

export interface AdjustApprovalClaims {
  approverId: string;
  /**
   * Onayın verildiği talep eden admin. Varsa yalnız o admin kullanabilir (onay başka bir
   * admine devredilemez). Eski (alan öncesi) belirteçlerde yok; 15 dk TTL ile kendiliğinden biter.
   */
  requesterId?: string;
  userId: string;
  delta: number;
  xp: number;
  exp: number;
  nonce: string;
}

function secret(): string {
  const s = process.env.ECONOMY_APPROVAL_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s || s.length < 16) {
    throw new EconomyError('INVALID_INPUT', 'Onay imza anahtarı yapılandırılmamış.');
  }
  return s;
}

function sign(body: string): string {
  return createHmac('sha256', secret()).update(`${VERSION}.${body}`).digest('base64url');
}

export function issueAdjustApproval(input: {
  approverId: string;
  /** Talep eden admin; verilirse belirteç yalnız onun düzeltmesinde geçerlidir. */
  requesterId?: string;
  userId: string;
  delta: number;
  xp?: number;
  now?: Date;
}): { token: string; expiresAt: Date } {
  const now = (input.now ?? new Date()).getTime();
  const claims: AdjustApprovalClaims = {
    approverId: input.approverId,
    ...(input.requesterId ? { requesterId: input.requesterId } : {}),
    userId: input.userId,
    delta: input.delta,
    xp: input.xp ?? 0,
    exp: now + ADJUST_APPROVAL_TTL_MS,
    nonce: randomBytes(16).toString('base64url'),
  };
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return { token: `${VERSION}.${body}.${sign(body)}`, expiresAt: new Date(claims.exp) };
}

/** Belirteci doğrular ve talep edilen işlemle birebir eşleştiğini kontrol eder. */
export function verifyAdjustApproval(
  token: string,
  expected: { requesterId: string; userId: string; delta: number; xp: number; now?: Date }
): AdjustApprovalClaims {
  const fail = (msg: string) => new EconomyError('SECOND_APPROVAL_REQUIRED', msg);
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3 || parts[0] !== VERSION) throw fail('Onay belirteci geçersiz.');
  const [, body, mac] = parts;
  const want = Buffer.from(sign(body));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) throw fail('Onay belirteci geçersiz.');

  let c: AdjustApprovalClaims;
  try {
    c = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as AdjustApprovalClaims;
  } catch {
    throw fail('Onay belirteci geçersiz.');
  }
  const now = (expected.now ?? new Date()).getTime();
  if (typeof c.exp !== 'number' || c.exp < now) throw fail('Onayın süresi dolmuş; yeniden onay alın.');
  if (c.userId !== expected.userId || c.delta !== expected.delta || (c.xp ?? 0) !== expected.xp) {
    throw fail('Onay bu kullanıcı ve miktar için verilmemiş.');
  }
  if (!c.approverId || c.approverId === expected.requesterId || c.approverId === expected.userId) {
    throw fail('İkinci onay farklı bir yöneticiden gelmeli.');
  }
  if (c.requesterId !== undefined && c.requesterId !== expected.requesterId) {
    throw fail('Bu onay başka bir yöneticinin talebi için verilmiş.');
  }
  if (typeof c.nonce !== 'string' || c.nonce.length < 16) throw fail('Onay belirteci geçersiz.');
  return c;
}
