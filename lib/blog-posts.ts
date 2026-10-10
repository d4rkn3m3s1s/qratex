/**
 * Blog içeriği ve saf yardımcıları — `/blog`, `/blog/[slug]`, RSS (`/feed.xml`) ve sitemap'in
 * TEK kaynağı.
 *
 * İçerik depoda tipli bloklar olarak durur (gözden geçirilebilir, diff'lenebilir, build'de
 * statik üretilir). Okuma süresi, içindekiler, sıralama, ilgili yazılar ve önceki/sonraki
 * gezinmesi ELLE girilmez; buradaki saf fonksiyonlar içerikten türetir (`__tests__/lib/blog-posts.test.ts`).
 *
 * Satır içi bağlantı: paragraf ve madde metninde `[metin](/yol)` yazımı. Yalnız site içi
 * kök-göreli yollar (`/…`) bağlantıya dönüşür; dış adres ya da `//` düz metin kalır.
 */

export type BlogAudience = 'business' | 'consumer' | 'both';

export const BLOG_CATEGORIES = [
  { slug: 'isletme-rehberi', label: 'İşletme rehberi', description: 'QR geri bildirimle işletmenizi büyütmek için pratik rehberler.' },
  { slug: 'oyunlastirma', label: 'Oyunlaştırma', description: 'Puan, rozet, görev ve ligler müşteri bağlılığını nasıl artırır.' },
  { slug: 'gizlilik', label: 'Gizlilik ve veri', description: 'Verilerinizin nasıl işlendiği ve haklarınızı nasıl kullanacağınız.' },
] as const;

export type BlogCategorySlug = (typeof BLOG_CATEGORIES)[number]['slug'];

export type BlogBlock =
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'callout'; tone: 'tip' | 'note'; title?: string; text: string }
  | { type: 'quote'; text: string; cite?: string };

export interface BlogAuthor {
  name: string;
  /** Ekip/kurum yazısı `Organization`, kişi yazısı `Person` (JSON-LD tipi). */
  kind: 'Organization' | 'Person';
}

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  datePublished: string; // ISO
  dateModified: string; // ISO
  author: BlogAuthor;
  category: BlogCategorySlug;
  audience: BlogAudience;
  tags: string[];
  content: BlogBlock[];
}

