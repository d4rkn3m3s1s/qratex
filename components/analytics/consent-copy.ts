/**
 * Rıza arayüzü metinleri (TR/EN). Metin gerçek davranışla birebir: yalnız kullanılan
 * kategoriler (analitik, oturum kaydı) sorulur; pazarlama çerezi KULLANILMAZ ve bu açıkça
 * yazılır.
 */
export type ConsentLocale = 'tr' | 'en';

export interface ConsentCopy {
  bannerTitle: string;
  bannerBody: string;
  policyLink: string;
  rejectAll: string;
  acceptAll: string;
  manage: string;
  centerTitle: string;
  centerDescription: string;
  necessaryTitle: string;
  necessaryBody: string;
  analyticsTitle: string;
  analyticsBody: string;
  replayTitle: string;
  replayBody: string;
  replayNeedsAnalytics: string;
  marketingNote: string;
  alwaysOn: string;
  save: string;
  saved: string;
  lastDecision: (date: string) => string;
  noDecision: string;
  status: (on: boolean) => string;
  preferencesButton: string;
  providers: string;
}

const TR: ConsentCopy = {
  bannerTitle: 'Gizliliğinize saygı duyuyoruz',
  bannerBody:
    'Zorunlu çerezler oturumunuz ve güvenliğiniz için her zaman açıktır. Ürünü iyileştirmek için kullandığımız analitik ve oturum kaydı ise yalnız siz izin verirseniz çalışır. Kararınızı istediğiniz an değiştirebilirsiniz.',
  policyLink: 'Çerez Politikası',
  rejectAll: 'Tümünü reddet',
  acceptAll: 'Tümünü kabul et',
  manage: 'Tercihleri yönet',
  centerTitle: 'Çerez ve izleme tercihleri',
  centerDescription: 'Hangi isteğe bağlı işlemeye izin verdiğinizi seçin. Ret, kabul kadar kolaydır ve hizmeti kullanmanızı engellemez.',
  necessaryTitle: 'Zorunlu',
  necessaryBody: 'Giriş oturumu, güvenlik, dil ve bu tercihin kendisi. Hizmet bunlarsız çalışmaz; kapatılamaz.',
  analyticsTitle: 'Analitik',
  analyticsBody:
    'Hangi sayfaların ve özelliklerin kullanıldığını ölçeriz (PostHog, AB bölgesi). Adres çubuğundaki giriş bağlantıları ve kodlar gönderilmeden önce silinir.',
  replayTitle: 'Oturum kaydı',
  replayBody:
    'Hataları anlamak için ekrandaki etkileşimleri kaydederiz. Yazdığınız tüm alanlar maskelenir; giriş, şifre ve kart sayfaları hiç kaydedilmez.',
  replayNeedsAnalytics: 'Oturum kaydı için önce analitiği açın.',
  marketingNote: 'Pazarlama veya reklam çerezi kullanmıyoruz; bu yüzden böyle bir seçenek yok.',
  alwaysOn: 'Her zaman açık',
  save: 'Seçimlerimi kaydet',
  saved: 'Tercihleriniz kaydedildi.',
  lastDecision: (date) => `Son kararınız: ${date}`,
  noDecision: 'Henüz bir seçim yapmadınız; isteğe bağlı işleme kapalı.',
  status: (on) => (on ? 'Açık' : 'Kapalı'),
  preferencesButton: 'Çerez tercihleri',
  providers: 'Çerezsiz ve kimliksiz sayfa ölçümü (Vercel) rıza gerektirmez ve kişisel profil oluşturmaz.',
};

const EN: ConsentCopy = {
  bannerTitle: 'We respect your privacy',
  bannerBody:
    'Essential cookies keep you signed in and secure, so they are always on. Analytics and session recording, which help us improve the product, only run if you allow them. You can change your choice at any time.',
  policyLink: 'Cookie Policy',
  rejectAll: 'Reject all',
  acceptAll: 'Accept all',
  manage: 'Manage preferences',
  centerTitle: 'Cookie and tracking preferences',
  centerDescription: 'Choose which optional processing you allow. Rejecting is as easy as accepting and never blocks the service.',
  necessaryTitle: 'Essential',
  necessaryBody: 'Sign-in session, security, language and this choice itself. The service cannot work without them.',
  analyticsTitle: 'Analytics',
  analyticsBody:
    'We measure which pages and features are used (PostHog, EU region). Sign-in links and codes in the address bar are removed before sending.',
  replayTitle: 'Session recording',
  replayBody:
    'We record on-screen interactions to understand errors. Every input is masked; sign-in, password and card pages are never recorded.',
  replayNeedsAnalytics: 'Turn on analytics first to allow session recording.',
  marketingNote: 'We do not use marketing or advertising cookies, so there is no such option.',
  alwaysOn: 'Always on',
  save: 'Save my choices',
  saved: 'Your preferences were saved.',
  lastDecision: (date) => `Last decision: ${date}`,
  noDecision: 'You have not made a choice yet; optional processing is off.',
  status: (on) => (on ? 'On' : 'Off'),
  preferencesButton: 'Cookie preferences',
  providers: 'Cookieless, anonymous page measurement (Vercel) needs no consent and builds no personal profile.',
};

export function getConsentCopy(locale: string | null | undefined): ConsentCopy {
  return locale === 'en' ? EN : TR;
}
