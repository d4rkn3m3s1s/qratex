/**
 * QRA asistanının uygulama-içi bilgi tabanı: müşteri sayfa haritası + "nasıl yapılır"
 * SSS eşlemesi. Sistem promptuna enjekte edilir ki QRA "kupon nasıl girilir?" gibi
 * sorularda internetten genel cevap yerine doğru sekmeye yönlendirsin.
 *
 * Buradaki yollar gerçek route'lardır (app/customer/**). Yeni müşteri sayfası
 * eklendiğinde buraya da bir satır eklenmeli ki QRA güncel kalsın.
 */

export interface QraSiteMapEntry {
  /** Gerçek route — app/customer/** */
  path: string;
  /** Kullanıcıya görünen sekme adı (TR) */
  label: string;
  /** Bu sayfada ne yapılır (kısa) */
  purpose: string;
}

/** Müşteri panelindeki sayfa haritası (sidebar ile uyumlu). */
export const QRA_CUSTOMER_SITEMAP: QraSiteMapEntry[] = [
  { path: '/customer', label: 'Panel', purpose: 'Ana özet: puan, seviye, son aktiviteler' },
  { path: '/customer/my-card', label: 'Kartım', purpose: 'Kişisel sadakat kartı ve profil' },
  { path: '/customer/rewards', label: 'Ödüller', purpose: 'Puanla ödül alma ve KUPON KODU kullanma' },
  { path: '/customer/remedy', label: 'Telafi Teklifleri', purpose: 'İşletmeden gelen telafi/indirim tekliflerini açma' },
  { path: '/customer/consumptions', label: 'Tüketimlerim', purpose: 'Geçmiş alışveriş/tüketim kayıtları' },
  { path: '/customer/scan', label: 'Tara', purpose: 'QR kod okutma' },
  { path: '/customer/feedbacks', label: 'Geri Bildirimlerim', purpose: 'Gönderdiğin yorum/değerlendirme geçmişi' },
  { path: '/customer/badges', label: 'Rozetlerim', purpose: 'Kazanılan rozetler ve ilerleme' },
  { path: '/customer/quests', label: 'Görevler', purpose: 'Aktif görevleri tamamlayıp ödül kazanma' },
  { path: '/customer/shop', label: 'Çerçeve Dükkanı', purpose: 'Puan/XP ile çerçeve, rozet ve arka plan satın alma' },
  { path: '/customer/leaderboard', label: 'Liderlik Tablosu', purpose: 'Genel ve klan sıralaması' },
  { path: '/customer/squads', label: 'Klanlar', purpose: 'Klana katılma/kurma, klan savaşları' },
  { path: '/customer/surprise-boxes', label: 'Sürpriz Kutularım', purpose: 'Günlük giriş kutusu ve hediye kutularını açma' },
  { path: '/customer/donations', label: 'Sosyal Sorumluluk', purpose: 'Puanla bağış yapma' },
  { path: '/customer/nearby', label: 'Yakınımdakiler', purpose: 'Yakındaki işletmeleri keşfetme' },
  { path: '/customer/analytics', label: 'Kişisel Analitik', purpose: 'Kategori dağılımı, en çok tüketilen ürünler' },
  { path: '/customer/spending-overview', label: 'Harcama Özeti', purpose: 'Harcama istatistikleri' },
  { path: '/customer/experiences', label: 'Deneyimlerim', purpose: 'İşletmedeki deneyimler ve güvenli paylaşım' },
  { path: '/customer/settings', label: 'Ayarlar', purpose: 'Hesap, dil ve bildirim ayarları' },
];

export interface QraFaqEntry {
  /** Tipik kullanıcı sorusu */
  question: string;
  /** Yönlendirilecek sekme adı + yol */
  label: string;
  path: string;
  /** Adımlar / kısa açıklama */
  answer: string;
}