const TEAM: BlogAuthor = { name: 'QRateX Ekibi', kind: 'Organization' };

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'verileriniz-sizin-indirme-duzeltme-silme',
    title: 'Verileriniz Sizin: İndirme, Düzeltme ve Silme',
    description:
      'KVKK haklarınızı e-posta yazmadan, hesabınızın içinden nasıl kullanırsınız; hesabınızı silerseniz neyin kalıp neyin gittiği.',
    datePublished: '2026-10-10T09:00:00.000Z',
    dateModified: '2026-10-10T09:00:00.000Z',
    author: TEAM,
    category: 'gizlilik',
    audience: 'consumer',
    tags: ['KVKK', 'veri hakları', 'hesap'],
    content: [
      {
        type: 'p',
        text: 'KVKK size kişisel verileriniz üzerinde sekiz hak tanır. QRateX’te bunların çoğunu e-posta yazmadan, hesabınızın içinden ve birkaç dokunuşla kullanabilirsiniz. Bu yazıda hangi düğmenin ne yaptığını ve arka planda neyin değiştiğini anlatıyoruz.',
      },
      { type: 'h2', text: 'Verilerimi indir' },
      {
        type: 'p',
        text: 'Ayarlar › Gizlilik bölümündeki “Verilerimi indir” düğmesi, hesabınıza bağlı kişisel verilerin (profil, yorumlar, puan hareketleri, QRA sohbetleri, bildirimler, cihazlar ve daha fazlası) makine tarafından okunabilir bir kopyasını anında hazırlar.',
      },
      {
        type: 'ul',
        items: [
          'Her indirme kanıtlı bir erişim başvurusu olarak kayda geçer; ne zaman neyi indirdiğiniz “Başvurularım” listesinde görünür.',
          'Kötüye kullanımı önlemek için günde en fazla üç kez indirebilirsiniz.',
          'Paketteki bölümler, sistemdeki kişisel veri envanterinden üretilir; envantere eklenen her yeni kayıt pakete de girer.',
        ],
      },
      { type: 'h2', text: 'Düzeltme, itiraz ve silme başvurusu' },
      {
        type: 'p',
        text: 'Aynı bölümden düzeltme, itiraz, erişim ve silme başvurusu yapabilirsiniz. Başvurunuzun makbuzu hesabınızın e-posta adresine gönderilir ve başvuru en geç 30 gün içinde sonuçlandırılır. “Başvurularım” listesinde her başvurunun durumunu, son tarihini ve yürütülen adımları izlersiniz.',
      },
      {
        type: 'callout',
        tone: 'tip',
        title: 'Otomatik bir değerlendirmeye mi katılmıyorsunuz?',
        text: 'Yorumlarınız yapay zekâ ile duygu ve konu bakımından sınıflandırılır; sahtecilik önleme için hesaplara bir güven puanı hesaplanır. Bu değerlendirmelerden birinin aleyhinize sonuç doğurduğunu düşünüyorsanız “itiraz” başvurusu tam olarak bunun için var.',
      },
      { type: 'h2', text: 'Hesabınızı silerseniz' },
      {
        type: 'p',
        text: 'Hesap silme, KVKK kapsamında geri döndürülemez bir anonimleştirmedir. Silmeden önce ekranda neyi kaybedeceğinizin sunucudan hesaplanan özetini görürsünüz.',
      },
      {
        type: 'ul',
        items: [
          'Ad, e-posta, telefon, adres, şifre ve açık oturumlarınız kaldırılır.',
          'Yorumlarınızın metni silinir; verdiğiniz puan, işletmenin istatistiğinde kimliksiz olarak kalır.',
          'Tüketim kayıtları işletmenin ticari kaydı olduğu için kimliksizleşerek korunur.',
          'Kullanılmamış puan bakiyeniz geçersiz olur.',
        ],
      },
      { type: 'h2', text: 'Ne kadar saklıyoruz?' },
      {
        type: 'p',
        text: 'Bazı kayıtlar süresi dolunca günlük temizlikte otomatik silinir: QRA asistanı sohbetleri ve anlık bildirim kayıtları 180 gün, bildirimler 365 gün sonra. Okunmuş bildirimler 30 gün sonra, kullanılmış ya da süresi dolmuş giriş bağlantıları ise her gün temizlenir.',
      },
      {
        type: 'p',
        text: 'Tüm veri grupları, hukuki sebepleri ve saklama süreleri [KVKK Aydınlatma Metni](/kvkk-aydinlatma-metni#kategoriler)’nde; hizmet sağlayıcılarımızın listesi [Gizlilik Politikası](/gizlilik-politikasi#paylasim)’nda.',
      },
    ],
  },
  {
    slug: 'cerez-tercihleriniz-neyi-neden-soruyoruz',
    title: 'Çerez Tercihleriniz: Neyi, Neden Soruyoruz?',
    description:
      'Zorunlu çerezler, analitik ve oturum kaydı nasıl çalışır; onay vermezseniz ne olur ve kararınızı nasıl değiştirirsiniz.',
    datePublished: '2026-10-10T08:00:00.000Z',
    dateModified: '2026-10-10T08:00:00.000Z',
    author: TEAM,
    category: 'gizlilik',
    audience: 'both',
    tags: ['çerez', 'rıza', 'analitik'],
    content: [
      {
        type: 'p',
        text: 'QRateX’i ilk açtığınızda gördüğünüz çerez bildirimi bir formalite değil: verdiğiniz karar, tarayıcınızda hangi kodun çalışacağını gerçekten belirler. Bu yazıda üç seçeneğin ne yaptığını ve ne yapmadığını anlatıyoruz.',
      },
      { type: 'h2', text: 'Üç kategori, varsayılanı “hayır”' },
      {
        type: 'ul',
        items: [
          'Zorunlu: giriş oturumu, güvenlik, dil ve rıza tercihinizin kendisi. Hizmet bunlarsız çalışmaz, bu yüzden kapatılamaz.',
          'Analitik: hangi sayfaların ve özelliklerin kullanıldığını ölçer. Onay vermezseniz analitik kütüphanesi hiç yüklenmez ve üçüncü tarafa istek gitmez.',
          'Oturum kaydı: hataları anlamak için ekran etkileşimlerini kaydeder. Analitikten ayrı, ikinci bir onay ister.',
        ],
      },
      {
        type: 'callout',
        tone: 'note',
        text: 'Pazarlama veya reklam çerezi kullanmıyoruz. Bu yüzden tercih merkezinde böyle bir seçenek göremezsiniz.',
      },
      { type: 'h2', text: 'Onay verirseniz ne olur?' },
      {
        type: 'p',
        text: 'Analitik ve oturum kaydı PostHog tarafından AB (Frankfurt) bölgesindeki sunucularda işlenir. Gönderilen sayfa adreslerinden giriş bağlantıları, doğrulama kodları ve benzeri gizli değerler gönderilmeden önce silinir.',
      },
      {
        type: 'p',
        text: 'Oturum kaydında form alanlarına yazdıklarınız maskelenir. Giriş ve şifre sıfırlama ekranları, yönetici kapısı, kart ve paylaşım bağlantısı sayfaları hiç kaydedilmez. Onayınızı geri çektiğinizde kayıt durur ve analitik çerezleri tarayıcınızdan silinir.',
      },
      { type: 'h2', text: 'Kararınızı değiştirmek' },
      {
        type: 'p',
        text: 'Ret, kabul kadar kolaydır ve hizmeti kullanmanızı engellemez. Kararınızı istediğiniz an üç yerden değiştirebilirsiniz:',
      },
      {
        type: 'ul',
        items: [
          'Her sayfanın altındaki “Çerez tercihleri” bağlantısı.',
          '[Çerez Politikası](/cerez-politikasi#tercihleriniz) sayfasındaki “Tercihleri yönet” düğmesi.',
          'Hesabınızın Ayarlar › Gizlilik bölümü.',
        ],
      },
      {
        type: 'p',
        text: 'Kararınız bu tarayıcıda 180 gün geçerlidir; politika değişirse yeniden sorarız. Oturum açtıysanız kararınız hesabınıza da kaydedilir ve yeni cihazınızda aynı soruyu tekrar görmezsiniz. Hangi çerezin ne kadar tutulduğunun tam listesi [Çerez Politikası](/cerez-politikasi#kategoriler)’nda.',
      },
    ],
  },
  {
    slug: 'qr-kod-ile-geri-bildirim-toplama',
    title: 'QR Kod ile Geri Bildirim Toplama: İşletmeler İçin Rehber',
    description: 'QR kodlar ile müşteri geri bildirimi toplamanın avantajları ve QRateX ile nasıl başlayacağınız.',
    datePublished: '2025-01-15T10:00:00.000Z',
    dateModified: '2025-01-15T10:00:00.000Z',
    author: TEAM,
    category: 'isletme-rehberi',
    audience: 'business',
    tags: ['QR kod', 'geri bildirim', 'başlangıç'],
    content: [
      { type: 'p', text: 'Geleneksel anket ve yorum kutuları müşterinin dikkatini dağıtır, düşük katılım getirir ve verileri toplamak zahmetlidir. QR kod tabanlı geri bildirim, müşterinin cebindeki telefonu tek dokunuşla bir geri bildirim kanalına dönüştürür.' },
      { type: 'h2', text: 'Neden QR kod?' },
      { type: 'p', text: 'Bir QR kod, masaya, ürüne veya faturaya yerleştirilebilir. Müşteri kodu okuttuğunda saniyeler içinde geri bildirim ekranına ulaşır — uygulama indirmesi, üyelik veya form doldurma zorunluluğu yoktur.' },
      {
        type: 'ul',
        items: [
          'Sıfır sürtünme: uygulama yok, tek tarama ile açılır.',
          'Konuma özel: her masa/şube için ayrı kod ile hassas analiz.',
          'Anlık: geri bildirim toplandığı anda panele düşer.',
          'Oyunlaştırma: puan ve ödüllerle katılım oranı artar.',
        ],
      },
      { type: 'h2', text: 'QRateX ile nasıl başlanır?' },
      { type: 'p', text: 'İşletmenizi oluşturun, ürünlerinizi ekleyin ve QRateX sizin için benzersiz QR kodlar üretsin. Kodları yazdırıp yerleştirin; ilk geri bildirimler dakikalar içinde gelmeye başlar. Yapay zekâ yorumları duygu ve konu bakımından sınıflandırır ve size aksiyon önerileri sunar.' },
      { type: 'p', text: 'Ücretsiz planla başlayabilir, işletmeniz büyüdükçe daha fazla QR kod ve gelişmiş analitiğe geçebilirsiniz.' },
    ],
  },
  {
    slug: 'musteri-deneyimi-ve-gamification',
    title: 'Müşteri Deneyimini Oyunlaştırma ile Güçlendirmek',
    description: 'Puan, rozet ve görevler ile müşteri bağlılığını artırmanın yolları.',
    datePublished: '2025-01-10T10:00:00.000Z',
    dateModified: '2026-10-10T10:00:00.000Z',
    author: TEAM,
    category: 'oyunlastirma',
    audience: 'business',
    tags: ['oyunlaştırma', 'sadakat', 'puan'],
    content: [
      { type: 'p', text: 'Oyunlaştırma, oyun mekaniklerini oyun dışı bir bağlama taşımaktır. Müşteri deneyiminde doğru uygulandığında, sıradan bir ziyareti tekrarlanan bir alışkanlığa dönüştürür.' },
      { type: 'h2', text: 'Puan ekonomisi' },
      { type: 'p', text: 'Her geri bildirim, ziyaret veya görev tamamlama müşteriye puan kazandırır. Puanlar ödüllere, kozmetik öğelere veya bağış kampanyalarına dönüşür. Önemli olan ekonominin dengeli olması: puan kazanımı anlamlı, harcama ise tatmin edici olmalı. Bu yüzden QRateX’te puan kazanımı günlük ve haftalık tavanlarla sınırlanır; hiçbir mekanik ekonomiyi tek başına şişiremez.' },
      { type: 'h2', text: 'Rozetler ve görevler' },
      { type: 'p', text: 'Rozetler, müşterinin ilerlemesini görünür kılar ve bir sonraki hedefe motive eder. Görevler ise davranışı yönlendirir — “3 farklı kategoride işletme ziyaret et” gibi görevler keşfi teşvik eder.' },
      {
        type: 'ul',
        items: [
          'Seviyeler ve seriler ile düzenli katılımı ödüllendirin.',
          'Ligler ve sıralama tabloları ile sosyal rekabet yaratın.',
          'Sürpriz kutular ve mini oyunlar ile beklenmedik hazlar sunun.',
          'Sosyal sorumluluk: puanları bağışa çevirerek anlam katın.',
        ],
      },
      { type: 'h2', text: 'Ölçün ve iyileştirin' },
      { type: 'p', text: 'Oyunlaştırma bir kur-unut sistemi değildir. QRateX analitiği, hangi mekaniğin katılımı artırdığını, hangisinin işe yaramadığını gösterir. Kampanya ve teklif araçlarıyla katılımı sürekli yönlendirebilirsiniz.' },
    ],
  },
];

