/**
 * Anonim deneyim kartı — HERKESE AÇIK okuma ve görüntülenme sayımı (`/experience/[token]`).
 *
 * Denetim (docs/audit/2026-10-08/musteri/experience_token.md) kapanışları:
 *  - B1 (keyfi metin): kart artık yalnız sunucu şablonlu not (lib/venue-detail/share.ts) taşır.
 *    ESKİ serbest metinli kayıtlar da burada şablona uymuyorsa GÖSTERİLMEZ → Qratex alan
 *    adında kullanıcı üretimi keyfi metin yayınlanamaz.
 *  - B2/B4: okuma sunucu bileşeninde; sonuç `ok | expired | not_found | disabled | unavailable`
 *    olarak ayrışır (ham JSON hatası istemciye sızmaz; geçici sorun "tekrar dene" ekranıdır).
 *  - B5: okuma YAN ETKİSİZ. Sayım ayrı POST ucunda, IP+UA özetiyle 24 saatte bir kez ve
 *    paylaşanın kendi açışı hariç (`recordExperienceView`).
 *  - B8: modül (`experiences`) kapalıysa kart gösterilmez.
 *  - B10: işletme adı yoksa bayinin KİŞİSEL adı yerine genel etiket (null → arayüz "İşletme").
 *
 * Kişisel veri: paylaşanın kimliği (creatorId) hiçbir DTO'ya girmez; yalnız `isOwner` bayrağı
 * (görüntüleyen = paylaşan) hesaplanır.
 */
import { createHash } from 'crypto';
import { prisma, isPrismaConnectivityError } from '@/lib/prisma';
import { getModuleControls } from '@/lib/module-gate';
import { cachedJson } from '@/lib/redis';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { categoryFromBusinessCategory, type PlaceCategory } from '@/lib/places/categories';
import { computeOpenState, parseBusinessHours, PLACES_TIME_ZONE, type OpenState } from '@/lib/places/business-hours';
import { SHARE_CAPTION_TR } from '@/lib/venue-detail/share';
import { SHARE_CAPTION_KEYS, SHARE_MOODS, type ShareCaptionKey, type ShareMood } from '@/lib/venue-detail/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** `randomBytes(18).toString('base64url')` → 24 karakter; eski/ileri biçimler için pay. */
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

export function isPlausibleShareToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_RE.test(token);
}

/** Mekân geneli sosyal kanıt: anlamlı olması için en az bu kadar geri bildirim. */
export const VENUE_STATS_MIN_SAMPLE = 5;
export const VENUE_STATS_WINDOW_DAYS = 30;
/** Tekil görüntüleme penceresi (aynı cihaz 24 saatte bir kez sayılır). */
export const VIEW_DEDUPE_WINDOW_MS = DAY_MS;

export type ParsedShareCaption = { key: ShareCaptionKey; rating: number };

const CAPTION_BY_TEXT = new Map<string, ShareCaptionKey>(
  SHARE_CAPTION_KEYS.map((key) => [SHARE_CAPTION_TR[key], key] as const)
);

/**
 * Kayıtlı notu şablon anahtarına + puana çözer. Biçim `buildShareCaption` ile aynıdır:
 * `"<şablon> · N/5"`. Şablona uymayan (eski serbest metin) not `null` → GÖSTERİLMEZ.
 */
export function parseShareCaption(caption: string | null | undefined): ParsedShareCaption | null {
  if (!caption) return null;
  const match = /^(.*) · ([1-5])\/5$/.exec(caption.trim());
  if (!match) return null;
  const key = CAPTION_BY_TEXT.get(match[1]);
  if (!key) return null;
  return { key, rating: Number(match[2]) };
}

export function normalizeMood(mood: string | null | undefined): ShareMood {
  return (SHARE_MOODS as readonly string[]).includes(mood ?? '') ? (mood as ShareMood) : 'good';
}

