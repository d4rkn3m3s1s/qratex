/**
 * EKONOMİ MUTABAKATI — gece kontrolü (veri modeli B3, "mutabakat işi").
 *
 * Neden: `User.points` değiştirilebilir bir bakiye; tek kaynak doğruluk `PointsLedger`. Bütün
 * bakiye değişimleri `lib/points-wallet.ts` (mintPoints → creditPointsAndXp / debitPoints)
 * üzerinden geçer ve her biri aynı transaction'da `balanceAfter` taşıyan bir defter satırı yazar.
 * Defter DIŞI bir yazım (ham SQL, elle DB düzeltmesi, gelecekte yazılacak hatalı bir yol) bugün
 * sessizce kalırdı. Bu iş onu görünür kılar; HİÇBİR ŞEYİ DÜZELTMEZ (yalnız SecurityAlert).
 *
 * Kontroller:
 *  1. Defter sapması: son 8 günde defter hareketi olan ve son 10 dakikadır sessiz kullanıcılarda
 *     güncel bakiye, son hareket kümesinin (son satır ±60 sn — eşzamanlı işlemlerin createdAt
 *     sırası kesin olmayabilir) hiçbir `balanceAfter` değerine eşit değilse → sapma.
 *     Defter öncesi (eski) bakiyeler yanlış alarm üretmez: `balanceAfter` mutlak bakiyedir.
 *  2. Bağış ilerlemesi: `DonationProject.current` ≠ `SUM(Donation.points)` → sapma
 *     (yönetici panelindeki "Uzlaştır" eylemiyle düzeltilir).
 *  3. Kupon sayacı: `Coupon.usedCount` < kullanım satırı sayısı → sayaç artmadan kullanım yazılmış.
 *     (Ters yön — sayaç fazla — CouponRedemption öncesi eski kullanımlar yüzünden normaldir.)
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type ReconcileDb = Pick<typeof prisma, '$queryRaw' | 'securityAlert'>;

export const RECONCILE_LOOKBACK_DAYS = 8;
export const RECONCILE_QUIET_MINUTES = 10;
const SAMPLE_LIMIT = 50;

export interface LedgerDrift {
  userId: string;
  points: number;
  ledgerBalance: number | null;
  lastAt: Date;
}
export interface DonationDrift {
  projectId: string;
  name: string;
  current: number;
  total: number;
}
export interface CouponDrift {
  couponId: string;
  code: string;
  usedCount: number;
  redemptions: number;
}

export interface ReconcileResult {
  ledgerDrift: LedgerDrift[];
  donationDrift: DonationDrift[];
  couponDrift: CouponDrift[];
  alerts: number;
}

const num = (v: unknown): number => (typeof v === 'bigint' ? Number(v) : Number(v ?? 0));

export async function findLedgerDrift(db: ReconcileDb, now: Date = new Date()): Promise<LedgerDrift[]> {
  const since = new Date(now.getTime() - RECONCILE_LOOKBACK_DAYS * 86_400_000);
  const quietCutoff = new Date(now.getTime() - RECONCILE_QUIET_MINUTES * 60_000);
  const rows = await db.$queryRaw<Array<{ userId: string; points: number; ledgerBalance: number | null; lastAt: Date }>>(Prisma.sql`
    WITH recent AS (
      SELECT "userId", MAX("createdAt") AS last_at
      FROM "PointsLedger"
      WHERE "userId" IS NOT NULL AND "balanceAfter" IS NOT NULL AND "currency" = 'POINTS'
        AND "createdAt" >= ${since}
      GROUP BY "userId"
      HAVING MAX("createdAt") < ${quietCutoff}
    )
    SELECT r."userId" AS "userId", u."points" AS "points", r.last_at AS "lastAt",
      (SELECT p."balanceAfter" FROM "PointsLedger" p
        WHERE p."userId" = r."userId" AND p."balanceAfter" IS NOT NULL
        ORDER BY p."createdAt" DESC, p."id" DESC LIMIT 1) AS "ledgerBalance"
    FROM recent r
    JOIN "User" u ON u."id" = r."userId"
    WHERE NOT EXISTS (
      SELECT 1 FROM "PointsLedger" p
      WHERE p."userId" = r."userId"
        AND p."balanceAfter" = u."points"
        AND p."createdAt" >= r.last_at - interval '60 seconds'
    )
    ORDER BY r.last_at DESC
    LIMIT ${SAMPLE_LIMIT}
  `);
  return rows.map((r) => ({
    userId: r.userId,
    points: num(r.points),
    ledgerBalance: r.ledgerBalance == null ? null : num(r.ledgerBalance),
    lastAt: r.lastAt,
  }));
}

export async function findDonationDrift(db: ReconcileDb): Promise<DonationDrift[]> {
  const rows = await db.$queryRaw<Array<{ projectId: string; name: string; current: number; total: bigint }>>(Prisma.sql`
    SELECT p."id" AS "projectId", p."name" AS "name", p."current" AS "current",
           COALESCE(SUM(d."points"), 0)::bigint AS "total"
    FROM "DonationProject" p
    LEFT JOIN "Donation" d ON d."projectId" = p."id"
    GROUP BY p."id", p."name", p."current"
    HAVING p."current" <> COALESCE(SUM(d."points"), 0)
    LIMIT ${SAMPLE_LIMIT}
  `);
  return rows.map((r) => ({ projectId: r.projectId, name: r.name, current: num(r.current), total: num(r.total) }));
}

export async function findCouponDrift(db: ReconcileDb): Promise<CouponDrift[]> {
  const rows = await db.$queryRaw<Array<{ couponId: string; code: string; usedCount: number; redemptions: bigint }>>(Prisma.sql`
    SELECT c."id" AS "couponId", c."code" AS "code", c."usedCount" AS "usedCount", COUNT(r."id")::bigint AS "redemptions"
    FROM "Coupon" c
    JOIN "CouponRedemption" r ON r."couponId" = c."id"
    GROUP BY c."id", c."code", c."usedCount"
    HAVING c."usedCount" < COUNT(r."id")
    LIMIT ${SAMPLE_LIMIT}
  `);
  return rows.map((r) => ({ couponId: r.couponId, code: r.code, usedCount: num(r.usedCount), redemptions: num(r.redemptions) }));
}

/** Üç kontrolü çalıştırır; sapma varsa tür başına TEK SecurityAlert yazar (örneklem metadata'da). */
export async function runEconomyReconcile(db: ReconcileDb = prisma, now: Date = new Date()): Promise<ReconcileResult> {
  const [ledgerDrift, donationDrift, couponDrift] = await Promise.all([
    findLedgerDrift(db, now),
    findDonationDrift(db),
    findCouponDrift(db),
  ]);

  let alerts = 0;
  if (ledgerDrift.length) {
    await db.securityAlert.create({
      data: {
        type: 'ECONOMY_LEDGER_DRIFT',
        severity: 'ERROR',
        targetType: 'USER',
        targetId: ledgerDrift[0].userId,
        message: `${ledgerDrift.length}${ledgerDrift.length >= SAMPLE_LIMIT ? '+' : ''} kullanıcının puan bakiyesi defterle uyuşmuyor (defter dışı bakiye değişimi).`,
        metadata: {
          checkedAt: now.toISOString(),
          sample: ledgerDrift.map((d) => ({ ...d, lastAt: d.lastAt.toISOString() })),
        } as Prisma.InputJsonObject,
      },
    });
    alerts++;
  }
  if (donationDrift.length) {
    await db.securityAlert.create({
      data: {
        type: 'ECONOMY_DONATION_DRIFT',
        severity: 'WARNING',
        targetType: 'DONATION_PROJECT',
        targetId: donationDrift[0].projectId,
        message: `${donationDrift.length} bağış kampanyasının ilerlemesi gerçek bağış toplamıyla uyuşmuyor (Bağışlar → Uzlaştır).`,
        metadata: { checkedAt: now.toISOString(), sample: donationDrift } as unknown as Prisma.InputJsonObject,
      },
    });
    alerts++;
  }
  if (couponDrift.length) {
    await db.securityAlert.create({
      data: {
        type: 'ECONOMY_COUPON_DRIFT',
        severity: 'WARNING',
        targetType: 'COUPON',
        targetId: couponDrift[0].couponId,
        message: `${couponDrift.length} kuponda kullanım sayacı kullanım kayıtlarının gerisinde (sayaçsız kullanım).`,
        metadata: { checkedAt: now.toISOString(), sample: couponDrift } as unknown as Prisma.InputJsonObject,
      },
    });
    alerts++;
  }
  return { ledgerDrift, donationDrift, couponDrift, alerts };
}
