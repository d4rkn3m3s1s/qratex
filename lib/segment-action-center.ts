/**
 * Segment Aksiyon Merkezi çekirdeği: dealer'ın müşteri segmentlerini (CustomerLifetimeValue
 * + CustomerSegment, clv-core cron'undan) TEK bir aksiyon-odaklı özete dönüştürür. Her segment
 * için: kaç müşteri, toplam/ortalama değer, ve ÖNERİLEN AKSİYON + o aksiyonu uygulayan mevcut
 * endpoint. Böylece dağınık churn/win-back/kampanya yüzeyleri tek panelde "gör → uygula" olur.
 *
 * Saf mantık burada (test edilebilir); DB okuması route'ta.
 */

/** Bir segment için hesaplanmış özet satırı. */
export interface SegmentSummary {
  /** clv-core DEFAULT_SEGMENTS adı (VIP | Sadık | Risk Altında | Uyuyan | Yeni) veya 'Segmentsiz'. */
  name: string;
  color: string;
  count: number;
  totalSpent: number;
  avgSpent: number;
  /** Segmentteki ortalama kayıp olasılığı (0-1) — varsa. */
  avgChurn: number | null;
  /** Önerilen aksiyon (dealer'a gösterilecek). */
  action: SegmentAction | null;
}

/**
 * Aksiyon TİPİ — istemcinin hangi gövdeyi hangi uca göndereceğini belirleyen sözleşme.
 * (Eskiden yalnız `endpoint` vardı ve sayfa her uca aynı `{segment, source}` gövdesini
 * yolluyordu → 5 butonun 4'ü her zaman 400 alıyordu. Gövde kurulumu:
 * lib/dealer/segment-action-requests.ts.)
 *  - `risk_offer`: risk segmentine ANINDA bildirim (onay diyaloğuyla).
 *  - `win_back`: bu işletmeye 30+ gündür gelmeyenlere ANINDA geri kazanım teklifi.
 *  - `segment_proposal`: kampanya TASLAĞI (admin onayından sonra /dealer/innovation'dan gönderilir).
 */
export type SegmentActionKind = 'risk_offer' | 'win_back' | 'segment_proposal';

/** `segment_proposal` için şablon anahtarı (lib/innovation-segment-templates.ts → SegmentKey). */
export type SegmentProposalKey = 'sleeping' | 'loyal' | 'first_visit';

/** Bir segmente önerilen tek-tık aksiyon + onu uygulayan mevcut endpoint. */
export interface SegmentAction {
  /** Aksiyon tipi (istemci gövdeyi buna göre kurar). */
  kind: SegmentActionKind;
  /** Sonuç: `send` müşterilere hemen gider; `draft` yalnız taslak oluşturur. */
  effect: 'send' | 'draft';
  /** Yalnız `segment_proposal`: kullanılacak şablon. */
  proposalSegmentKey?: SegmentProposalKey;
  /** Kısa etiket (buton metni). */
  label: string;
  /** Neden bu aksiyon (dealer'a açıklama). */
  rationale: string;
  /** Aciliyet (UI vurgusu): high kırmızı, medium sarı, low nötr. */
  priority: 'high' | 'medium' | 'low';
  /** Bu aksiyonu uygulayan mevcut API endpoint'i (POST). */
  endpoint: string;
  /** İkon anahtarı (geriye uyumluluk için emoji; istemci lucide ikonuna eşler). */
  icon: string;
}

const SEGMENT_COLORS: Record<string, string> = {
  VIP: '#FFD700',
  'Sadık': '#45B7D1',
  'Risk Altında': '#FF6B6B',
  'Uyuyan': '#95A5A6',
  'Yeni': '#4ECDC4',
  'Segmentsiz': '#CBD5E1',
};

/**
 * Segment adına göre önerilen aksiyonu döndürür. Boş segment (count=0) için null.
 * Endpoint'ler keşifte doğrulanan mevcut dealer route'larına bağlanır.
 */
