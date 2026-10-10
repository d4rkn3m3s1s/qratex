/**
 * b-analitik saf yardımcıları: ısı ölçeği (sayısal lejant eşikleri), CSV (formül enjeksiyonu),
 * analitik sekmeleri (kayıttan türeme, bağlam taşıma).
 */
import { HEAT_LEVELS, heatLevel, heatThresholds, ratingTone } from '@/lib/dealer-analytics/heat-scale';
import { escapeCsvCell, toCsv } from '@/lib/dealer-analytics/csv';
import { activeAnalyticsTab, resolveAnalyticsTabs, withAnalyticsContext } from '@/lib/dealer-analytics/tabs';
import type { ShellConfig } from '@/lib/navigation/shell-config';

describe('ısı ölçeği', () => {
  it('karekök ölçek: aykırı tek hücre diğerlerini silmez', () => {
    expect(heatLevel(0, 100)).toBe(0);
    expect(heatLevel(null, 100)).toBe(0);
    expect(heatLevel(100, 100)).toBe(HEAT_LEVELS);
    // Doğrusal ölçekte %4 → en soluk kademe; karekökte ikinci kademeye çıkmaz ama görünür kalır.
    expect(heatLevel(4, 100)).toBe(1);
    expect(heatLevel(10, 100)).toBe(2);
    expect(heatLevel(40, 100)).toBe(3);
  });

  it('lejant eşikleri sayısal, bitişik ve maksimumda biter', () => {
    const t = heatThresholds(100);
    expect(t[0]).toEqual({ level: 1, from: 1, to: 6 });
    expect(t[t.length - 1].to).toBe(100);
    for (let i = 1; i < t.length; i++) expect(t[i].from).toBe(t[i - 1].to + 1);
    for (const s of t) expect(heatLevel(s.to, 100)).toBe(s.level);
    expect(heatThresholds(0)).toEqual([]);
  });

  it('küçük maksimumda boş kademe üretmez', () => {
    const t = heatThresholds(2);
    expect(t.every((s) => s.to >= s.from)).toBe(true);
    expect(t[t.length - 1].to).toBe(2);
  });

  it('puan tonu genel ortalamadan sapmaya göre', () => {
    expect(ratingTone(3, 4.2).tone).toBe('danger');
    expect(ratingTone(4.8, 4.2).tone).toBe('success');
    expect(ratingTone(4.25, 4.2).tone).toBe('neutral');
    expect(ratingTone(null, 4.2).alpha).toBe(0);
  });
});

describe('CSV', () => {
  it('formül enjeksiyonunu ve ayırıcıyı kaçışlar', () => {
    expect(escapeCsvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(escapeCsvCell('-5')).toBe("'-5");
    expect(escapeCsvCell(-5)).toBe('-5');
    expect(escapeCsvCell('a;b')).toBe('"a;b"');
    expect(escapeCsvCell(null)).toBe('');
  });

  it('BOM + CRLF', () => {
    const csv = toCsv(['Gün', 'Adet'], [['2026-10-01', 3]]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('Gün;Adet\r\n2026-10-01;3\r\n');
  });
});

describe('analitik sekmeleri', () => {
  const item = (id: string, href: string) => ({ id, href, label: { tr: id, en: id }, icon: 'BarChart3' as const, children: [] });
  const shell = {
    nodes: [
      {
        kind: 'group' as const,
        id: 'analytics',
        label: { tr: 'Analiz', en: 'Analytics' },
        icon: 'BarChart3' as const,
        items: [item('dealer.analytics', '/dealer/analytics'), item('dealer.analytics.heatmap', '/dealer/analytics/heatmap'), item('dealer.analytics.insights', '/dealer/analytics/insights')],
      },
      { kind: 'item' as const, item: item('dealer.inbox', '/dealer/inbox') },
    ],
  } as unknown as Pick<ShellConfig, 'nodes'>;

  it('kayıttan türer; kök her zaman ilk; analitik dışı öğe eklenmez', () => {
    const tabs = resolveAnalyticsTabs(shell);
    expect(tabs.map((t) => t.id)).toEqual(['dealer.analytics', 'dealer.analytics.heatmap', 'dealer.analytics.insights']);
    expect(resolveAnalyticsTabs(null).map((t) => t.id)).toEqual(['dealer.analytics']);
  });

  it('modülü kapalı sekme kabukta yoksa gösterilmez', () => {
    const noHeat = { nodes: [{ ...shell.nodes[0], items: [item('dealer.analytics', '/dealer/analytics')] }] } as unknown as Pick<ShellConfig, 'nodes'>;
    expect(resolveAnalyticsTabs(noHeat)).toHaveLength(1);
  });

  it('etkin sekme: kök yalnız tam eşleşmede', () => {
    const tabs = resolveAnalyticsTabs(shell);
    expect(activeAnalyticsTab(tabs, '/dealer/analytics')).toBe('dealer.analytics');
    expect(activeAnalyticsTab(tabs, '/dealer/analytics/heatmap')).toBe('dealer.analytics.heatmap');
  });

  it('dönem/şube bağlamı taşınır, sekmeye özgü süzgeç taşınmaz', () => {
    const sp = new URLSearchParams('period=last7&compare=yoy&channel=qr&metric=visits&location=l1');
    expect(withAnalyticsContext('/dealer/analytics/heatmap', sp)).toBe('/dealer/analytics/heatmap?period=last7&compare=yoy&location=l1');
    expect(withAnalyticsContext('/dealer/analytics', new URLSearchParams())).toBe('/dealer/analytics');
  });
});
