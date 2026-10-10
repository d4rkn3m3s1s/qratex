/**
 * Hizmet sağlayıcılar (veri işleyenler) — Gizlilik Politikası ve KVKK Aydınlatma Metni'ndeki
 * "kimlerle paylaşıyoruz" tablosunun TEK kaynağı.
 *
 * Her satır koddaki gerçek bir entegrasyona karşılık gelir (`evidence`: bağımlılık / dosya).
 * Bölge yalnız kod veya yapılandırmadan DOĞRULANABİLİYORSA yazılır (ör. Vercel `fra1`,
 * PostHog AB uç noktası); doğrulanamayan bölge için "sağlayıcının veri merkezleri" denir ve
 * yurt dışı aktarım ihtimali açıkça belirtilir. Yeni bir üçüncü taraf eklendiğinde buraya da
 * eklenmelidir (`__tests__/lib/legal-documents.test.ts` package.json ile karşılaştırır).
 */

export type ProcessorBasis = 'contract' | 'consent' | 'legitimate';

export interface DataProcessor {
  /** Sağlayıcının ticari adı. */
  name: string;
  /** Ne için kullanıldığı (kullanıcı dilinde). */
  purpose: string;
  /** Hangi verilere erişebildiği. */
  data: string;
  /** Doğrulanmış bölge ya da dürüst belirsizlik notu. */
  location: string;
  /** Yurt dışına aktarım olup olmadığı. */
  abroad: boolean;
  basis: ProcessorBasis;
  /** Koddaki dayanak (bağımlılık adı ya da dosya) — denetim içindir, sayfada gösterilmez. */
  evidence: string;
}

export const PROCESSOR_BASIS_LABELS: Readonly<Record<ProcessorBasis, string>> = {
  contract: 'Hizmetin sunulması (sözleşme)',
  consent: 'Yalnız açık rızanızla',
  legitimate: 'Meşru menfaat (güvenlik, hata giderme)',
};

export const DATA_PROCESSORS: readonly DataProcessor[] = [
  {
    name: 'Vercel',
    purpose: 'Uygulamanın barındırılması ve çerezsiz ziyaret/hız ölçümü',
    data: 'İstek bilgileri (IP, tarayıcı), sayfa adresi',
    location: 'AB (Frankfurt) sunucu bölgesi',
    abroad: true,
    basis: 'contract',
    evidence: 'vercel.json regions fra1; @vercel/analytics, @vercel/speed-insights',
  },
  {
    name: 'Neon (PostgreSQL)',
    purpose: 'Veritabanı',
    data: 'Hesap, geri bildirim, puan ve işlem kayıtları',
    location: 'Sağlayıcının bulut veri merkezleri (yurt dışı)',
    abroad: true,
    basis: 'contract',
    evidence: 'DATABASE_URL (*.neon.tech, .env.example)',
  },
  {
    name: 'Upstash (Redis)',
    purpose: 'Önbellek ve istek sınırlama',
    data: 'Kısa süreli oturum doğrulama ve sayaç verisi',
    location: 'Sağlayıcının bulut veri merkezleri (yurt dışı)',
    abroad: true,
    basis: 'contract',
    evidence: '@upstash/redis',
  },
  {
    name: 'Cloudflare R2',
    purpose: 'Yüklediğiniz fotoğraf ve eklerin saklanması',
    data: 'Fotoğraf ve dosyalar',
    location: 'Sağlayıcının bulut veri merkezleri (yurt dışı)',
    abroad: true,
    basis: 'contract',
    evidence: '@aws-sdk/client-s3 (R2 uç noktası)',
  },
  {
    name: 'Resend / SMTP e-posta hizmeti',
    purpose: 'Doğrulama, bildirim ve başvuru makbuzu e-postaları',
    data: 'E-posta adresi, ad, e-posta içeriği',
    location: 'Sağlayıcının veri merkezleri (yurt dışı olabilir)',
    abroad: true,
    basis: 'contract',
    evidence: 'resend, nodemailer',
  },
  {
    name: 'Groq (yapay zekâ)',
    purpose: 'Yorum metinlerinin duygu ve konu analizi, QRA asistanı yanıtları',
    data: 'Yorum ve sohbet metni',
    location: 'ABD',
    abroad: true,
    basis: 'contract',
    evidence: 'lib/ai-engine.ts (api.groq.com)',
  },
  {
    name: 'Inngest',
    purpose: 'Arka plan işleri (ör. yorum analizinin sıraya alınması)',
    data: 'İşin kimliği ve gerekli kayıt numaraları',
    location: 'Sağlayıcının bulut veri merkezleri (yurt dışı)',
    abroad: true,
    basis: 'contract',
    evidence: 'inngest',
  },
  {
    name: 'Sentry',
    purpose: 'Uygulama hatalarının tespiti',
    data: 'Hata anındaki teknik ayrıntılar, tarayıcı bilgisi',
    location: 'Sağlayıcının bulut veri merkezleri (yurt dışı)',
    abroad: true,
    basis: 'legitimate',
    evidence: '@sentry/nextjs',
  },
  {
    name: 'PostHog',
    purpose: 'Ürün analitiği ve oturum kaydı',
    data: 'Sayfa ve özellik kullanımı; oturum kaydında maskelenmiş ekran etkileşimleri',
    location: 'AB (Frankfurt)',
    abroad: true,
    basis: 'consent',
    evidence: 'posthog-js (eu.i.posthog.com), lib/consent',
  },
  {
    name: 'Google',
    purpose: 'Google hesabıyla giriş (yalnız bu yolu seçerseniz)',
    data: 'Ad, e-posta, profil fotoğrafı',
    location: 'Sağlayıcının veri merkezleri (yurt dışı)',
    abroad: true,
    basis: 'contract',
    evidence: 'next-auth GoogleProvider (lib/auth.ts)',
  },
  {
    name: 'Tarayıcı bildirim servisleri',
    purpose: 'İzin verdiğiniz anlık bildirimlerin cihazınıza iletilmesi',
    data: 'Bildirim aboneliği adresi ve bildirim metni',
    location: 'Tarayıcınızın bildirim sağlayıcısı (yurt dışı)',
    abroad: true,
    basis: 'contract',
    evidence: 'web-push',
  },
  {
    name: 'Stripe',
    purpose: 'İşletme aboneliklerinin ödemesi',
    data: 'İşletme ödeme ve fatura bilgileri (kart bilgisi QRateX’e gelmez)',
    location: 'Sağlayıcının veri merkezleri (yurt dışı)',
    abroad: true,
    basis: 'contract',
    evidence: 'stripe',
  },
];

/** Tabloda kullanılacak, kodla eşleşmesi test edilen npm bağımlılıkları. */
export const PROCESSOR_PACKAGES: readonly string[] = [
  '@vercel/analytics',
  '@vercel/speed-insights',
  '@upstash/redis',
  '@aws-sdk/client-s3',
  'resend',
  'nodemailer',
  'inngest',
  '@sentry/nextjs',
  'posthog-js',
  'web-push',
  'stripe',
];