/** Google Haritalar yol tarifi bağlantısı (koordinat varsa onunla, yoksa adresle). */
export function directionsUrl(input: {
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  name: string | null;
}): string | null {
  const { latitude, longitude } = input;
  if (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    !(latitude === 0 && longitude === 0)
  ) {
    return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
  }
  const address = input.address?.trim();
  if (!address) return null;
  const q = input.name ? `${input.name}, ${address}` : address;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q.slice(0, 300))}`;
}

export type PublicVenue = {
  id: string;
  /** `businessName`; boşsa `null` (arayüz genel "İşletme" etiketi gösterir — kişisel ad sızmaz). */
  name: string | null;
  logo: string | null;
  category: PlaceCategory | null;
};

export type VenueStats = { feedbackCount: number; avgRating: number; windowDays: number };

export type PublicExperienceCard = {
  token: string;
  venue: PublicVenue & {
    address: string | null;
    directionsUrl: string | null;
    openState: OpenState | null;
  };
  caption: ParsedShareCaption | null;
  mood: ShareMood;
  createdAt: string;
  expiresAt: string;
  /** Kalan tam gün (en az 0). */
  daysLeft: number;
  /** Yalnız paylaşanın kendisine gösterilir. */
  viewCount: number;
  stats: VenueStats | null;
};

export type PublicExperienceResult =
  | { status: 'ok'; card: PublicExperienceCard; isOwner: boolean }
  | { status: 'expired'; venue: PublicVenue | null }
  | { status: 'not_found' }
  | { status: 'disabled' }
  | { status: 'unavailable' };

async function experiencesEnabled(): Promise<boolean> {
  try {
    const modules = await getModuleControls();
    return modules.experiences !== false;
  } catch {
    return true; // getModuleControls zaten fail-safe; ayar okunamazsa varsayılan (açık)
  }
}

/** Mekân geneli toplu, anonim istatistik (son 30 gün QR geri bildirimi). Redis 10 dk. */
async function loadVenueStats(dealerId: string, now: Date): Promise<VenueStats | null> {
  try {
    return await cachedJson<VenueStats | { none: true }>(`exp-share:venue-stats:${dealerId}`, 600, async () => {
      const since = new Date(now.getTime() - VENUE_STATS_WINDOW_DAYS * DAY_MS);
      const agg = await prisma.feedback.aggregate({
        where: { deletedAt: null, createdAt: { gte: since }, qrCode: { dealerId } },
        _count: { _all: true },
        _avg: { rating: true },
      });
      const count = agg._count._all;
      const avg = agg._avg.rating;
      if (count < VENUE_STATS_MIN_SAMPLE || avg == null) return { none: true };
      return { feedbackCount: count, avgRating: Math.round(avg * 10) / 10, windowDays: VENUE_STATS_WINDOW_DAYS };
    }).then((v) => ('none' in v ? null : v));
  } catch {
    return null; // sosyal kanıt yardımcı bilgidir; okunamazsa kart yine açılır
  }
}

/**
 * Kartı okur. YAZMAZ (sayaç ayrı). `viewerId` yalnız `isOwner` hesabı için kullanılır.
 */
export async function getPublicExperience(
  token: string,
  opts: { viewerId?: string | null; now?: Date; withStats?: boolean } = {}
): Promise<PublicExperienceResult> {
  if (!isPlausibleShareToken(token)) return { status: 'not_found' };
  const now = opts.now ?? new Date();
  try {
    if (!(await experiencesEnabled())) return { status: 'disabled' };

    const row = await prisma.experienceShareToken.findUnique({
      where: { token },
      select: {
        token: true,
        creatorId: true,
        caption: true,
        mood: true,
        viewCount: true,
        createdAt: true,
        expiresAt: true,
        dealer: {
          select: {
            id: true,
            role: true,
            businessName: true,
            businessLogo: true,
            businessCategory: true,
            address: true,
            latitude: true,
            longitude: true,
            businessHours: true,
            holidayMode: true,
            suspendedAt: true,
            anonymizedAt: true,
          },
        },
      },
    });
    if (!row) return { status: 'not_found' };

    const d = row.dealer;
    const venueActive = d && d.role === 'DEALER' && !d.suspendedAt && !d.anonymizedAt;
    const venue: PublicVenue | null = venueActive
      ? {
          id: d.id,
          name: d.businessName?.trim() || null,
          logo: d.businessLogo || null,
          category: categoryFromBusinessCategory(d.businessCategory),
        }
      : null;

    if (row.expiresAt.getTime() <= now.getTime()) return { status: 'expired', venue };
    if (!venue) return { status: 'not_found' };

    const stats = opts.withStats === false ? null : await loadVenueStats(d.id, now);
    const address = d.address?.trim() || null;
    const card: PublicExperienceCard = {
      token: row.token,
      venue: {
        ...venue,
        address,
        directionsUrl: directionsUrl({ latitude: d.latitude, longitude: d.longitude, address, name: venue.name }),
        openState: computeOpenState(parseBusinessHours(d.businessHours), d.holidayMode === true, now, PLACES_TIME_ZONE),
      },
      caption: parseShareCaption(row.caption),
      mood: normalizeMood(row.mood),
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      daysLeft: Math.max(0, Math.floor((row.expiresAt.getTime() - now.getTime()) / DAY_MS)),
      viewCount: row.viewCount,
      stats,
    };
    return { status: 'ok', card, isOwner: Boolean(opts.viewerId && opts.viewerId === row.creatorId) };
  } catch (error) {
    if (!isPrismaConnectivityError(error)) console.error('[experience-share] okuma hatası', error);
    return { status: 'unavailable' };
  }
}

/** Cihaz özeti: ham IP saklanmaz; IP+UA SHA-256'nın ilk 24 hanesi. */
export function viewerFingerprint(ip: string | null, userAgent: string | null): string {
  return createHash('sha256')
    .update(`${ip ?? 'unknown'}|${(userAgent ?? '').slice(0, 200)}`)
    .digest('hex')
    .slice(0, 24);
}

export type RecordViewResult = { counted: boolean; reason?: 'owner' | 'duplicate' | 'expired' | 'not_found' };

/**
 * Tekil görüntülenmeyi sayar: paylaşanın kendisi sayılmaz, aynı cihaz 24 saatte bir kez,
 * süresi dolmuş kart sayılmaz. Artış atomik (`increment`).
 */
export async function recordExperienceView(
  token: string,
  input: { viewerId: string | null; ip: string | null; userAgent: string | null; now?: Date }
): Promise<RecordViewResult> {
  if (!isPlausibleShareToken(token)) return { counted: false, reason: 'not_found' };
  const now = input.now ?? new Date();
  const row = await prisma.experienceShareToken.findUnique({
    where: { token },
    select: { id: true, creatorId: true, expiresAt: true },
  });
  if (!row) return { counted: false, reason: 'not_found' };
  if (row.expiresAt.getTime() <= now.getTime()) return { counted: false, reason: 'expired' };
  if (input.viewerId && input.viewerId === row.creatorId) return { counted: false, reason: 'owner' };

  const fp = input.viewerId ? `u:${input.viewerId}` : `d:${viewerFingerprint(input.ip, input.userAgent)}`;
  const first = await checkRateLimitDb(`exp-view:${row.id}:${fp}`, 1, VIEW_DEDUPE_WINDOW_MS);
  if (!first.ok) return { counted: false, reason: 'duplicate' };

  const updated = await prisma.experienceShareToken.updateMany({
    where: { id: row.id, expiresAt: { gt: now } },
    data: { viewCount: { increment: 1 } },
  });
  return updated.count > 0 ? { counted: true } : { counted: false, reason: 'expired' };
}

/**
 * Paylaşımı durdur (yalnız paylaşan). Şema `revokedAt` taşımadığı için kayıt SİLİNMEZ;
 * `expiresAt` şimdiye çekilir → bağlantı "süresi doldu" ekranına düşer, mekân detayındaki
 * "aktif bağlantılar" listesinden de çıkar (arşiv ilkesi: cascade/silme yok).
 */
export async function revokeExperienceShare(token: string, userId: string, now: Date = new Date()): Promise<boolean> {
  if (!isPlausibleShareToken(token)) return false;
  const res = await prisma.experienceShareToken.updateMany({
    where: { token, creatorId: userId, expiresAt: { gt: now } },
    data: { expiresAt: now },
  });
  return res.count > 0;
}
