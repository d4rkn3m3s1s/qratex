/**
 * QRA asistanının uygulama-içi bilgi tabanı: müşteri sayfa haritası + "nasıl yapılır"
 * SSS eşlemesi. Sistem promptuna enjekte edilir ki QRA "puanımı nasıl harcarım?" gibi
 * sorularda internetten genel cevap yerine doğru sekmeye yönlendirsin.
 *
 * Yol ve sekme ADLARI tek navigasyon kaydından (`lib/navigation/registry.ts`) TÜRETİLİR —
 * burada yalnız her sayfanın "ne işe yarar" metni ve SSS tutulur. Eskiden elle tutulan 19
 * yollu liste menüden kopmuştu (B2): emekli URL'ler ve artık var olmayan sekme adları
 * ("Çerçeve Dükkanı", "Sürpriz Kutularım"…) öneriliyordu. Yeni müşteri menü sayfası
 * eklendiğinde `QRA_PURPOSE`'a bir satır eklenmezse
 * `__tests__/lib/qra-knowledge-base.test.ts` düşer (iki yönlü).
 */
import { isDynamicHref, routesForRole, type NavRoute } from '@/lib/navigation/registry';

export interface QraSiteMapEntry {
  /** Kayıt kimliği (`NavRoute.id`). */
  id: string;
  /** Gerçek route — app/customer/** (kayıttan). */
  path: string;
  /** Kullanıcıya görünen menü yolu (TR, kayıttan; ör. "Cüzdan › Ödüller"). */
  label: string;
  /** Bu sayfada ne yapılır (kısa). */
  purpose: string;
}

/** Müşteri menüsündeki her sayfanın amacı — anahtar: kayıt kimliği. */
export const QRA_PURPOSE: Readonly<Record<string, string>> = {
  'customer.home': 'Ana özet: puan bakiyesi, seri, günlük hedef ve son aktiviteler',
  'customer.places': 'Yakındaki mekânlar, kaydettiğin (favori) mekânlar, fırsatlar/etkinlikler ve en iyi işletmeler; mekâna dokununca mekân detayı açılır',
  'customer.scan': 'İşletmenin QR kodunu okutup puan kazanma ve geri bildirim bırakma; kart aktivasyonu',
  'customer.games': 'Mini oyunlar ve turnuvalar',
  'customer.quests': 'Günlük/haftalık görevleri tamamlayıp ödül kazanma',
  'customer.squads': 'Klana katılma ya da klan kurma, klan savaşları',
  'customer.leaderboard': 'Haftalık, sezonluk ve tüm zamanlar sıralaması; ligin ve bir üst lige kalan puan',
  'customer.wallet': 'Kart, ödüller, hareketler ve bağış tek yerde',
  'customer.wallet.card': 'Kasada göstereceğin QR kartın, statün (VIP kademesi) ve son hareketlerin',
  'customer.wallet.rewards': 'Puanını ödüllere ve profil kozmetiklerine (çerçeve, rozet, arka plan) çevirme',
  'customer.wallet.owned': 'Aldığın ödül kodları, kabul ettiğin telafi kuponları (kasada QR olarak gösterilir) ve sürpriz kutuların (günlük kutu dahil)',
  'customer.wallet.activity': 'Puan geçmişin, ziyaretlerin/tüketimlerin ve harcama özetin',
  'customer.wallet.donate': 'Puanınla sosyal sorumluluk projelerine bağış yapma',
  'customer.me': 'Profilin, ilerlemen ve hesabınla ilgili her şey',
  'customer.me.progress': 'Seviyen, katkın, deneyim skorun ve kişisel trendlerin',
  'customer.me.badges': 'Kazandığın rozetler ve karakter rozeti ilerlemen',
  'customer.me.year': 'Yılın özeti: en çok gittiğin mekânlar ve öne çıkan anların',
  'customer.me.voices': 'Yorumların, işletmelerin yanıtları ve sana gelen telafi teklifleri (teklifi buradan kabul edersin)',
  'customer.me.invite': 'Arkadaşını davet etme, davet kodun ve davet ödüllerin',
  'customer.me.settings': 'Hesap, dil, bildirim ve gizlilik ayarları',
};

/** Qra'nın tanıttığı müşteri rotaları: menüde görünen (primary/secondary), statik, ekip dışı. */
export function qraCustomerRoutes(): NavRoute[] {
  return routesForRole('customer').filter(
    (r) => (r.status === 'primary' || r.status === 'secondary') && !r.teamOnly && !isDynamicHref(r.href)
  );
}

function menuPath(route: NavRoute, byId: Map<string, NavRoute>): string {
  const parent = route.parent ? byId.get(route.parent) : undefined;
  return parent ? `${parent.label.tr} › ${route.label.tr}` : route.label.tr;
}

/** Müşteri panelindeki sayfa haritası — kayıttan türetilir (menü ile birebir). */
export function buildQraSiteMap(): QraSiteMapEntry[] {
  const byId = new Map(routesForRole('customer').map((r) => [r.id, r]));
  return qraCustomerRoutes()
    .filter((r) => QRA_PURPOSE[r.id])
    .map((r) => ({ id: r.id, path: r.href, label: menuPath(r, byId), purpose: QRA_PURPOSE[r.id] }));
}

