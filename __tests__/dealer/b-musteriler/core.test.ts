/**
 * Müşteriler 360 — saf karar mantığı (lib/dealer-customers/core + ref + radar geometrisi).
 * DB yok.
 */
import {
  attributeOutcome,
  buildActionMessage,
  computeVipThreshold,
  csvCell,
  enrichRows,
  explainReasons,
  filterRows,
  istanbulDayStart,
  legacySortAlias,
  monthlyAtStake,
  paginateGuard,
  parseSortParam,
  partitionRecipients,
  rhythmDaysOf,
  sanitizeNote,
  sortRows,
  suggestNextAction,
  summarize,
  toCsv,
  toStatRow,
  weeklyAverages,
  winBackBand,
  type StatRow,
} from '@/lib/dealer-customers/core';
import { decodeCustomerRef, encodeCustomerRef } from '@/lib/dealer-customers/ref';
import { bandProgress, layoutRadar, quadrantOf, RADAR_MAX_POINTS } from '@/components/dealer/b-musteriler/radar-geometry';

const NOW = new Date('2026-10-10T09:00:00Z');
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function row(p: Partial<StatRow> & { customerId: string }): StatRow {
  return {
    totalSpend: 0,
    visitCount: 1,
    avgOrderValue: 0,
    reviewCount: 0,
    avgRating: null,
    firstVisitAt: day(100),
    lastVisitAt: day(1),
    churnRisk: null,
    ...p,
  };
}

describe('ritim ve geri kazanım bandı', () => {
  it('ritim = (son − ilk) / (ziyaret − 1); tek ziyarette yok', () => {
    expect(rhythmDaysOf({ visitCount: 5, firstVisitAt: day(40), lastVisitAt: day(0) })).toBe(10);
    expect(rhythmDaysOf({ visitCount: 1, firstVisitAt: day(40), lastVisitAt: day(40) })).toBeNull();
  });

  it.each([
    // [gün, ritim, beklenen]
    [10, 7, null], // < 14 gün: henüz gecikmiş sayılmaz
    [14, 7, 'waking'], // 2× ritim
    [25, 7, 'sleeping'], // 3,6×
    [50, 7, 'lost'], // > 6×
    [100, 60, 'waking'], // iki ayda bir gelen müşteri 100 günde 1,67×
    [29, null, null],
    [45, null, 'waking'],
    [90, null, 'sleeping'],
    [200, null, 'lost'],
  ])('%i gün / ritim %p → %p', (d, r, expected) => {
    expect(winBackBand(d, r)).toBe(expected);
  });

  it('haftalık müşteri 3 hafta gelmeyince işaretlenir ama aylık müşteri 3 haftada işaretlenmez (sabit 30 gün yok)', () => {
    expect(winBackBand(21, 7)).toBe('sleeping');
    expect(winBackBand(21, 30)).toBeNull();
  });
});

describe('etiketler (örtüşebilir, işletmeye göre VIP)', () => {
  it('VIP eşiği harcamada üst %10; uyuyan VIP hem VIP hem Uyuyan', () => {
    const rows = Array.from({ length: 20 }, (_, i) => row({ customerId: `c${i}`, totalSpend: (i + 1) * 100 }));
    expect(computeVipThreshold(rows)).toBe(1900);
    rows[19] = row({ customerId: 'c19', totalSpend: 2000, visitCount: 12, firstVisitAt: day(300), lastVisitAt: day(200) });
    const { rows: e } = enrichRows(rows, NOW);
    const vip = e.find((r) => r.customerId === 'c19')!;
    expect(vip.tags).toEqual(expect.arrayContaining(['vip', 'loyal', 'dormant']));
    expect(vip.band).toBe('lost');
  });

  it('risk ≥ 0,5 → at_risk; ilk ziyaret ≤ 30 gün → new', () => {
    const { rows: e } = enrichRows(
      [row({ customerId: 'a', churnRisk: 0.62 }), row({ customerId: 'b', firstVisitAt: day(5), lastVisitAt: day(5) })],
      NOW
    );
    expect(e[0]!.tags).toContain('at_risk');
    expect(e[0]!.risk).toBe('high');
    expect(e[1]!.tags).toContain('new');
  });

  it('eksik alanlı satır (eski önbellek/mock) güvenle normalize edilir', () => {
    const r = toStatRow({ customerId: 'x', totalSpend: '120.5', churnRisk: 2 } as unknown as Record<string, unknown>);
    expect(r).toMatchObject({ totalSpend: 120.5, visitCount: 0, churnRisk: 1, lastVisitAt: null });
  });
});

