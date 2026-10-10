/**
 * Bayi "Bugün" saf hesapları (lib/dealer-today/core.ts) — denetim bulgularının regresyonları:
 *  - dealer.md B3/B5/B8: ortalama ağırlıklı, veri yoksa null (0★ değil), tek pencere.
 *  - copilot B10/B11: "0,0 / 5" yok; olumsuz = ≤2 (3★ nötr).
 *  - onboarding B3/B4/B5: plan adımı yok; konum şubeyle de tamamlanır; profil açıklama ister.
 *  - copilot B2/B13: öneriler yinelenmez, takipteki öneri tekrar önerilmez.
 *  - Zaman: İstanbul takvimi (UTC 21:00 sonrası ertesi gün).
 */
import {
  buildMetrics,
  buildNextActions,
  buildSetup,
  buildThemes,
  buildWeeklyMetrics,
  excerpt,
  feedbackHref,
  fillDaily,
  greetingFor,
  isWeekKey,
  latestCompletedWeek,
  maxSeverity,
  normalizeText,
  pct,
  pctChange,
  pickSuggestions,
  todayWindows,
  weekStartOf,
  weightedAvg,
  type ActionSignals,
} from '@/lib/dealer-today/core';
import { buildRedirectHref } from '@/lib/dealer-today/legacy-redirect';
import { buildNarrativePrompt, sanitizeNarrative } from '@/lib/dealer-today/narrative';
import type { WeeklyReport } from '@/lib/dealer-today/types';

jest.mock('@/lib/redis', () => ({ redisGetJson: jest.fn(), redisSetJson: jest.fn() }));
jest.mock('@/lib/module-gate', () => ({ getModuleControls: jest.fn(async () => ({})) }));
jest.mock('@/lib/ai-engine', () => ({ isAIConfigured: () => true, runChatCompletion: jest.fn() }));
jest.mock('@/lib/ai-policy', () => ({ isDealerAiEnabled: jest.fn(async () => true) }));

describe('zaman (İstanbul)', () => {
  it('UTC 21:30 İstanbul’da ertesi gündür; 7 günlük pencere bugünü içerir', () => {
    const now = new Date('2026-10-09T21:30:00Z'); // İstanbul 10 Ekim 00:30
    const w = todayWindows(now);
    expect(w.today).toBe('2026-10-10');
    expect(w.days7).toEqual(['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10']);
    expect(w.todayStart.toISOString()).toBe('2026-10-09T21:00:00.000Z');
    expect(w.sameTimeYesterday.toISOString()).toBe('2026-10-08T21:30:00.000Z');
    expect(greetingFor(now)).toBe('night');
  });

  it('hafta Pazartesi başlar; son tamamlanan hafta bir önceki Pazartesi', () => {
    expect(weekStartOf('2026-10-10')).toBe('2026-10-05'); // Cumartesi → Pazartesi
    expect(weekStartOf('2026-10-05')).toBe('2026-10-05');
    expect(weekStartOf('2026-10-11')).toBe('2026-10-05'); // Pazar
    expect(latestCompletedWeek(new Date('2026-10-10T09:00:00Z'))).toBe('2026-09-28');
    expect(isWeekKey('2026-10-05')).toBe(true);
    expect(isWeekKey('2026-10-06')).toBe(false);
    expect(isWeekKey('bozuk')).toBe(false);
  });
});

describe('metrik sözlüğü', () => {
  it('ağırlıklı ortalama ve yüzde; veri yoksa null', () => {
    expect(weightedAvg(0, 0)).toBeNull();
    expect(weightedAvg(23, 5)).toBe(4.6);
    expect(pct(0, 0)).toBeNull();
    expect(pct(1, 3)).toBe(33.3);
    expect(pctChange(5, 0)).toBeNull();
    expect(pctChange(12, 10)).toBe(20);
  });

  it('boş günler 0★ değil null; seri bugünle biter', () => {
    const daily = fillDaily(['2026-10-09', '2026-10-10'], [{ day: '2026-10-10', n: 1, sum: 5 }], [{ day: '2026-10-09', n: 3 }]);
    expect(daily).toEqual([
      { day: '2026-10-09', feedback: 0, consumptions: 3, avgRating: null },
      { day: '2026-10-10', feedback: 1, consumptions: 0, avgRating: 5 },
    ]);
  });

  it('tek 5★ + boş günler → ortalama 5 (eski hata: 0,7/5); veri yoksa "—"', () => {
    const daily = fillDaily(['a', 'b', 'c'], [{ day: 'c', n: 1, sum: 5 }], []);
    const m = buildMetrics({
      feedbackToday: 1,
      feedbackYesterdaySameTime: 3,
      consumptionsToday: 0,
      consumptionsYesterdaySameTime: 0,
      cur7: { n: 1, sum: 5, replied: 1 },
      prev7: { n: 0, sum: 0, replied: 0 },
      medianFirstResponseSec: 3600,
      daily,
      asOf: 'x',
    });
    expect(m.avgRating7d.value).toBe(5);
    expect(m.avgRating7d.delta).toBeNull(); // önceki dönem yok → uydurma delta yok
    expect(m.avgRating7d.series).toEqual([null, null, 5]);
    expect(m.feedbackToday.delta).toMatchObject({ value: -2, kind: 'absolute' });
    expect(m.responseRate7d.value).toBe(100);

    const none = buildMetrics({
      feedbackToday: 0,
      feedbackYesterdaySameTime: 0,
      consumptionsToday: 0,
      consumptionsYesterdaySameTime: 0,
      cur7: { n: 0, sum: 0, replied: 0 },
      prev7: { n: 0, sum: 0, replied: 0 },
      medianFirstResponseSec: null,
      daily: [],
      asOf: 'x',
    });
    expect(none.avgRating7d.value).toBeNull();
    expect(none.responseRate7d.value).toBeNull();
  });

  it('haftalık: olumsuz oranı düşerse iyi yön "down"', () => {
    const m = buildWeeklyMetrics(
      { n: 10, sum: 40, negative: 1, replied: 5, consumptions: 30 },
      { n: 8, sum: 28, negative: 4, replied: 2, consumptions: 0 },
      'x'
    );
    expect(m.feedback.delta).toMatchObject({ value: 25, kind: 'percent' });
    expect(m.avgRating.value).toBe(4);
    expect(m.avgRating.delta).toMatchObject({ value: 0.5 });
    expect(m.negativeRate.value).toBe(10);
    expect(m.negativeRate.delta).toMatchObject({ value: -40, kind: 'points', goodDirection: 'down' });
    expect(m.consumptions.delta).toBeNull(); // önceki 0 → sonsuz yüzde gösterilmez
  });
});

