/**
 * `/guven` — Güven Merkezi metinleri (TR/EN).
 *
 * KURAL: her madde uygulamanın BUGÜNKÜ davranışını anlatır ve koddaki bir kaynağa
 * dayanır (denetim guven.md Bulgu 1-5). Kanıt eşlemesi:
 *  - bcrypt şifre özeti ................ app/api/auth/*, bcryptjs
 *  - e-posta doğrulaması ................ app/api/auth/register (emailVerified null, P0-39)
 *  - iki adımlı doğrulama (TOTP) ........ User.twoFactor*, components/auth/two-factor-settings
 *  - oturum iptali (sessionVersion) ..... lib/api-auth.ts (P0-07), token tekrarı: lib/token-replay.ts
 *  - hız sınırlama ..................... lib/rate-limit.ts
 *  - HSTS/CSP/çerçeve engeli ............ config/security-headers.js, proxy.ts
 *  - kiracı ayrımı ..................... lib/auth/scope.ts (resolveDealerScope, varsayılan red)
 *  - personelde maskeli e-posta ......... app/api/dealer/customers/route.ts (STAFF → maskEmail)
 *  - geri bildirimde ad/foto (e-posta yok) app/api/feedbacks/route.ts (email yalnız admin)
 *  - hesap silme = anonimleştirme ....... lib/gdpr-core.ts#anonymizeUser + yeniden kimlik doğrulama
 *  - KVKK başvurusu (4 tür, 30 gün) ...... app/api/customer/privacy-request, lib/dsr-workflow.ts
 *  - veri indirme ...................... app/api/user/data-export
 *  - rızaya bağlı analitik/oturum kaydı .. components/analytics/posthog-provider.tsx (P0-31)
 *  - çerezsiz performans ölçümü ......... components/analytics/vercel-analytics.tsx
 *  - AI'a yalnız metin ................. lib/ai-engine.ts#analyzeComprehensive(text)
 *  - Frankfurt bölgesi ................. vercel.json regions: fra1
 *  - Stripe barındırılan ödeme .......... app/api/dealer/billing (Checkout)
 *  - denetim kaydı + log maskeleme ...... AuditLog, lib/pii-redact.ts (auth/uyum kayıtları)
 * Ölçülmeyen SLO/uptime rakamları ve "signed URL / watermark" iddiaları KALDIRILDI.
 */
import type { PublicLocale } from './fmt';

/** İçeriğin son gözden geçirildiği gün (sayfa + sitemap için sabit; `new Date()` değil). */
export const TRUST_CONTENT_UPDATED_AT = '2026-10-10';

export interface TrustCopy {
  meta: { title: string; description: string };
  breadcrumb: { home: string; current: string };
  hero: { eyebrow: string; title: string; sub: string; chips: Array<{ label: string; href: string }> };
  status: {
    title: string;
    checking: string;
    ok: string;
    okDetail: string;
    down: string;
    downDetail: string;
    offline: string;
    retry: string;
    note: string;
  };
  data: {
    eyebrow: string;
    title: string;
    sub: string;
    collect: Array<{ title: string; body: string }>;
    seesTitle: string;
    sees: string[];
    notSeesTitle: string;
    notSees: string[];
    ai: string;
    analytics: string;
    leaderboard: string;
    consentButton: string;
  };
  control: {
    eyebrow: string;
    title: string;
    sub: string;
    actions: Array<{ title: string; body: string; cta: string }>;
    loginNote: string;
    businessNote: string;
  };
  business: { eyebrow: string; title: string; items: Array<{ title: string; body: string }> };
  security: { eyebrow: string; title: string; sub: string; items: Array<{ title: string; body: string }> };
  infra: {
    eyebrow: string;
    title: string;
    sub: string;
    colService: string;
    colPurpose: string;
    colData: string;
    rows: Array<{ service: string; purpose: string; data: string }>;
    transferNote: string;
    transferLink: string;
  };
  disclosure: { title: string; body: string; cta: string; securityTxt: string };
  legal: { eyebrow: string; title: string; docs: Array<{ title: string; body: string; href: string }> };
  faq: { eyebrow: string; title: string; items: Array<{ q: string; a: string }> };
  updated: string;
}

