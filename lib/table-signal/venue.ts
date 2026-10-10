/**
 * Masa sinyali girişinin çözümü (sunucu): hangi işletme, hangi QR, özellik açık mı?
 *
 * Giriş biçimleri:
 *  - Yeni (önerilen): `/table-signal?qr=<QRCode.code>&table=M7` — işletme QR'ın kendisinden
 *    çözülür; QR yaşam döngüsü (pasif/süresi dolmuş/iptal/arşiv) denetlenir, bayinin ham
 *    kullanıcı kimliği URL'de dolaşmaz.
 *  - Eski (geriye uyumlu): `/table-signal?dealerId=<id>[&qrCodeId=<id>]` — bayi panelindeki
 *    mevcut bağlantılar kırılmasın diye çalışır; `qrCodeId` verilirse aynı yaşam döngüsü uygulanır.
 *
 * Sayfa (ilk render) ve POST ucu AYNI çözücüyü kullanır: misafir formu doldurup ancak
 * gönderince "özellik kapalı / işletme yok" öğrenmez (rapor bulgu 8, envanter #5/#19).
 */
import { prisma } from '@/lib/prisma';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
import { getModuleControls } from '@/lib/module-gate';
import { qrCodeCandidates } from '@/lib/qr-resolve';

export interface SignalEntry {
  qr?: string | null;
  dealerId?: string | null;
  qrCodeId?: string | null;
}

export interface SignalVenue {
  name: string;
  logoUrl: string | null;
  placeLabel: string | null;
}

export type VenueResolution =
  | {
      status: 'ok';
      dealerId: string;
      qrCodeId: string | null;
      /** Geri bildirim köprüsü için QR kodu (yalnız aktif QR). */
      qrCode: string | null;
      venue: SignalVenue;
      /** Vaka kuyruğu (Gelen Kutusu › Vakalar) açık mı → misafire durum takibi sunulur. */
      casesEnabled: boolean;
    }
  | { status: 'missing' | 'not_found' | 'qr_inactive' | 'disabled' };

const ID_RE = /^[A-Za-z0-9_-]{1,191}$/;

type QrRow = {
  id: string;
  code: string;
  name: string;
  dealerId: string;
  isActive: boolean;
  expiresAt: Date | null;
  revokedAt: Date | null;
  archivedAt: Date | null;
  location: { name: string } | null;
};

type DealerRow = {
  id: string;
  name: string | null;
  businessName: string | null;
  businessLogo: string | null;
};

const QR_SELECT = {
  id: true,
  code: true,
  name: true,
  dealerId: true,
  isActive: true,
  expiresAt: true,
  revokedAt: true,
  archivedAt: true,
  location: { select: { name: true } },
} as const;

const DEALER_SELECT = { id: true, name: true, businessName: true, businessLogo: true } as const;

/** QR kullanılabilir mi? (customer/scan çözücüsü ve /api/feedbacks ile aynı sıra) */
export function isQrUsable(qr: Pick<QrRow, 'isActive' | 'expiresAt' | 'revokedAt' | 'archivedAt'>, now: Date): boolean {
  if (qr.archivedAt) return false;
  if (!qr.isActive) return false;
  if (qr.expiresAt && now > qr.expiresAt) return false;
  if (qr.revokedAt) return false;
  return true;
}

function venueOf(dealer: DealerRow, qr: QrRow | null): SignalVenue {
  const name = dealer.businessName?.trim() || dealer.name?.trim() || qr?.name || 'İşletme';
  const placeLabel = qr?.location?.name ?? (qr?.name && qr.name !== name ? qr.name : null);
  return { name, logoUrl: dealer.businessLogo || null, placeLabel };
}

async function findDealer(id: string): Promise<DealerRow | null> {
  return (await prisma.user.findFirst({
    where: { id, role: 'DEALER', suspendedAt: null, anonymizedAt: null },
    select: DEALER_SELECT,
  })) as DealerRow | null;
}

async function casesEnabled(): Promise<boolean> {
  try {
    const controls = (await getModuleControls()) as Record<string, unknown>;
    return controls.incidents !== false;
  } catch {
    return true;
  }
}

export async function resolveSignalVenue(entry: SignalEntry, now: Date = new Date()): Promise<VenueResolution> {
  const qrParam = entry.qr?.trim() || null;
  const dealerParam = entry.dealerId?.trim() || null;
  const qrIdParam = entry.qrCodeId?.trim() || null;
  if (!qrParam && !dealerParam) return { status: 'missing' };

  const cfg = await getInnovationPlatformConfig();
  if (!cfg.features.tablePulse) return { status: 'disabled' };

  let qr: QrRow | null = null;
  let dealerId: string;

  if (qrParam) {
    const candidates = qrCodeCandidates(qrParam);
    for (const code of candidates) {
      qr = (await prisma.qRCode.findUnique({ where: { code }, select: QR_SELECT })) as QrRow | null;
      if (qr) break;
    }
    if (!qr) return { status: 'not_found' };
    dealerId = qr.dealerId;
  } else {
    if (!dealerParam || !ID_RE.test(dealerParam)) return { status: 'not_found' };
    dealerId = dealerParam;
    if (qrIdParam) {
      if (!ID_RE.test(qrIdParam)) return { status: 'not_found' };
      qr = (await prisma.qRCode.findFirst({ where: { id: qrIdParam, dealerId }, select: QR_SELECT })) as QrRow | null;
      if (!qr) return { status: 'not_found' };
    }
  }

  if (qr && !isQrUsable(qr, now)) return { status: 'qr_inactive' };

  const dealer = await findDealer(dealerId);
  if (!dealer) return { status: 'not_found' };

  return {
    status: 'ok',
    dealerId,
    qrCodeId: qr?.id ?? null,
    qrCode: qr?.code ?? null,
    venue: venueOf(dealer, qr),
    casesEnabled: await casesEnabled(),
  };
}
