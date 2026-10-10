/**
 * Yılım yanıt sözleşmesi — sunucu (`getYearSummary`, `GET /api/customer/my-year`) ve
 * istemci (`components/customer/m-yilim`) AYNI tipi kullanır (denetim bulgu 8: elle
 * yazılmış arayüz sessizce kayıyordu). Saf modül; yalnız zod.
 *
 * Bütün tarihler ISO 8601 metindir (JSON/Redis güvenli).
 */
import { z } from 'zod';

const iso = z.string().min(1);

export const RHYTHM_KEYS = ['morning', 'noon', 'evening', 'night'] as const;
export type RhythmKey = (typeof RHYTHM_KEYS)[number];

export const YearPlaceSchema = z.object({
  dealerId: z.string(),
  name: z.string(),
  logo: z.string().nullable(),
  category: z.string().nullable(),
  /** Fiziksel kartla kayıtlı tüketim (ziyaret) sayısı. */
  visits: z.number().int().nonnegative(),
  /** O işletmeye yazılan yorum (QR + tüketim yorumu) sayısı. */
  reviews: z.number().int().nonnegative(),
});
export type YearPlace = z.infer<typeof YearPlaceSchema>;

export const YearLeagueRefSchema = z.object({ key: z.string(), name: z.string() });
export type YearLeagueRef = z.infer<typeof YearLeagueRefSchema>;

export const YearSummarySchema = z.object({
  period: z.object({
    year: z.number().int(),
    month: z.number().int().min(1).max(12).nullable(),
    key: z.string(),
    startIso: iso,
    endIso: iso,
    /** Dönem şu anı içeriyor (yıl/ay sürüyor). */
    isCurrent: z.boolean(),
    /** Dönem bitti. */
    isClosed: z.boolean(),
    days: z.number().int().positive(),
  }),
  /** Kıyas dönemi (geçen yıl / geçen ay). */
  previous: z.object({ year: z.number().int(), month: z.number().int().nullable(), key: z.string() }),
  memberSinceIso: iso,
  availableYears: z.array(z.number().int()),
  /** Seçili yılın seçilebilir ayları (1-12). */
  availableMonths: z.array(z.number().int().min(1).max(12)),
  /** URL'deki dönem geçersizdi, varsayılana düşüldü. */
  adjusted: z.boolean(),
  generatedAtIso: iso,

  visits: z.object({
    total: z.number().int().nonnegative(),
    previousTotal: z.number().int().nonnegative(),
    /** Ziyaret ya da yorum olan İstanbul takvim günü. */
    activeDays: z.number().int().nonnegative(),
    /** Dönem içindeki en uzun ardışık aktif gün serisi. */
    longestStreak: z.number().int().nonnegative(),
    /** Etkileşim kurulan benzersiz işletme. */
    places: z.number().int().nonnegative(),
  }),
  favorites: z.array(YearPlaceSchema).max(3),

  reviews: z.object({
    total: z.number().int().nonnegative(),
    previousTotal: z.number().int().nonnegative(),
    average: z.number().nullable(),
    /** En çok verilen yıldız (eşitlikte yüksek olan). */
    mostGiven: z.number().int().min(1).max(5).nullable(),
    /** 1..5 yıldız dağılımı (indeks 0 = 1 yıldız). */
    distribution: z.array(z.number().int().nonnegative()).length(5),
  }),

  impact: z.object({
    /** Yanıt gelen yorum sayısı. */
    repliedReviews: z.number().int().nonnegative(),
    /** Yanıt gelen yorum / toplam yorum (%), yorum yoksa null. */
    replyRate: z.number().int().min(0).max(100).nullable(),
    /** Yanıt veren benzersiz işletme. */
    respondingDealers: z.number().int().nonnegative(),
    quote: z
      .object({ dealerId: z.string(), dealerName: z.string(), text: z.string(), atIso: iso.nullable() })
      .nullable(),
  }),

  badges: z.object({
    total: z.number().int().nonnegative(),
    items: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          icon: z.string().nullable(),
          rarity: z.string(),
          color: z.string().nullable(),
          earnedAtIso: iso,
        })
      )
      .max(12),
  }),

  journey: z.object({
    /** Dönemdeki lig yükselişleri (An Motoru kayıtları), eskiden yeniye. */
    leagueUps: z.array(
      z.object({ fromKey: z.string(), fromName: z.string(), toKey: z.string(), toName: z.string(), atIso: iso })
    ),
    /** Dönem başındaki lig (puan defteri dönem başını kapsıyorsa). */
    startLeague: YearLeagueRefSchema.nullable(),
    /** Dönem sonundaki lig (süren dönemde bugünkü lig). */
    endLeague: YearLeagueRefSchema.nullable(),
    /** Dönemde ulaşılan en yüksek lig. */
    peakLeague: YearLeagueRefSchema.nullable(),
    levelFrom: z.number().int().nullable(),
    levelTo: z.number().int().nullable(),
    levelUps: z.number().int().nonnegative(),
  }),

  points: z.object({
    /** Dönemde kazanılan puan (kayıtlı hareketler; escrow iadesi ve ters kayıt HARİÇ). */
    earned: z.number().int().nonnegative(),
  }),

  squads: z.object({
    battles: z.number().int().nonnegative(),
    wins: z.number().int().nonnegative(),
  }),

  activity: z.object({
    unit: z.enum(['month', 'day']),
    /** Yıl → 12 ay, ay → takvim günleri. Değer: ziyaret + yorum sayısı. */
    buckets: z.array(z.number().int().nonnegative()),
  }),

  rhythm: z.object({
    counts: z.object({
      morning: z.number().int().nonnegative(),
      noon: z.number().int().nonnegative(),
      evening: z.number().int().nonnegative(),
      night: z.number().int().nonnegative(),
    }),
    peak: z.enum(RHYTHM_KEYS).nullable(),
    /** Zirve diliminin payı (%). */
    peakShare: z.number().int().min(0).max(100).nullable(),
    /** En hareketli haftanın günü (0 = Pazartesi … 6 = Pazar). */
    peakWeekday: z.number().int().min(0).max(6).nullable(),
  }),

  /** Dönemde gösterilecek hiçbir gerçek etkinlik var mı? (boş durum kararı) */
  hasActivity: z.boolean(),
});

export type YearSummary = z.infer<typeof YearSummarySchema>;

/** API sorgu şeması (`?year=2026&month=3`). Sınırlama sunucuda `resolvePeriod` ile. */
export const YearQuerySchema = z.object({
  year: z.string().regex(/^\d{4}$/, 'Yıl dört haneli olmalı').optional(),
  month: z.string().regex(/^(?:[1-9]|1[0-2]|0[1-9])$/, 'Ay 1-12 olmalı').optional(),
});
