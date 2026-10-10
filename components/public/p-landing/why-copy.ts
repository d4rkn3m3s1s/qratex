/**
 * `/neden-qratex` — İşletmeler için "Neden {marka}?" sayfası metinleri (TR/EN).
 * Her iddia koddaki gerçek bir modüle karşılık gelir (Gelen kutusu, AI analizi, telafi,
 * otomatik yanıt, kampanya, analitik/kıyas, ekip, plan kotaları).
 */
import type { PublicLocale } from './fmt';

export interface WhyCopy {
  meta: { title: string; description: string };
  breadcrumb: { home: string; current: string };
  hero: { eyebrow: string; title: string; sub: string; ctaRegister: string; ctaPricing: string; ctaContact: string };
  proof: { heading: string; businesses: string; feedbacks: string; feedbacksLast30d: string; rating: string; members: string };
  comparison: {
    eyebrow: string;
    title: string;
    sub: string;
    colTopic: string;
    colClassic: string;
    caption: string;
    rows: Array<{ topic: string; ours: string; classic: string; trustLink?: boolean }>;
    trustLinkLabel: string;
  };
  how: { eyebrow: string; title: string; steps: Array<{ title: string; body: string }> };
  features: { eyebrow: string; title: string; sub: string; items: Array<{ title: string; body: string }> };
  pricing: {
    eyebrow: string;
    title: string;
    sub: string;
    popular: string;
    free: string;
    cta: string;
    ctaFree: string;
    quotaHeading: string;
    featuresHeading: string;
    emptyTitle: string;
    emptyBody: string;
    unavailableTitle: string;
    unavailableBody: string;
    contactCta: string;
    note: string;
  };
  faq: { eyebrow: string; title: string; trustLink: string; items: Array<{ q: string; a: string }> };
  final: { title: string; sub: string; ctaRegister: string; ctaConsumer: string };
}