describe('kurulum kartı', () => {
  const base = {
    businessName: 'Kafe',
    businessDesc: 'Şirin bir kafe',
    hasUserLocation: false,
    activeLocations: 0,
    hasQr: true,
    hasFeedback: true,
    hasProduct: false,
  };

  it('konum şube (DealerLocation) ile de tamamlanır; zorunlular bitince kart görünmez', () => {
    expect(buildSetup(base).visible).toBe(true);
    const s = buildSetup({ ...base, activeLocations: 1 });
    expect(s.visible).toBe(false);
    expect(s.required).toEqual({ done: 4, total: 4 });
    // önerilen ürün adımı kartı tek başına açık tutmaz; plan adımı hiç yok
    expect(s.steps.map((x) => x.key)).toEqual(['profile', 'location', 'qr', 'firstFeedback', 'product']);
  });

  it('profil açıklama da ister; sıradaki adım ilk eksik zorunlu', () => {
    const s = buildSetup({ ...base, businessDesc: '  ', hasUserLocation: true });
    expect(s.steps.find((x) => x.key === 'profile')?.done).toBe(false);
    expect(s.nextKey).toBe('profile');
    expect(s.required.done).toBe(3);
  });
});

describe('sıradaki adımlar', () => {
  const quiet: ActionSignals = {
    remedyAwaiting: 0,
    remedyOldestAwaitingHours: null,
    unansweredNegative: 0,
    unansweredNegativeOldestHours: null,
    unansweredRecent: 0,
    openIncidents: 0,
    incidentMaxSeverity: null,
    overdueTodos: 0,
    avgRating7d: 4.5,
    avgRatingPrev7d: 4.5,
    n7d: 20,
    nPrev7d: 20,
    weakQr: null,
    hasQr: true,
    feedback7d: 20,
  };

  it('sakin günde boş liste ("her şey yolunda")', () => {
    expect(buildNextActions(quiet)).toEqual([]);
  });

  it('24 saati aşan olumsuz yanıt kritik ve en üstte; önem sırası korunur', () => {
    const list = buildNextActions({
      ...quiet,
      unansweredRecent: 4,
      remedyAwaiting: 2,
      remedyOldestAwaitingHours: 5,
      unansweredNegative: 3,
      unansweredNegativeOldestHours: 30,
      openIncidents: 1,
      incidentMaxSeverity: 'low',
    });
    expect(list.map((a) => a.kind)).toEqual(['unanswered_negative', 'remedy_approval', 'open_incidents', 'unanswered_recent']);
    expect(list[0]).toMatchObject({ severity: 'critical', count: 3, params: { oldestHours: 30 } });
    expect(list[1].href).toBe('/dealer/inbox/remedy');
    expect(list[0].href).toBe('/dealer/inbox?sentiment=negative&range=30&sort=oldest');
  });

  it('puan düşüşü yalnız yeterli örneklemde; zayıf QR eşiği', () => {
    expect(buildNextActions({ ...quiet, avgRating7d: 4.0, avgRatingPrev7d: 4.5 }).map((a) => a.kind)).toEqual(['rating_drop']);
    expect(buildNextActions({ ...quiet, avgRating7d: 3.0, avgRatingPrev7d: 4.5, n7d: 2 })).toEqual([]);
    expect(buildNextActions({ ...quiet, weakQr: { name: 'Teras', avg: 2.8, n: 6 } })[0]).toMatchObject({ kind: 'weak_qr', params: { name: 'Teras' } });
    expect(buildNextActions({ ...quiet, weakQr: { name: 'Teras', avg: 3.9, n: 6 } })).toEqual([]);
  });

  it('QR var ama 7 günde geri bildirim yok → sessiz hafta', () => {
    expect(buildNextActions({ ...quiet, feedback7d: 0, n7d: 0 }).map((a) => a.kind)).toEqual(['quiet_week']);
    expect(buildNextActions({ ...quiet, feedback7d: 0, n7d: 0, hasQr: false })).toEqual([]);
  });

  it('en yüksek olay önemi', () => {
    expect(maxSeverity(['low', 'HIGH', 'medium', null, 'bilinmeyen'])).toBe('high');
    expect(maxSeverity([])).toBeNull();
  });
});

