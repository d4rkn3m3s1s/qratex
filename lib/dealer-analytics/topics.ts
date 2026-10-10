/**
 * Konu taksonomisi — AI'nın serbest konu çıktısını kanonik anahtara indirger (rapor B-13, #37).
 *
 * AI analiz promptu (`lib/ai-engine.ts`) İngilizce anahtar listesi verir ama model zaman zaman
 * Türkçe/eşanlamlı ("servis", "hizmet", "garson") döndürür; eskiden "Servis/servis/service" ayrı
 * sayılıyordu. Burada küçük harfe indirip (TR yereliyle) eşanlamlıyı anahtara eşleriz. Bilinmeyen
 * konu ATILMAZ (veri kaybı yok): normalize edilmiş hâliyle kendi kovasında kalır. Saf; jest'li.
 */

export const TOPIC_KEYS = [
  'service',
  'quality',
  'price',
  'atmosphere',
  'staff',
  'food',
  'cleanliness',
  'speed',
  'location',
  'parking',
  'menu',
  'portion',
  'taste',
  'temperature',
  'presentation',
  'reservation',
  'waiting',
  'delivery',
  'packaging',
  'payment',
] as const;

export type TopicKey = (typeof TOPIC_KEYS)[number];

const SYNONYMS: Record<string, TopicKey> = {
  servis: 'service',
  hizmet: 'service',
  'hizmet kalitesi': 'service',
  'customer service': 'service',
  kalite: 'quality',
  fiyat: 'price',
  fiyatlar: 'price',
  pricing: 'price',
  ücret: 'price',
  atmosfer: 'atmosphere',
  ambiyans: 'atmosphere',
  ambiance: 'atmosphere',
  ortam: 'atmosphere',
  personel: 'staff',
  çalışan: 'staff',
  çalışanlar: 'staff',
  garson: 'staff',
  employees: 'staff',
  yemek: 'food',
  yemekler: 'food',
  temizlik: 'cleanliness',
  hijyen: 'cleanliness',
  hygiene: 'cleanliness',
  clean: 'cleanliness',
  hız: 'speed',
  hizli: 'speed',
  hızlı: 'speed',
  konum: 'location',
  lokasyon: 'location',
  otopark: 'parking',
  menü: 'menu',
  menu: 'menu',
  porsiyon: 'portion',
  'portion size': 'portion',
  lezzet: 'taste',
  tat: 'taste',
  flavor: 'taste',
  flavour: 'taste',
  sıcaklık: 'temperature',
  sunum: 'presentation',
  rezervasyon: 'reservation',
  bekleme: 'waiting',
  'bekleme süresi': 'waiting',
  'wait time': 'waiting',
  'waiting time': 'waiting',
  wait: 'waiting',
  teslimat: 'delivery',
  paketleme: 'packaging',
  ambalaj: 'packaging',
  ödeme: 'payment',
};

const KNOWN = new Set<string>(TOPIC_KEYS);

/** Ham konu → kanonik anahtar (bilinmiyorsa normalize edilmiş ham metin; geçersizse null). */
export function normalizeTopic(raw: unknown): { key: string; known: boolean } | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr-TR');
  if (!s || s.length > 40) return null;
  if (KNOWN.has(s)) return { key: s, known: true };
  // TR yereli "I" → "ı" yapar; İngilizce anahtarlar için tr'siz küçük harfe de bak.
  const en = raw.replace(/\s+/g, ' ').trim().toLowerCase();
  if (KNOWN.has(en)) return { key: en, known: true };
  const syn = SYNONYMS[s] ?? SYNONYMS[en];
  if (syn) return { key: syn, known: true };
  return { key: s, known: false };
}

export interface RawTopicCount {
  topic: string;
  count: number;
  positive: number;
  negative: number;
}

/** SQL'den gelen ham konu sayımlarını kanonik anahtarda birleştirir. */
export function mergeTopicCounts(rows: readonly RawTopicCount[]): Map<string, { known: boolean; count: number; positive: number; negative: number }> {
  const out = new Map<string, { known: boolean; count: number; positive: number; negative: number }>();
  for (const r of rows) {
    const norm = normalizeTopic(r.topic);
    if (!norm) continue;
    const prev = out.get(norm.key) ?? { known: norm.known, count: 0, positive: 0, negative: 0 };
    prev.count += r.count;
    prev.positive += r.positive;
    prev.negative += r.negative;
    out.set(norm.key, prev);
  }
  return out;
}
