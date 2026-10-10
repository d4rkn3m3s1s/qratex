/**
 * Kişisel veri envanterinden (`lib/pii-registry.ts`) yasal metin tablolarını üreten saf görünüm.
 *
 * KVKK Aydınlatma Metni ve Gizlilik Politikası'ndaki "hangi veri, hangi hukuki sebep, ne kadar
 * süre, silmede ne olur" satırları ELLE yazılmaz; buradan türetilir. Envantere yeni bir kayıt
 * eklendiğinde iki metin de kendiliğinden güncellenir (aynı veri, aynı cümle).
 */
import {
  PII_CATEGORY_LABELS,
  PII_REGISTRY,
  type EraseStrategy,
  type PiiCategory,
  type PiiRegistryEntry,
} from '@/lib/pii-registry';

export const LEGAL_CATEGORY_ORDER: readonly PiiCategory[] = [
  'kimlik',
  'iletişim',
  'konum',
  'serbest_metin',
  'işlem',
  'davranış',
  'ai',
  'tercih',
  'cihaz',
  'güvenlik',
];

export const LEGAL_CATEGORY_EXAMPLES: Readonly<Record<PiiCategory, string>> = {
  kimlik: 'Ad soyad, profil fotoğrafı, bağlı giriş hesabı (ör. Google), doğum tarihi (verdiyseniz), personel kaydı.',
  iletişim: 'E-posta adresi, telefon, size gönderilen bildirimler ve KVKK başvurularınız.',
  konum: 'Verdiyseniz adres ve işletme konumu. Cihaz konumunuzu sürekli izlemeyiz.',
  serbest_metin: 'Yazdığınız yorumlar, notlar, bağış mesajları, QRA asistanı ile sohbetleriniz, yüklediğiniz fotoğraflar.',
  işlem: 'Ziyaret ve tüketim kayıtları, puan hareketleri, ödüller, kart ve kupon kullanımı.',
  davranış: 'Oyun, görev, rozet ve seri ilerlemeniz; uygulama içi etkinlik kayıtları.',
  ai: 'Yorumlarınızdan çıkarılan duygu/konu analizleri, güven puanı ve kayıp riski gibi otomatik değerlendirmeler.',
  tercih: 'Bildirim, panel ve çerez/izleme tercihleriniz, favori işletmeleriniz.',
  cihaz: 'Anlık bildirim aboneliği, tarayıcı bilgisi, güvenlik kayıtlarındaki IP adresi.',
  güvenlik: 'Oturum ve tek kullanımlık giriş bağlantıları, denetim ve sahtecilik önleme kayıtları.',
};

export const ERASE_LABELS: Readonly<Record<EraseStrategy, string>> = {
  delete: 'silinir',
  redact: 'metin ve tanımlayıcılar temizlenir, kimliksiz istatistik kalır',
  pseudonymize: 'anonim hesaba bağlı kimliksiz istatistik olarak kalır',
  retain: 'yasal süre boyunca saklanır, süre sonunda imha edilir',
  user_row: 'anonimleştirilir',
  business: 'işletmenin ticari kaydı olarak kalır',
};

/** Tek bir envanter satırının saklama cümlesi. */
export function retentionText(e: Pick<PiiRegistryEntry, 'retentionDays' | 'retentionField'>): string {
  if (typeof e.retentionDays === 'number' && e.retentionField) return `${e.retentionDays} gün sonra otomatik silinir`;
  if (typeof e.retentionDays === 'number' && e.retentionDays >= 365) return `${Math.round(e.retentionDays / 365)} yıl (yasal saklama)`;
  if (typeof e.retentionDays === 'number') return `en fazla ${e.retentionDays} gün`;
  return 'hesabınız açık kaldığı sürece';
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
}

export interface LegalCategoryRow {
  category: PiiCategory;
  label: string;
  examples: string;
  legalBases: string[];
  retention: string[];
  onErase: string[];
}

/** Veri sahibinin KENDİ verisi (subject: self) olan envanter satırlarından kategori tablosu. */
export function buildLegalCategoryRows(registry: readonly PiiRegistryEntry[] = PII_REGISTRY): LegalCategoryRow[] {
  const own = registry.filter((e) => e.subject === 'self');
  return LEGAL_CATEGORY_ORDER.map((category) => {
    const entries = own.filter((e) => e.categories.includes(category));
    return {
      category,
      label: PII_CATEGORY_LABELS[category],
      examples: LEGAL_CATEGORY_EXAMPLES[category],
      legalBases: uniq(entries.map((e) => e.legalBasis)),
      retention: uniq(entries.map(retentionText)),
      onErase: uniq(entries.map((e) => ERASE_LABELS[e.erase])),
    };
  }).filter((r) => r.legalBases.length > 0);
}

export interface AutoRetentionRule {
  model: string;
  days: number;
}

/** Günlük temizlikte OTOMATİK uygulanan saklama süreleri (gerçekten silinenler). */
export function listAutoRetentionRules(registry: readonly PiiRegistryEntry[] = PII_REGISTRY): AutoRetentionRule[] {
  const seen = new Set<string>();
  const out: AutoRetentionRule[] = [];
  for (const e of registry) {
    if (!e.retentionField || typeof e.retentionDays !== 'number' || e.retentionDays <= 0) continue;
    if (seen.has(e.model)) continue;
    seen.add(e.model);
    out.push({ model: e.model, days: e.retentionDays });
  }
  return out;
}
