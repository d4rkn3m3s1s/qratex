# /blog

**Amaç:** Herkese açık (giriş gerektirmeyen) blog dizini. `lib/blog-posts.ts` içindeki sabit kodlu yazıları kart ızgarasında listeler, her kart `/blog/[slug]` detayına gider. Pratikte bir SEO/pazarlama sayfası: içerik **işletme sahibine** yazılmış ("İşletmeler İçin Rehber", "QRateX ile nasıl başlanır?"); QR okutan son kullanıcıya (tüketiciye) yönelik tek satır yok.

**Genel puan: 3.5/10** · **Karar: yeniden tasarla** (sayfa iskeleti temiz ama içerik modeli, SEO kablolaması ve detay sayfasındaki tipografi kırık; tüketici panelinde bir rolü yok.)

> Denetim kapsamı: `app/(public)/blog/page.tsx` + `app/(public)/layout.tsx` + `app/(public)/loading.tsx` + `lib/blog-posts.ts` + kartların bağlandığı `app/(public)/blog/[slug]/page.tsx` + blogu besleyen `app/sitemap.ts`, `app/feed.xml/route.ts`, `app/layout.tsx` (metadata), `components/layout/header.tsx` / `footer.tsx`. Sayfa hiçbir API ucu çağırmıyor, hiçbir Prisma modeli kullanmıyor (yalnızca layout `prisma.settings` okuyor, `lib/get-background-effect.ts:13`). Kod/DB'ye dokunulmadı, hiçbir şey çalıştırılmadı; bulgular kodu okuyarak doğrulandı.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Listeleme ve link çalışıyor, fakat canonical ana sayfaya düşüyor, detayda `prose` stili hiç uygulanmıyor, yazılar sitemap'te yok. |
| UX | 3/10 | İki kart, ikisi de 21 aylık; filtre/arama/öne çıkan/CTA yok; hedef kitle (tüketici) ile içerik (işletme) birbirini tutmuyor. |
| Görsel | 4/10 | Temiz ama jenerik shadcn kart ızgarası; `image` alanı var ama kapak görseli hiç render edilmiyor, marka kimliği (mor, 3B, karakter) yok. |
| Mimari | 3/10 | İçerik TS dizisinde sabit kodlu; atıl duran `Page` modeli/CMS'i kullanılmıyor; kardeş public sayfaların SEO deseni (`getPageSeo`, JSON-LD, breadcrumb) atlanmış. |
| Performans | 8/10 | Tamamen statik server component, istemci JS'i yok; tek maliyet layout'taki animasyonlu arka plan ve kartlardaki `backdrop-blur`. |
| Erişilebilirlik + mobil | 6/10 | Semantik `time`, `aria-hidden` ikonlar, focus ring, tek sütun mobil iyi; ama hover hareketi `motion-reduce`'a uymuyor, kart link adı çok uzun, detayda liste/başlık semantiği görsel olarak kayboluyor, EN dil seçimi içerikte karşılıksız. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa `title` / `description` metadata | ÇALIŞIYOR | `app/(public)/blog/page.tsx:7-10` | Şablonla "Blog \| {siteName}" olur (`app/layout.tsx:51-53`). |
| 2 | Canonical URL | BOZUK | `app/layout.tsx:66-67` (`canonical: '/'`), `blog/page.tsx:7-10` (alternates yok) | /blog, canonical olarak **ana sayfayı** bildiriyor. Bkz. Bulgu 1. |
| 3 | Open Graph / Twitter kartı | BOZUK | `app/layout.tsx:70-91` | /blog paylaşıldığında og:url = ana sayfa, og:title = site varsayılan başlığı. |
| 4 | Admin SEO paneli sayfa-bazlı override (`getPageSeo`) | EKSİK | Kardeş sayfa: `app/(public)/guven/page.tsx:10-18`; blog: yok | Admin `/admin/seo` üzerinden /blog için girilen başlık/açıklama/canonical yok sayılır. |
| 5 | "Blog" üst etiketi (pill) | ÇALIŞIYOR | `blog/page.tsx:16-18` | Dekoratif. |
| 6 | H1 "İçgörüler & Rehberler" + alt açıklama | ÇALIŞIYOR | `blog/page.tsx:19-22` | Alt açıklama metadata ile birebir aynı metin. |
| 7 | Yazı kartı ızgarası (mobil 1, md 2 sütun) | ÇALIŞIYOR | `blog/page.tsx:24-25` | Sadece 2 öğe; sayfa yarı boş görünür. |
| 8 | Kart: yayın tarihi (`<time dateTime>`) | ÇALIŞIYOR | `blog/page.tsx:34-37`, `lib/blog-posts.ts:81-85` | Deterministik TR formatı (hydration-güvenli, iyi). |
| 9 | Kart: okuma süresi | KISMİ | `blog/page.tsx:38-43`, `lib/blog-posts.ts:30,53` | Elle girilmiş sayı, içerikten hesaplanmıyor; içerik değişince yalan söyler. |
| 10 | Kart: başlık (`h2`) + açıklama | ÇALIŞIYOR | `blog/page.tsx:51-54` | |
| 11 | Kartın tamamı link + klavye focus ring | KISMİ | `blog/page.tsx:26-30`, `components/ui/card.tsx:14` | Link `rounded-2xl`, Card `rounded-xl` → focus halkası köşelerde karttan kopuk; link'in erişilebilir adı tarih+süre+başlık+açıklamanın tamamı. |
| 12 | Hover mikro-etkileşimi (kalkma, gölge, ok kayması) | KISMİ | `blog/page.tsx:31,46` | `transition-all` + `-translate-y-0.5` ama `motion-reduce:` varyantı yok; `Card`'ın kendi `hover` prop'u (motion-reduce destekli, `card.tsx:19-20`) kullanılmamış. |
| 13 | Sıralama (yeniden eskiye) | KISMİ | `lib/blog-posts.ts:22-70`, `blog/page.tsx:25` | Sıralama kodla yapılmıyor; dizinin elle yazılan sırasına güveniyor. |
| 14 | Kapak görseli | EKSİK | `lib/blog-posts.ts:17` (`image?: string`) | Alan tanımlı, hiçbir yazıda dolu değil, hiçbir yerde render edilmiyor (ölü alan). |
| 15 | Boş durum | EKSİK | `blog/page.tsx:24-59` | `BLOG_POSTS` boşsa başlık altında boş ızgara kalır. Statik veride düşük risk; CMS'e geçilince gerekli. |
| 16 | Kategori / etiket filtresi | EKSİK | `lib/blog-posts.ts:10-20` | Veri modelinde kategori/etiket alanı yok. |
| 17 | Arama | EKSİK | — | |
| 18 | Sayfalama / "daha fazla yükle" | EKSİK | — | 2 yazıyla gerek yok; CMS ile gerekli olur. |
| 19 | Öne çıkan (hero) yazı | EKSİK | — | Tüm kartlar eş ağırlıkta. |
| 20 | Breadcrumb (görsel + `BreadcrumbList` JSON-LD) | EKSİK | Kardeş: `guven/page.tsx:30-31`; detay görsel breadcrumb'ı var (`blog/[slug]/page.tsx:68-74`) | Dizin sayfasında yok; detayda JSON-LD versiyonu da yok. |
| 21 | `Blog` / `ItemList` yapılandırılmış veri | EKSİK | — | Detayda `Article` JSON-LD var (`blog/[slug]/page.tsx:49-66`), dizinde hiçbir şema yok. |
| 22 | RSS keşfi + feed | KISMİ | `app/layout.tsx:159`, `app/feed.xml/route.ts:16`, footer `footer.tsx:24` | Çalışıyor; ancak feed `siteUrl` (env) kullanıyor, sitemap/canonical `seo.canonicalBase` kullanıyor → iki farklı host üretebilir. Sayfada RSS/abone ol bağlantısı yok. |
| 23 | Sitemap kaydı | KISMİ | `app/sitemap.ts:60-65` | `/blog` var, **tekil yazı URL'leri yok**. Bkz. Bulgu 3. |
| 24 | İçerik yönetimi | KISMİ | `lib/blog-posts.ts:1-4,22` | Yazı eklemek = kod değişikliği + deploy. `Page` modeli (`prisma/schema.prisma:1385-1397`) ve `app/api/admin/pages/route.ts` mevcut ama blog bunlara bağlı değil. |
| 25 | Çok dil (EN) | EKSİK | `components/layout/language-switcher.tsx:17`, `messages/en.json:1856` | Header'da EN seçilebiliyor, sayfa metinleri ve yazılar sabit Türkçe. |
| 26 | Dönüşüm CTA'sı (QR okut / kayıt ol / işletmeni ekle) | EKSİK | `blog/page.tsx:12-62` | Sayfa hiçbir yere yönlendirmiyor. |
| 27 | Bülten / bildirim aboneliği | EKSİK | — | |
| 28 | Tüketiciye yönelik içerik / kişiselleştirme | EKSİK | `lib/blog-posts.ts:25-26,42` | İçerik işletme odaklı; oturum açmış tüketiciye puan/rozet/oyun bağlamı sunulmuyor. |
| 29 | İçerik tazeliği | KISMİ | `lib/blog-posts.ts:27,50` | Son yazı 15 Ocak 2025 (bugün 8 Ekim 2026): ~21 ay. "weekly" sitemap sıklığı (`sitemap.ts:63`) ve `lastModified: new Date()` gerçeği yansıtmıyor. |
| 30 | Yükleniyor durumu | ÇALIŞIYOR | `app/(public)/loading.tsx:13-96` | Statik sayfada nadiren görünür; görünürse tam ekran `z-[100]` overlay, basit bir liste sayfası için ağır. |
| 31 | Hata durumu | ÇALIŞIYOR | `app/error.tsx` (kök) | `(public)` grubuna özel error boundary yok; kök yakalar. |
| 32 | Animasyonlu arka plan + reduced-motion | ÇALIŞIYOR | `app/(public)/layout.tsx:18`, `components/landing/LandingBackground.tsx:51-53,79` | Arka plan reduce tercihine uyuyor (sayfa kartları uymuyor, #12). |
| 33 | Skip-link + `main` landmark | ÇALIŞIYOR | `app/(public)/layout.tsx:19-28` | |
| 34 | Header / footer navigasyon girişleri | ÇALIŞIYOR | `components/layout/header.tsx:29`, `footer.tsx:19` | |
| 35 | Detay sayfası gövde tipografisi (`prose`) | BOZUK | `blog/[slug]/page.tsx:96`, `tailwind.config.ts:193`, `package.json` | `@tailwindcss/typography` kurulu değil → `prose` sınıfı hiçbir şey yapmıyor. Bkz. Bulgu 2. |
| 36 | Detay: yazar bilgisi / JSON-LD yazar tipi | KISMİ | `blog/[slug]/page.tsx:57`, `lib/blog-posts.ts:29` | "QRateX Ekibi" bir kurum ama `@type: 'Person'` olarak işaretlenmiş. |
| 37 | Detay: paylaşım, ilgili yazılar, önceki/sonraki | EKSİK | `blog/[slug]/page.tsx:109-129` | Sadece "← Tüm yazılar" linki. |

**Sayım (37 özellik):** ÇALIŞIYOR 11 (#1,5,6,7,8,10,30,31,32,33,34) · KISMİ 9 (#9,11,12,13,22,23,24,29,36) · BOZUK 3 (#2,3,35) · SAHTE 0 · EKSİK 14 (#4,14,15,16,17,18,19,20,21,25,26,27,28,37). #35-37 kartların vardığı detay sayfasına aittir; dizinin kullanıcı yolculuğunun parçası olduğu için dahil edildi.

---

## Bulgular

### 1. Kritik · SEO / doğruluk · /blog canonical olarak ana sayfayı bildiriyor
- **Kanıt:** `app/layout.tsx:65-68` kök metadata'da `metadataBase` + `alternates: { canonical: '/' }` tanımlıyor. `app/(public)/blog/page.tsx:7-10` yalnızca `title`/`description` döndürüyor, `alternates` yok. Next.js metadata birleştirmesinde alt segment bir alanı tanımlamazsa üst segmentinkini miras alır → /blog'un HTML'inde `<link rel="canonical" href="{base}/">` çıkar. Aynı mirasla `openGraph.url = base`, `og:title = seo.defaultTitle` (`app/layout.tsx:70-76`). Kardeş sayfaların hepsi bunu açıkça eziyor (`guven/page.tsx:17`, `gizlilik-politikasi/page.tsx:16`, `cerez-politikasi/page.tsx:15` ...); blog dizini tek istisna.
- **Sorun:** Google'a "bu sayfa ana sayfanın kopyası" deniyor; /blog sitemap'te `priority 0.7` ile ilan edilirken (`sitemap.ts:60-65`) canonical'ı ana sayfayı gösteriyor — çelişkili sinyal, dizin sayfasının indekslenmemesi/konsolide edilmesi. Sosyal paylaşımda önizleme ana sayfanın kartı olur.
- **Profesyonel öneri:** `export const metadata` yerine kardeş sayfalarla aynı deseni kullanan `generateMetadata()`: `getPageSeo('/blog')` override'ı + `getCanonicalBase(seo)` ile `alternates.canonical = ${base}/blog`, `openGraph: { type: 'website', url, title, description, images }`, `twitter`. Ayrıca kök layout'taki `canonical: '/'` mirasının bir tuzak olduğunu belgeleyip, ileride eklenecek her public sayfa için bir lint/test kuralı (public route'larda `alternates.canonical` zorunlu) eklenmeli.
- **Efor:** S

### 2. Yüksek · Görsel / işlevsellik · Blog yazılarının gövdesi stilsiz render ediliyor (`prose` sınıfı ölü)
- **Kanıt:** `app/(public)/blog/[slug]/page.tsx:96` `className="prose prose-neutral max-w-none dark:prose-invert"`. `tailwind.config.ts:193` yalnızca `tailwindcss-animate` eklentisini yüklüyor; `package.json`'da `@tailwindcss/typography` yok; `app/globals.css`'te `.prose` tanımı yok (grep: eşleşme yok). Tailwind 3 preflight `h2 { font-size: inherit; font-weight: inherit }`, `ul { list-style: none; margin: 0; padding: 0 }`, `p { margin: 0 }` uygular.
- **Sorun:** /blog'daki her kart, ara başlıkları paragrafla aynı boyutta/kalınlıkta, madde işaretleri kaybolmuş, paragraflar arası boşluksuz tek bir metin duvarına götürüyor. Dizin sayfasının tek işlevi bu detaya yönlendirmek olduğundan, kullanıcı yolculuğunun varış noktası kırık. (Görsel olarak tarayıcıda doğrulanmadı; CSS zinciri okunarak doğrulandı. `app/customer/nearby/page.tsx` de `prose` kullanıyor — aynı sorun orada da olabilir.)
- **Profesyonel öneri:** `@tailwindcss/typography` eklentisini ekleyip `tailwind.config.ts` `theme.extend.typography` ile marka tokenlarına (`--foreground`, `--primary`, `--muted-foreground`) bağlanmış bir `prose-qratex` varyantı tanımla; ya da eklenti istenmiyorsa blok renderer'ı (`h2`/`p`/`ul`) kendi Tailwind sınıflarıyla stillendiren küçük bir `BlogBlocks` bileşeni yaz. Uzun vadede blok tipleri (alıntı, görsel, callout, CTA) büyüyeceği için ikinci yol (tipli blok renderer) daha sürdürülebilir.
- **Efor:** S

### 3. Yüksek · SEO · Tekil yazılar sitemap'te yok, sitemap tarihleri gerçek dışı
- **Kanıt:** `app/sitemap.ts:11-72` sabit liste; `/blog` var (`:60-65`), `BLOG_POSTS` içe aktarılmıyor, `/blog/{slug}` URL'leri üretilmiyor. Tüm girdilerde `lastModified: new Date()` (her istek "bugün değişti").
- **Sorun:** Asıl indekslenmesi gereken içerik (makaleler) arama motoruna ilan edilmiyor; yalnızca iç linklerle keşfediliyor. `lastModified` her zaman "şimdi" olduğu için Google bu sinyali güvenilmez sayar.
- **Profesyonel öneri:** Sitemap'i `BLOG_POSTS` (veya CMS'e geçince DB) üzerinden genişlet: her yazı için `url`, `lastModified: post.dateModified`, `changeFrequency: 'monthly'`. `/blog` girdisinin `lastModified`'ı en yeni yazının `dateModified`'ı olsun. Feed (`feed.xml/route.ts:16`) ile sitemap'in host'u tek kaynaktan (`getCanonicalBase(seo)`) gelsin.
- **Efor:** S

### 4. Yüksek · Ürün / bilgi mimarisi · Sayfa müşteri (tüketici) panelinde konumlanmış ama içerik işletme sahibine yazılmış
- **Kanıt:** Yazı başlıkları "QR Kod ile Geri Bildirim Toplama: İşletmeler İçin Rehber" (`lib/blog-posts.ts:25`), "İşletmenizi oluşturun, ürünlerinizi ekleyin..." (`:42`), "Ekonomi ayarlarını yönetici panelinden düzenleyerek..." (`:67`). `app/customer/*` altında blog/içerik sayfası yok; müşteri kabuğundan /blog'a link bulunmadı (grep `"/blog"`: yalnızca public header/footer, sitemap, feed).
- **Sorun:** Puan/XP/rozet/lig kazanan tüketici için bu sayfanın değeri sıfır: ne "puanını nasıl katlarsın", ne "yeni sezon/turnuva", ne "rozet rehberi" var. Starbucks Rewards/Duolingo'da içerik akışı ürünün içine gömülüdür (yenilikler, ipuçları, etkinlik duyuruları) ve oyunlaştırma döngüsünü besler. Burada blog pazarlama sitesinin bir köşesinde, 21 aydır güncellenmemiş, iki işletme makalesinden ibaret.
- **Profesyonel öneri:** İki kitleyi ayır: (a) **Public blog** = işletme/SEO pazarlama içeriği, B2B CTA'larıyla ("Ücretsiz başla"); (b) **Tüketici tarafı** = müşteri panelinde "Keşfet/Rehberler" sekmesi altında kısa, kart tabanlı, oyunlaştırmaya bağlı içerik ("Bu hafta 2× XP", "Efsanevi rozet nasıl çıkar", "Yeni sezon ligi"). Veri modelinde `audience: 'business' | 'consumer' | 'both'` alanı ile aynı CMS'ten beslenir; tüketici kartları okununca küçük bir XP/görev tetikleyebilir ("İlk rehberi oku" görevi) — ama puan basan her yol `points-economy-invariants` kurallarına (atomik tek seferlik kredi, idempotency) uymalı.
- **Efor:** L

### 5. Orta · Mimari · İçerik kodda sabit; mevcut `Page` modeli/CMS'i atıl
- **Kanıt:** `lib/blog-posts.ts:1-4` ("şimdilik statik; ileride CMS/DB'den gelebilir"), `:22-70`. `prisma/schema.prisma:1385-1397` `Page { slug, title, content Json, meta Json?, isPublished }` ve `app/api/admin/pages/route.ts` CRUD'u mevcut; `prisma.page` okuyan public bir renderer yok (grep: yalnızca admin route).
- **Sorun:** Her yazı bir geliştirici + deploy gerektiriyor; içerik ekibi (ör. stajyerler) yazamıyor; bu yüzden içerik 21 aydır donmuş. Aynı zamanda admin tarafında kimsenin tüketmediği yarım bir CMS duruyor.
- **Profesyonel öneri:** Ya `Page` modelini `kind: 'page' | 'post'`, `excerpt`, `coverImage`, `tags String[]`, `audience`, `publishedAt`, `author` alanlarıyla genişletip blogu ona bağla, ya da ayrı `BlogPost` modeli aç. Okuma yolu: `lib/blog.ts` içinde `unstable_cache` + `tags: ['blog']` ile önbellekli `listPosts()/getPost()`, admin yayınlayınca `revalidateTag('blog')`. Hafıza notundaki **build-time DB fail-safe** kuralı gereği bu helper'lar try/catch + boş liste/varsayılan dönmeli (statik public sayfa build'de DB'ye erişemezse deploy patlamasın). `generateStaticParams` + ISR ile performans korunur. İçerik formatı için mevcut `BlogBlock` tip birliği korunup genişletilebilir (alıntı, görsel, CTA bloğu).
- **Efor:** L

### 6. Orta · SEO / tutarlılık · Kardeş public sayfaların desenini (override, JSON-LD, breadcrumb) atlıyor
- **Kanıt:** `guven/page.tsx:10-31` → `getPageSeo`, `WebPageJsonLd`, `BreadcrumbJsonLd`, `BreadcrumbNav`. Blog dizini: hiçbiri yok (`blog/page.tsx:1-10`). Detayda görsel breadcrumb var ama `BreadcrumbJsonLd` yok (`blog/[slug]/page.tsx:68-74`); `Article.author` kurum olduğu hâlde `@type: 'Person'` (`:57`), `image` yok (Google Article zengin sonuçları için önerilen alan).
- **Sorun:** Admin SEO panelinden /blog için yapılan ayar sessizce etkisiz; arama sonuçlarında breadcrumb/zengin sonuç kaybı.
- **Profesyonel öneri:** Dizine `CollectionPage`/`Blog` + `ItemList` (her yazı `BlogPosting` url'si) JSON-LD'si, `BreadcrumbJsonLd` ve `BreadcrumbNav` ekle. Detayda `author` için `Organization`, `image` (kapak veya varsayılan OG), `mainEntityOfPage` ekle. Bunu tek seferlik değil, `components/seo/` altında `PublicPageSeo` gibi tek bir yardımcıyla tüm public sayfalara standartlaştır.
- **Efor:** S

### 7. Orta · UX / görsel · Jenerik kart ızgarası; kapak görseli, hiyerarşi ve CTA yok
- **Kanıt:** `blog/page.tsx:24-58` iki eş ağırlıklı metin kartı; `image` alanı tanımlı ama kullanılmıyor (`lib/blog-posts.ts:17`); sayfada herhangi bir dönüşüm aksiyonu yok (`blog/page.tsx:12-62`).
- **Sorun:** Görsel hiyerarşi yok (öne çıkan yazı, kategori, görsel); okuyucu bir yazıyı bitirdiğinde veya listeye baktığında ürünün değer önerisine geri bağlanmıyor. Landing'deki mor marka dili, 3B ödül kutusu ve karakter rozetleri gibi ayırt edici öğeler burada hiç yok — sayfa herhangi bir shadcn şablonu gibi duruyor.
- **Profesyonel öneri:** Üstte tam genişlik "öne çıkan yazı" (16:9 kapak, kategori çipi, başlık, özet), altında 3 sütunlu (lg) / 2 (md) / 1 (mobil) kart ızgarası, her kartta `next/image` kapak (`sizes` ile), kategori çipi, okuma süresi. Liste sonunda kitleye göre CTA bandı (işletme: "Ücretsiz başla"; tüketici: "Yakınındaki QR'ları keşfet → /customer/nearby"). Kapak yoksa marka renginde, kategoriye göre otomatik üretilen SVG/gradient placeholder.
- **Efor:** M

### 8. Orta · İçerik / güven · İçerik bayat, "weekly" sinyaliyle çelişiyor
- **Kanıt:** En yeni yazı `datePublished: '2025-01-15'` (`lib/blog-posts.ts:27`); sitemap `/blog` için `changeFrequency: 'weekly'` (`sitemap.ts:63`).
- **Sorun:** Ziyaretçi için 21 aylık iki yazı "terk edilmiş blog" izlenimi verir ve marka güvenini düşürür; özellikle `/guven` gibi güven sayfalarıyla aynı footer'da durduğu için.
- **Profesyonel öneri:** CMS'e geçene kadar ya içerik takvimi (ayda en az 2 yazı: sürüm notları, rozet sezonu, işletme vaka çalışması) ya da tarihi kart üzerinde vurgulamayan bir düzen. Sürüm notları/"Yenilikler" içeriği hızlı bir besleme kaynağı olabilir.
- **Efor:** M (süreç)

### 9. Düşük · Erişilebilirlik · Kart hareketi azaltılmış harekete uymuyor; link adı çok uzun; focus halkası köşeleri
- **Kanıt:** `blog/page.tsx:31` `transition-all duration-200 group-hover:-translate-y-0.5` (motion-reduce yok); `:46` ok `translate-x-1`. Link `rounded-2xl` (`:29`), Card `rounded-xl` (`components/ui/card.tsx:14`). Link içeriği tarih + "4 dk okuma" + başlık + açıklamanın tamamı (`:32-55`) → ekran okuyucu her kartı uzun bir cümle olarak okur.
- **Sorun:** `prefers-reduced-motion` kullanıcıları için arka plan duruyor ama kartlar hâlâ kayıyor (tutarsız); focus halkası kart köşesinden ayrık görünür; liste gezinmesi yorucu.
- **Profesyonel öneri:** `motion-safe:group-hover:-translate-y-0.5` / `motion-reduce:transition-none` (veya `Card`'ın hazır `hover` prop'u, `card.tsx:19-20`), `transition-all` yerine `transition-[transform,box-shadow,border-color]`. Kartı `<article aria-labelledby>` yapıp linki başlığa koy, kartın geri kalanını "stretched link" (`after:absolute after:inset-0`) ile tıklanabilir tut; böylece link adı yalnızca başlık olur. Link ve Card aynı radius'u paylaşsın.
- **Efor:** S

### 10. Düşük · i18n · EN seçilebiliyor ama blog yalnız Türkçe
- **Kanıt:** `components/layout/language-switcher.tsx:17` (`tr`, `en`); header etiketi çevriliyor (`header.tsx:29`, `messages/en.json:1856`); `blog/page.tsx:8-21` ve tüm yazılar sabit TR.
- **Sorun:** EN seçen ziyaretçi menüde "Blog" görür, tıklayınca tamamen Türkçe sayfa — dil karışıklığı.
- **Profesyonel öneri:** Kısa vadede sayfa iskeleti metinlerini (`İçgörüler & Rehberler`, "dk okuma", boş durum) `useAppT`/mesaj dosyalarına taşı ve EN'de "Bu yazılar Türkçedir" rozetini göster; CMS modelinde `locale` alanı ile çevrilmiş yazı desteği + `hreflang` alternates.
- **Efor:** M

### 11. Düşük · Doğruluk · Okuma süresi elle girilmiş, sıralama dizinin sırasına bağlı
- **Kanıt:** `lib/blog-posts.ts:30,53` (`readingMinutes: 4/5`), `blog/page.tsx:25` (`BLOG_POSTS.map`, sort yok).
- **Sorun:** İçerik düzenlenince okuma süresi yanlışlaşır; yeni yazı dizinin sonuna eklenirse en altta görünür.
- **Profesyonel öneri:** Okuma süresini blok metinlerinin kelime sayısından türeten saf bir fonksiyon (`~200 kelime/dk`), listede `datePublished` desc ile açık sıralama.
- **Efor:** S

### 12. Düşük · Tutarlılık · Feed ve canonical farklı host kaynakları; marka yazımı karışık
- **Kanıt:** `app/feed.xml/route.ts:2,16` `siteUrl` (env) ↔ `blog/[slug]/page.tsx:20-21`, `sitemap.ts:9` `seo.canonicalBase || seo.siteUrl`. Marka: "QRateX" (`blog-posts.ts`, `feed.xml/route.ts:30`) ↔ "Qratex" (`app/(public)/loading.tsx:44`).
- **Sorun:** Admin SEO'dan canonical host değiştirilirse RSS eski host'u yayınlamaya devam eder; marka yazımı sayfalar arasında tutarsız.
- **Profesyonel öneri:** Tüm public URL üretimini `getCanonicalBase(await getSeoSettings())` üzerinden tekilleştir; marka adı için tek sabit (`seo.siteName`) kullan.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Kitleye göre içerik akışı + uygulama içi "Yenilikler/Rehberler"** — Duolingo ve Starbucks Rewards içerik/duyuruyu ürünün içinde, oyunlaştırma döngüsüne bağlı sunar (etkinlik, çifte puan, yeni rozet). Qratex'te tüketici için içerik yüzeyi yok.
2. **Kategori/etiket filtresi + arama** — "İşletme rehberi", "Oyunlaştırma", "Sürüm notları", "Vaka çalışması" gibi çipler; istemci tarafı hafif filtre (az yazıda) veya URL parametreli server filtre.
3. **Öne çıkan yazı + kapak görselleri + okuma ilerleme çubuğu (detayda)** — Monzo/Revolut bloglarının standart editoryal düzeni.
4. **Paylaşım ve ilgili yazılar** — detayda Web Share API (mobil), "Bunu da oku" (aynı etiket), önceki/sonraki.
5. **Abonelik** — e-posta bülteni veya web push ("yeni yazı/etkinlik"), mevcut push merkezi ve mail altyapısına bağlanabilir.
6. **CMS ile yayın akışı** — taslak/zamanlanmış yayın, önizleme, yazar profili; içerik ekibinin deploy'suz yayın yapabilmesi.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** /blog iki net işe hizmet etmeli. Public tarafta *"Qratex ne işe yarar ve işletmem nasıl kazanır?"* sorusunu taze, görsel, SEO'su doğru içerikle cevaplayan editoryal bir vitrin; tüketici tarafında ise müşteri panelinin içinde kısa, oyunlaştırmaya bağlı "Rehberler & Yenilikler" akışı.

**Yerleşim (public /blog):**
- Üst: kısa başlık + kategori çipleri (yatay kaydırılabilir, mobilde sticky, `top: env(safe-area-inset-top)` dikkatli).
- Öne çıkan yazı: tam genişlik kart, 16:9 kapak, kategori, başlık, 2 satır özet, okuma süresi.
- Izgara: lg 3 / md 2 / mobil 1 sütun; `article` + stretched-link kartlar; `next/image` kapaklar.
- Ara bant: "Sürüm notları" mini zaman çizelgesi (son 3 güncelleme) — içerik tazeliği sinyali.
- Alt: kitleye göre CTA bandı + RSS/bülten aboneliği.
- Boş durum: "Henüz yazı yok — RSS'e abone ol" mesajı.

**Motion/3D (ölçülü):** Kartlarda yalnızca `motion-safe` altında 2-4px kalkma + gölge; ızgarada ilk boyamada hafif stagger (global `LazyMotion`'daki `m as Motion` ile, `useReducedMotion` kontrolüyle, en fazla 6 kart, toplam <300 ms). Blog bir okuma yüzeyi; three.js/3B burada **yerinde değil** — öne çıkan yazının kapağı bir oyunlaştırma konusundaysa statik bir 3B render görseli (önceden üretilmiş PNG/WebP) yeterli. Detay sayfasında okuma ilerleme çubuğu (`useScroll`, transform-only).

**Veri/API değişiklikleri:**
- Model: `BlogPost` (veya genişletilmiş `Page`): `slug, title, excerpt, coverImage, tags[], audience, locale, author, status (draft/scheduled/published), publishedAt, updatedAt, content Json (tipli bloklar)`.
- Okuma: `lib/blog.ts` → `unstable_cache(..., { tags: ['blog'] })`, try/catch + boş liste fallback (build-time fail-safe); admin yayınlayınca `revalidateTag('blog')`.
- Rotalar: `/blog` (ISR), `/blog/[slug]` (`generateStaticParams` + ISR), `/blog/etiket/[tag]` opsiyonel.
- SEO: `generateMetadata` + `getPageSeo('/blog')`, canonical, OG; `Blog`/`ItemList` + `BreadcrumbList` JSON-LD; sitemap ve feed aynı kaynaktan ve aynı host'tan.
- Admin: mevcut `/admin/pages` ekranını "İçerik" olarak yeniden adlandırıp blog yazısı türünü eklemek (yeni bir panel açmak yerine).
- Tüketici akışı: `/customer` altında "Rehberler" kartı/sekmesi `audience in ('consumer','both')` filtresiyle aynı veriyi okur; okuma bazlı görev ödülü eklenecekse sunucu tarafında idempotent, tek seferlik kredi (`points-economy-invariants`).

---

## Çakışmalar / birleştirme önerisi

- **`/admin/pages` + `Page` modeli** (`prisma/schema.prisma:1385`, `app/api/admin/pages/route.ts`): public tarafta tüketicisi olmayan bir CMS; blogun ihtiyacı olan şeyin ta kendisi. **Birleştir:** blog içeriği bu modele (veya onun genişletilmiş hâline) taşınmalı, `lib/blog-posts.ts` statik dizisi seed/migrasyon kaynağı olarak emekliye ayrılmalı.
- **`/neden-qratex`**: ikisi de işletmeye yönelik pazarlama içeriği. Çakışma değil ama /blog yazılarının sonundaki CTA'nın hedefi bu sayfa olabilir; ayrı tutulmalı.
- **Müşteri paneli (`/customer/discover`, `/customer/progress-hub`, `/customer/quests`)**: tüketiciye yönelik "rehber/yenilik" içeriği eklenirse yeni bir sayfa açmak yerine `discover` veya `progress-hub` içinde bir bölüm olarak gömülmeli; /blog'un müşteri paneli kapsamında ayrı bir sayfa olarak varlığı gerekli değil.
- Karar: **/blog'u public pazarlama sayfası olarak koru ama yeniden tasarla** (SEO hatalarını hemen düzelt, CMS'e bağla); tüketici içerik ihtiyacını panelin içinde ayrı bir yüzeyle karşıla.

---

## Doğrulama (şüpheci inceleme)

### 1. /blog sayfası canonical ve OG olarak ana sayfayı yayınlıyor — **DOĞRULANDI**

- `app/(public)/blog/page.tsx:7-10` yalnızca statik `title` + `description` içeren bir `metadata` dışa aktarıyor; `alternates`, `openGraph` ve `twitter` tanımlı değil.
- Arada metadata ezen bir katman yok: `app/(public)/layout.tsx` yalnızca bileşen döndürüyor (metadata/generateMetadata yok), `app/(public)/blog/` altında ayrı bir `layout.tsx` da yok.
- Kök `app/layout.tsx:65-68` `metadataBase` + `alternates.canonical: '/'`, `:70-76` `openGraph.url: base`, `title: seo.defaultTitle`, `description: seo.defaultDescription` tanımlıyor. Next.js (package.json:78, `^16`) metadata birleştirmesi alt segmentte tanımlanmayan üst-düzey alanları miras alır; dolayısıyla `/blog` HTML'inde `<link rel="canonical" href="{base}/">` ve `og:url = base`, `og:title`/`og:description` = ana sayfa varsayılanları çıkar (çocuktaki `title` OG nesnesine otomatik yansımaz, çünkü OG nesnesi bütün olarak üstten gelir).
- Tutarsızlık kanıtı: aynı gruptaki tüm diğer public sayfalar canonical'ı açıkça eziyor (`cerez-politikasi/page.tsx:15`, `gizlilik-politikasi/page.tsx:16`, `guven/page.tsx:17`, `kullanim-sartlari/page.tsx:16`, `kvkk-aydinlatma-metni/page.tsx:15`, `blog/[slug]/page.tsx:25`); `app/sitemap.ts:61-64` ise `/blog`'u `priority: 0.7`, `weekly` ile ilan ediyor.
- **Yeniden üretim:** `/blog` sayfasının kaynağını aç → `rel="canonical"` kök URL'yi gösterir; URL'yi WhatsApp/LinkedIn/X'te paylaş → önizleme kartı blog değil ana sayfa başlık/açıklamasıyla görünür. Google, sitemap'teki `/blog`'u ana sayfanın kopyası sayıp dizinlemeyebilir (Search Console'da "Alternatif sayfa, uygun standart etikete sahip").
- **Not:** Etki SEO/paylaşım düzeyinde; güvenlik veya veri bütünlüğü sorunu değil. Ciddiyet "YÜKSEK" yerine "ORTA-YÜKSEK" (SEO) olarak okunmalı, ama bulgu gerçek. Düzeltme yaklaşımı: diğer public sayfalarla aynı desende `generateMetadata` → `getSeoSettings()` + `getCanonicalBase()` ile `alternates.canonical: ${base}/blog`, kendi `openGraph` (url/title/description/type: 'website') ve `twitter` alanları; `getPageSeo('/blog')` override desteği; helper'lar build-time fail-safe (try/catch + varsayılan) kalmalı.

### 2. Blog detay gövdesi stilsiz: `prose` sınıfı tanımsız — **DOĞRULANDI**

- `app/(public)/blog/[slug]/page.tsx:96` gövdeyi `prose prose-neutral max-w-none dark:prose-invert` sınıflarıyla sarıyor ve içeriği çıplak `<h2>`, `<ul>/<li>`, `<p>`, `<hr>` olarak basıyor (`:98-109`).
- `tailwind.config.ts:193` → `plugins: [require('tailwindcss-animate')]`; `package.json`'da `@tailwindcss/typography` yok, `node_modules/@tailwindcss/typography` dizini de yok. Tailwind sürümü `^3.4.0` (package.json:140), `app/globals.css:1-3` klasik `@tailwind base/components/utilities` — v4 `@plugin` yolu da yok. Hiçbir `.css` dosyasında `.prose` tanımı bulunmuyor. Yani `prose*` sınıfları hiçbir CSS üretmiyor.
- Tailwind 3 preflight (`@tailwind base`) başlıkları `font-size: inherit; font-weight: inherit`, `ul`'yi `list-style: none; padding: 0`, `p`/`h2`/`ul` marjinlerini `0` yapar. `lib/blog-posts.ts` içinde 6 adet `h2` ve 3 adet `ul` bloğu var; hepsi bu sıfırlamaya maruz kalıyor.
- **Yeniden üretim:** `/blog` → herhangi bir karta tıkla → yazı gövdesinde ara başlıklar paragrafla aynı boyut/kalınlıkta, madde işaretleri ve paragraf arası boşluklar yok; metin tek bir yoğun blok gibi okunur. (Tarayıcıda görsel doğrulama bu incelemede de yapılmadı; CSS zinciri ve bağımlılık ağacı okunarak kesinleştirildi — eklenti hem config'te hem node_modules'ta yok, belirsizlik kalmıyor.)
- **Not:** `app/customer/nearby/page.tsx` de `prose` kullanıyor; aynı kök neden orayı da etkiler. Düzeltme yaklaşımı: `@tailwindcss/typography` eklentisini ekleyip `tailwind.config.ts` plugins'e kaydetmek ve tema token'larıyla (`--foreground`, `--muted-foreground`, `--primary`) `typography` extend'i tanımlamak (dark modda `prose-invert` yerine token tabanlı renkler daha tutarlı olur); ya da eklenti istenmiyorsa blok renderer'ı (`h2`/`ul`/`p`) tipli bileşenlere (ör. `components/blog/blog-block.tsx`) taşıyıp her bloğa açık Tailwind sınıfları vermek. CMS'e geçiş planlandığı için ikinci yol (tipli blok bileşenleri) uzun vadede daha sağlam.
