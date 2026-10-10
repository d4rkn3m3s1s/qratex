/**
 * QR geri bildirim sayfasının sunucu verisi (ilk HTML'de; istemci isteği yok).
 *
 * Eski sayfa tamamen istemcideydi: HTML → JS → `GET /api/qr-codes/public/[code]` → render
 * şelalesi; logo, açıklama ve segment karşılama metni hiç gösterilmiyordu; personelin TAM
 * adı herkese açık JSON'daydı (KVKK). Şimdi tek sorgu, yalnız gereken alanlar, personelde
 * yalnız ilk ad. Okuma YAN ETKİSİZDİR (tarama olayı ayrı uçtan, tekilleştirilerek yazılır).
 *
 * Public sayfa kuralı: DB erişilemezse fırlatmaz, `unavailable` döner (sayfa yeniden dene
 * durumunu gösterir).
 */
import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { qrCodeCandidates } from '@/lib/qr-resolve';

export type VenueStatus = 'ok' | 'not_found' | 'inactive' | 'expired' | 'revoked' | 'archived' | 'unavailable';

export type VenueStaff = { id: string; firstName: string; image: string | null };

export type FeedbackVenue = {
  qrCodeId: string;
  code: string;
  dealerId: string;
  /** İşletme adı (businessName → name → QR adı). */
  businessName: string;
  logoUrl: string | null;
  /** Masa/nokta adı (QR adı) — işletme adıyla aynıysa null. */
  spotName: string | null;
  /** Şube adı. */
  locationName: string | null;
  description: string | null;
  /** `segmentConfig[segment].welcomeText` (bayi ayarı). */
  welcomeText: string | null;
  staff: VenueStaff[];
};

export type VenueLookup = { status: Exclude<VenueStatus, 'ok'>; venue: null } | { status: 'ok'; venue: FeedbackVenue };

type QrRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  expiresAt: Date | null;
  revokedAt: Date | null;
  archivedAt: Date | null;
  segmentConfig: unknown;
  dealerId: string;
  location: { name: string } | null;
  dealer: {
    name: string | null;
    businessName: string | null;
    businessLogo: string | null;
    staffMembers: { id: string; user: { name: string | null; image: string | null } }[];
  } | null;
};

/** Public QR ucu, tara çözümleyicisi ve gönderim ile aynı kontrol sırası. */
export function qrStatusOf(
  qr: { isActive: boolean; expiresAt: Date | null; revokedAt: Date | null; archivedAt: Date | null },
  now: Date
): Exclude<VenueStatus, 'not_found' | 'unavailable'> {
  if (qr.archivedAt) return 'archived';
  if (!qr.isActive) return 'inactive';
  if (qr.expiresAt && now > qr.expiresAt) return 'expired';
  if (qr.revokedAt) return 'revoked';
  return 'ok';
}

export function firstName(full: string | null | undefined): string | null {
  const first = (full ?? '').trim().split(/\s+/)[0];
  return first ? first.slice(0, 24) : null;
}

export function welcomeTextFor(segmentConfig: unknown, segment: string | null | undefined): string | null {
  if (!segment || !segmentConfig || typeof segmentConfig !== 'object' || Array.isArray(segmentConfig)) return null;
  const entry = (segmentConfig as Record<string, unknown>)[segment];
  if (!entry || typeof entry !== 'object') return null;
  const text = (entry as { welcomeText?: unknown }).welcomeText;
  return typeof text === 'string' && text.trim() ? text.trim().slice(0, 280) : null;
}

const SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  isActive: true,
  expiresAt: true,
  revokedAt: true,
  archivedAt: true,
  segmentConfig: true,
  dealerId: true,
  location: { select: { name: true } },
  dealer: {
    select: {
      name: true,
      businessName: true,
      businessLogo: true,
      staffMembers: {
        where: { isActive: true },
        orderBy: { createdAt: 'asc' as const },
        take: 12,
        select: { id: true, user: { select: { name: true, image: true } } },
      },
    },
  },
} as const;

export function toVenue(row: QrRow, segment: string | null | undefined): FeedbackVenue {
  const businessName = row.dealer?.businessName?.trim() || row.dealer?.name?.trim() || row.name;
  const staff: VenueStaff[] = [];
  for (const s of row.dealer?.staffMembers ?? []) {
    const name = firstName(s.user?.name);
    if (name) staff.push({ id: s.id, firstName: name, image: s.user?.image || null });
  }
  return {
    qrCodeId: row.id,
    code: row.code,
    dealerId: row.dealerId,
    businessName,
    logoUrl: row.dealer?.businessLogo || null,
    spotName: row.name && row.name.trim() !== businessName ? row.name.trim() : null,
    locationName: row.location?.name ?? null,
    description: row.description?.trim() || null,
    welcomeText: welcomeTextFor(row.segmentConfig, segment),
    staff,
  };
}

async function loadVenueImpl(code: string, segment: string | null, now: Date): Promise<VenueLookup> {
  const candidates = qrCodeCandidates(code);
  if (candidates.length === 0) return { status: 'not_found', venue: null };
  try {
    let row: QrRow | null = null;
    for (const c of candidates) {
      row = (await prisma.qRCode.findUnique({ where: { code: c }, select: SELECT })) as QrRow | null;
      if (row) break;
    }
    if (!row) return { status: 'not_found', venue: null };
    const status = qrStatusOf(row, now);
    if (status !== 'ok') return { status, venue: null };
    return { status: 'ok', venue: toVenue(row, segment) };
  } catch (err) {
    console.error('[feedback-funnel] mekân okunamadı', err);
    return { status: 'unavailable', venue: null };
  }
}

/** Aynı RSC isteğinde (generateMetadata + sayfa) tek sorgu. */
export const loadFeedbackVenue = cache((code: string, segment: string | null) => loadVenueImpl(code, segment, new Date()));

/**
 * Görüntüleyen bu işletmenin sahibi ya da personeli mi (çıkar çatışması — rapor Bulgu 5).
 * Pasif personel kaydı da sayılır (işletmeyle bağı olan kişi tarafsız müşteri değildir).
 */
export async function isVenueInsider(userId: string, dealerId: string): Promise<boolean> {
  if (userId === dealerId) return true;
  const staff = await prisma.dealerStaff.findFirst({ where: { userId, dealerId }, select: { id: true } });
  return !!staff;
}
