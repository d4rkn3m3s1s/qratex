# /blog/[slug]

**Amaç:** Herkese açık blog yazısı detay sayfası. `lib/blog-posts.ts` içindeki statik dizide duran yazıyı SEO meta verisi, Article JSON-LD, breadcrumb ve basit blok listesi (h2 / p / ul) olarak gösterir. Hedef kitle aslında işletme (B2B) ve organik arama trafiği. Müşteri panelindeki tüketici akışına (puan, rozet, lig, oyun) hiç bağlanmıyor.

**Genel puan:** 4.5 / 10
**Karar:** **yeniden tasarla.** Rota ve SSG iskeleti doğru ve korunmalı. Okuma deneyimi (tipografi), içerik modeli, SEO bütünlüğü ve dönüşüm katmanı baştan ele alınmalı.

> İnceleme salt okunur yapıldı. Kod çalıştırılmadı, build/dev server/DB kullanılmadı. Her bulgu dosya okunarak doğrulandı. Doğrulanamayanlar ayrıca belirtildi.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Yönlendirme, 404, meta ve tarih mantığı çalışıyor. Ancak gövdenin bütün tipografisi (`prose`) eklenti kurulu olmadığı için hiçbir şey yapmıyor; başlıklar ve madde işaretleri görünmüyor. |
| UX | 4/10 | Sayfa düz bir metin duvarı. Okuma süresi, içindekiler, ilgili yazılar, paylaşım ve CTA yok. Aynı `/blog` linki iki kez var. |
| Görsel | 3/10 | Kapak görseli yok, h2 gövde metniyle aynı boyda. Uzun metin, hareketli orb/parçacık zemininin üstünde yüzey (card) olmadan duruyor. `/blog` liste sayfasındaki cam-kart dilinden kopuk. |
| Mimari | 5/10 | Server Component, `generateStaticParams` ve fail-safe SEO helper doğru seçimler. Fakat içerik koda gömülü (her yazı deploy ister), sitemap yazıları içermiyor, hazır `BreadcrumbJsonLd` kullanılmıyor. |
| Performans | 7/10 | Sayfa SSG ve çok hafif. Maliyet layout'tan geliyor: yaklaşık 40 sonsuz framer animasyonu ve her görüntülemede `no-store` bir `/api/settings/background` isteği. |
| Erişilebilirlik + Mobil | 6/10 | `aria-labelledby`, `<time dateTime>`, odak halkaları ve skip-link iyi. Ancak h2'ler görsel olarak ayırt edilemiyor, liste işaretleri kayıp, hareketli zemin üstünde `text-muted-foreground` kontrastı doğrulanmadı. Uzun başlık mobilde breadcrumb'ı 2-3 satıra taşıyor. |

---

## Özellik envanteri

