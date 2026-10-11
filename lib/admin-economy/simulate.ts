/**
 * Ekonomi simülasyonu — SAF (Prisma yok, Jest ile test edilir).
 *
 * Yöntem: gerçek PointsLedger gözlemi (kaynak başına dönemde basılan puan) × taslak/kayıtlı
 * birim ödül oranı. Davranış (olay sayısı) sabit varsayılır; VIP ve sezonsal kampanya
 * çarpanları oransal olduğu için oran içinde sadeleşir. Tavanlar (lib/economy/caps) artışı
 * kısabilir — bu yüzden ARTIŞ yönündeki projeksiyon bir ÜST SINIRDIR (varsayımlarda yazılır).
 * Matrisin etkilemediği kaynaklar (oyun, rozet, bayi pasif…) gözlendiği gibi taşınır.
 */
import type { PointsMatrix } from '@/lib/points-rules';
import {
  sourceLabel,
  type EconomyFlow,
  type Multipliers,
  type SimSourceRow,
  type SimulationResult,
} from './contract';

const avg = (a: number, b: number) => (a + b) / 2;

/** Çarkın çevirme başına beklenen PUAN değeri (ağırlıklı). */
export function spinExpectedPoints(spin: PointsMatrix['spin']): number {
  if (!spin.enabled || spin.prizes.length === 0) return 0;
  const total = spin.prizes.reduce((s, p) => s + Math.max(0, p.weight), 0);
  if (total <= 0) return 0;
  return spin.prizes.reduce((s, p) => (p.type === 'points' ? s + (p.value * Math.max(0, p.weight)) / total : s), 0);
}

/** Çarkın çevirme başına beklenen XP değeri. */
export function spinExpectedXp(spin: PointsMatrix['spin']): number {
  if (!spin.enabled || spin.prizes.length === 0) return 0;
  const total = spin.prizes.reduce((s, p) => s + Math.max(0, p.weight), 0);
  if (total <= 0) return 0;
  return spin.prizes.reduce((s, p) => (p.type === 'xp' ? s + (p.value * Math.max(0, p.weight)) / total : s), 0);
}

type Unit = { unit: (m: PointsMatrix, mult: Multipliers) => number; basis: string };

/** Matrisin (ve çarpanın) belirlediği kaynaklar → birim ödül fonksiyonu. */
export const MODELED_SOURCES: Record<string, Unit> = {
  feedback: {
    unit: (m, mult) => avg(m.feedback.base.points, m.feedback.detailed.points) * mult.pointMultiplier,
    basis: 'temel/detaylı ödül ortalaması × platform puan çarpanı',
  },
  review: {
    unit: (m) => avg(m.consumptionReview.base.points, m.consumptionReview.detailed.points),
    basis: 'tüketim yorumu temel/detaylı ödül ortalaması',
  },
  spin: {
    unit: (m) => spinExpectedPoints(m.spin) * m.spin.dailyLimit,
    basis: 'çevirme başına beklenen puan × günlük limit (limit tam kullanılır varsayımı)',
  },
  birthday: { unit: (m) => m.birthday.points, basis: 'doğum günü bonusu' },
  referral: {
    unit: (m) => m.referral.referredPoints + m.referral.referrerPoints,
    basis: 'kodu giren + kod sahibi puanı',
  },
  streak: {
    unit: (m) => m.streak.milestones.reduce((s, x) => s + x.points, 0),
    basis: 'kilometre taşı bonusları toplamı (taşlar arası dağılım değişmez varsayımı)',
  },
};

const round = (n: number) => Math.round(n);

export function simulateEconomy(input: {
  flow: Pick<EconomyFlow, 'days' | 'bySource' | 'spent'>;
  saved: { matrix: PointsMatrix; multipliers: Multipliers };
  draft: { matrix: PointsMatrix; multipliers: Multipliers };
  now?: Date;
}): SimulationResult {
  const { flow, saved, draft } = input;
  const rows: SimSourceRow[] = [];
  const unscalable: string[] = [];

  for (const row of flow.bySource) {
    if (row.kind !== 'mint') continue;
    const model = MODELED_SOURCES[row.source];
    if (!model) {
      rows.push({
        source: row.source,
        label: row.label,
        observed: row.points,
        projected: row.points,
        factor: 1,
        basis: 'matris dışı kaynak — gözlendiği gibi',
        modeled: false,
      });
      continue;
    }
    const before = model.unit(saved.matrix, saved.multipliers);
    const after = model.unit(draft.matrix, draft.multipliers);
    let factor: number | null;
    if (before > 0) factor = after / before;
    else if (after === 0) factor = 1;
    else {
      factor = null;
      unscalable.push(row.label);
    }
    rows.push({
      source: row.source,
      label: row.label,
      observed: row.points,
      projected: factor === null ? row.points : round(row.points * factor),
      factor,
      basis: model.basis,
      modeled: true,
    });
  }

  // Gözlemi olmayan ama taslakta değişen modelli kaynakları da göster (0 → ? uyarısı için).
  for (const source of Object.keys(MODELED_SOURCES)) {
    if (rows.some((r) => r.source === source)) continue;
    const model = MODELED_SOURCES[source];
    const before = model.unit(saved.matrix, saved.multipliers);
    const after = model.unit(draft.matrix, draft.multipliers);
    if (before === after) continue;
    rows.push({
      source,
      label: sourceLabel(source),
      observed: 0,
      projected: 0,
      factor: before > 0 ? after / before : null,
      basis: model.basis,
      modeled: true,
    });
    if (before <= 0) unscalable.push(sourceLabel(source));
  }

  rows.sort((a, b) => b.projected - a.projected || b.observed - a.observed);
  const observedMint = rows.reduce((s, r) => s + r.observed, 0);
  const projectedMint = rows.reduce((s, r) => s + r.projected, 0);
  const observedNet = observedMint - flow.spent;
  const projectedNet = projectedMint - flow.spent;

  const assumptions = [
    `Son ${flow.days} günün gerçek defter kayıtları taban alınır; olay sayıları (kaç geri bildirim, kaç çevirme…) değişmez varsayılır.`,
    'VIP ve sezonsal kampanya çarpanları oransaldır; oran içinde sadeleşir.',
    'Geri bildirim/oyun tavanları artışı kısabilir: artış yönündeki projeksiyon bir üst sınırdır.',
    'Harcama tarafı gözlendiği gibi taşınır (ödül kataloğu değişmedi varsayımı).',
    'Görev varsayılan ödülü yalnız ödülü tanımsız görevlerde kullanılır; görev kaynağı ölçeklenmez.',
    'Kapsam: lib/economy (mintPoints/debitPoints) üzerinden geçen yollar. Defter dışı eski yollar bu tabloda yoktur.',
  ];
  if (unscalable.length > 0) {
    assumptions.push(`Kayıtlı ödülü 0 olan kaynaklar ölçeklenemez (gözlem yok): ${unscalable.join(', ')}.`);
  }

  return {
    days: flow.days,
    observedMint,
    projectedMint,
    observedSpend: flow.spent,
    observedNet,
    projectedNet,
    deltaPct: observedMint > 0 ? ((projectedMint - observedMint) / observedMint) * 100 : null,
    rows,
    assumptions,
    asOf: (input.now ?? new Date()).toISOString(),
  };
}
