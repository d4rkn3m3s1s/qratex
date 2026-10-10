/**
 * Yasal belgeler kaydı — dört yasal metnin (Kullanım Şartları, Gizlilik Politikası, KVKK
 * Aydınlatma Metni, Çerez Politikası) sürüm, yürürlük tarihi ve değişiklik geçmişinin TEK kaynağı.
 *
 * Sayfa başlığı/rozeti, sitemap `lastModified`, JSON-LD `dateModified` ve "İlgili belgeler"
 * listesi buradan beslenir. "Son güncelleme" ASLA render anı (`new Date()`) değildir: metin
 * değiştiğinde burada `version` + `effectiveDate` elle artırılır ve `changelog`'a satır eklenir.
 *
 * Saf modül (Prisma/Next bağımlılığı yok) — istemci bileşenleri ve testler de okuyabilir.
 * Çerez Politikası'nın sürümü rıza modülündeki envanterle (`lib/consent/inventory.ts`) aynı
 * kaynaktan gelir; rıza sürümü değişince politika da aynı anda güncellenir.
 */
import { COOKIE_POLICY_EFFECTIVE_DATE, COOKIE_POLICY_VERSION } from '@/lib/consent/inventory';

export const LEGAL_SLUGS = ['kullanim-sartlari', 'gizlilik-politikasi', 'kvkk-aydinlatma-metni', 'cerez-politikasi'] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

export interface LegalChange {
  version: string;
  /** YYYY-MM-DD (Europe/Istanbul takvim günü). */
  date: string;
  summary: readonly string[];
}

export interface LegalDocumentMeta {
  slug: LegalSlug;
  path: `/${LegalSlug}`;
  title: string;
  /** Kart ve ilgili belgeler listesindeki tek cümlelik açıklama. */
  blurb: string;
  /** Meta açıklama (≤ 160 karakter hedefi). */
  description: string;
  version: string;
  /** YYYY-MM-DD — metnin yürürlüğe girdiği gün. */
  effectiveDate: string;
  /** Yeniden eskiye. İlk satır güncel sürüm olmalı (test korur). */
  changelog: readonly LegalChange[];
}

/** Yasal başvurular ve sorular için tek iletişim adresi (tüm yasal metinlerde aynı). */
export const LEGAL_CONTACT_EMAIL = 'info@qratex.com';

const FIRST_PUBLISHED = '2026-05-12';

