/**
 * Segment Aksiyon Merkezi çekirdeği: müşteri satırlarını segment özetine indirger ve
 * her segmente doğru aksiyonu/aciliyeti atar. Bu mantık dealer'a "kaç müşteri riskte +
 * ne yapmalı" gösteren panelin temeli — yanlış segment/aksiyon dealer'ı yanlış yönlendirir.
 */
import {
  buildSegmentSummaries,
  actionForSegment,
  type CustomerRow,
} from '@/lib/segment-action-center';

describe('actionForSegment', () => {
  it('boş segment (count=0) için aksiyon yok', () => {
    expect(actionForSegment('Risk Altında', 0, 0.7)).toBeNull();
  });

  it('Risk Altında → yüksek öncelikli flash teklif', () => {
    const a = actionForSegment('Risk Altında', 5, 0.7);
    expect(a).not.toBeNull();
    expect(a?.priority).toBe('high');
    expect(a?.endpoint).toBe('/api/dealer/campaigns/risk-segment');
    expect(a?.rationale).toContain('%70'); // avgChurn yansır
  });

  it('Uyuyan → yüksek öncelikli win-back', () => {
    const a = actionForSegment('Uyuyan', 23, null);
    expect(a?.priority).toBe('high');
    expect(a?.endpoint).toBe('/api/dealer/win-back');
  });

  it('VIP/Sadık/Yeni → orta öncelikli segment önerisi', () => {
    for (const name of ['VIP', 'Sadık', 'Yeni']) {
      const a = actionForSegment(name, 3, null);
      expect(a?.priority).toBe('medium');
      expect(a?.endpoint).toBe('/api/dealer/innovation/segment-proposals');
    }
  });

  it('bilinmeyen/Segmentsiz → aksiyon yok', () => {
    expect(actionForSegment('Segmentsiz', 10, null)).toBeNull();
    expect(actionForSegment('Rastgele', 10, null)).toBeNull();
  });
});

describe('buildSegmentSummaries', () => {
  const rows: CustomerRow[] = [
    { totalSpent: 6000, predictedChurn: 0.1, segmentName: 'VIP' },
    { totalSpent: 5500, predictedChurn: 0.2, segmentName: 'VIP' },
    { totalSpent: 300, predictedChurn: 0.8, segmentName: 'Risk Altında' },
    { totalSpent: 150, predictedChurn: null, segmentName: 'Uyuyan' },
    { totalSpent: 50, predictedChurn: null, segmentName: null }, // Segmentsiz
  ];

  it('segment başına count/totalSpent/avgSpent doğru toplar', () => {
    const s = buildSegmentSummaries(rows);
    const vip = s.find((x) => x.name === 'VIP')!;
    expect(vip.count).toBe(2);
    expect(vip.totalSpent).toBe(11500);
    expect(vip.avgSpent).toBe(5750);
  });

  it('avgChurn yalnız churn değeri olanlardan hesaplanır (null atlanır)', () => {
    const s = buildSegmentSummaries(rows);
    expect(s.find((x) => x.name === 'VIP')!.avgChurn).toBeCloseTo(0.15, 5);
    expect(s.find((x) => x.name === 'Risk Altında')!.avgChurn).toBeCloseTo(0.8, 5);
    // Uyuyan'da hiç churn yok → null
    expect(s.find((x) => x.name === 'Uyuyan')!.avgChurn).toBeNull();
  });

  it('segmenti null olan müşteri Segmentsiz\'e düşer ve aksiyonu yoktur', () => {
    const s = buildSegmentSummaries(rows);
    const none = s.find((x) => x.name === 'Segmentsiz')!;
    expect(none.count).toBe(1);
    expect(none.action).toBeNull();
  });

  it('aciliyet sırasına göre sıralar: Risk > Uyuyan > VIP > ... > Segmentsiz', () => {
    const s = buildSegmentSummaries(rows);
    const names = s.map((x) => x.name);
    expect(names.indexOf('Risk Altında')).toBeLessThan(names.indexOf('Uyuyan'));
    expect(names.indexOf('Uyuyan')).toBeLessThan(names.indexOf('VIP'));
    expect(names.indexOf('VIP')).toBeLessThan(names.indexOf('Segmentsiz'));
  });

  it('boş girdi → boş özet', () => {
    expect(buildSegmentSummaries([])).toEqual([]);
  });
});