// ─────────────────────────────── Sorgular ───────────────────────────────

function byNewest(a: BlogPost, b: BlogPost): number {
  const d = Date.parse(b.datePublished) - Date.parse(a.datePublished);
  return d !== 0 ? d : a.slug.localeCompare(b.slug);
}

/** Yayın tarihine göre yeniden eskiye (dizideki elle sıra önemli değil). */
export function getAllPosts(posts: readonly BlogPost[] = BLOG_POSTS): BlogPost[] {
  return [...posts].sort(byNewest);
}

export function getPostBySlug(slug: string, posts: readonly BlogPost[] = BLOG_POSTS): BlogPost | undefined {
  return posts.find((p) => p.slug === slug);
}

export function getCategory(slug: string | null | undefined) {
  return BLOG_CATEGORIES.find((c) => c.slug === slug);
}

export function isBlogCategory(value: unknown): value is BlogCategorySlug {
  return typeof value === 'string' && BLOG_CATEGORIES.some((c) => c.slug === value);
}

/** Kategoriye göre süzülmüş, sıralı yazılar (kategori yoksa hepsi). */
export function getPostsByCategory(category: BlogCategorySlug | null, posts: readonly BlogPost[] = BLOG_POSTS): BlogPost[] {
  const all = getAllPosts(posts);
  return category ? all.filter((p) => p.category === category) : all;
}

