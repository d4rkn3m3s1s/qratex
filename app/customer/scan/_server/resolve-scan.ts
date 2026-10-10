/**
 * Uygulama içi tarama çözümü (BFF: POST /api/customer/scan/resolve).
 *
 * Eski akış (B-3, B-7): sayfa `/api/qr-codes/public/:code`'u çağırıp sonra geri bildirim
 * sayfası aynı ucu TEKRAR çağırıyordu → her taramada iki `qr_scanned` olayı, iki hız limiti
 * hakkı, gereksiz aktif personel listesi; tüm hatalar "bulunamadı" görünüyordu.
 *
 * Bu çözümleyici:
 *  - `qr_scanned` YAZMAZ (o olay geri bildirim sayfası açılınca bir kez yazılır), personel
 *    listesi çekmez; yalnız durum + mekân kimliği döner.
 *  - Durumu makine-okur kodla verir (`ok | inactive | expired | revoked | archived | not_found`).
 *  - `/c/<token>` ve düz kart token'ını da tanır (kart aktivasyonu buradan başlar).
 *  - Kart sahibinin kimliğini asla döndürmez (yalnız "senin / başkasının" bilgisi).
 */
import { prisma } from '@/lib/prisma';
import { parseQrPayload, qrCodeCandidates, CARD_TOKEN_PATTERN, type QrTarget } from '@/lib/qr-resolve';
import type { CardState, ScanResolution, VenueStatus } from '@/components/customer/m-tara/scan-types';

const QR_SELECT = {
  id: true,
  code: true,
  name: true,
  isActive: true,
  expiresAt: true,
  revokedAt: true,
  archivedAt: true,
  dealerId: true,
  location: { select: { name: true } },
  dealer: { select: { name: true, businessName: true, businessLogo: true } },
} as const;

type QrRow = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  expiresAt: Date | null;
  revokedAt: Date | null;
  archivedAt: Date | null;
  dealerId: string;
  location: { name: string } | null;
  dealer: { name: string | null; businessName: string | null; businessLogo: string | null } | null;
};

/** Public QR ucu ve /api/feedbacks ile aynı kontrol sırası. */
export function venueStatusOf(qr: Pick<QrRow, 'isActive' | 'expiresAt' | 'revokedAt' | 'archivedAt'>, now: Date): Exclude<VenueStatus, 'not_found'> {
  if (qr.archivedAt) return 'archived';
  if (!qr.isActive) return 'inactive';
  if (qr.expiresAt && now > qr.expiresAt) return 'expired';
  if (qr.revokedAt) return 'revoked';
  return 'ok';
}

async function findQr(candidates: readonly string[]): Promise<QrRow | null> {
  for (const code of candidates) {
    const row = (await prisma.qRCode.findUnique({ where: { code }, select: QR_SELECT })) as QrRow | null;
    if (row) return row;
  }
  return null;
}

async function venueResolution(userId: string, qr: QrRow, now: Date): Promise<ScanResolution> {
  const status = venueStatusOf(qr, now);
  if (status !== 'ok') return { kind: 'venue', status, code: qr.code };

  const last = await prisma.feedback.findFirst({
    where: { userId, qrCode: { dealerId: qr.dealerId } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  const name = qr.dealer?.businessName?.trim() || qr.dealer?.name?.trim() || qr.name;
  return {
    kind: 'venue',
    status: 'ok',
    code: qr.code,
    venue: {
      name,
      logoUrl: qr.dealer?.businessLogo || null,
      placeLabel: qr.location?.name ?? (qr.name && qr.name !== name ? qr.name : null),
      lastVisitAt: last ? last.createdAt.toISOString() : null,
    },
  };
}

export function cardStateOf(
  card: { status: string; customerId: string | null; archivedAt: Date | null } | null,
  userId: string
): CardState {
  if (!card || card.archivedAt) return 'not_found';
  if (card.status === 'BLOCKED') return 'blocked';
  if (card.customerId && card.customerId === userId) return 'mine';
  if (card.customerId || card.status === 'ACTIVATED') return 'taken';
  return 'unused';
}

async function cardResolution(userId: string, token: string): Promise<ScanResolution | null> {
  if (!CARD_TOKEN_PATTERN.test(token)) return null;
  const card = await prisma.physicalCard.findUnique({
    where: { token },
    select: { status: true, customerId: true, archivedAt: true },
  });
  if (!card) return null;
  const state = cardStateOf(card, userId);
  let hasOtherCard = false;
  if (state === 'unused') {
    const other = await prisma.physicalCard.findFirst({
      where: { customerId: userId, status: 'ACTIVATED', archivedAt: null },
      select: { id: true },
    });
    hasOtherCard = !!other;
  }
  return { kind: 'card', state, token, hasOtherCard };
}

/** Okunan metni bu müşteri için çözer. DB'ye yalnız okur. */
export async function resolveScanForCustomer(
  userId: string,
  text: string,
  now: Date = new Date()
): Promise<{ target: QrTarget; result: ScanResolution }> {
  const target = parseQrPayload(text);

  switch (target.kind) {
    case 'unknown':
      return { target, result: { kind: 'unknown' } };

    case 'feedback': {
      const qr = await findQr(qrCodeCandidates(target.code));
      return {
        target,
        result: qr ? await venueResolution(userId, qr, now) : { kind: 'venue', status: 'not_found', code: target.code },
      };
    }

    case 'card': {
      const card = await cardResolution(userId, target.token);
      return { target, result: card ?? { kind: 'card', state: 'not_found', token: target.token, hasOtherCard: false } };
    }

    case 'plain': {
      // Düz kod: önce QR (masadaki kodun altındaki yazı), sonra kart token'ı.
      const qr = await findQr(qrCodeCandidates(target.value));
      if (qr) return { target, result: await venueResolution(userId, qr, now) };
      const card = await cardResolution(userId, target.value);
      if (card) return { target, result: card };
      return { target, result: { kind: 'venue', status: 'not_found', code: target.value } };
    }
  }
}

/** Huni olayı için kısa durum etiketi. */
export function resolutionOutcome(result: ScanResolution): string {
  if (result.kind === 'venue') return `venue:${result.status}`;
  if (result.kind === 'card') return `card:${result.state}`;
  return 'unknown';
}
