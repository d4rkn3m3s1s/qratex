/**
 * Blog yazıları (şimdilik statik; ileride CMS/DB'den gelebilir).
 * `content`: basit paragraf/başlık dizisi — [slug] sayfası bunu render eder.
 */
export type BlogBlock =
  | { type: 'h2'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] };

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  datePublished: string; // ISO
  dateModified: string;
  author: string;
  image?: string;
  readingMinutes?: number;
  content: BlogBlock[];
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'qr-kod-ile-geri-bildirim-toplama',
    title: 'QR Kod ile Geri Bildirim Toplama: İşletmeler İçin Rehber',
    description: 'QR kodlar ile müşteri geri bildirimi toplamanın avantajları ve QRateX ile nasıl başlayacağınız.',
    datePublished: '2025-01-15T10:00:00.000Z',
    dateModified: '2025-01-15T10:00:00.000Z',
    author: 'QRateX Ekibi',
    readingMinutes: 4,
    content: [
      { type: 'p', text: 'Geleneksel anket ve yorum kutuları müşterinin dikkatini dağıtır, düşük katılım getirir ve verileri toplamak zahmetlidir. QR kod tabanlı geri bildirim, müşterinin cebindeki telefonu tek dokunuşla bir geri bildirim kanalına dönüştürür.' },
      { type: 'h2', text: 'Neden QR kod?' },
      { type: 'p', text: 'Bir QR kod, masaya, ürüne veya faturaya yerleştirilebilir. Müşteri kodu okuttuğunda saniyeler içinde geri bildirim ekranına ulaşır — uygulama indirmesi, üyelik veya form doldurma zorunluluğu yoktur.' },
      { type: 'ul', items: [
        'Sıfır sürtünme: uygulama yok, tek tarama ile açılır.',
        'Konuma özel: her masa/şube için ayrı kod ile hassas analiz.',
        'Anlık: geri bildirim toplandığı anda panele düşer.',
        'Gamification: puan ve ödüllerle katılım oranı artar.',
      ] },
      { type: 'h2', text: 'QRateX ile nasıl başlanır?' },
      { type: 'p', text: 'İşletmenizi oluşturun, ürünlerinizi ekleyin ve QRateX sizin için benzersiz QR kodlar üretsin. Kodları yazdırıp yerleştirin; ilk geri bildirimler dakikalar içinde gelmeye başlar. Yapay zeka her yorumu otomatik analiz eder ve size aksiyon önerileri sunar.' },
      { type: 'p', text: 'Ücretsiz planla başlayabilir, işletmeniz büyüdükçe daha fazla QR kod ve gelişmiş analitiğe geçebilirsiniz.' },
    ],
  },
  {
    slug: 'musteri-deneyimi-ve-gamification',
    title: 'Müşteri Deneyimini Gamification ile Güçlendirmek',
    description: 'Puan, rozet ve görevler ile müşteri bağlılığını artırmanın yolları.',
    datePublished: '2025-01-10T10:00:00.000Z',
    dateModified: '2025-01-10T10:00:00.000Z',
    author: 'QRateX Ekibi',
    readingMinutes: 5,
    content: [
      { type: 'p', text: 'Gamification, oyun mekaniklerini oyun dışı bir bağlama taşımaktır. Müşteri deneyiminde doğru uygulandığında, sıradan bir ziyareti tekrarlanan bir alışkanlığa dönüştürür.' },
      { type: 'h2', text: 'Puan ekonomisi' },
      { type: 'p', text: 'Her geri bildirim, ziyaret veya görev tamamlama müşteriye puan kazandırır. Puanlar ödüllere, kozmetik öğelere veya özel kampanyalara dönüşür. Önemli olan ekonominin dengeli olması: puan kazanımı anlamlı, harcama ise tatmin edici olmalı.' },
      { type: 'h2', text: 'Rozetler ve görevler' },
      { type: 'p', text: 'Rozetler, müşterinin ilerlemesini görünür kılar ve bir sonraki hedefe motive eder. Görevler ise davranışı yönlendirir — "3 farklı kategoride işletme ziyaret et" gibi görevler keşfi teşvik eder.' },
      { type: 'ul', items: [
        'Seviyeler ve seriler (streak) ile düzenli katılımı ödüllendirin.',
        'Ligler ve liderlik tabloları ile sosyal rekabet yaratın.',
        'Sürpriz kutular ve mini oyunlar ile beklenmedik hazlar sunun.',
        'Sosyal sorumluluk: puanları bağışa çevirerek anlam katın.',
      ] },
      { type: 'h2', text: 'Ölçün ve iyileştirin' },
      { type: 'p', text: 'Gamification bir kur-unut sistemi değildir. QRateX analitiği, hangi mekaniğin katılımı artırdığını, hangisinin işe yaramadığını gösterir. Ekonomi ayarlarını yönetici panelinden düzenleyerek dengeyi sürekli iyileştirebilirsiniz.' },
    ],
  },
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

// Sunucu/istemci locale (ICU) farkından doğan hydration hatalarını önlemek için
// deterministik TR tarih formatı. `long`=tam ay adı, `short`=kısaltma.
const TR_MONTHS_LONG = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const TR_MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

export function formatBlogDate(iso: string, style: 'long' | 'short' = 'long'): string {
  const d = new Date(iso);
  const months = style === 'long' ? TR_MONTHS_LONG : TR_MONTHS_SHORT;
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