/** Her kategorideki yazı sayısı (boş kategori çipi gösterilmez). */
export function countByCategory(posts: readonly BlogPost[] = BLOG_POSTS): Record<BlogCategorySlug, number> {
  const out = Object.fromEntries(BLOG_CATEGORIES.map((c) => [c.slug, 0])) as Record<BlogCategorySlug, number>;
  for (const p of posts) out[p.category] += 1;
  return out;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageCount: number;
  total: number;
}

/** 1 tabanlı sayfalama; geçersiz/aşan sayfa sınıra çekilir. */
export function paginate<T>(items: readonly T[], page: number, pageSize: number): Page<T> {
  const size = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const p = Number.isFinite(page) ? Math.min(Math.max(1, Math.floor(page)), pageCount) : 1;
  return { items: items.slice((p - 1) * size, p * size), page: p, pageCount, total: items.length };
}

/** Sorgu parametresini güvenli sayfa numarasına çevirir. */
export function parsePageParam(raw: string | string[] | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Aynı kategori → ortak etiket → aynı kitle → yenilik sırasıyla en fazla `limit` ilgili yazı. */
export function getRelatedPosts(post: BlogPost, limit = 3, posts: readonly BlogPost[] = BLOG_POSTS): BlogPost[] {
  const tags = new Set(post.tags.map((t) => t.toLocaleLowerCase('tr-TR')));
  const scored = getAllPosts(posts)
    .filter((p) => p.slug !== post.slug)
    .map((p, recency) => {
      let score = 0;
      if (p.category === post.category) score += 4;
      score += p.tags.filter((t) => tags.has(t.toLocaleLowerCase('tr-TR'))).length * 2;
      if (p.audience === post.audience || p.audience === 'both' || post.audience === 'both') score += 1;
      return { p, score, recency };
    });
  scored.sort((a, b) => b.score - a.score || a.recency - b.recency);
  return scored.slice(0, Math.max(0, limit)).map((s) => s.p);
}

/** Yayın sırasındaki komşular: `newer` daha yeni, `older` daha eski yazı. */
export function getAdjacentPosts(slug: string, posts: readonly BlogPost[] = BLOG_POSTS): { newer?: BlogPost; older?: BlogPost } {
  const all = getAllPosts(posts);
  const i = all.findIndex((p) => p.slug === slug);
  if (i < 0) return {};
  return { newer: i > 0 ? all[i - 1] : undefined, older: i < all.length - 1 ? all[i + 1] : undefined };
}

/** Blogun en son değiştiği an (sitemap `/blog` + RSS `lastBuildDate`). */
export function getLatestModified(posts: readonly BlogPost[] = BLOG_POSTS): string | null {
  let best: string | null = null;
  for (const p of posts) if (!best || Date.parse(p.dateModified) > Date.parse(best)) best = p.dateModified;
  return best;
}

// ─────────────────────────────── İçerikten türetilenler ───────────────────────────────

const LINK_RE = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

export type InlineSegment = { type: 'text'; text: string } | { type: 'link'; text: string; href: string };

/** `[metin](/yol)` → bağlantı. Yalnız site içi kök-göreli yol (`/…`, `//` değil) kabul edilir. */
export function parseInline(text: string): InlineSegment[] {
  const out: InlineSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK_RE)) {
    const [raw, label, href] = m as unknown as [string, string, string];
    const at = m.index ?? 0;
    const safe = href.startsWith('/') && !href.startsWith('//');
    if (at > last) out.push({ type: 'text', text: text.slice(last, at) });
    out.push(safe ? { type: 'link', text: label, href } : { type: 'text', text: raw });
    last = at + raw.length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out.length ? out : [{ type: 'text', text }];
}