const tr: WhyCopy = {
  meta: {
    title: 'Neden {brand}? İşletmeler için QR geri bildirim ve sadakat',
    description:
      '{brand} ile müşteri geri bildirimini QR kodla anında toplayın, yapay zekâ ile analiz edin, telafi ve oyunlaştırmayla müşterinizi geri getirin. Klasik yöntemlerle karşılaştırma, planlar ve SSS.',
  },
  breadcrumb: { home: 'Ana Sayfa', current: 'Neden {brand}?' },
  hero: {
    eyebrow: 'İşletmeler için',
    title: 'Neden {brand}?',
    sub:
      'Müşteri deneyimini masada, o anda yakalayın. {brand}; QR ile geri bildirim toplamayı, yapay zekâ analizini, olumsuz deneyime hızlı dönüşü ve müşteriyi geri getiren oyunlaştırmayı tek panelde birleştirir.',
    ctaRegister: 'Ücretsiz işletme hesabı aç',
    ctaPricing: 'Planları gör',
    ctaContact: 'Bize yazın',
  },
  proof: {
    heading: 'Platformdan güncel rakamlar',
    businesses: 'İşletme',
    feedbacks: 'Geri bildirim',
    feedbacksLast30d: 'Son 30 günde geri bildirim',
    rating: 'Ortalama puan',
    members: 'Kayıtlı üye',
  },
  comparison: {
    eyebrow: 'Karşılaştırma',
    title: 'Klasik yöntemlere göre farkı',
    sub: 'Kâğıt anket, sonradan gönderilen form ya da ayrı sadakat kartı yerine tek akış.',
    colTopic: 'Konu',
    colClassic: 'Klasik yöntem',
    caption: '{brand} ile klasik geri bildirim yöntemlerinin karşılaştırması',
    rows: [
      {
        topic: 'Geri bildirim toplama',
        ours: 'Masadaki QR kodla, deneyim tazeyken; müşterinin uygulama indirmesi gerekmez.',
        classic: 'Kâğıt anket ya da günler sonra gelen e-posta formu.',
      },
      {
        topic: 'Analiz',
        ours: 'Yapay zekâ duygu, konu ve niyeti otomatik çıkarır; panelde özetlenir.',
        classic: 'Yorumlar elle okunur, tabloya aktarılır.',
      },
      {
        topic: 'Olumsuz deneyim',
        ours: 'Uyarı, otomatik yanıt ve telafi teklifiyle müşteri ayrılmadan geri dönüş.',
        classic: 'Çoğu zaman müşteri gittikten sonra fark edilir.',
      },
      {
        topic: 'Müşteri sadakati',
        ours: 'Puan, rozet, lig ve ödüllerle tekrar gelme motivasyonu; kampanyalarla geri çağırma.',
        classic: 'Ayrı bir damga kartı ya da hiç yok.',
      },
      {
        topic: 'Şube ve personel görünürlüğü',
        ours: 'Şube ve personel bazında puanlar, saat bazında yoğunluk ısı haritası.',
        classic: 'Genel bir izlenim; kırılım yok.',
      },
      {
        topic: 'Kurulum',
        ours: 'Hesap açın, QR kodunuzu oluşturup yazdırın; dakikalar içinde hazır.',
        classic: 'Anket aracı, baskı ve veri girişi için ayrı ayrı uğraş.',
      },
      {
        topic: 'Veri ve KVKK',
        ours: 'Çerez rızası, veri indirme ve silme panelden; her işletme yalnız kendi verisini görür.',
        classic: 'Kişisel veriler kâğıt formlarda ve dağınık tablolarda.',
        trustLink: true,
      },
    ],
    trustLinkLabel: 'Güven sayfası',
  },
  how: {
    eyebrow: 'Nasıl başlanır',
    title: 'Üç adımda hazır',
    steps: [
      { title: 'Ücretsiz hesap açın', body: 'İşletme bilgilerinizi girin; kayıt için kredi kartı gerekmez, ücretsiz kotayla başlarsınız.' },
      { title: 'QR kodlarınızı oluşturun', body: 'Masa, şube ya da ürün için QR kod oluşturun, indirip yazdırın.' },
      { title: 'Panelden yönetin', body: 'Gelen kutusunda yanıtlayın, yapay zekâ özetini okuyun, kampanyalarla müşterinizi geri çağırın.' },
    ],
  },
  features: {
    eyebrow: 'Neler var',
    title: 'Tek panelde müşteri deneyimi',
    sub: 'Operasyonu sakin tutan, müşteriyi geri getiren araçlar.',
    items: [
      { title: 'Gelen kutusu', body: 'QR geri bildirimleri ve tüketim yorumları tek listede; durum takibi ve hızlı yanıt.' },
      { title: 'Yapay zekâ analizi', body: 'Duygu, konu ve niyet etiketleri; sayılar veritabanından, yapay zekâ yalnız özetler.' },
      { title: 'Telafi ve otomatik yanıt', body: 'Olumsuz deneyime kural bazlı otomatik yanıt ve onaylı telafi teklifi.' },
      { title: 'Kampanyalar', body: 'Segmentlere hedefli kampanya, fırsat ve bildirim; performans takibi.' },
      { title: 'Analitik ve kıyas', body: 'Dönem karşılaştırmalı puan ve duygu trendleri, yoğunluk ısı haritası, anonim sektör kıyası.' },
      { title: 'Ekip ve şubeler', body: 'Personel hesapları ve rolleri, şube bazında QR kodlar ve sonuçlar.' },
    ],
  },
  pricing: {
    eyebrow: 'Planlar',
    title: 'İşletmenize uygun planı seçin',
    sub: 'Fiyatlar ve kotalar, faturalamada kullanılan plan tablosunun aynısıdır.',
    popular: 'En çok tercih edilen',
    free: 'Ücretsiz',
    cta: 'Bu planla başla',
    ctaFree: 'Ücretsiz başla',
    quotaHeading: 'Kotalar',
    featuresHeading: 'Plana dahil',
    emptyTitle: 'Planlar şu an listelenmiyor',
    emptyBody: 'İşletmenize uygun planı birlikte belirleyelim. {email} adresine yazabilirsiniz.',
    unavailableTitle: 'Plan bilgisi şu an yüklenemedi',
    unavailableBody: 'Lütfen biraz sonra tekrar deneyin ya da {email} adresine yazın.',
    contactCta: 'E-posta gönder',
    note: 'Ödeme ve abonelik yönetimi kayıttan sonra işletme panelindeki faturalama sayfasından yapılır; plan değiştirebilir ya da iptal edebilirsiniz.',
  },
  faq: {
    eyebrow: 'Sık sorulanlar',
    title: 'İşletmelerin sorduğu sorular',
    trustLink: 'Güvenlik, KVKK ve alt işlemciler',
    items: [
      {
        q: 'Müşterilerim QR kodu okutmak için uygulama indirmeli mi?',
        a: 'Hayır. Telefon kamerası yeterli; geri bildirim sayfası tarayıcıda açılır.',
      },
      {
        q: 'Müşterilerimin üye olması gerekir mi?',
        a: 'Hayır, isteyen üye olmadan da geri bildirim verebilir. Üye olanlar puan ve rozet kazandığı için tekrar gelme motivasyonu artar.',
      },
      {
        q: 'Yapay zekâ neyi analiz ediyor?',
        a: 'Geri bildirim metninden duygu, konu ve niyet çıkarır; özetler panelinizde görünür. Puanlar, sayılar ve grafikler yapay zekâya değil veritabanına dayanır.',
      },
      {
        q: 'Verilerimi kimler görebilir?',
        a: 'Geri bildirimler yalnız sizin işletme hesabınıza bağlıdır; başka işletmeler göremez. Personeliniz müşteri e-postalarını maskeli görür. Barındırma ve alt işlemciler Güven sayfasında listelenir.',
      },
      {
        q: 'Planımı sonra değiştirebilir miyim?',
        a: 'Evet. İşletme panelindeki faturalama sayfasından planınızı değiştirebilir ya da aboneliğinizi iptal edebilirsiniz.',
      },
    ],
  },
  final: {
    title: 'Müşterinizi bugün duymaya başlayın',
    sub: 'Ücretsiz hesap açın, ilk QR kodunuzu oluşturun; ilk geri bildirim bir taramayla gelir.',
    ctaRegister: 'Ücretsiz işletme hesabı aç',
    ctaConsumer: 'Müşteri olarak katıl',
  },
};