export function actionForSegment(name: string, count: number, avgChurn: number | null): SegmentAction | null {
  if (count === 0) return null;
  switch (name) {
    case 'Risk Altında':
      return {
        kind: 'risk_offer',
        effect: 'send',
        label: 'Flash teklif gönder',
        rationale: `${count} müşteri kayıp riskinde${avgChurn != null ? ` (ort. %${Math.round(avgChurn * 100)} olasılık)` : ''}. Hızlı bir teşvik onları elde tutar.`,
        priority: 'high',
        endpoint: '/api/dealer/campaigns/risk-segment',
        icon: '⚡',
      };
    case 'Uyuyan':
      return {
        kind: 'win_back',
        effect: 'send',
        label: 'Geri kazanım teklifi gönder',
        rationale: `${count} müşteri 30+ gündür pasif. Bu işletmeye 30+ gündür gelmeyenlere geri kazanım teklifi gönder.`,
        priority: 'high',
        endpoint: '/api/dealer/win-back',
        icon: '📨',
      };
    case 'VIP':
      return {
        kind: 'segment_proposal',
        effect: 'draft',
        proposalSegmentKey: 'loyal',
        label: 'Sadakat ödülü taslağı oluştur',
        rationale: `${count} yüksek değerli müşteri. Teşekkür + ikram taslağı hazırla; admin onayından sonra gönderebilirsin.`,
        priority: 'medium',
        endpoint: '/api/dealer/innovation/segment-proposals',
        icon: '👑',
      };
    case 'Sadık':
      return {
        kind: 'segment_proposal',
        effect: 'draft',
        proposalSegmentKey: 'loyal',
        label: 'Teşekkür ödülü taslağı oluştur',
        rationale: `${count} sadık müşteri — en iyi tavsiye kaynağın. Teşekkür + mikro ödül taslağı hazırla; admin onayından sonra gönderebilirsin.`,
        priority: 'medium',
        endpoint: '/api/dealer/innovation/segment-proposals',
        icon: '🤝',
      };
    case 'Yeni':
      return {
        kind: 'segment_proposal',
        effect: 'draft',
        proposalSegmentKey: 'first_visit',
        label: 'Karşılama teklifi taslağı oluştur',
        rationale: `${count} yeni müşteri. İkinci ziyareti getirecek bir karşılama teklifi taslağı hazırla; admin onayından sonra gönderebilirsin.`,
        priority: 'medium',
        endpoint: '/api/dealer/innovation/segment-proposals',
        icon: '🌱',
      };
    default:
      return null;
  }
}

/** Segment görüntüleme sırası (aciliyet + değer önceliği). */
const SEGMENT_ORDER = ['Risk Altında', 'Uyuyan', 'VIP', 'Sadık', 'Yeni', 'Segmentsiz'];

export interface CustomerRow {
  totalSpent: number;
  predictedChurn: number | null;
  segmentName: string | null;
}

/**
 * Müşteri satırlarını segment bazlı özete indirger. Segmenti null olanlar 'Segmentsiz'.
 * Aciliyet sırasına göre sıralı döner; boş segmentler dahil edilmez.
 */
export function buildSegmentSummaries(customers: CustomerRow[]): SegmentSummary[] {
  const byName = new Map<string, { count: number; totalSpent: number; churnSum: number; churnN: number }>();
  for (const c of customers) {
    const name = c.segmentName ?? 'Segmentsiz';
    const cur = byName.get(name) ?? { count: 0, totalSpent: 0, churnSum: 0, churnN: 0 };
    cur.count += 1;
    cur.totalSpent += c.totalSpent;
    if (c.predictedChurn != null) {
      cur.churnSum += c.predictedChurn;
      cur.churnN += 1;
    }
    byName.set(name, cur);
  }

  const summaries: SegmentSummary[] = [];
  for (const [name, agg] of byName) {
    const avgChurn = agg.churnN > 0 ? agg.churnSum / agg.churnN : null;
    summaries.push({
      name,
      color: SEGMENT_COLORS[name] ?? SEGMENT_COLORS['Segmentsiz'],
      count: agg.count,
      totalSpent: Math.round(agg.totalSpent * 100) / 100,
      avgSpent: agg.count > 0 ? Math.round((agg.totalSpent / agg.count) * 100) / 100 : 0,
      avgChurn: avgChurn != null ? Math.round(avgChurn * 100) / 100 : null,
      action: actionForSegment(name, agg.count, avgChurn),
    });
  }

  summaries.sort((a, b) => {
    const ia = SEGMENT_ORDER.indexOf(a.name);
    const ib = SEGMENT_ORDER.indexOf(b.name);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return summaries;
}