/** Bağlantı yazımını atarak düz metin (kelime sayımı, meta açıklama). */
export function plainText(text: string): string {
  return parseInline(text)
    .map((s) => s.text)
    .join('');
}

function blockText(b: BlogBlock): string {
  switch (b.type) {
    case 'ul':
    case 'ol':
      return b.items.map(plainText).join(' ');
    case 'callout':
      return `${b.title ?? ''} ${plainText(b.text)}`;
    case 'quote':
      return `${plainText(b.text)} ${b.cite ?? ''}`;
    default:
      return plainText(b.text);
  }
}

export function countWords(post: Pick<BlogPost, 'title' | 'content'>): number {
  const text = [post.title, ...post.content.map(blockText)].join(' ');
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Okuma süresi (dk): ~200 kelime/dk, en az 1. Elle girilmez — içerik değişince kendiliğinden doğru kalır. */
export function getReadingMinutes(post: Pick<BlogPost, 'title' | 'content'>, wordsPerMinute = 200): number {
  return Math.max(1, Math.ceil(countWords(post) / wordsPerMinute));
}

const TR_ASCII: Readonly<Record<string, string>> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

/** Türkçe başlık → URL çapası ("Neden QR kod?" → "neden-qr-kod"). */
export function slugifyHeading(text: string): string {
  const s = plainText(text)
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]/g, (ch) => TR_ASCII[ch] ?? ch)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'bolum';
}