export const LEGAL_DOCUMENTS: Readonly<Record<LegalSlug, LegalDocumentMeta>> = {
  'kullanim-sartlari': {
    slug: 'kullanim-sartlari',
    path: '/kullanim-sartlari',
    title: 'Kullanım Şartları',
    blurb: 'Hesap, geri bildirim, puan, oyun, ödül ve hesap kapatma kuralları.',
    description:
      'QRateX kullanım şartları: hesap, geri bildirim içeriği, puan ve ödül kuralları, oyunlar ve klanlar, hile önleme, hesap kapatma ve iletişim.',
    version: '2.0',
    effectiveDate: '2026-10-10',
    changelog: [
      {
        version: '2.0',
        date: '2026-10-10',
        summary: [
          'Puan, tavan, turnuva, klan savaşı ve sürpriz kutu kuralları uygulamadaki gerçek değerlerle eklendi.',
          'Otomatik hile tespiti, sonuçları ve itiraz yolu açıkça yazıldı.',
          'Hesap kapatmada puan, ödül ve yorumların akıbeti eklendi.',
          'İşletme yükümlülükleri, uygulanacak hukuk ve iletişim bölümleri eklendi.',
        ],
      },
      { version: '1.0', date: FIRST_PUBLISHED, summary: ['İlk yayımlanan kısa metin.'] },
    ],
  },
  'gizlilik-politikasi': {
    slug: 'gizlilik-politikasi',
    path: '/gizlilik-politikasi',
    title: 'Gizlilik Politikası',
    blurb: 'Hangi verileri neden işlediğimiz, kimlerle paylaştığımız ve ne kadar sakladığımız.',
    description:
      'QRateX gizlilik politikası: hangi verileri neden işlediğimiz, kimlerle paylaştığımız, ne kadar sakladığımız ve haklarınızı nasıl kullanacağınız.',
    version: '2.0',
    effectiveDate: '2026-10-10',
    changelog: [
      {
        version: '2.0',
        date: '2026-10-10',
        summary: [
          'Veri grupları ve saklama süreleri kişisel veri envanterinden otomatik üretiliyor.',
          'Hizmet sağlayıcılar, bulundukları bölge ve yurt dışı aktarım tablosu eklendi.',
          'Yapay zekâ analizi, sıralama tablolarındaki görünürlük ve haklarınızı kullanma yolları eklendi.',
        ],
      },
      { version: '1.0', date: FIRST_PUBLISHED, summary: ['İlk yayımlanan kısa metin.'] },
    ],
  },
  'kvkk-aydinlatma-metni': {
    slug: 'kvkk-aydinlatma-metni',
    path: '/kvkk-aydinlatma-metni',
    title: 'KVKK Aydınlatma Metni',
    blurb: 'KVKK m.10 aydınlatması: veri grupları, hukuki sebepler, aktarım ve başvuru.',
    description:
      '6698 sayılı KVKK kapsamında hangi kişisel verilerin, hangi amaç ve hukuki sebeple işlendiği, ne kadar saklandığı ve haklarınızı nasıl kullanacağınız.',
    version: '2.1',
    effectiveDate: '2026-10-10',
    changelog: [
      {
        version: '2.1',
        date: '2026-10-10',
        summary: ['Hizmet sağlayıcılar ve bölgeleri ad ad listelendi.', 'Belge sürüm geçmişi ve yazdırma görünümü eklendi.'],
      },
      {
        version: '2.0',
        date: '2026-10-10',
        summary: [
          'Veri grupları, hukuki sebepler ve saklama süreleri kişisel veri envanterinden üretiliyor.',
          'KVKK m.11 kapsamındaki sekiz hak ve uygulama içi başvuru yolu eklendi.',
        ],
      },
      { version: '1.0', date: FIRST_PUBLISHED, summary: ['İlk yayımlanan kısa metin.'] },
    ],
  },
  'cerez-politikasi': {
    slug: 'cerez-politikasi',
    path: '/cerez-politikasi',
    title: 'Çerez Politikası',
    blurb: 'Hangi çerezleri neden kullandığımız ve tercihinizi nasıl değiştireceğiniz.',
    description:
      'QRateX hangi çerezleri ve benzeri teknolojileri hangi amaçla kullanır, ne kadar saklar ve tercihinizi nasıl değiştirirsiniz.',
    version: COOKIE_POLICY_VERSION,
    effectiveDate: COOKIE_POLICY_EFFECTIVE_DATE,
    changelog: [
      {
        version: COOKIE_POLICY_VERSION,
        date: COOKIE_POLICY_EFFECTIVE_DATE,
        summary: [
          'Analitik ve oturum kaydı ayrı onaya bağlandı; onay yoksa hiç çalışmaz.',
          'Çerez ve yerel depolama envanteri tablo olarak eklendi; pazarlama çerezi kullanılmadığı belirtildi.',
          'Tercih merkezi bu sayfadan, sayfa altından ve Ayarlar › Gizlilik’ten açılabiliyor.',
        ],
      },
      { version: '1.0', date: FIRST_PUBLISHED, summary: ['İlk yayımlanan kısa metin.'] },
    ],
  },
};

export function getLegalDocument(slug: LegalSlug): LegalDocumentMeta {
  return LEGAL_DOCUMENTS[slug];
}

/** Belirtilen belge dışındaki yasal belgeler (ilgili belgeler listesi için, sabit sırada). */
export function getRelatedLegalDocuments(slug: LegalSlug): LegalDocumentMeta[] {
  return LEGAL_SLUGS.filter((s) => s !== slug).map((s) => LEGAL_DOCUMENTS[s]);
}

/** `YYYY-MM-DD` → İstanbul gece yarısındaki an (sitemap / JSON-LD için). */
export function legalDateToDate(isoDay: string): Date {
  return new Date(`${isoDay}T00:00:00+03:00`);
}

const TR_LONG = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeZone: 'Europe/Istanbul' });

/** `YYYY-MM-DD` → "10 Ekim 2026" (Europe/Istanbul, deterministik). */
export function formatLegalDate(isoDay: string): string {
  return TR_LONG.format(legalDateToDate(isoDay));
}