export interface QraFaqEntry {
  /** Tipik kullanıcı sorusu */
  question: string;
  /** Yönlendirilecek sayfanın kayıt kimliği. */
  routeId: string;
  /** Adımlar / kısa açıklama */
  answer: string;
}

/** Sık sorulan "nasıl yapılır" → doğru sayfa eşlemesi (sayfa adı ve yolu kayıttan). */
export const QRA_CUSTOMER_FAQ: QraFaqEntry[] = [
  {
    question: 'Puanlarımı nasıl harcarım / ödüle çeviririm?',
    routeId: 'customer.wallet.rewards',
    answer: 'Ödüller sayfasında puanını bir ödüle ya da profil kozmetiğine çevirebilirsin.',
  },
  {
    question: 'Aldığım ödülün kodu / kuponum nerede, kasada nasıl gösteririm?',
    routeId: 'customer.wallet.owned',
    answer: 'Ödüllerim sayfasında kodunu aç; QR olarak kasada göster.',
  },
  {
    question: 'Kartımı kasada nasıl gösteririm?',
    routeId: 'customer.wallet.card',
    answer: 'Kartım sayfasındaki QR kartını kasada okut.',
  },
  {
    question: 'QR kodu nasıl okuturum / tararım?',
    routeId: 'customer.scan',
    answer: 'Tara sayfasından kameranla işletmenin QR kodunu okut.',
  },
  {
    question: 'Günlük kutumu / sürpriz kutumu nereden açarım?',
    routeId: 'customer.wallet.owned',
    answer: 'Ödüllerim sayfasındaki Kutularım sekmesinde günlük kutunu ve hediye kutularını açabilirsin.',
  },
  {
    question: 'Telafi tekliflerimi nereden görürüm?',
    routeId: 'customer.me.voices',
    answer: 'Seslerim sayfasında işletmeden gelen teklifi açıp seçimini yaparsın; kupon türündeyse Ödüllerim’de kasada gösterirsin.',
  },
  {
    question: 'Rozetlerimi nereden görürüm?',
    routeId: 'customer.me.badges',
    answer: 'Rozetler sayfasında kazandığın rozetleri ve ilerlemeni görürsün.',
  },
  {
    question: 'Klana nasıl katılırım?',
    routeId: 'customer.squads',
    answer: 'Klan sayfasında davet koduyla bir klana katılabilir ya da kendi klanını kurabilirsin.',
  },
  {
    question: 'Çerçeve / avatar çerçevesi nereden alırım?',
    routeId: 'customer.wallet.rewards',
    answer: 'Ödüller sayfasının kozmetik bölümünde puanla çerçeve, rozet ve arka plan alabilirsin.',
  },
  {
    question: 'Puan geçmişimi / ziyaretlerimi nereden görürüm?',
    routeId: 'customer.wallet.activity',
    answer: 'Hareketler sayfasında puan defterini, ziyaretlerini ve harcama özetini görürsün.',
  },
  {
    question: 'Bağış nasıl yaparım?',
    routeId: 'customer.wallet.donate',
    answer: 'Bağış sayfasında puanınla bir projeye bağış yapabilirsin.',
  },
  {
    question: 'Arkadaşımı nasıl davet ederim?',
    routeId: 'customer.me.invite',
    answer: 'Davet sayfasından davet kodunu paylaşabilirsin.',
  },
  {
    question: 'Dil ve bildirim ayarlarını nereden değiştiririm?',
    routeId: 'customer.me.settings',
    answer: 'Ayarlar sayfasından dil ve bildirim tercihlerini değiştirebilirsin.',
  },
];

/**
 * Bilgi tabanını sistem promptuna eklenecek metne çevirir. Sayfa haritası + SSS +
 * net yönlendirme kuralı içerir.
 */
export function buildQraKnowledgeBlock(): string {
  const sitemapEntries = buildQraSiteMap();
  const byId = new Map(sitemapEntries.map((e) => [e.id, e]));
  const sitemap = sitemapEntries.map((e) => `- ${e.label} (${e.path}): ${e.purpose}`).join('\n');

  const faq = QRA_CUSTOMER_FAQ.flatMap((f) => {
    const target = byId.get(f.routeId);
    return target ? [`- Soru: "${f.question}" → ${target.label} (${target.path}). ${f.answer}`] : [];
  }).join('\n');

  return `
## Uygulama Sayfa Haritası (Müşteri Paneli)
Aşağıdaki sayfalar uygulamanın içindedir. "A › B" biçimi menüdeki yeri gösterir (A menüsünün altındaki B sayfası). Kullanıcı bir özelliği nerede bulacağını sorduğunda DOĞRU sayfayı bu adla söyle.
${sitemap}

## Sık Sorulan Sorular → Sayfa Yönlendirmesi
${faq}

## Yönlendirme Kuralı (ÇOK ÖNEMLİ)
- Kullanıcı "nasıl yaparım / nerede" diye bir özellik sorduğunda, internetten genel bilgi VERME.
- Yukarıdaki harita ve SSS'yi kullanarak uygulama içindeki DOĞRU sayfanın adını ve ne yapacağını söyle.
- Haritada olmayan bir sayfa ya da özellik UYDURMA; emin değilsen en yakın sayfayı öner ve kullanıcıya o sayfaya bakmasını söyle.
- Yolları (örn. /customer/wallet/rewards) kullanıcıya ham link olarak verme; menü adıyla tarif et ("Cüzdan › Ödüller'e git").`;
}