const tr: TrustCopy = {
  meta: {
    title: 'Güven Merkezi: güvenlik, gizlilik ve KVKK',
    description:
      '{brand} hangi veriyi neden işler, işletmeler neyi görür, verilerini nasıl indirip silersin? Güvenlik uygulamaları, alt işlemciler ve KVKK hakların tek sayfada.',
  },
  breadcrumb: { home: 'Ana Sayfa', current: 'Güven Merkezi' },
  hero: {
    eyebrow: 'Güven Merkezi',
    title: 'Verin sana ait, güvenliği bizim işimiz',
    sub:
      'Hangi veriyi neden işlediğimizi, kimin neyi gördüğünü ve kontrolün nasıl sende olduğunu sade bir dille anlatıyoruz. Buradaki her madde uygulamanın bugünkü davranışını anlatır.',
    chips: [
      { label: 'KVKK hakların panelde', href: '#kontrol' },
      { label: 'Sunucular Frankfurt (AB)', href: '#altyapi' },
      { label: 'HTTPS ve HSTS', href: '#guvenlik' },
      { label: 'Analitik yalnız rızanla', href: '#senin-verin' },
    ],
  },
  status: {
    title: 'Sistem durumu',
    checking: 'Kontrol ediliyor…',
    ok: 'Sistemler çalışıyor',
    okDetail: 'Veritabanı yanıt süresi {ms} ms · {time} itibarıyla',
    down: 'Şu an bir sorun yaşıyoruz',
    downDetail: 'Veritabanına ulaşılamadı ({time}). Ekibimiz hata izleme üzerinden otomatik olarak uyarılır.',
    offline: 'Durum alınamadı. İnternet bağlantını kontrol edip tekrar dene.',
    retry: 'Tekrar kontrol et',
    note: 'Bu kontrol, sayfayı açtığın anda canlı yapılır.',
  },
  data: {
    eyebrow: 'Senin verin',
    title: 'Ne topluyoruz, kim neyi görüyor?',
    sub: 'Yalnız hizmeti çalıştırmak için gereken veriyi işleriz.',
    collect: [
      {
        title: 'Hesap bilgilerin',
        body: 'Ad, e-posta, isteğe bağlı telefon ve profil fotoğrafı. Giriş yapman ve hesabını yönetmen için.',
      },
      {
        title: 'Geri bildirimlerin',
        body: 'Verdiğin puan, yorum metni ve eklediğin fotoğraflar. İşletmenin hizmetini iyileştirmesi ve senin puan kazanman için.',
      },
      {
        title: 'Oyun ve ödül verilerin',
        body: 'Puan, XP, rozet, lig, seri ve ödül geçmişi. Ödül sistemini çalıştırmak için.',
      },
      {
        title: 'Güvenlik kayıtları',
        body: 'Giriş denemeleri gibi oturum kayıtları. Hesabını kötüye kullanıma karşı korumak için.',
      },
    ],
    seesTitle: 'İşletme görür',
    sees: [
      'Üye olarak verdiğin geri bildirimde adını ve profil fotoğrafını',
      'Puanını, yorumunu ve eklediğin fotoğrafları',
      'Kartınla alışveriş kaydın varsa işletme sahibi, müşteri listesinde e-posta adresini (personel maskeli görür)',
    ],
    notSeesTitle: 'İşletme görmez',
    notSees: [
      'Telefon numaranı',
      'Şifreni (biz de göremeyiz; geri döndürülemez biçimde saklanır)',
      'Başka işletmelere verdiğin geri bildirimleri',
      'Üye olmadan verdiğin geri bildirimde kim olduğunu',
    ],
    ai: 'Yorum metnin; duygu ve konu analizi ile karakter rozeti eşleştirmesi için bir yapay zekâ hizmet sağlayıcısında işlenir. Bu analize adın ve e-posta adresin eklenmez.',
    analytics:
      'Zorunlu çerezler oturumun içindir. Ürün analitiği ve oturum kaydı yalnız onay verirsen çalışır; oturum kaydında yazdığın alanlar maskelenir. Çerezsiz performans ölçümü kimliğini toplamaz. Onayını istediğin an geri çekebilirsin.',
    leaderboard: 'Lig tablosunda adınla görünmek istemezsen Ayarlar → Gizlilik bölümünden kapatabilirsin.',
    consentButton: 'Çerez tercihlerimi yönet',
  },
  control: {
    eyebrow: 'Kontrol sende',
    title: 'Verilerin üzerinde söz hakkın var',
    sub: 'KVKK kapsamındaki haklarını kimseye yazmadan, panelden kullanabilirsin.',
    actions: [
      { title: 'Verilerimi indir', body: 'Hesabındaki kişisel verilerin bir kopyasını indir.', cta: 'Gizlilik ayarlarını aç' },
      {
        title: 'KVKK başvurusu yap',
        body: 'Erişim, düzeltme, silme ya da itiraz talebi oluştur. Talebin en geç 30 gün içinde sonuçlandırılır; makbuzu e-postana gelir.',
        cta: 'Başvuru oluştur',
      },
      {
        title: 'Hesabımı sil',
        body: 'Kişisel bilgilerin silinir ve kayıtlarla bağın koparılır; işletme istatistikleri isimsiz kalır. Güvenliğin için şifren (açıksa iki adımlı doğrulama kodun) istenir.',
        cta: 'Hesap silmeye git',
      },
    ],
    loginNote: 'Bu işlemler hesabına giriş yapmanı ister.',
    businessNote: 'İşletme hesapları için veri ve hesap talepleri:',
  },
  business: {
    eyebrow: 'İşletmeler için',
    title: 'İşletme verisi nasıl korunur?',
    items: [
      {
        title: 'Her işletme yalnız kendi verisini görür',
        body: 'Geri bildirimler ve müşteri kayıtları işletme hesabına bağlıdır; erişim her istekte sunucuda denetlenir ve varsayılan olarak reddedilir.',
      },
      {
        title: 'Ekip rolleri',
        body: 'Personel hesapları işletme sahibinden ayrıdır; personel müşteri e-postalarını maskeli görür, pasifleştirilen personelin erişimi kapanır.',
      },
      {
        title: 'Kart bilgisi bize uğramaz',
        body: 'Abonelik ödemeleri Stripe’ın ödeme sayfasında alınır; kart bilgileri sunucularımızdan geçmez ve saklanmaz.',
      },
      {
        title: 'Dışa aktarma',
        body: 'Geri bildirim dışa aktarımları yalnız oturum açmış yetkili hesapla ve işletmenin kendi verisiyle sınırlıdır.',
      },
    ],
  },
  security: {
    eyebrow: 'Güvenlik uygulamaları',
    title: 'Arka planda neler yapıyoruz?',
    sub: 'Teknik ayrıntıyı sade dille anlattık.',
    items: [
      { title: 'Şifreler geri döndürülemez', body: 'Şifreler bcrypt ile tek yönlü özetlenir; düz metin olarak hiçbir yerde saklanmaz.' },
      { title: 'E-posta doğrulaması', body: 'E-postayla açılan her hesap, e-posta adresi doğrulanarak etkinleşir.' },
      { title: 'İki adımlı doğrulama', body: 'Doğrulama uygulamasıyla (TOTP) ikinci adım ve tek kullanımlık kurtarma kodları ayarlardan açılabilir.' },
      {
        title: 'Oturum güvenliği',
        body: 'Şifren değiştiğinde ya da hesap askıya alındığında eski oturumlar geçersiz olur; oturum belirtecinin yeniden kullanılması tespit edilir.',
      },
      { title: 'Deneme sınırları', body: 'Giriş, kayıt, şifre sıfırlama ve hassas işlemlerde deneme sayısı sınırlanır.' },
      {
        title: 'Şifreli bağlantı',
        body: 'Tüm trafik HTTPS üzerinden; HSTS (preload), içerik güvenlik politikası ve başka sitelere gömülme engeli uygulanır.',
      },
      {
        title: 'Denetim kaydı',
        body: 'Yönetici ve hassas işlemler denetim günlüğüne yazılır; güvenlik kayıtlarında e-posta, telefon ve IP maskelenir.',
      },
      {
        title: 'Silme yerine arşiv',
        body: 'Kayıtlar kazara silinmeye karşı arşivlenir; hesap silme ise kişisel verileri anonimleştirir.',
      },
      { title: 'Hata izleme', body: 'Uygulama hataları otomatik izlenir; sorunlar kullanıcılar bildirmeden fark edilir.' },
    ],
  },
  infra: {
    eyebrow: 'Altyapı',
    title: 'Hizmet sağlayıcılarımız',
    sub: 'Verilerin, aşağıdaki sağlayıcıların altyapısında ve yalnız belirtilen amaçla işlenir.',
    colService: 'Sağlayıcı',
    colPurpose: 'Ne için',
    colData: 'Hangi veri',
    rows: [
      { service: 'Vercel', purpose: 'Uygulama barındırma; sunucu işlevleri Frankfurt (AB) bölgesinde', data: 'Tüm istekler' },
      { service: 'Neon', purpose: 'PostgreSQL veritabanı', data: 'Hesap, geri bildirim ve ödül verileri' },
      { service: 'Upstash', purpose: 'Önbellek ve deneme sınırı sayaçları (Redis)', data: 'Geçici önbellek, güvenlik sayaçları' },
      { service: 'Cloudflare R2', purpose: 'Dosya depolama', data: 'Yüklenen fotoğraflar ve ekler' },
      { service: 'Groq', purpose: 'Yapay zekâ metin analizi', data: 'Geri bildirim metni (ad ve e-posta olmadan)' },
      { service: 'Sentry', purpose: 'Hata izleme', data: 'Hata ayrıntıları ve teknik bağlam' },
      { service: 'PostHog', purpose: 'Ürün analitiği (yalnız rızayla)', data: 'Sayfa ve etkileşim olayları' },
      { service: 'Vercel Analytics', purpose: 'Çerezsiz performans ölçümü', data: 'Sayfa adresi (gizli parametreler ayıklanır), hız ölçümleri' },
      { service: 'Stripe', purpose: 'İşletme abonelik ödemeleri', data: 'Ödeme ve fatura bilgileri (yalnız işletmeler)' },
      { service: 'E-posta (SMTP / Resend)', purpose: 'Doğrulama ve bildirim e-postaları', data: 'E-posta adresi ve ileti içeriği' },
      { service: 'Tarayıcı bildirim servisleri', purpose: 'Anlık bildirim (izin verirsen)', data: 'Bildirim içeriği' },
      { service: 'Google / GitHub', purpose: 'İsteğe bağlı sosyal giriş', data: 'Bu yolla giriş yaparsan hesap kimliğin' },
    ],
    transferNote:
      'Bu sağlayıcıların büyük kısmı yurt dışında yerleşiktir. Kişisel verilerin yurt dışına aktarımı ve hukuki dayanakları KVKK Aydınlatma Metni’nde açıklanır.',
    transferLink: 'KVKK Aydınlatma Metni',
  },
  disclosure: {
    title: 'Bir güvenlik açığı mı buldun?',
    body: 'Sorumlu bildirim için {email} adresine yaz; açığı istismar etmeden ve başkalarının verisine erişmeden bildirmeni rica ederiz.',
    cta: 'Güvenlik bildirimi gönder',
    securityTxt: 'security.txt',
  },
  legal: {
    eyebrow: 'Yasal belgeler',
    title: 'Ayrıntılı metinler',
    docs: [
      { title: 'KVKK Aydınlatma Metni', body: 'Hangi verinin hangi amaç ve hukuki sebeple işlendiği.', href: '/kvkk-aydinlatma-metni' },
      { title: 'Gizlilik Politikası', body: 'Verilerin nasıl toplandığı, saklandığı ve paylaşıldığı.', href: '/gizlilik-politikasi' },
      { title: 'Çerez Politikası', body: 'Kullanılan çerezler ve tercih yönetimi.', href: '/cerez-politikasi' },
      { title: 'Kullanım Şartları', body: 'Hizmetin kullanım koşulları.', href: '/kullanim-sartlari' },
    ],
  },
  faq: {
    eyebrow: 'Sık sorulanlar',
    title: 'Gizlilik soruları',
    items: [
      {
        q: 'Yorumum anonim mi?',
        a: 'Üye olmadan verdiğin geri bildirimde işletme kim olduğunu görmez. Üye olarak verdiğinde adını ve profil fotoğrafını görür; telefon numaran paylaşılmaz.',
      },
      {
        q: 'Puanlarım ve rozetlerim kaybolur mu?',
        a: 'Hayır. Puan hareketlerin bir defterde tutulur ve kayıtlar silinmek yerine arşivlenir. Hesabını silersen puanların da kişisel bilgilerinle birlikte kullanılamaz hâle gelir.',
      },
      {
        q: 'Verilerimi satıyor musunuz?',
        a: 'Hayır. Verilerin yalnız hizmeti sunmak için, yukarıda listelenen sağlayıcılarla ve belirtilen amaçlarla işlenir.',
      },
      {
        q: 'Hesabımı silersem ne olur?',
        a: 'Adın, e-posta adresin ve diğer kişisel bilgilerin kaldırılır, hesabınla kayıtların arasındaki bağ koparılır. İşletmelerin istatistikleri isimsiz olarak korunur.',
      },
    ],
  },
  updated: 'Son güncelleme: {date}',
};

