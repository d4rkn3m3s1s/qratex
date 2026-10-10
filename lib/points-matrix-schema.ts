/**
 * Puan matrisi (Settings `points_matrix`) sunucu şeması + alan bazlı üst sınırlar (P0-21).
 *
 * Önceden PUT gövdesi `matrix: z.unknown()` idi ve `normalizePointsMatrix` yalnız alt sınır
 * uyguluyordu: tek yanlış tuş (referral 100.000.000, çarka fazladan sıfır) doğrudan para
 * benzeri değer basıyor ya da `Int` taşmasıyla kayıt/referans/çark akışlarını 500'e düşürüyordu.
 *
 * `POINTS_MATRIX_LIMITS` TEK kaynaktır: yazmada bu şema (400 + Türkçe alan mesajı), okumada
 * `normalizePointsMatrix` aynı tavanlara kırpar (canlıdaki eski değerler için savunma derinliği).
 * Saf modül (Prisma yok) — istemci formu da aynı sınırları içe aktarabilir.
 */
import { z } from 'zod';

export const POINTS_MATRIX_LIMITS = {
  /** Geri bildirim / tüketim yorumu "detaylı" eşiği (karakter). */
  longTextThreshold: { min: 1, max: 2000 },
  /** Geri bildirim ve tüketim yorumu ödülü (puan ve XP ayrı ayrı). */
  reviewReward: { max: 1000 },
  /** Davet: kodu giren ve kod sahibi. */
  referral: { max: 20_000 },
  /** Doğum günü bonusu. */
  birthday: { max: 10_000 },
  /** Seri kilometre taşı: gün 2–3650 (1. gün her sıfırlamada tekrar kazanılırdı), puan ≤ 50.000. */
  streakDays: { min: 2, max: 3650 },
  streakPoints: { max: 50_000 },
  streakMilestones: { min: 1, max: 30 },
  /** Görev varsayılan ödülü. */
  questReward: { max: 5_000 },
  /** Günlük çark. */
  spinDailyLimit: { min: 1, max: 10 },
  spinPrizeValue: { max: 1_000 },
  spinPrizeWeight: { min: 1, max: 1_000 },
  spinPrizes: { min: 1, max: 20 },
  spinLabel: { max: 60 },
} as const;

const L = POINTS_MATRIX_LIMITS;
const SPIN_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function intField(label: string, min: number, max: number) {
  return z
    .number({ required_error: `${label} gerekli`, invalid_type_error: `${label} sayı olmalı` })
    .finite(`${label} sayı olmalı`)
    .int(`${label} tam sayı olmalı`)
    .min(min, `${label} en az ${min.toLocaleString('tr-TR')} olmalı`)
    .max(max, `${label} en fazla ${max.toLocaleString('tr-TR')} olabilir`);
}

function section<T extends z.ZodRawShape>(label: string, shape: T) {
  return z.object(shape, {
    required_error: `${label} bölümü gerekli`,
    invalid_type_error: `${label} bölümü nesne olmalı`,
  });
}

function rewardGrant(label: string, max: number) {
  return section(label, {
    points: intField(`${label} puanı`, 0, max),
    xp: intField(`${label} XP'si`, 0, max),
  });
}

function reviewSection(label: string) {
  return section(label, {
    longTextThreshold: intField(`${label} detay eşiği`, L.longTextThreshold.min, L.longTextThreshold.max),
    base: rewardGrant(`${label} temel`, L.reviewReward.max),
    detailed: rewardGrant(`${label} detaylı`, L.reviewReward.max),
  });
}

export const spinPrizeSchema = z
  .object({
    id: z
      .string({ required_error: 'Çark ödül kimliği gerekli' })
      .trim()
      .regex(SPIN_ID_RE, 'Çark ödül kimliği yalnız harf, rakam, _ ve - içerebilir (en fazla 64)'),
    label: z
      .string({ required_error: 'Çark ödül etiketi gerekli' })
      .trim()
      .min(1, 'Çark ödül etiketi gerekli')
      .max(L.spinLabel.max, `Çark ödül etiketi en fazla ${L.spinLabel.max} karakter olabilir`),
    type: z.enum(['points', 'xp', 'nothing'], {
      errorMap: () => ({ message: 'Çark ödül tipi puan, XP ya da boş olmalı' }),
    }),
    value: intField('Çark ödül değeri', 0, L.spinPrizeValue.max),
    weight: intField('Çark ödül ağırlığı', L.spinPrizeWeight.min, L.spinPrizeWeight.max),
  })
  .superRefine((p, ctx) => {
    if (p.type !== 'nothing' && p.value <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Puan/XP ödülünün değeri 0 olamaz' });
    }
  });

export const pointsMatrixSchema = z
  .object({
    feedback: reviewSection('Geri bildirim'),
    consumptionReview: reviewSection('Tüketim yorumu'),
    referral: section('Davet', {
      referredPoints: intField('Kodu giren kullanıcının puanı', 0, L.referral.max),
      referrerPoints: intField('Kod sahibinin puanı', 0, L.referral.max),
    }),
    birthday: section('Doğum günü', { points: intField('Doğum günü puanı', 0, L.birthday.max) }),
    streak: section('Seri', {
      milestones: z
        .array(
          section('Seri kilometre taşı', {
            days: intField('Seri günü', L.streakDays.min, L.streakDays.max),
            points: intField('Seri bonusu', 0, L.streakPoints.max),
          }),
          { required_error: 'Seri kilometre taşları gerekli', invalid_type_error: 'Seri kilometre taşları liste olmalı' }
        )
        .min(L.streakMilestones.min, 'En az bir seri kilometre taşı gerekli')
        .max(L.streakMilestones.max, `En fazla ${L.streakMilestones.max} seri kilometre taşı olabilir`),
    }),
    quest: section('Görev', { default: rewardGrant('Görev varsayılan', L.questReward.max) }),
    spin: section('Çark', {
      enabled: z.boolean({ required_error: 'Çark durumu gerekli', invalid_type_error: 'Çark durumu açık/kapalı olmalı' }),
      dailyLimit: intField('Günlük çevirme limiti', L.spinDailyLimit.min, L.spinDailyLimit.max),
      prizes: z
        .array(spinPrizeSchema, { required_error: 'Çark ödülleri gerekli', invalid_type_error: 'Çark ödülleri liste olmalı' })
        .min(L.spinPrizes.min, 'En az bir çark ödülü gerekli')
        .max(L.spinPrizes.max, `En fazla ${L.spinPrizes.max} çark ödülü olabilir`),
    }),
  }, { required_error: 'Puan matrisi gerekli', invalid_type_error: 'Puan matrisi nesne olmalı' })
  .superRefine((m, ctx) => {
    const days = m.streak.milestones.map((x) => x.days);
    if (new Set(days).size !== days.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['streak', 'milestones'],
        message: 'Aynı seri günü birden fazla kez tanımlanamaz',
      });
    }
    const ids = m.spin.prizes.map((p) => p.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['spin', 'prizes'],
        message: 'Çark ödül kimlikleri benzersiz olmalı',
      });
    }
  });

export type ValidatedPointsMatrix = z.infer<typeof pointsMatrixSchema>;

/** Okuma tarafı kırpması: sonlu değilse `fallback`, aksi hâlde [min, max] tam sayı. */
export function clampMatrixInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}