describe('liste: filtre, sıralama, sayfa', () => {
  const { rows } = enrichRows(
    [
      row({ customerId: 'a', totalSpend: 300, churnRisk: null }),
      row({ customerId: 'b', totalSpend: 100, churnRisk: 0.8 }),
      row({ customerId: 'c', totalSpend: 200, churnRisk: 0.1 }),
    ],
    NOW
  );

  it('risk sıralamasında boş değerler HER İKİ yönde sona (eski NULLS FIRST hatası)', () => {
    expect(sortRows(rows, { id: 'risk', desc: true }).map((r) => r.customerId)).toEqual(['b', 'c', 'a']);
    expect(sortRows(rows, { id: 'risk', desc: false }).map((r) => r.customerId)).toEqual(['c', 'b', 'a']);
  });

  it('eski ?sort=churn|recent|spend parametreleri yeni biçime çevrilir; bilinmeyen → harcama', () => {
    expect(parseSortParam(legacySortAlias('churn'))).toEqual({ id: 'risk', desc: true });
    expect(parseSortParam(legacySortAlias('recent'))).toEqual({ id: 'lastVisit', desc: true });
    expect(parseSortParam('email.asc')).toEqual({ id: 'spend', desc: true });
  });

  it('filtreler ve arama kimlik kümesi birlikte uygulanır', () => {
    expect(filterRows(rows, { segment: 'at_risk', risk: null, band: null }).map((r) => r.customerId)).toEqual(['b']);
    expect(filterRows(rows, { segment: null, risk: 'unknown', band: null }, new Set(['a'])).map((r) => r.customerId)).toEqual(['a']);
  });

  it('taşan sayfa son sayfaya çekilir; boyut 1-100', () => {
    expect(paginateGuard(45, 9, 20)).toEqual({ page: 3, pageSize: 20, start: 40 });
    expect(paginateGuard(0, 1, 500)).toEqual({ page: 1, pageSize: 100, start: 0 });
  });
});

describe('özet ve risk altındaki ciro', () => {
  it('aktif/yeni/tekrar oranı ve band sayıları', () => {
    const { rows } = enrichRows(
      [
        row({ customerId: 'a', totalSpend: 100, visitCount: 3, firstVisitAt: day(60), lastVisitAt: day(2) }),
        row({ customerId: 'b', totalSpend: 300, visitCount: 1, firstVisitAt: day(70), lastVisitAt: day(70) }),
      ],
      NOW
    );
    const s = summarize(rows, NOW);
    expect(s).toMatchObject({ total: 2, active30: 1, dormant: 1, totalRevenue: 400, avgCustomerValue: 200, repeatRate: 50 });
    expect(s.bands.sleeping).toBe(1);
  });

  it('aylık risk = ortalama sepet × (30 ÷ ritim, en çok 8); tek ziyaretlide ayda 1; kayıp bandı dahil değil', () => {
    const { rows } = enrichRows(
      [
        row({ customerId: 'w', avgOrderValue: 100, visitCount: 5, firstVisitAt: day(60), lastVisitAt: day(30) }), // ritim 7,5 → 4/ay, 30 gün = 4× → sleeping
        row({ customerId: 's', avgOrderValue: 50, visitCount: 1, firstVisitAt: day(45), lastVisitAt: day(45) }), // waking, ayda 1
        row({ customerId: 'l', avgOrderValue: 999, visitCount: 1, firstVisitAt: day(400), lastVisitAt: day(400) }), // lost
      ],
      NOW
    );
    expect(monthlyAtStake(rows)).toBe(100 * 4 + 50);
  });
});

describe('açıklanabilirlik ve önerilen adım', () => {
  it('gerekçeler yalnız ölçülmüş verilerden', () => {
    const r = explainReasons({
      churnRisk: 0.62,
      band: 'waking',
      daysSinceLast: 20,
      rhythmDays: 7,
      avgRating: 2.5,
      reviewCount: 2,
      latestNegativeUnanswered: true,
      openOffer: false,
    });
    expect(r.join(' ')).toMatch(/%62/);
    expect(r.join(' ')).toMatch(/20 gündür/);
    expect(r.join(' ')).toMatch(/yanıtlanmadı/);
  });

  it('yanıtlanmamış olumsuz yorum varsa önce yanıt; izin yoksa ileti önerilmez', () => {
    const base = { tags: [] as never[], band: 'waking' as const, risk: 'high' as const, reachable: true, contactedRecently: false, openOffer: false };
    expect(suggestNextAction({ ...base, latestNegativeUnanswered: true })).toBe('reply');
    expect(suggestNextAction({ ...base, latestNegativeUnanswered: false })).toBe('personal_offer');
    expect(suggestNextAction({ ...base, latestNegativeUnanswered: false, reachable: false })).toBeNull();
    expect(suggestNextAction({ ...base, latestNegativeUnanswered: false, contactedRecently: true })).toBeNull();
  });
});