describe('AI önerileri', () => {
  it('yinelenenler ve takiptekiler elenir; öncelik → düşük puan sırası', () => {
    const rows = [
      { id: 'f1', rating: 4, createdAt: '2026-10-09T10:00:00Z', actionSuggestions: [{ action: 'Garson eğitimi verin', priority: 'medium' }] },
      { id: 'f2', rating: 1, createdAt: '2026-10-08T10:00:00Z', actionSuggestions: [{ action: 'Garson eğitimi verin!', priority: 'high' }, { action: 'Bekleme süresini kısaltın', priority: 'high' }] },
      { id: 'f3', rating: 2, createdAt: '2026-10-07T10:00:00Z', actionSuggestions: [{ action: 'Masaları temizleyin', priority: 'critical' }, { action: 'x' }, 'bozuk'] },
      { id: 'f4', rating: 3, createdAt: '2026-10-07T10:00:00Z', actionSuggestions: null },
    ];
    const tracked = new Set([normalizeText('Masaları temizleyin')]);
    const out = pickSuggestions(rows, tracked, 5);
    expect(out.map((s) => [s.feedbackId, s.text, s.priority])).toEqual([
      ['f2', 'Bekleme süresini kısaltın', 'high'],
      ['f1', 'Garson eğitimi verin', 'medium'],
    ]);
  });
});

describe('temalar', () => {
  it('ana tema sayılır (satır başına bir kez), olumlu/olumsuz ve önceki hafta', () => {
    const cur = [
      { themes: [{ theme: 'Hizmet', sentiment: 'negative' }, { theme: 'hizmet', sentiment: 'negative' }, { theme: 'Lezzet', sentiment: 'positive' }] },
      { themes: [{ theme: 'Hizmet', sentiment: 'positive' }] },
      { themes: null },
    ];
    const prev = [{ themes: [{ theme: 'Hizmet' }] }];
    expect(buildThemes(cur, prev)).toEqual([
      { label: 'Hizmet', count: 2, positive: 1, negative: 1, prevCount: 1 },
      { label: 'Lezzet', count: 1, positive: 1, negative: 0, prevCount: 0 },
    ]);
  });
});

describe('yardımcılar', () => {
  it('alıntı kısaltılır; derin bağlantı kanala göre', () => {
    expect(excerpt('  a   b  ')).toBe('a b');
    expect(excerpt(null)).toBeNull();
    expect(excerpt('x'.repeat(200), 10)).toHaveLength(10);
    expect(feedbackHref('qr', 'abc')).toBe('/dealer/inbox?id=qr-abc');
    expect(feedbackHref('consumption', 'abc')).toBe('/dealer/inbox?id=cr-abc');
  });

  it('emekli rota yönlendirmesi sorguyu korur, sekmeyi ekler', () => {
    expect(buildRedirectHref('/dealer', {})).toBe('/dealer');
    expect(buildRedirectHref('/dealer', { utm: 'mail', tab: 'x', a: ['1', '2'] }, { tab: 'weekly' })).toBe('/dealer?utm=mail&a=1&a=2&tab=weekly');
  });

  it('AI anlatısı: istem yalnız sayı + tema içerir; çıktı düz metne indirgenir', () => {
    const report = {
      week: '2026-09-28',
      weekEnd: '2026-10-04',
      isComplete: true,
      metrics: {
        feedback: { value: 12, delta: { value: 20 } },
        avgRating: { value: 4.2, delta: null },
        negativeRate: { value: 8.3 },
        responseRate: { value: null },
        consumptions: { value: 40 },
      },
      sources: { qr: 7, consumption: 5 },
      themes: [{ label: 'Hizmet', count: 3, positive: 1, negative: 2, prevCount: 1 }],
    } as unknown as WeeklyReport;
    const prompt = buildNarrativePrompt(report);
    expect(prompt).toContain('Geri bildirim sayısı: 12 (önceki haftaya göre +20)');
    expect(prompt).toContain('Yanıtlanma oranı (%): veri yok');
    expect(prompt).toContain('Hizmet (3 kez; olumlu 1, olumsuz 2; önceki hafta 1)');
    expect(sanitizeNarrative('**Harika** <b>hafta</b>\n\n\n\n# Öneri')).toBe('Harika hafta\n\nÖneri');
  });
});