const en: WhyCopy = {
  meta: {
    title: 'Why {brand}? QR feedback and loyalty for businesses',
    description:
      'Collect customer feedback instantly via QR, analyze it with AI and bring customers back with recovery offers and gamification. Comparison with classic methods, plans and FAQ.',
  },
  breadcrumb: { home: 'Home', current: 'Why {brand}?' },
  hero: {
    eyebrow: 'For businesses',
    title: 'Why {brand}?',
    sub:
      'Capture the customer experience at the table, in the moment. {brand} combines QR feedback, AI analysis, fast recovery from bad experiences and loyalty-building gamification in one dashboard.',
    ctaRegister: 'Create a free business account',
    ctaPricing: 'See plans',
    ctaContact: 'Contact us',
  },
  proof: {
    heading: 'Current numbers from the platform',
    businesses: 'Businesses',
    feedbacks: 'Feedback entries',
    feedbacksLast30d: 'Feedback in the last 30 days',
    rating: 'Average rating',
    members: 'Registered members',
  },
  comparison: {
    eyebrow: 'Comparison',
    title: 'How it differs from classic methods',
    sub: 'One flow instead of paper surveys, follow-up forms or a separate loyalty card.',
    colTopic: 'Topic',
    colClassic: 'Classic method',
    caption: 'Comparison of {brand} with classic feedback methods',
    rows: [
      {
        topic: 'Collecting feedback',
        ours: 'Via the QR code on the table while the experience is fresh; no app needed.',
        classic: 'Paper surveys or an email form days later.',
      },
      {
        topic: 'Analysis',
        ours: 'AI extracts sentiment, topics and intent automatically; summarized in the dashboard.',
        classic: 'Reviews are read and copied into spreadsheets by hand.',
      },
      {
        topic: 'Bad experiences',
        ours: 'Alerts, automatic replies and recovery offers before the customer is gone.',
        classic: 'Usually noticed after the customer has left.',
      },
      {
        topic: 'Customer loyalty',
        ours: 'Points, badges, leagues and rewards to come back; campaigns to win customers back.',
        classic: 'A separate stamp card, or nothing at all.',
      },
      {
        topic: 'Branch and staff visibility',
        ours: 'Ratings per branch and staff member, hourly busyness heatmap.',
        classic: 'A general impression with no breakdown.',
      },
      {
        topic: 'Setup',
        ours: 'Create an account, generate and print your QR code; ready in minutes.',
        classic: 'Separate effort for survey tools, printing and data entry.',
      },
      {
        topic: 'Data and privacy',
        ours: 'Cookie consent, data export and deletion from the dashboard; each business sees only its own data.',
        classic: 'Personal data on paper forms and scattered spreadsheets.',
        trustLink: true,
      },
    ],
    trustLinkLabel: 'Trust page',
  },
  how: {
    eyebrow: 'Getting started',
    title: 'Ready in three steps',
    steps: [
      { title: 'Create a free account', body: 'Enter your business details; no credit card needed, you start with the free quota.' },
      { title: 'Generate QR codes', body: 'Create QR codes for tables, branches or products, then download and print them.' },
      { title: 'Manage from the dashboard', body: 'Reply from the inbox, read the AI summary, win customers back with campaigns.' },
    ],
  },
  features: {
    eyebrow: 'What you get',
    title: 'Customer experience in one dashboard',
    sub: 'Tools that keep operations calm and bring customers back.',
    items: [
      { title: 'Inbox', body: 'QR feedback and purchase reviews in one list; status tracking and quick replies.' },
      { title: 'AI analysis', body: 'Sentiment, topic and intent tags; numbers come from the database, AI only summarizes.' },
      { title: 'Recovery and auto replies', body: 'Rule-based automatic replies and approved recovery offers for bad experiences.' },
      { title: 'Campaigns', body: 'Targeted campaigns, offers and notifications by segment; performance tracking.' },
      { title: 'Analytics and benchmarks', body: 'Period-over-period rating and sentiment trends, busyness heatmap, anonymous industry benchmark.' },
      { title: 'Team and branches', body: 'Staff accounts and roles, QR codes and results per branch.' },
    ],
  },
  pricing: {
    eyebrow: 'Plans',
    title: 'Pick the right plan for your business',
    sub: 'Prices and quotas are the same plan table used for billing.',
    popular: 'Most popular',
    free: 'Free',
    cta: 'Start with this plan',
    ctaFree: 'Start for free',
    quotaHeading: 'Quotas',
    featuresHeading: 'Included',
    emptyTitle: 'Plans are not listed right now',
    emptyBody: 'Let’s find the right plan together. Write to {email}.',
    unavailableTitle: 'Plan information could not be loaded',
    unavailableBody: 'Please try again shortly or write to {email}.',
    contactCta: 'Send email',
    note: 'Payment and subscription are managed after sign-up from the billing page in the business dashboard; you can change or cancel your plan.',
  },
  faq: {
    eyebrow: 'FAQ',
    title: 'Questions businesses ask',
    trustLink: 'Security, privacy and sub-processors',
    items: [
      { q: 'Do my customers need an app to scan the QR code?', a: 'No. The phone camera is enough; the feedback page opens in the browser.' },
      {
        q: 'Do my customers need an account?',
        a: 'No, anyone can give feedback without an account. Members earn points and badges, which motivates them to come back.',
      },
      {
        q: 'What does the AI analyze?',
        a: 'It extracts sentiment, topics and intent from feedback text; summaries appear in your dashboard. Scores, counts and charts come from the database, not from AI.',
      },
      {
        q: 'Who can see my data?',
        a: 'Feedback belongs to your business account only; other businesses cannot see it. Your staff see customer emails masked. Hosting and sub-processors are listed on the Trust page.',
      },
      { q: 'Can I change my plan later?', a: 'Yes. You can change your plan or cancel your subscription from the billing page in the business dashboard.' },
    ],
  },
  final: {
    title: 'Start hearing your customers today',
    sub: 'Create a free account and your first QR code; the first feedback is one scan away.',
    ctaRegister: 'Create a free business account',
    ctaConsumer: 'Join as a customer',
  },
};

export function getWhyCopy(locale: PublicLocale): WhyCopy {
  return locale === 'en' ? en : tr;
}