describe('gönderim kuralları', () => {
  it('eleme sırası: hesap → izin → 7 gün tavanı → gönderim tavanı; öncelik sırası korunur', () => {
    const out = partitionRecipients(
      [
        { customerId: 'closed', eligibleAccount: false, reachable: false, contactedRecently: false },
        { customerId: 'optout', eligibleAccount: true, reachable: false, contactedRecently: false },
        { customerId: 'recent', eligibleAccount: true, reachable: true, contactedRecently: true },
        { customerId: 'a', eligibleAccount: true, reachable: true, contactedRecently: false },
        { customerId: 'b', eligibleAccount: true, reachable: true, contactedRecently: false },
        { customerId: 'c', eligibleAccount: true, reachable: true, contactedRecently: false },
      ],
      2
    );
    expect(out.eligible).toEqual(['a', 'b']);
    expect(out.skipped).toEqual({ ineligible: 1, optedOut: 1, cooldown: 1, overCap: 1 });
  });

  it('şablonlar karşılıksız vaat içermez (5X puan, indirim, hediye yok); not eklenir ve temizlenir', () => {
    for (const t of ['winback', 'thanks', 'welcome', 'checkin'] as const) {
      const m = buildActionMessage(t, 'Kahve Durağı', '', 'tr');
      expect(m.message).toContain('Kahve Durağı');
      expect(m.message).not.toMatch(/5X|puan|indirim|hediye|%/i);
    }
    expect(buildActionMessage('winback', '', 'Yeni menümüz hazır', 'en').message).toMatch(/Your favourite place[\s\S]*Yeni menümüz hazır/);
    expect(sanitizeNote('a\u0000b\n\n\n\nc', 10)).toBe('ab\n\nc');
  });

  it('atıf: yalnız alıcıların pencere içindeki ziyaretleri sayılır', () => {
    const sent = day(10);
    const out = attributeOutcome(
      sent,
      ['a', 'b'],
      [
        { customerId: 'a', createdAt: day(5), amount: 120 },
        { customerId: 'a', createdAt: day(4), amount: 30 },
        { customerId: 'b', createdAt: day(11), amount: 500 }, // gönderimden önce
        { customerId: 'z', createdAt: day(3), amount: 999 }, // alıcı değil
      ],
      NOW
    );
    expect(out).toEqual({ returned: 1, revenue: 150, windowOpen: true });
  });

  it('İstanbul günü başlangıcı UTC+3', () => {
    expect(istanbulDayStart(new Date('2026-10-10T22:30:00Z')).toISOString()).toBe('2026-10-10T21:00:00.000Z');
  });
});

describe('CSV ve trend', () => {
  it('formül enjeksiyonu önlenir; BOM + noktalı virgül', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+90')).toBe("'+90");
    expect(toCsv(['a'], [['b;c']]).startsWith('﻿a\r\n"b;c"')).toBe(true);
  });

  it('haftalık ortalamalar en eskiden en yeniye, boş hafta null', () => {
    const w = weeklyAverages([{ at: day(1), value: 0.6 }, { at: day(2), value: 0.2 }, { at: day(20), value: 0.5 }], NOW, 4);
    expect(w).toEqual([null, 0.5, null, 0.4]);
  });
});

describe('müşteri referansı', () => {
  it('çözülür; başka işletmenin oturumunda ve kurcalanınca çözülmez; ham kimlik içermez', () => {
    const ref = encodeCustomerRef('dealer-a', 'cust_123');
    expect(ref).not.toContain('cust_123');
    expect(encodeCustomerRef('dealer-a', 'cust_123')).toBe(ref); // deterministik
    expect(decodeCustomerRef('dealer-a', ref)).toBe('cust_123');
    expect(decodeCustomerRef('dealer-b', ref)).toBeNull();
    expect(decodeCustomerRef('dealer-a', ref.slice(0, -2) + (ref.endsWith('A') ? 'BB' : 'AA'))).toBeNull();
    expect(decodeCustomerRef('dealer-a', 'cust_123')).toBeNull();
  });
});

describe('geri kazanım haritası geometrisi', () => {
  it('çeyrek = ziyaret sayısı; halka = bant; en fazla 24 nokta', () => {
    expect([1, 2, 4, 5, 9, 10].map(quadrantOf)).toEqual([0, 1, 1, 2, 2, 3]);
    const pts = layoutRadar(
      Array.from({ length: 30 }, (_, i) => ({
        ref: `r${i}`,
        band: (['waking', 'sleeping', 'lost'] as const)[i % 3]!,
        daysSinceLast: 60,
        rhythmDays: 10,
        visits: i,
        avgOrderValue: 50 + i,
      }))
    );
    expect(pts).toHaveLength(RADAR_MAX_POINTS);
    for (const p of pts) {
      const d = Math.hypot(p.x - 160, p.y - 160);
      const [inner, outer] = p.band === 'waking' ? [44, 84] : p.band === 'sleeping' ? [84, 118] : [118, 148];
      expect(d).toBeGreaterThanOrEqual(inner - 0.2);
      expect(d).toBeLessThanOrEqual(outer + 0.2);
    }
    expect(bandProgress({ band: 'waking', daysSinceLast: 15, rhythmDays: 5 })).toBe(1);
  });
});