const en: TrustCopy = {
  meta: {
    title: 'Trust Center: security, privacy and data protection',
    description:
      'What data does {brand} process and why, what do businesses see, and how do you download or delete your data? Security practices, sub-processors and your rights on one page.',
  },
  breadcrumb: { home: 'Home', current: 'Trust Center' },
  hero: {
    eyebrow: 'Trust Center',
    title: 'Your data is yours, keeping it safe is our job',
    sub:
      'We explain in plain words which data we process and why, who sees what, and how you stay in control. Every item here describes how the app behaves today.',
    chips: [
      { label: 'Your rights in the dashboard', href: '#kontrol' },
      { label: 'Servers in Frankfurt (EU)', href: '#altyapi' },
      { label: 'HTTPS and HSTS', href: '#guvenlik' },
      { label: 'Analytics only with consent', href: '#senin-verin' },
    ],
  },
  status: {
    title: 'System status',
    checking: 'Checking…',
    ok: 'Systems operational',
    okDetail: 'Database response {ms} ms · as of {time}',
    down: 'We are experiencing an issue',
    downDetail: 'The database could not be reached ({time}). Our team is alerted automatically via error monitoring.',
    offline: 'Status unavailable. Check your connection and try again.',
    retry: 'Check again',
    note: 'This check runs live when you open the page.',
  },
  data: {
    eyebrow: 'Your data',
    title: 'What we collect, who sees what',
    sub: 'We only process the data needed to run the service.',
    collect: [
      { title: 'Account details', body: 'Name, email, optional phone and profile photo. So you can sign in and manage your account.' },
      { title: 'Your feedback', body: 'Your rating, review text and photos you add. So the business can improve and you can earn points.' },
      { title: 'Game and reward data', body: 'Points, XP, badges, league, streak and reward history. To run the rewards system.' },
      { title: 'Security records', body: 'Session records such as sign-in attempts. To protect your account from abuse.' },
    ],
    seesTitle: 'Businesses see',
    sees: [
      'Your name and profile photo on feedback you give as a member',
      'Your rating, review and the photos you add',
      'If you have a purchase record with your card, the business owner sees your email in the customer list (staff see it masked)',
    ],
    notSeesTitle: 'Businesses do not see',
    notSees: [
      'Your phone number',
      'Your password (neither can we; it is stored irreversibly)',
      'Feedback you give to other businesses',
      'Who you are when you give feedback without an account',
    ],
    ai: 'Your review text is processed by an AI service provider for sentiment and topic analysis and character badge matching. Your name and email are not included in this analysis.',
    analytics:
      'Essential cookies keep you signed in. Product analytics and session recording run only with your consent; fields you type are masked in recordings. Cookie-less performance measurement does not collect your identity. You can withdraw consent at any time.',
    leaderboard: 'If you do not want to appear by name on leaderboards, turn it off in Settings → Privacy.',
    consentButton: 'Manage cookie preferences',
  },
  control: {
    eyebrow: 'You are in control',
    title: 'You have a say over your data',
    sub: 'Use your data protection rights from the dashboard, without writing to anyone.',
    actions: [
      { title: 'Download my data', body: 'Download a copy of the personal data in your account.', cta: 'Open privacy settings' },
      {
        title: 'Submit a data request',
        body: 'Request access, correction, deletion or objection. Requests are resolved within 30 days; the receipt is sent to your email.',
        cta: 'Create a request',
      },
      {
        title: 'Delete my account',
        body: 'Your personal details are removed and the link to your records is cut; business statistics remain anonymous. For your security your password (and two-step code if enabled) is required.',
        cta: 'Go to account deletion',
      },
    ],
    loginNote: 'These actions require you to sign in.',
    businessNote: 'Data and account requests for business accounts:',
  },
  business: {
    eyebrow: 'For businesses',
    title: 'How business data is protected',
    items: [
      {
        title: 'Each business sees only its own data',
        body: 'Feedback and customer records belong to the business account; access is checked on the server on every request and denied by default.',
      },
      {
        title: 'Team roles',
        body: 'Staff accounts are separate from the owner; staff see customer emails masked, and deactivated staff lose access.',
      },
      {
        title: 'Card details never reach us',
        body: 'Subscription payments are taken on Stripe’s payment page; card details do not pass through or stay on our servers.',
      },
      { title: 'Exports', body: 'Feedback exports require a signed-in authorized account and are limited to the business’s own data.' },
    ],
  },
  security: {
    eyebrow: 'Security practices',
    title: 'What we do behind the scenes',
    sub: 'Technical details in plain words.',
    items: [
      { title: 'Irreversible passwords', body: 'Passwords are hashed one-way with bcrypt and never stored in plain text.' },
      { title: 'Email verification', body: 'Every account created with email is activated by verifying the address.' },
      { title: 'Two-step verification', body: 'An authenticator app (TOTP) second step and one-time recovery codes can be enabled in settings.' },
      {
        title: 'Session security',
        body: 'Old sessions are invalidated when your password changes or the account is suspended; reuse of a session token is detected.',
      },
      { title: 'Attempt limits', body: 'Sign-in, sign-up, password reset and sensitive actions are rate limited.' },
      { title: 'Encrypted connections', body: 'All traffic uses HTTPS with HSTS (preload), a content security policy and protection against framing.' },
      { title: 'Audit log', body: 'Admin and sensitive actions are written to an audit log; emails, phones and IPs are masked in security logs.' },
      { title: 'Archive instead of delete', body: 'Records are archived to protect against accidental deletion; account deletion anonymizes personal data.' },
      { title: 'Error monitoring', body: 'Application errors are monitored automatically, so problems are noticed before users report them.' },
    ],
  },
  infra: {
    eyebrow: 'Infrastructure',
    title: 'Our service providers',
    sub: 'Your data is processed on the following providers’ infrastructure, only for the stated purpose.',
    colService: 'Provider',
    colPurpose: 'Purpose',
    colData: 'Data',
    rows: [
      { service: 'Vercel', purpose: 'Application hosting; server functions in the Frankfurt (EU) region', data: 'All requests' },
      { service: 'Neon', purpose: 'PostgreSQL database', data: 'Account, feedback and reward data' },
      { service: 'Upstash', purpose: 'Cache and rate-limit counters (Redis)', data: 'Temporary cache, security counters' },
      { service: 'Cloudflare R2', purpose: 'File storage', data: 'Uploaded photos and attachments' },
      { service: 'Groq', purpose: 'AI text analysis', data: 'Feedback text (without name or email)' },
      { service: 'Sentry', purpose: 'Error monitoring', data: 'Error details and technical context' },
      { service: 'PostHog', purpose: 'Product analytics (consent only)', data: 'Page and interaction events' },
      { service: 'Vercel Analytics', purpose: 'Cookie-less performance measurement', data: 'Page address (secret parameters stripped), speed metrics' },
      { service: 'Stripe', purpose: 'Business subscription payments', data: 'Payment and billing details (businesses only)' },
      { service: 'Email (SMTP / Resend)', purpose: 'Verification and notification emails', data: 'Email address and message content' },
      { service: 'Browser push services', purpose: 'Push notifications (if you allow)', data: 'Notification content' },
      { service: 'Google / GitHub', purpose: 'Optional social sign-in', data: 'Your account ID if you sign in this way' },
    ],
    transferNote:
      'Most of these providers are established abroad. Transfers of personal data abroad and their legal grounds are explained in the KVKK Privacy Notice.',
    transferLink: 'KVKK Privacy Notice',
  },
  disclosure: {
    title: 'Found a security issue?',
    body: 'For responsible disclosure write to {email}; please report without exploiting the issue or accessing other people’s data.',
    cta: 'Send a security report',
    securityTxt: 'security.txt',
  },
  legal: {
    eyebrow: 'Legal documents',
    title: 'Detailed texts',
    docs: [
      { title: 'KVKK Privacy Notice', body: 'Which data is processed, for what purpose and on what legal basis.', href: '/kvkk-aydinlatma-metni' },
      { title: 'Privacy Policy', body: 'How data is collected, stored and shared.', href: '/gizlilik-politikasi' },
      { title: 'Cookie Policy', body: 'Cookies we use and how to manage preferences.', href: '/cerez-politikasi' },
      { title: 'Terms of Use', body: 'Terms for using the service.', href: '/kullanim-sartlari' },
    ],
  },
  faq: {
    eyebrow: 'FAQ',
    title: 'Privacy questions',
    items: [
      {
        q: 'Is my review anonymous?',
        a: 'When you give feedback without an account the business does not see who you are. As a member, it sees your name and profile photo; your phone number is not shared.',
      },
      {
        q: 'Can I lose my points and badges?',
        a: 'No. Point movements are kept in a ledger and records are archived rather than deleted. If you delete your account, your points become unusable together with your personal details.',
      },
      { q: 'Do you sell my data?', a: 'No. Your data is processed only to provide the service, with the providers listed above and for the stated purposes.' },
      {
        q: 'What happens if I delete my account?',
        a: 'Your name, email and other personal details are removed and the link between your account and records is cut. Business statistics are kept anonymously.',
      },
    ],
  },
  updated: 'Last updated: {date}',
};

export function getTrustCopy(locale: PublicLocale): TrustCopy {
  return locale === 'en' ? en : tr;
}