/** Sık sorulan "nasıl yapılır" → doğru sayfa eşlemesi. */
export const QRA_CUSTOMER_FAQ: QraFaqEntry[] = [
  {
    question: 'Kupon kodunu nasıl girerim / kullanırım?',
    label: 'Ödüller',
    path: '/customer/rewards',
    answer: 'Ödüller sayfasına git, "Kupon Kullan" bölümüne kodunu yapıştır ve uygula.',
  },
  {
    question: 'Puanlarımı nasıl harcarım / ödüle çeviririm?',
    label: 'Ödüller',
    path: '/customer/rewards',
    answer: 'Ödüller sayfasında puanını ödüllerle değiştirebilirsin.',
  },
  {
    question: 'QR kodu nasıl okuturum / tararım?',
    label: 'Tara',
    path: '/customer/scan',
    answer: 'Tara sayfasından kameranla işletmenin QR kodunu okut.',
  },
  {
    question: 'Günlük kutumu / sürpriz kutumu nereden açarım?',
    label: 'Sürpriz Kutularım',
    path: '/customer/surprise-boxes',
    answer: 'Sürpriz Kutularım sayfasında her gün giriş kutunu açabilirsin.',
  },
  {
    question: 'Telafi tekliflerimi nereden görürüm?',
    label: 'Telafi Teklifleri',
    path: '/customer/remedy',
    answer: 'Telafi Teklifleri sayfasında işletmeden gelen indirim/telafi tekliflerini açabilirsin.',
  },
  {
    question: 'Rozetlerimi nereden görürüm?',
    label: 'Rozetlerim',
    path: '/customer/badges',
    answer: 'Rozetlerim sayfasında kazandığın rozetleri ve ilerlemeni görürsün.',
  },
  {
    question: 'Klana nasıl katılırım?',
    label: 'Klanlar',
    path: '/customer/squads',
    answer: 'Klanlar sayfasında davet koduyla bir klana katılabilir veya kendi klanını kurabilirsin.',
  },
  {
    question: 'Çerçeve / avatar çerçevesi nereden alırım?',
    label: 'Çerçeve Dükkanı',
    path: '/customer/shop',
    answer: 'Çerçeve Dükkanı sayfasında puan/XP ile çerçeve, rozet ve arka plan alabilirsin.',
  },
  {
    question: 'Bağış nasıl yaparım?',
    label: 'Sosyal Sorumluluk',
    path: '/customer/donations',
    answer: 'Sosyal Sorumluluk sayfasında puanınla bağış yapabilirsin.',
  },
  {
    question: 'Dil ve bildirim ayarlarını nereden değiştiririm?',
    label: 'Ayarlar',
    path: '/customer/settings',
    answer: 'Ayarlar sayfasından dil ve bildirim tercihlerini değiştirebilirsin.',
  },
];

/**
 * Bilgi tabanını sistem promptuna eklenecek metne çevirir. Sayfa haritası + SSS +
 * net yönlendirme kuralı içerir.
 */
export function buildQraKnowledgeBlock(): string {
  const sitemap = QRA_CUSTOMER_SITEMAP.map(
    (e) => `- ${e.label} (${e.path}): ${e.purpose}`
  ).join('\n');

  const faq = QRA_CUSTOMER_FAQ.map(
    (f) => `- Soru: "${f.question}" → ${f.label} sayfası (${f.path}). ${f.answer}`
  ).join('\n');

  return `
## Uygulama Sayfa Haritası (Müşteri Paneli)
Aşağıdaki sayfalar uygulamanın içindedir. Kullanıcı bir özelliği nerede bulacağını sorduğunda DOĞRU sekmeyi adıyla söyle.
${sitemap}

## Sık Sorulan Sorular → Sayfa Yönlendirmesi
${faq}

## Yönlendirme Kuralı (ÇOK ÖNEMLİ)
- Kullanıcı "nasıl yaparım / nerede" diye bir özellik sorduğunda, internetten genel bilgi VERME.
- Yukarıdaki harita ve SSS'yi kullanarak uygulama içindeki DOĞRU sekmenin adını ve ne yapacağını söyle.
- Emin değilsen en yakın sekmeyi öner ve kullanıcıya o sekmeye bakmasını söyle.
- Yolları (örn. /customer/rewards) kullanıcıya ham link olarak verme; sekme ADIYLA tarif et ("Ödüller sayfasına git").`;
}