Durum kısaltmaları: ÇALIŞIYOR, KISMİ, BOZUK, SAHTE, EKSİK.

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Statik üretim (`generateStaticParams`) | ÇALIŞIYOR | `app/(public)/blog/[slug]/page.tsx:8-10` | Tüm slug'lar build'de üretiliyor. |
| 2 | Bilinmeyen slug için 404 | ÇALIŞIYOR | `page.tsx:42-43`, `app/not-found.tsx:12-40` | Genel 404'e düşüyor. Blog'a özel "diğer yazılar" önerisi yok. |
| 3 | Sayfa başlığı (title template) | ÇALIŞIYOR | `page.tsx:23`, `app/layout.tsx:53` | `"<başlık> \| QRateX"` biçiminde. |
| 4 | Meta description | ÇALIŞIYOR | `page.tsx:24` | |
| 5 | Canonical URL | ÇALIŞIYOR | `page.tsx:21,25`, `lib/seo-settings.ts:145-147` | `canonicalBase` yoksa `siteUrl` kullanılıyor. |
| 6 | OpenGraph `article` meta | KISMİ | `page.tsx:26-32`, `app/layout.tsx:70-85` | Sayfa `openGraph` nesnesini baştan tanımladığı için (Next metadata sığ birleşim yapar) layout'tan gelen `url`, `siteName`, `locale` düşüyor. Görsel, kök `app/opengraph-image.tsx` sayesinde var ama yazıya değil siteye özel. |
| 7 | Yazıya özel OG / kapak görseli | EKSİK | `lib/blog-posts.ts:17` (`image?` alanı), `page.tsx` içinde hiç okunmuyor | Veri modelinde alan var ama hiçbir yazı doldurmuyor ve sayfa kullanmıyor. |
| 8 | Article JSON-LD | KISMİ | `page.tsx:49-66` | `image` yok (Google Article rich result için önerilen alan), `mainEntityOfPage` ve `inLanguage` yok. `author` `Person` tipinde ama değer "QRateX Ekibi", yani bir organizasyon. |
| 9 | BreadcrumbList JSON-LD | EKSİK | `components/seo/breadcrumb-json-ld.tsx:8-26` hazır; `cerez-politikasi/page.tsx:28` gibi diğer public sayfalar kullanıyor | Blog detayında sadece görsel breadcrumb var. |
| 10 | Görsel breadcrumb | ÇALIŞIYOR | `page.tsx:68-74`, `components/seo/breadcrumb-nav.tsx:10-35` | Son öğe tam yazı başlığı olduğu için mobilde çok satıra yayılıyor. |
| 11 | Yayın tarihi | ÇALIŞIYOR | `page.tsx:78-80`, `lib/blog-posts.ts:81-85` | UTC tabanlı ve deterministik; hydration açısından güvenli. |
| 12 | Güncellenme tarihi (koşullu) | ÇALIŞIYOR | `page.tsx:47,81-85` | |
| 13 | H1 başlık | ÇALIŞIYOR | `page.tsx:87-89` | |
| 14 | Özet / description paragrafı | ÇALIŞIYOR | `page.tsx:90` | |
| 15 | Yazar bilgisi | KISMİ | `page.tsx:91-94` | Düz metin. Avatar, rol ve yazar sayfası yok. |
| 16 | Okuma süresi | EKSİK | `lib/blog-posts.ts:18,30,53` veride var; yalnız `app/(public)/blog/page.tsx:38-43` gösteriyor | Detay sayfasında gösterilmiyor. |
| 17 | Kapak / hero görseli | EKSİK | `page.tsx:76-95` | |
| 18 | Gövde tipografisi (`prose`) | BOZUK | `page.tsx:96`; `tailwind.config.ts:193` sadece `tailwindcss-animate` yüklü; `package.json` içinde `@tailwindcss/typography` yok; `app/globals.css` içinde `.prose` tanımı yok | `prose`, `prose-neutral` ve `dark:prose-invert` sınıfları hiç CSS üretmiyor. Preflight yüzünden h2 gövde metniyle aynı boyda ve kalınlıkta, paragraflar arasında boşluk yok. |
| 19 | Madde listesi (`ul`) | BOZUK | `page.tsx:99-106` + Tailwind preflight (`list-style: none; margin: 0; padding: 0`) | Madde işaretleri ve girinti görünmüyor. Maddeler alt alta düz satırlar gibi duruyor. |
| 20 | H2 render | KISMİ | `page.tsx:98` | Semantik olarak doğru (`<h2>`), görsel olarak ayırt edilemiyor (#18). `id` / anchor yok. |
| 21 | Ayraç (`hr`) + "blog serisinin parçası" dipnotu | ÇALIŞIYOR | `page.tsx:109-119` | Preflight'ta `hr` yalnız `border-top-width:1px` alıyor ve margin yok; görsel ayrım zayıf. |
| 22 | "← Tüm yazılar" geri linki | ÇALIŞIYOR | `page.tsx:122-129` | #21'deki link ile aynı hedef; tekrar ediyor. |
| 23 | Klavye odak halkaları | ÇALIŞIYOR | `page.tsx:114,125`, `breadcrumb-nav.tsx:25` | |
| 24 | Skip-link ve `main` hedefi | ÇALIŞIYOR | `app/(public)/layout.tsx:19-26` | |
| 25 | Yetki | ÇALIŞIYOR (gerekmez) | `page.tsx` | Public sayfa. Oturum ve kişisel veri yok. |
| 26 | Yükleniyor durumu | KISMİ | `app/(public)/loading.tsx:14-20` | Statik sayfa için tam ekran (`fixed inset-0 z-[100]`) marka splash'i gereğinden ağır. İstemci geçişinde kısa bir flaş olabilir (doğrulanmadı). |
| 27 | Hareketli arka plan (layout) | KISMİ | `components/landing/LandingBackground.tsx:76-157` | `prefers-reduced-motion` destekleniyor (`:50-56`). Ancak uzun okuma sırasında 8 orb, 26 parçacık ve 6 yıldız sonsuz döngüde çalışıyor; metnin altında yüzey yok. |
| 28 | Dil (TR/EN) tutarlılığı | KISMİ | `components/layout/header.tsx:22-23,252` (dil değiştirici); `page.tsx:79,83,92,111` sabit TR | EN seçen kullanıcı İngilizce header ile Türkçe "Yayın / Güncellenme / Yazar" etiketlerini birlikte görüyor. |
| 29 | İçindekiler (TOC) / başlık anchor'ları | EKSİK | `page.tsx:97-108` | |
| 30 | İlgili yazılar / önceki-sonraki | EKSİK | `page.tsx:122-129` | |
| 31 | Paylaşım (Web Share / link kopyala) | EKSİK | | |
| 32 | Dönüşüm CTA'sı (kayıt ol / işletmeni ekle / QR okut) | EKSİK | `page.tsx:109-119` | Metin "Ücretsiz planla başlayabilir..." diyor (`lib/blog-posts.ts:43`) ama bir aksiyon butonu yok. |
| 33 | Sitemap'te yazı URL'leri | EKSİK | `app/sitemap.ts:60-65` | Sadece `/blog` var; `BLOG_POSTS` döngüsü yok. |
| 34 | İçerik yönetimi (admin/CMS) | EKSİK | `lib/blog-posts.ts:1-3,22-70` | Yazılar koda gömülü. Her yazı ve düzeltme bir commit ve deploy istiyor. |
| 35 | RSS / Atom beslemesi | EKSİK | | |

**Durum sayımı:** ÇALIŞIYOR 15 · KISMİ 7 · BOZUK 2 · SAHTE 0 · EKSİK 11 (toplam 35)

---

## Bulgular

### 1. Gövde tipografisi tamamen çalışmıyor: `prose` sınıfları ölü
- **Önem:** yüksek · **Kategori:** hata / görsel · **Efor:** S
- **Kanıt:**
  - Kullanım: `app/(public)/blog/[slug]/page.tsx:96`, `<div className="prose prose-neutral max-w-none dark:prose-invert">`
  - Eklentiler: `tailwind.config.ts:193`, `plugins: [require('tailwindcss-animate')]`
  - `package.json` içinde `@tailwindcss/typography` yok.
  - `app/globals.css` içinde `.prose` tanımı yok (grep ile doğrulandı).
  - Aynı ölü sınıf `app/customer/nearby/page.tsx:493` içinde de var.
- **Sorun:** Tailwind preflight `h2`'ye `font-size: inherit; font-weight: inherit`, `ul`'ye `list-style:none; padding:0` ve `p`'ye `margin:0` veriyor. Sonuç olarak:
  - Ara başlıklar gövde metniyle aynı boyda.
  - Madde listesi işaretsiz.
  - Paragraflar bitişik.

  Makale, hiyerarşisi olmayan tek bir metin bloğu gibi okunuyor. Yazının asıl işi (taranabilir rehber olmak) başarısız. Ekran okuyucu semantiği doğru olsa da görsel kullanıcı için başlık yapısı kaybolmuş.
- **Öneri:** İki yaklaşımdan biri seçilmeli.
  - **(a) Önerilen:** `@tailwindcss/typography` eklenip `tailwind.config.ts`'e kaydedilir, ardından marka token'larıyla (`--foreground`, `--primary`, `--muted-foreground`) bir `prose-qratex` teması tanımlanır (`theme.extend.typography`). Böylece dark tema, link rengi, `hr` ve liste işaretleri sistemle uyumlu olur.
  - **(b) Eklenti istenmezse:** `components/blog/article-body.tsx` adında bir render bileşeni yazılır ve her blok tipi (`h2`, `p`, `ul`, ileride `quote`/`image`/`callout`) açık Tailwind sınıflarıyla stillenir.

  Her iki yolda da aynı düzeltme `customer/nearby` için de geçerli olmalı. Dar ekranda satır uzunluğu `max-w-[68ch]`, satır yüksekliği yaklaşık 1.7 hedeflenmeli.

### 2. Yazı URL'leri sitemap'te yok; SEO amacına ters
- **Önem:** yüksek · **Kategori:** SEO / mimari · **Efor:** S
- **Kanıt:** `app/sitemap.ts:11-72` sabit listede yalnız `${base}/blog` (`:60-65`) var. `BLOG_POSTS` import edilmiyor.
- **Sorun:** Blogun tek gerçek amacı organik trafik. Detay sayfaları ancak `/blog` liste sayfasından link takibiyle keşfedilebiliyor. `lastModified` sinyali (`dateModified`) arama motoruna hiç iletilmiyor.
- **Öneri:** `sitemap.ts` içinde `BLOG_POSTS.map(p => ({ url: `${base}/blog/${p.slug}`, lastModified: new Date(p.dateModified), changeFrequency: 'monthly', priority: 0.6 }))` eklenmeli. İçerik DB'ye taşınırsa aynı helper'dan beslenmeli. Build-time DB fail-safe kuralına uygun olarak try/catch ve boş dizi varsayılanı kullanılmalı.

### 3. OpenGraph birleşimi site bilgilerini düşürüyor; yazıya özel görsel yok
- **Önem:** orta · **Kategori:** SEO / paylaşım · **Efor:** M
- **Kanıt:**
  - `page.tsx:26-32`: `openGraph` yalnız `title`, `description`, `type`, `publishedTime` ve `modifiedTime` içeriyor.
  - `app/layout.tsx:70-85`: `url`, `siteName`, `locale` ve `images` layout'ta tanımlı.
  - `app/opengraph-image.tsx:6-23`: kök OG görseli dosya tabanlı ve sadece site varsayılan başlığını çiziyor.
  - `lib/blog-posts.ts:17`: `image?` alanı hiç kullanılmıyor.
- **Sorun:** Next metadata çözümlemesi `openGraph` nesnesini sığ biçimde değiştirir. Bu yüzden yazı sayfasında `og:url`, `og:site_name` ve `og:locale` kayboluyor (dokümante davranış; canlı çıktı doğrulanmadı). Paylaşılan her yazı aynı genel "QRateX - QR Tabanlı Geri Bildirim Platformu" kartıyla görünüyor, yazının başlığı görselde yok. Bu, WhatsApp/LinkedIn/X paylaşımında tıklanma oranını doğrudan düşürür.
- **Öneri:**
  - `app/(public)/blog/[slug]/opengraph-image.tsx` eklenmeli. Bu dosya `next/og` ile yazı başlığını, okuma süresini ve marka gradyanını çizer. `generateStaticParams` ile build'de üretilip statik kalabilir.
  - `generateMetadata` içinde `openGraph` nesnesine `url`, `siteName: seo.siteName`, `locale` ve `authors` eklenmeli. Twitter kartı için `twitter: { title, description }` açıkça verilmeli.
  - `image` alanı doldurulduğunda öncelik ona verilmeli.

### 4. Article JSON-LD eksik ve yanlış tipli; BreadcrumbList yok
- **Önem:** orta · **Kategori:** SEO · **Efor:** S
- **Kanıt:**
  - `page.tsx:49-59`: `image` yok, `mainEntityOfPage` yok, `author: { '@type': 'Person', name: 'QRateX Ekibi' }`.
  - `components/seo/breadcrumb-json-ld.tsx:8-26` hazır bileşen; `app/(public)/cerez-politikasi/page.tsx:28` gibi diğer public sayfalarda kullanılıyor ama burada kullanılmıyor.
- **Sorun:** Google Article zengin sonucu için `image` güçlü biçimde öneriliyor. Bir ekibi `Person` olarak işaretlemek yapısal veride tutarsızlık yaratıyor. Breadcrumb zengin sonucu kaybediliyor ve sayfa diğer public sayfalarla tutarsız kalıyor.
- **Öneri:**
  - `author` için `@type: 'Organization'` kullanılmalı; gerçek yazar eklenince `Person` ve `url` verilmeli.
  - `image` (OG görsel URL'si), `mainEntityOfPage: { '@type': 'WebPage', '@id': url }`, `inLanguage: 'tr-TR'` ve `publisher.logo` eklenmeli.
  - `<BreadcrumbJsonLd items={…}/>` görsel breadcrumb ile aynı dizi kullanılarak render edilmeli; dizi tek bir sabitten türetilmeli.

### 5. İçerik koda gömülü; yayıncılık akışı yok
- **Önem:** orta · **Kategori:** mimari / ürün · **Efor:** L
- **Kanıt:** `lib/blog-posts.ts:1-3` ("şimdilik statik; ileride CMS/DB'den gelebilir") ve `:22-70` (toplam 2 yazı, ikisi de Ocak 2025 tarihli). Git geçmişinde blog dosyalarına dokunan yalnız 2 commit var.
- **Sorun:** Pazarlama/içerik ekibi yazı ekleyemiyor, düzeltemiyor ya da taslak tutamıyor; her değişiklik bir geliştirici ve deploy istiyor. Sonuç olarak blog yaklaşık 21 aydır güncellenmemiş. Bayat bir blog, güven sayfası işlevi gören bir içerik için ters sinyal veriyor.
- **Öneri:** `BlogPost` Prisma modeli kurulmalı:
  - Alanlar: `slug @unique`, `title`, `description`, `bodyMdx` veya `blocks Json`, `coverUrl` (R2), `status` (draft/published), `publishedAt`, `updatedAt`, `authorId`, `tags`, `audience` ('business' | 'consumer').
  - Mevcut admin desenine uygun bir `/admin/blog` editörü eklenmeli.
  - Okuma tarafında `unstable_cache` + `tags: ['blog']` kullanılmalı ve yayınlamada `revalidateTag('blog')` çağrılmalı.
  - `generateStaticParams` fail-safe olmalı (DB yoksa `[]`) ve `dynamicParams = true` kalmalı.
  - Daha hafif bir ara adım isteniyorsa `content/blog/*.mdx` ve MDX derleme yeterli olur; tip güvenliği ve diff'lenebilirlik korunur.

  **Güvenlik notu:** İçerik DB/CMS'e taşındığında `page.tsx:63-66`'daki `JSON.stringify` ile `dangerouslySetInnerHTML` kullanımı `</script>` kaçışı olmadan XSS vektörüne dönüşür. `JSON.stringify(ld).replace(/</g, '\\u003c')` zorunlu hale gelir. Bugün içerik repodan geldiği için risk yok.

### 6. Dönüşüm katmanı yok: okuyucuyu hiçbir yere götürmüyor
- **Önem:** orta · **Kategori:** UX / ürün · **Efor:** M
- **Kanıt:** `page.tsx:109-129`: yazının sonunda yalnız iki adet `/blog` linki var. İçerik ise `lib/blog-posts.ts:42-43`'te "İşletmenizi oluşturun… Ücretsiz planla başlayabilir" diyor.
- **Sorun:** Okuyucu ikna noktasına geldiğinde ona bir aksiyon sunulmuyor. Ne "İşletmeni ücretsiz ekle" (B2B) ne de "QR okut, puan kazan" (tüketici) yolu var. Ayrıca aynı hedefe giden iki link (`:112-117` ve `:123-128`) gereksiz tekrar.
- **Öneri:**
  - Yazı modeline `audience` alanı eklenmeli ve sona hedef kitleye göre bir CTA kartı konmalı:
    - İşletme: `/auth/register?role=dealer` + "Ücretsiz başla".
    - Tüketici: `/customer` + "İlk geri bildirimini ver, X puan kazan".
  - Oturum açık kullanıcı için CTA, istemci tarafında küçük bir ada bileşeniyle kişiselleştirilebilir; sayfa statik kalır.
  - Tekrarlayan dipnot linki kaldırılmalı ve yerine "İlgili yazılar" bloğu konmalı (#7).
  - Tıklamalar PostHog funnel'ına (`blog_cta_click`) bağlanmalı.

### 7. Keşif ve okuma araçları eksik (okuma süresi, TOC, ilgili yazılar, paylaşım)
- **Önem:** orta · **Kategori:** UX · **Efor:** M
- **Kanıt:**
  - `readingMinutes` yalnız `app/(public)/blog/page.tsx:38-43`'te gösteriliyor, detayda yok.
  - `page.tsx:98`: h2'lerde `id` yok.
  - Sayfada paylaşım ya da ilgili yazı bileşeni yok.
- **Sorun:** Medium/Substack seviyesindeki okuma deneyiminin temel parçaları yok: süre beklentisi, içerikte gezinme, yazı sonunda devam yolu ve paylaşım.
- **Öneri:**
  - Header meta satırına "4 dk okuma" eklenmeli. Değer elle girilmek yerine kelime sayısından türetilmeli (~200 kelime/dk).
  - h2'lere slug `id` verilmeli. 3 veya daha fazla h2 olan yazılarda masaüstünde sticky bir yan TOC, mobilde açılır "İçindekiler" gösterilmeli.
  - Sona etiket/kitle eşleşmesine göre 2-3 kartlık "İlgili yazılar" bloğu (liste sayfasındaki kart bileşeniyle aynı) ve önceki/sonraki gezinmesi eklenmeli.
  - `navigator.share` + "Linki kopyala" yedeği küçük bir istemci adası olarak eklenmeli.

### 8. Uzun okuma, yüzeysiz biçimde hareketli zeminin üstünde
- **Önem:** orta · **Kategori:** erişilebilirlik / görsel / performans · **Efor:** S-M
- **Kanıt:**
  - `app/(public)/layout.tsx:18`: `LandingBackground` tüm public sayfalarda çalışıyor.
  - `components/landing/LandingBackground.tsx:76-157`: 8 orb, 26 parçacık ve 6 yıldızın hepsi `repeat: Infinity`.
  - `:36-48`: her görüntülemede `/api/settings/background` için `cache: 'no-store'` fetch yapılıyor.
  - Bu uç `app/api/settings/background/route.ts:7,12-24` üzerinden `force-dynamic` ile her seferinde DB'ye gidiyor.
  - `page.tsx:67`: makale kabı saydam; card/yüzey yok.
- **Sorun:** Pazarlama landing'i için doğru olan "canlı zemin" fikri, 4-5 dakikalık bir okuma için dikkat dağıtıcı. Göz çevresinde sürekli hareket var ve `text-muted-foreground` tarih/yazar satırları geçen parlak orb'ların üstünde kontrast kaybedebilir (gerçek kontrast ölçülmedi; doğrulanmadı). `reduced-motion` desteği var (`:50-56`), ama varsayılan kullanıcı için okuma modu yok. Statik bir yazı sayfası, sırf zemin varyantı için her ziyarette DB'ye gidiyor; değer zaten sunucuda `getBackgroundEffect()` ile 60 sn önbelleklenmiş biçimde geliyor (`lib/get-background-effect.ts:24-26`).
- **Öneri:**
  - Okuma sayfaları için layout'a bir "sakin zemin" modu eklenmeli: blog route segmentinde `LandingBackground`'a `calm` prop'u geçilir, sadece statik `gradient-mesh` kalır, parçacık ve yıldızlar kapanır.
  - Makale gövdesi `bg-background/85 backdrop-blur` bir yüzeye alınmalı.
  - İstemci tarafındaki `no-store` fetch kaldırılmalı veya `revalidate` edilebilir hale getirilmeli; SSR değeri yeterli ve admin değişikliği zaten 60 sn'de yansıyor.
  - Bu iyileştirme bütün public sayfaları etkiler; global bulgu olarak ayrıca not edilmeli.

### 9. Dil karışıklığı: EN seçilebiliyor ama sayfa sabit TR
- **Önem:** düşük · **Kategori:** i18n · **Efor:** S (etiketler) / L (içerik çevirisi)
- **Kanıt:** `components/layout/header.tsx:22-23,252` (`LanguageSwitcher`, `useAppT`) ile `page.tsx:79,83,92,111,127` ("Yayın", "Güncellenme", "Yazar:", "Tüm yazılar" sabit TR).
- **Sorun:** EN kullanıcısı İngilizce menü ile Türkçe arayüz etiketlerini aynı ekranda görüyor.
- **Öneri:** Arayüz etiketleri `messages/*.json` üzerinden çevrilmeli. İçerik çevrilmeyecekse yazının yanında "Bu yazı yalnızca Türkçe" rozeti gösterilmeli ve `<article lang="tr">` eklenmeli. Uzun vadede `BlogPost.locale` + `hreflang` alternatifleri düşünülmeli.

### 10. Küçük cila: breadcrumb, 404, marka yazımı, `hr`
- **Önem:** düşük · **Kategori:** UX / tutarlılık · **Efor:** S
- **Kanıt:**
  - `page.tsx:72`: breadcrumb'ın son öğesi tam başlık (~55 karakter), mobilde 2-3 satır.
  - `app/not-found.tsx:24-40`: genel 404, blog'a dönüş önerisi yok.
  - `app/(public)/loading.tsx:44`: "Qratex", blog içeriğinde ise "QRateX" yazılıyor.
  - `page.tsx:109`: `hr` preflight'ta margin almıyor.
- **Öneri:**
  - Breadcrumb son öğesi mobilde `truncate max-w-[40ch]` ile kısaltılmalı, ya da mobilde yalnız "← Blog" gösterilmeli.
  - `app/(public)/blog/[slug]/not-found.tsx` eklenmeli: "Bu yazı kaldırılmış olabilir" + son 3 yazı.
  - Marka yazımı tek sabitte toplanmalı (`seo.siteName`).

---

## Eksik özellikler (kıyas ürünlerle)

Kıyas ürünler: Starbucks Stories, Duolingo blog, Monzo blog, Spotify Newsroom.

1. **Yazıya özel paylaşım kartı ve yerel paylaşım.** Monzo ve Spotify her yazı için başlıklı bir OG kartı ve tek dokunuşla paylaşım sunuyor. Spotify Wrapped'ın ana büyüme kaldıracı da paylaşılabilir kart.
2. **Okuma ilerleme göstergesi ve okuma süresi.** Duolingo/Monzo blogunda üstte ince bir ilerleme çubuğu var. Qratex'te bu çubuk oyunlaştırmayla bağlanabilir: oturum açık müşteri yazıyı bitirince (scroll ≥ %90 + minimum süre) tek seferlik "Okur" rozeti verilir. Puan basan her yol gibi bu da sunucu tarafında, idempotent ve tek seferlik kredi deseniyle yapılmalı; hafızadaki "Points economy invariants" kuralına göre istemci beyanına güvenilmemeli.
3. **Hedef kitleye göre CTA.** Starbucks içerikleri doğrudan "uygulamada dene" aksiyonuna bağlıyor. Burada işletme ve tüketici için iki ayrı yol gerekiyor.
4. **İlgili yazılar, etiket/kategori ve seri gezinmesi.** Okuyucuyu sitede tutan temel mekanizma bunlar.
5. **İçindekiler ve başlık anchor'ları.** Uzun rehberlerde paylaşılabilir bölüm linkleri sağlar.
6. **Yayıncılık altyapısı.** Taslak, zamanlanmış yayın, kapak görseli (R2), RSS ve sitemap otomasyonu.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Sakin ve okunur bir "editoryal" sayfa. Marka kimliğini zemindeki gürültüden değil, kapak kartı ve tipografiden alır. Okuyucu sonunda net bir sonraki adıma yönlenir.

**Yerleşim:**

Mobil öncelikli, tek sütun. `lg` ve üstünde 2 sütun: içerik 68ch + 220px sticky TOC.

1. **Breadcrumb (kısa).** Mobilde yalnızca "← Blog".
2. **Hero.**
   - Kategori çipi ("Gamification" / "İşletme rehberi").
   - H1 (`text-3xl md:text-5xl`, `tracking-tight`, `text-balance`).
   - Özet.
   - Meta satırı: yazar avatarı + ad · tarih · "4 dk okuma" · paylaş butonu.
   - 16:9 kapak görseli; görsel yoksa OG ile aynı jeneratif gradyan kart.
3. **Gövde.** Marka temalı `prose`. h2 anchor ikonu hover/focus'ta görünür. "İpucu" ve "Not" için callout blokları, alıntı bloğu.
4. **Yazı sonu.**
   - Kitleye göre CTA kartı (cam yüzey, liste sayfasındaki `Card` diliyle aynı).
   - "İlgili yazılar" (2-3 kart).
   - Önceki/sonraki.

**Motion (ölçülü):**
- Zemin animasyonu blog segmentinde "calm" moduna iner.
- Hero yüklenişte yalnızca opacity + 8px y geçişi yapar; `useReducedMotion` ile kapanır.
- Okuma ilerleme çubuğu `scaleX` ile `useScroll` kullanır; transform tabanlı, layout tetiklemez.
- 3D veya three.js burada yerinde değil; okuma sayfasına ağırlık ve dikkat dağınıklığı getirir.
- Rozet ödülü varsa yazı sonunda tek seferlik küçük bir "Okur rozeti kazandın" toast'ı; tam ekran reveal kullanılmamalı.

**Veri / API değişiklikleri:**
- **Prisma:** `BlogPost { id, slug @unique, title, description, body (MDX veya blocks Json), coverUrl?, status, audience, tags String[], locale, readingMinutes (türetilmiş), authorId?, publishedAt, updatedAt }`.
- **Okuma:** `lib/blog.ts` → `getPublishedPosts()` / `getPostBySlug()`. `unstable_cache` + `tags: ['blog']`; DB hatasında `[]` / `null` dönen fail-safe yapı.
- **Yazma:** `/admin/blog` (CRUD + önizleme + R2 kapak yükleme). Yayında `revalidateTag('blog')` ve `revalidatePath('/sitemap.xml')`.
- **SEO:**
  - `sitemap.ts` yazıları ekler.
  - `blog/[slug]/opengraph-image.tsx` yazıya özel kart üretir.
  - Article ve BreadcrumbList JSON-LD `<` kaçışıyla basılır.
  - `app/blog/rss.xml/route.ts` eklenir.
- **Okur rozeti (opsiyonel):** `POST /api/blog/[slug]/read`. Oturum zorunlu, `(userId, slug)` unique, sunucuda okuma süresi kontrolü ve tek seferlik kredi.

---

## Çakışmalar / birleştirme önerisi

- **`/blog` (liste) ile birlikte tek modül olarak ele alınmalı.** Kart dili, okuma süresi ve tarih biçimi zaten ortak (`lib/blog-posts.ts:81-85`). Yeniden tasarım iki sayfayı tek seferde kapsamalı. Ayrı bir birleştirme gerekmiyor; liste ve detay doğal olarak ayrı rotalar.
- **`/neden-qratex` ve `/guven` ile içerik örtüşmesi.** "QRateX ile nasıl başlanır?" bölümü (`lib/blog-posts.ts:41-43`) pazarlama sayfası tekrarı gibi. Blog yazıları bu sayfalara içeriği tekrarlamak yerine link vermeli. Bu sayfaların içerikleri bu denetimde ayrıntılı okunmadı; örtüşme derecesi doğrulanmadı.
- **Müşteri panelindeki konumu.** Bu sayfa tüketici panelinin (`/customer/*`) parçası değil ve oyunlaştırma akışıyla bağı yok. Tüketiciye yönelik içerik (ör. "Puanlarını nasıl daha hızlı kazanırsın", "Ligler nasıl çalışır") yazılacaksa, bunlar blogda değil müşteri panelinde bir "Rehber / İpuçları" yüzeyi olarak sunulmalı. `/blog` ise SEO ve B2B kanalı olarak kalmalı. Kaldırma önerilmiyor.

## Doğrulama (şüpheci inceleme)

### 1. Makale gövdesi tipografisi tamamen çalışmıyor (prose sınıfları CSS üretmiyor) — **DOĞRULANDI** (önem: görsel/UX hatası; güvenlik veya veri etkisi yok)

Kanıt zinciri okuyarak doğrulandı:
- `app/(public)/blog/[slug]/page.tsx:96` gövdeyi `prose prose-neutral max-w-none dark:prose-invert` ile sarıyor; `:97-107` ham `<h2>`, `<ul>/<li>`, `<p>` ve `:108` `<hr>` basıyor; bu elemanların hiçbirine yardımcı sınıf verilmemiş.
- `tailwind.config.ts:193` yalnızca `plugins: [require('tailwindcss-animate')]`. `@tailwindcss/typography` `package.json`'da, lock dosyasında ve `node_modules/@tailwindcss/` altında yok (dizin hiç mevcut değil).
- Projede `.prose` tanımı yapan CSS yok: `app/globals.css` (yalnızca `@tailwind base/components/utilities`, h2/list-style kuralı yok), `app/customer/customer-shell.css`, `components/ui/profile-backgrounds.css` tarandı; eşleşme yok.
- Tailwind v3 (`package.json:140` `^3.4.0`) bilinmeyen sınıfı sessizce yok sayar, preflight ise `h2 { font-size: inherit; font-weight: inherit }`, `ul { list-style: none; padding: 0 }`, `p, h2, ul, hr { margin: 0 }` uygular.

Yeniden üretim: herhangi bir yazıyı aç (ör. `lib/blog-posts.ts:33` "Neden QR kod?" başlığı ve `:35` madde listesi olan yazı). "Neden QR kod?" çevresindeki paragraflarla aynı boy ve kalınlıkta görünür; liste maddelerinde madde işareti ve girinti yoktur; paragraflar arasında boşluk yoktur. Sonuç tek parça, hiyerarşisiz bir metin bloğudur. `max-w-none` da okuma genişliği sınırını kaldırdığı için geniş ekranda satır uzunluğu gereğinden fazla artar.

Ek not: `app/customer/nearby/page.tsx:493` aynı ölü `prose prose-sm dark:prose-invert` sınıflarını kullanıyor; orada `whitespace-pre-wrap` ile düz metin basıldığı için etki daha küçük (yalnızca beklenen tipografi yok).

Öneri (ürün seviyesi): Tek doğru kaynak olarak `@tailwindcss/typography` eklenip `tailwind.config.ts` plugins dizisine kaydedilmeli; ardından `prose` için tema token'larına (`--foreground`, `--muted-foreground`, `--primary`) bağlı bir `typography` uzantısı tanımlanarak açık/koyu temada marka renkleri tutarlı hale getirilmeli. `max-w-none` yerine `max-w-prose` / ~68ch okuma genişliği kullanılmalı. Eklenti istenmiyorsa alternatif: blok tipine göre stil veren küçük bir `ArticleBody` bileşeni (h2 → `mt-10 text-2xl font-semibold scroll-mt-24` + id ile başlık çapası, ul → `list-disc pl-6 space-y-2`, p → `leading-7 [&:not(:first-child)]:mt-6`) yazılıp hem blog detayında hem ileride eklenecek rehber yüzeylerinde yeniden kullanılmalı. Hangi yol seçilirse seçilsin, `prose` sınıfı CSS'i üretilmeden kodda bırakılmamalı.

---

## Uygulama (Dalga 2)

**Yüzey:** `p-blog-yasal` · **Tarih:** 2026-10-10 · URL korundu (`app/(okuma)/blog/[slug]`, sakin okuma kabuğu). Dosyalar: `page.tsx`, `opengraph-image.tsx`, `not-found.tsx`; bileşenler `components/public/p-blog-yasal/` (`article-body`, `reading-progress`, `share-actions`, `toc-nav`, `post-card`, `blog-cta`, `json-ld`). Test: `__tests__/lib/blog-posts.test.ts`, `__tests__/lib/legal-documents.test.ts` (JSON-LD kaçışı).

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Nasıl |
|---|---|---|---|
| 1 | Statik üretim | ÇALIŞIYOR | `generateStaticParams` |
| 2 | Bilinmeyen slug | ÇALIŞIYOR | blog'a özel `not-found.tsx` (son 3 yazı + tüm yazılar), metadata `noindex` |
| 3 | Başlık | ÇALIŞIYOR | |
| 4 | Açıklama | ÇALIŞIYOR | |
| 5 | Canonical | ÇALIŞIYOR | |
| 6 | OpenGraph article | ÇALIŞIYOR | url, siteName, locale, publishedTime, modifiedTime, authors, section, tags eksiksiz |
| 7 | Yazıya özel OG görseli | ÇALIŞIYOR | `opengraph-image.tsx` (başlık, kategori, okuma süresi); X kartı og:image'a düşer |
| 8 | Article JSON-LD | ÇALIŞIYOR | `BlogPosting`: Organization yazar, image, mainEntityOfPage, inLanguage, wordCount, timeRequired, publisher.logo; `<` kaçışlı |
| 9 | BreadcrumbList LD | ÇALIŞIYOR | canonical tabanla |
| 10 | Görsel breadcrumb | ÇALIŞIYOR | DS `Breadcrumbs`: mobilde yalnız "‹ Blog", masaüstünde uzun başlık kırpılır |
| 11 | Yayın tarihi | ÇALIŞIYOR | Europe/Istanbul günü |
| 12 | Güncellenme | ÇALIŞIYOR | gün farkı varsa |
| 13 | H1 | ÇALIŞIYOR | |
| 14 | Özet | ÇALIŞIYOR | |
| 15 | Yazar | ÇALIŞIYOR | kurum simgesi + ad; yazar sayfası yok (ekip yazısı) |
| 16 | Okuma süresi | ÇALIŞIYOR | içerikten türetilir |
| 17 | Kapak | ÇALIŞIYOR | kategori renginden marka kapağı (21:9) |
| 18 | Gövde tipografisi | ÇALIŞIYOR | tipli `ArticleBody` (eklentisiz), 68ch, 1.75 satır aralığı |
| 19 | Madde listesi | ÇALIŞIYOR | `list-disc pl-6`, marka renkli işaret; ayrıca `ol`, `callout`, `quote` blokları |
| 20 | H2 | ÇALIŞIYOR | hiyerarşi + `id` + hover/odakta bölüm bağlantısı (başlık adını kirletmez) |
| 21 | `hr` + dipnot | KALDIRILDI | aynı hedefe ikinci bağlantıydı; yerine kitle CTA'sı + ilgili yazılar |
| 22 | "Tüm yazılar" | ÇALIŞIYOR | ilgili yazılar başlığında |
| 23 | Odak halkaları | ÇALIŞIYOR | |
| 24 | Skip-link | ÇALIŞIYOR | |
| 25 | Yetki | ÇALIŞIYOR (gerekmez) | |
| 26 | Yükleniyor | ÇALIŞIYOR | hafif statik iskelet |
| 27 | Hareketli arka plan | KALDIRILDI (okuma yüzeyinde) | statik zemin; `no-store` ayar isteği bu sayfalarda yok |
| 28 | Dil tutarlılığı | ÇALIŞIYOR (kısmi kapsam) | EN arayüzde "yalnız Türkçe" notu, `<article lang="tr">` |
| 29 | İçindekiler | ÇALIŞIYOR | ≥ 3 h2: masaüstü yapışkan scroll-spy, mobil açılır liste |
| 30 | İlgili / önceki-sonraki | ÇALIŞIYOR | kategori → etiket → kitle → yenilik puanlaması |
| 31 | Paylaşım | ÇALIŞIYOR | Web Share (varsa) + bağlantı kopyala, `aria-live` sonuç, `blog_share` |
| 32 | Dönüşüm CTA | ÇALIŞIYOR | kitle/kategoriye göre; `blog_cta_click` rızaya bağlı |
| 33 | Sitemap | ÇALIŞIYOR | `app/sitemap.ts` (eklemeli değişiklik) |
| 34 | CMS | ÇALIŞIYOR (depo tabanlı) | deploy'suz yayın → ŞEMA İSTEĞİ (bkz. blog.md) |
| 35 | RSS | ÇALIŞIYOR | `/feed.xml` canonical tabanla |

Ek: okuma ilerleme çubuğu (yalnız `scaleX`, konum dış sarmalayıcıda, azaltılmış harekette yaylanmasız).

### Kapanan bulgular
1 (tipografi), 2 (sitemap), 3 (OG + yazıya özel görsel), 4 (JSON-LD tip/alanlar + Breadcrumb), 6 (CTA, tekrar bağlantı), 7 (okuma süresi, TOC, ilgili, paylaşım), 8 (sakin zemin + yüzey), 10 (breadcrumb, 404, `hr`). Kısmen: 9 (dil notu; içerik çevirisi yok). Güvenlik notu (JSON-LD `</script>` kaçışı) kapandı.

### Kalanlar
- **Bulgu 5 / CMS:** ŞEMA İSTEĞİ (`BlogPost`).
- "Okur rozeti" (okumayı bitirince tek seferlik ödül) yapılmadı: puan/rozet basan yeni yol ekonomi + sunucu doğrulaması ister; bu yüzeyin kapsamı dışında.
- Tarayıcıda görsel doğrulama yapılmadı (dev server yasak).