export interface TocEntry {
  id: string;
  text: string;
  /** `content` dizisindeki blok sırası. */
  blockIndex: number;
}

/** h2 başlıklarından içindekiler; aynı başlık tekrar ederse `-2`, `-3` eklenir. */
export function getPostToc(post: Pick<BlogPost, 'content'>): TocEntry[] {
  const used = new Map<string, number>();
  const out: TocEntry[] = [];
  post.content.forEach((b, blockIndex) => {
    if (b.type !== 'h2') return;
    const base = slugifyHeading(b.text);
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    out.push({ id: n === 1 ? base : `${base}-${n}`, text: plainText(b.text), blockIndex });
  });
  return out;
}

// ─────────────────────────────── Biçimleme ───────────────────────────────

// Sunucu/istemci ICU farkından doğan hydration hatalarını önlemek için deterministik TR tarih
// biçimi; gün sınırı Europe/Istanbul (UTC+3, yaz saati yok).
const TR_MONTHS_LONG = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const TR_MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;

export function formatBlogDate(iso: string, style: 'long' | 'short' = 'long'): string {
  const d = new Date(Date.parse(iso) + ISTANBUL_OFFSET_MS);
  const months = style === 'long' ? TR_MONTHS_LONG : TR_MONTHS_SHORT;
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export const AUDIENCE_LABELS: Readonly<Record<BlogAudience, string>> = {
  business: 'İşletmeler için',
  consumer: 'Kullanıcılar için',
  both: 'Herkes için',
};
