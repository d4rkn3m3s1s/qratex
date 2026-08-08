/**
 * Rozet izlenebilirlik sınıflandırması. KRİTİK: EXACT_TYPES + APPROXIMATE_TYPES,
 * surprise-badges.ts counterFor eşlemesiyle SENKRON kalmalı — drift = admin panelinde
 * yanlış "tam/yaklaşık/ölü rozet" etiketi. Bu testler o senkronu ve sınıflandırmayı korur.
 */
import {
  EXACT_TYPES,
  APPROXIMATE_TYPES,
  trackabilityOf,
  trackabilityLabel,
  REQUIREMENT_TYPE_OPTIONS,
} from '@/lib/badge-trackability';

describe('trackabilityOf', () => {
  it('gerçek sayaç tipleri → exact', () => {
    for (const t of ['feedback_count', 'five_star_count', 'night_feedback', 'leaderboard_top', 'points']) {
      expect(trackabilityOf(t)).toBe('exact');
    }
  });

  it('proxy tipleri → approximate', () => {
    for (const t of ['detailed_feedback_count', 'funny_feedback', 'liked_feedback', 'milestone_reached']) {
      expect(trackabilityOf(t)).toBe('approximate');
    }
  });

  it('bilinmeyen/custom/null → untrackable (ölü rozet)', () => {
    expect(trackabilityOf('custom')).toBe('untrackable');
    expect(trackabilityOf('rastgele_tip')).toBe('untrackable');
    expect(trackabilityOf(null)).toBe('untrackable');
    expect(trackabilityOf(undefined)).toBe('untrackable');
  });
});

describe('EXACT ve APPROXIMATE kümeleri çakışmaz', () => {
  it('bir tip iki kümede birden olamaz', () => {
    for (const t of EXACT_TYPES) expect(APPROXIMATE_TYPES.has(t)).toBe(false);
    for (const t of APPROXIMATE_TYPES) expect(EXACT_TYPES.has(t)).toBe(false);
  });
});

describe('REQUIREMENT_TYPE_OPTIONS tutarlılığı', () => {
  it('her seçeneğin trackability etiketi kümelerle uyumlu', () => {
    for (const o of REQUIREMENT_TYPE_OPTIONS) {
      expect(trackabilityOf(o.value)).toBe(o.trackability);
    }
  });

  it('seçenek değerleri benzersiz', () => {
    const vals = REQUIREMENT_TYPE_OPTIONS.map((o) => o.value);
    expect(new Set(vals).size).toBe(vals.length);
  });
});

describe('trackabilityLabel', () => {
  it('her sınıf için etiket + renk döndürür', () => {
    expect(trackabilityLabel('exact').tone).toBe('green');
    expect(trackabilityLabel('approximate').tone).toBe('amber');
    expect(trackabilityLabel('untrackable').tone).toBe('red');
    expect(trackabilityLabel('character').tone).toBe('violet');
  });
});
