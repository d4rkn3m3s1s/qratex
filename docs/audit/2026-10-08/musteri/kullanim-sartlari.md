# /kullanim-sartlari

**Amaç:** Qratex'i kullanan herkesin (QR okutup geri bildirim veren tüketici, puan/XP/rozet/lig/oyun/ödül ekonomisine katılan müşteri ve işletme/bayi) bağlı olduğu hizmet sözleşmesini sunmak; kayıt ekranındaki "Kayıt olarak Kullanım Şartları'nı kabul etmiş olursunuz" beyanının dayandığı hukuki metin.

**Genel puan:** 3.8 / 10 · **Karar:** yeniden tasarla (sayfa iskeleti ve SEO altyapısı sağlam; içerik, sürümleme, onay kaydı ve bilgi mimarisi baştan kurulmalı)

> Kapsam notu: Sayfa tamamen statik bir Server Component. Hiçbir `fetch`/`useSWR`/server action yok; tek veri kaynağı `prisma.settings` (`key = 'seo'`) satırı, `lib/seo-settings.ts` üzerinden `unstable_cache` ile okunuyor. Bu yüzden "API uçları" bölümü boş. Denetim salt okunur yapıldı; hiçbir komut, build ya da DB sorgusu çalıştırılmadı.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Sayfa açılıyor ve linkleri çalışıyor, ama hukuki metin olarak işlevini yapmıyor: 4 genel paragraf var, platformun asıl ekonomisi (puan, ödül, oyun, klan escrow'u, fraud/shadow-ban) hiç geçmiyor, "Son güncelleme" tarihi sahte. |
| UX | 3/10 | Tek kart içinde `text-sm` gri metin; içindekiler, bölüm başlıkları, özet, sürüm geçmişi, "neler değişti" yok; EN kullanıcı TR metin görüyor; müşteri panelinden ulaşılamıyor. |
| Görsel | 4/10 | shadcn `Card` + muted metin temiz ama kimliksiz; hareketli landing arka planının üstünde okuma sayfası, başlık hiyerarşisi yok (sayfada `h1` yok). |
| Mimari | 5/10 | SEO override + JSON-LD + breadcrumb deseni iyi ve DB'ye düşmeye karşı korumalı; fakat 4 yasal sayfa birebir kopya, içerik koda gömülü, sürümleme/onay modeli yok. |
| Performans | 8/10 | Statik RSC, client JS yok (layout hariç); `unstable_cache` + `React.cache` ile istek başına tek Prisma çağrısı. Tek maliyet layout'taki hareketli arka plan. |
| Erişilebilirlik + mobil | 6/10 | Skip-link, breadcrumb `aria-current`, `prefers-reduced-motion` desteği var; ama `h1` eksik, linklerde focus halkası yok, uzun hukuki metin için `text-sm` küçük, mobilde gezinme yardımı yok. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | `<title>` / meta description (admin override + varsayılan) | ÇALIŞIYOR | `app/(public)/kullanim-sartlari/page.tsx:9-17`, `lib/seo-settings.ts:139-143` | Root template `%s \| QRateX` ile birleşiyor (`app/layout.tsx:51-53`). |
| 2 | Canonical URL | ÇALIŞIYOR | `page.tsx:16`, `lib/seo-settings.ts:145-147` | `canonicalBase` yoksa `siteUrl`. |
| 3 | OpenGraph / Twitter kartı | KISMİ | `app/layout.tsx:70-76`; sayfada `openGraph` yok | Sayfa kendi `openGraph`'unu tanımlamadığı için root'unkini devralıyor: paylaşımda başlık "QRateX - QR Tabanlı Geri Bildirim Platformu", `og:url` ana sayfa. |
| 4 | `WebPage` JSON-LD | ÇALIŞIYOR | `page.tsx:28`, `components/seo/webpage-json-ld.tsx:10-24` | `sanitizeSeoString` ile HTML temizleniyor. |
| 5 | `BreadcrumbList` JSON-LD | KISMİ | `page.tsx:29`, `components/seo/breadcrumb-json-ld.tsx:13`, `lib/site-config.ts:26-29` | Breadcrumb URL'leri `siteUrl` ile, canonical ise `canonicalBase` ile kuruluyor; admin `canonicalBase`'i farklı ayarlarsa iki farklı alan adı yayınlanır. |
| 6 | Görsel breadcrumb (Ana Sayfa › Kullanım Şartları) | ÇALIŞIYOR | `page.tsx:31`, `components/seo/breadcrumb-nav.tsx` | `aria-label`, `aria-current="page"` var. |
| 7 | Sayfa başlığı | KISMİ | `page.tsx:34`, `components/ui/card.tsx:44` (`CardTitle` = `h3`) | Sayfada `h1` yok. Ayrıca admin'den gelen `override.title` (`page.tsx:24`) görünen başlığa uygulanmıyor, sabit metin. |
| 8 | Paragraf 1: kabul beyanı ve hizmet tanımı | KISMİ | `page.tsx:37-40` | "Kullanarak kabul etmiş sayılırsınız" (browsewrap). Hizmet tanımı oyun, mağaza, bağış, klan, turnuva, sürpriz kutu gibi modülleri saymıyor. |
| 9 | Paragraf 2: kullanıcı ve işletme yükümlülükleri | KISMİ | `page.tsx:41-44` | İşletme (bayi) yükümlülüğü tek cümle; tüketici ve işletme şartları ayrılmamış. |
| 10 | Paragraf 3: garanti reddi ve hesap sonlandırma | KISMİ | `page.tsx:45-48` | Hangi ihlalde, hangi süreçle, itiraz yolu var mı, belirtilmiyor. |
| 11 | Gizlilik Politikası ve KVKK linkleri | ÇALIŞIYOR | `page.tsx:50-58`; hedefler `app/(public)/gizlilik-politikasi`, `app/(public)/kvkk-aydinlatma-metni` mevcut | Linkler sadece `underline`, focus stili yok. Çerez Politikası linki yok. |
| 12 | "Son güncelleme" tarihi | SAHTE | `page.tsx:60` (`new Date().toLocaleDateString('tr-TR')`) | Metnin değiştiği tarih değil, sayfanın üretildiği/yeniden üretildiği an. Aynı hata 4 yasal sayfada var (`cerez-politikasi/page.tsx:56`, `gizlilik-politikasi/page.tsx:56`, `kvkk-aydinlatma-metni/page.tsx:59`). |
| 13 | Public layout (header, footer, skip-link, çerez bandı) | ÇALIŞIYOR | `app/(public)/layout.tsx:8-33` | `main#main-content` + `tabIndex={-1}` doğru. |
| 14 | Hareketli arka plan + azaltılmış hareket desteği | ÇALIŞIYOR | `app/(public)/layout.tsx:18`, `components/landing/LandingBackground.tsx:34-53,79` | `prefers-reduced-motion` dinleniyor. Okuma sayfası için gereksiz görsel gürültü (bkz. bulgu 9). |
| 15 | Yükleniyor durumu | ÇALIŞIYOR | `app/(public)/loading.tsx` | Statik sayfada pratikte görünmez. |
| 16 | DB erişilemezken çökmeme (build-time fail-safe) | ÇALIŞIYOR | `lib/seo-settings.ts:88-115` (try/catch + `defaults`) | Proje kuralına uygun. |
| 17 | Footer'dan erişim | ÇALIŞIYOR | `components/layout/footer.tsx:28` | Footer etiketleri i18n'e bağlı değil (sabit TR). |
| 18 | Kayıt ekranından erişim + kabul beyanı | KISMİ | `app/(auth)/auth/register/page.tsx:428-444`, `messages/tr.json:2398-2402` | Link var ama kabul hiçbir yerde kaydedilmiyor (bkz. #19). |
| 19 | Onayın kaydı (kim, ne zaman, hangi sürüm) | EKSİK | `app/api/auth/register/route.ts:57-63` (yalnızca `name,email,password,role,emailVerified`); `prisma/schema.prisma`'da `termsAcceptedAt`/`termsVersion` benzeri alan yok | Uyuşmazlıkta "kullanıcı bu metni kabul etti" ispatlanamaz. |
| 20 | Google / magic-link ile kayıtta şartların gösterilmesi | EKSİK | `app/(auth)/auth/login/page.tsx:268` (`signIn('google', …)`); `app/(auth)/auth/complete` ve magic-link akışında "kullanım/terms/şart" geçmiyor (grep boş) | Bu yollarla açılan hesaplar şartları hiç görmüyor. |
| 21 | Sitemap kaydı | KISMİ | `app/sitemap.ts:36-40` | `lastModified: new Date()`; arama motoruna her taramada "değişti" sinyali. |
| 22 | Puan / XP / rozet / lig ekonomisi kuralları | EKSİK | Metinde yok; sistemde var (`app/customer/rewards`, `badges`, `leaderboard`, `shop`) | Puanın nakit olmadığı, devredilemeyeceği, değerinin/kurallarının değişebileceği yazmıyor. |
| 23 | Oyun, turnuva, klan savaşı (escrow) ve sürpriz kutu kuralları | EKSİK | Sistemde: `prisma/schema.prisma:450-458` (`rewardPool`, `rewardFunded`, `rewardRefunded`), `app/customer/games`, `squads`, `surprise-boxes` | Kullanıcının puanını riske ettiği akışlar sözleşmede tanımsız. |
| 24 | Fraud / shadow-ban açıklaması | EKSİK | `lib/fraud/engine.ts:16,53,93-96` ("Shadow banned users should think they succeeded") | Kullanıcıya puan kazandığı izlenimi verilip puan yazılmayan bir mekanizma sözleşmede hiç geçmiyor. |
| 25 | Hesap silme ve puanların/ödüllerin akıbeti | EKSİK | Sistemde: `app/customer/settings/page.tsx:479-482` → `/api/user/delete-account` | Silinince puan/rozet/kupon ne olur, yazmıyor. |
| 26 | Kullanıcı içeriği (geri bildirim, yorum, fotoğraf) lisansı ve AI işleme | EKSİK | Sistemde: `app/customer/ai-insights`, `feedbacks` | İçeriğin işletmeyle paylaşımı, AI ile analizi, anonimleştirme sözleşmede yok. |
| 27 | Yaş sınırı / reşit olmayanlar | EKSİK | Sistemde doğum tarihi tutuluyor: `prisma/schema.prisma:1903-1906` (`UserBirthday`) | Yaş şartı ve veli onayı belirtilmemiş. |
| 28 | Şirket kimliği, iletişim, uygulanacak hukuk, yetkili mahkeme | EKSİK | `page.tsx:37-59` | Ticari unvan, MERSİS, adres, e-posta, uyuşmazlık çözümü (Tüketici Hakem Heyeti) yok. |
| 29 | Sürüm geçmişi / "neler değişti" / değişiklik bildirimi | EKSİK | — | Değişikliklerin kullanıcıya bildirilip yeniden onay alınacağı süreç yok. |
| 30 | İçindekiler, bölüm anchor'ları, derin link | EKSİK | `page.tsx:36-61` (bölümsüz düz paragraflar) | Destek ekibi "madde 7'ye bakın" diyemez. |
| 31 | İngilizce sürüm | EKSİK | `messages/en.json:2398-2402` EN kayıt ekranı "Terms of Use" diyor; sayfa yalnızca TR; `app/layout.tsx:148` sabit `lang="tr"` | EN kullanıcı TR metne düşüyor. |
| 32 | Müşteri panelinden (ayarlar) erişim | EKSİK | `app/customer/**` ve `components/customer/**` içinde `/kullanim-sartlari` linki yok (grep) | Giriş yapmış müşteri yalnızca public footer'a giderek ulaşabilir. |
| 33 | Yazdırma / PDF indirme | EKSİK | — | Hukuki metinlerde beklenen bir davranış; yazdırma stilleri de yok. |

Özet sayım: ÇALIŞIYOR 11 · KISMİ 9 · BOZUK 0 · SAHTE 1 · EKSİK 12 (toplam 33).

---

## Bulgular

### 1. Kullanım şartlarına onay hiçbir yerde kaydedilmiyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / hukuki uyum · **Efor:** M
- **Kanıt:** `app/(auth)/auth/register/page.tsx:428-444` (yalnızca metin + link, checkbox yok); `app/api/auth/register/route.ts:57-63` (`user.create` yalnızca `name,email,password,role,emailVerified`); `prisma/schema.prisma`'da onay/sürüm alanı yok; Google akışı `app/(auth)/auth/login/page.tsx:268`, `app/(auth)/auth/complete` şartlardan hiç söz etmiyor.
- **Sorun:** Bir puan/ödül ekonomisi işletiyorsunuz; hesap kapatma, puan iptali, shadow-ban gibi kararların sözleşmesel dayanağı "kullanıcı bu sürümü bu tarihte kabul etti" kaydıdır. Şu an ne sürüm ne tarih ne kanal (form/Google/magic-link) tutuluyor. Google ve magic-link ile açılan hesaplar metni hiç görmüyor.
- **Öneri:** `LegalDocument` (slug, version, publishedAt, contentMd, changeSummary) ve `LegalAcceptance` (userId, documentSlug, version, acceptedAt, channel, ipHash, userAgent) modelleri. Kayıt formuna açık onay (kayıt düğmesine bağlı, ön işaretsiz checkbox veya "Kabul et ve devam et" düğmesi) ve `/auth/complete` adımına aynı onay ekranı. Oturum açan kullanıcının kabul ettiği sürüm < güncel sürüm ise müşteri kabuğunda (customer shell) engellemeyen ama kalıcı bir "Şartlar güncellendi, neler değişti" sayfası. Kabul kaydı yalnızca sunucuda, kayıt transaction'ı içinde yazılsın.

### 2. "Son güncelleme" tarihi sahte: her üretimde bugünün tarihi
- **Önem:** yüksek · **Kategori:** yanlış veri / güven · **Efor:** S
- **Kanıt:** `page.tsx:60` `new Date().toLocaleDateString('tr-TR')`; aynı desen `cerez-politikasi/page.tsx:56`, `gizlilik-politikasi/page.tsx:56`, `kvkk-aydinlatma-metni/page.tsx:59`; `app/sitemap.ts:36-40` `lastModified: new Date()`.
- **Sorun:** Hukuki metnin yürürlük tarihi, sayfanın sunucuda render edildiği an olarak gösteriliyor. Ayrıca sunucu UTC'de çalıştığı için gece yarısı civarı bir gün kayabilir. Uyuşmazlıkta "bu metin hangi tarihte yürürlükteydi" sorusu cevapsız; kullanıcı açısından da metin her gün değişiyormuş izlenimi yaratıyor. (Sayfanın build'de mi yoksa `unstable_cache` revalidate'i yüzünden periyodik mi yeniden üretildiği doğrulanmadı; iki durumda da tarih yanlış.)
- **Öneri:** Tarih ve sürüm numarası içerikle birlikte saklanan sabit veri olsun (`LegalDocument.publishedAt` veya MDX frontmatter `effectiveDate`/`version`). Sitemap `lastModified` aynı kaynaktan beslensin. 4 yasal sayfanın hepsine aynı düzeltme.

### 3. Sözleşme platformun asıl ekonomisini kapsamıyor
- **Önem:** yüksek · **Kategori:** içerik / hukuki risk · **Efor:** L (hukuk danışmanlığıyla)
- **Kanıt:** Metnin tamamı `page.tsx:37-59` arasındaki 4 paragraf. Sistemde var olup metinde olmayanlar: puan/ödül/mağaza (`app/customer/rewards`, `shop`), klan savaşı escrow'u (`prisma/schema.prisma:450-458`), oyunlar/turnuva (`app/customer/games`), sürpriz kutu (`app/customer/surprise-boxes`), bağış (`app/customer/donations`), referral (`app/customer/referral`), seri dondurma (`prisma/schema.prisma:1767-1768`).
- **Sorun:** Puan değişikliği, bitiş süresi, mağaza ürününün stoğu, klan savaşında yatırılan puanın kaybı, sürpriz kutunun rastgele içeriği, referral kötüye kullanımı gibi konularda kullanıcıyla çıkacak her anlaşmazlıkta dayanak yok. Sürpriz kutu gibi şansa dayalı mekanikler için ayrıca açıklık ("puanla alınır, para ile alınamaz, olasılıklar şunlardır") güven ve mevzuat açısından önemli.
- **Öneri:** Metni modüler bölümlere ayırın: 1) Taraflar ve tanımlar, 2) Hesap ve yaş, 3) Geri bildirim ve içerik lisansı, 4) Puan, XP, rozet, lig (puanın nakit karşılığı yok, devredilemez, düzenlenebilir), 5) Oyunlar, turnuvalar, klan savaşları ve escrow, 6) Ödüller, mağaza, sürpriz kutular (olasılık açıklaması), bağışlar, 7) Referral, 8) Hile ve kötüye kullanım, 9) İşletme (bayi) sorumlulukları, 10) Hesap kapatma ve verilerin/puanların akıbeti, 11) Sorumluluk sınırı, 12) Değişiklikler, 13) Uygulanacak hukuk ve iletişim. Ekonomi bölümündeki sayısal kuralları (ör. ödül eşikleri) koddaki sabitlerle aynı kaynaktan üretmeyi düşünün ki metin ile davranış ayrışmasın.

### 4. Shadow-ban mekanizması sözleşmede hiç açıklanmıyor
- **Önem:** yüksek · **Kategori:** güven / şeffaflık · **Efor:** S (metin) + M (ürün kararı)
- **Kanıt:** `lib/fraud/engine.ts:16` ("> 10 scans in 1 hour = SHADOW_BAN"), `:53`, `:93-96` ("Shadow banned users should think they succeeded, but the DB shouldn't apply points"); `prisma/schema.prisma:100` `fraudStatus`.
- **Sorun:** Kullanıcıya puan kazandığı gösterilip puan yazılmayan bir yaptırım var; metinde yalnızca "uyumsuz kullanımda hesap kısıtlanabilir" (`page.tsx:47`) ifadesi var. Sessiz yaptırımı bilmeyen meşru bir kullanıcı (ör. kalabalık bir etkinlikte arka arkaya okutan) yanlış pozitif yaşadığında itiraz yolu da yok.
- **Öneri:** "Hile ve kötüye kullanım" bölümünde otomatik tespitin varlığı, olası sonuçları (kazanımların askıya alınması/iptali, görünürlüğün kısıtlanması) ve itiraz kanalı yazılsın. Ürün tarafında itiraz için mevcut `DataSubjectRequest` kuyruğuna (`prisma/schema.prisma:2804-2817`) benzer bir "inceleme talebi" türü eklenebilir. Hangi yaptırımın sessiz kalacağı hukuk ve ürün ekibiyle birlikte kararlaştırılmalı.

### 5. Hesap silme, puan ve içerik akıbeti tanımsız
- **Önem:** orta · **Kategori:** içerik · **Efor:** S
- **Kanıt:** Silme akışı mevcut: `app/customer/settings/page.tsx:479-482` → `/api/user/delete-account`; metinde yok.
- **Sorun:** Kullanıcı silme düğmesine bastığında puanlarının, kuponlarının, rozetlerinin, klan hazinesine katkısının ve geri bildirimlerinin ne olacağını bilmiyor.
- **Öneri:** Bölüm 10'da açık kurallar; ayarlar sayfasındaki silme onay modalinde ilgili maddeye derin link (`/kullanim-sartlari#hesap-kapatma`).

### 6. Sayfada `h1` yok, görünen başlık admin override'ını yok sayıyor
- **Önem:** orta · **Kategori:** erişilebilirlik / SEO · **Efor:** S
- **Kanıt:** `page.tsx:34` `CardTitle` → `components/ui/card.tsx:44` `h3`; `page.tsx:24` `title` değişkeni hesaplanıyor ama görünen başlıkta kullanılmıyor.
- **Sorun:** Ekran okuyucu kullanıcısı başlıklar listesinde sayfa başlığı bulamıyor; SEO açısından da ana başlık sinyali zayıf. Admin başlığı değiştirirse `<title>` ve JSON-LD değişiyor, ekrandaki başlık değişmiyor.
- **Öneri:** Yasal sayfa şablonunda `h1` sayfa başlığı, bölümler `h2`. Başlık tek kaynaktan gelsin.

### 7. OpenGraph meta verisi ana sayfadan devralınıyor; breadcrumb ile canonical farklı taban URL kullanabiliyor
- **Önem:** düşük · **Kategori:** SEO · **Efor:** S
- **Kanıt:** `page.tsx:13-17` `openGraph` tanımlamıyor; root `app/layout.tsx:70-76` `url: base`, `title: seo.defaultTitle`. Breadcrumb: `components/seo/breadcrumb-json-ld.tsx:13` → `lib/site-config.ts:26-29` (`siteUrl`); canonical: `lib/seo-settings.ts:145-147` (`canonicalBase || siteUrl`).
- **Sorun:** Link WhatsApp/Slack'te paylaşıldığında önizleme ana sayfa gibi görünür. `canonicalBase` ayarlanırsa yapılandırılmış veride iki farklı alan adı olur.
- **Öneri:** Paylaşılan bir `buildLegalMetadata(slug)` yardımcısı `openGraph.title/url/type: 'article'` ve `modifiedTime` üretsin; `BreadcrumbJsonLd` bir `base` parametresi alsın.

### 8. İçerik koda gömülü; 4 yasal sayfa birebir kopya
- **Önem:** orta · **Kategori:** mimari · **Efor:** M
- **Kanıt:** `kullanim-sartlari/page.tsx`, `gizlilik-politikasi/page.tsx`, `cerez-politikasi/page.tsx`, `kvkk-aydinlatma-metni/page.tsx` aynı iskelet (63-66 satır), yalnızca slug ve paragraflar farklı.
- **Sorun:** Hukuk ekibi metni güncellemek için deploy gerekiyor; sürüm geçmişi git'te kalıyor, kullanıcıya gösterilemiyor; bir düzeltme (ör. sahte tarih) 4 yerde yapılmak zorunda.
- **Öneri:** Tek `app/(public)/(legal)/[slug]/page.tsx` + `components/legal/LegalDocument.tsx`. İçerik ya repoda sürümlü MDX (hukuk metni için daha denetlenebilir) ya da admin panelinden düzenlenebilen `LegalDocument` tablosu (yayınlanan sürüm değiştirilemez, yeni sürüm yeni satır). `generateStaticParams` + `revalidateTag('legal')`; DB helper'ları build-time fail-safe kuralına uygun try/catch ile.

### 9. Okuma deneyimi zayıf: küçük gri metin, içindekiler yok, hareketli arka plan
- **Önem:** orta · **Kategori:** UX / görsel · **Efor:** M
- **Kanıt:** `page.tsx:36` `text-sm leading-6 text-muted-foreground`; bölüm/anchor yok; `app/(public)/layout.tsx:18` tüm public sayfalarda `LandingBackground`.
- **Sorun:** Uzun hukuki metin için `text-sm` + muted kontrast yorucu; içerik büyüdüğünde (bulgu 3) gezinme imkânsızlaşır. Landing'in pazarlama arka planı okuma bağlamında dikkat dağıtıyor.
- **Öneri:** Okuma odaklı şablon: `max-w-prose`, `text-base`, tam kontrast gövde metni; masaüstünde sticky içindekiler, mobilde açılır "Bölümler" menüsü; her bölümün başında bir cümlelik sade dil özeti ("Kısacası: puanların nakit değeri yoktur"); yasal rotalarda arka planı statik/sakin varyanta düşürmek.

### 10. Müşteri panelinden ve İngilizce arayüzden erişim yok
- **Önem:** orta · **Kategori:** bilgi mimarisi / i18n · **Efor:** M
- **Kanıt:** `app/customer/**` ve `components/customer/**` içinde `/kullanim-sartlari` linki yok; `messages/en.json:2398-2402` EN kayıt ekranı "Terms of Use" diyor, sayfa yalnızca TR; `components/layout/footer.tsx:26-31` etiketleri sabit TR.
- **Sorun:** Giriş yapmış müşteri, ayarlardan ya da ödül/oyun ekranlarından ilgili kurala ulaşamıyor. EN arayüz kullanıcısı TR metne düşüyor.
- **Öneri:** Müşteri ayarlarına "Yasal" bölümü (şartlar, gizlilik, KVKK, kabul ettiğim sürüm ve tarih); ödül, mağaza, sürpriz kutu, klan savaşı ekranlarında bağlamsal "Kurallar" bağlantısı (ilgili anchor'a). EN çeviri hazırlanana kadar EN arayüzde "Bu metin yalnızca Türkçe olarak bağlayıcıdır" notu.

### 11. Linklerde focus göstergesi yok; Çerez Politikası linki eksik
- **Önem:** düşük · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:** `page.tsx:51,55` yalnızca `className="underline"`; breadcrumb ve kayıt sayfası linklerinde `focus-visible:ring-2` var (`breadcrumb-nav.tsx:25`, `register/page.tsx:431`).
- **Öneri:** Yasal şablonda ortak link stili; ilgili belgeler kutusu (Gizlilik, KVKK, Çerez).

### 12. Şirket kimliği, iletişim ve uyuşmazlık çözümü yok
- **Önem:** orta · **Kategori:** içerik / hukuki uyum · **Efor:** S
- **Kanıt:** `page.tsx:37-59`.
- **Sorun:** Tüketici ilişkisi kuran bir platformda hizmet sağlayıcının kimliği, iletişim adresi ve başvuru yolları (Tüketici Hakem Heyeti, yetkili mahkeme) beklenir.
- **Öneri:** Sabit "Biz kimiz / bize ulaşın" bloğu; içerik hukuk danışmanıyla netleştirilmeli (kesin yükümlülükler bu denetimin kapsamı dışında, doğrulanmadı).

---

## Eksik özellikler (kıyas ürünlerle)

- **Sürümlü şartlar + "neler değişti" ekranı ve yeniden onay** (Revolut, Monzo, Spotify): güncellemede kısa değişiklik özeti, uygulama içinde bir kerelik bildirim, kabul kaydı.
- **Sade dil özeti / iki katmanlı metin** (Monzo "plain English" yaklaşımı): her bölümün üstünde tek cümlelik özet, altında bağlayıcı metin.
- **Ayrı ve detaylı ödül programı şartları** (Starbucks Rewards Terms): puanın nasıl kazanıldığı, ne zaman düştüğü, ödül kademeleri, programın değiştirilmesi.
- **Oyun ve şans mekaniği açıklaması** (Duolingo'nun gem/lig kuralları, mobil oyunlarda kutu olasılıkları): lig düşme/yükselme, sürpriz kutu olasılıkları, turnuva ödülü kuralları.
- **Bağlamsal derin linkler**: ürün ekranından ilgili maddeye (`#oduller`, `#klan-savaslari`) gitme.
- **Hesap içinden "kabul ettiğim belgeler" geçmişi ve PDF/yazdırma.**

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Kullanıcı şartları bir "engel" olarak değil, oyunun kural kitabı olarak okuyabilmeli. 30 saniyede "puanlarım güvende mi, neyi yaparsam kaybederim" sorusunun cevabını alabilmeli; hukuk ekibi ise deploy beklemeden yeni sürüm yayınlayıp kimin hangi sürümü kabul ettiğini ispatlayabilmeli.

**Yerleşim:**
1. **Üst şerit:** `h1` başlık, sürüm rozeti (`v3 · 1 Ekim 2026'dan itibaren geçerli`), "Önceki sürümler" ve "Neler değişti" bağlantıları, giriş yapmış kullanıcı için "Bu sürümü 2 Ekim'de kabul ettiniz" satırı.
2. **"Kısaca" kartı (5-6 madde):** puanın nakit karşılığı yok; hile tespitinde kazanımlar askıya alınabilir; geri bildiriminiz işletmeyle paylaşılır ve AI ile analiz edilir; hesabı silince puanlar silinir; vb. Her madde ilgili bölüme anchor.
3. **İki sütun (masaüstü):** solda sticky içindekiler (scroll-spy ile aktif bölüm), sağda `max-w-prose` gövde. **Mobil:** üstte yapışkan "Bölümler" açılır menüsü, metin tek sütun, `text-base`.
4. **Bölüm sonu:** ilgili belgeler (Gizlilik, KVKK, Çerez), iletişim kutusu, PDF/yazdır.

**Motion/3D:** Yerinde ve ölçülü olmalı. 3D veya parçacık efekti burada yanlış olur. Yeterli olanlar: scroll-spy'da aktif bölüm göstergesinin `layoutId` ile kayması (framer-motion `m`), anchor'a gidildiğinde hedef başlığın kısa bir vurgu animasyonu, "Neler değişti" ekranında eklenen/değişen satırların diff vurgusu. Hepsi `useReducedMotion` ile kapatılabilir olmalı. Yasal rotalarda `LandingBackground` statik varyanta düşürülmeli.

**Veri/API değişiklikleri:**
- Prisma: `LegalDocument { id, slug, locale, version, effectiveAt, contentMd, changeSummary, publishedAt, publishedById }` (yayınlanmış satır salt okunur) ve `LegalAcceptance { id, userId, slug, version, acceptedAt, channel, ipHash, userAgent }`, `@@unique([userId, slug, version])`.
- `lib/legal.ts`: `getCurrentLegalDoc(slug, locale)` (`unstable_cache`, tag `legal`, try/catch + gömülü varsayılan metin, build-time fail-safe kuralı).
- `POST /api/legal/accept` (oturum zorunlu, sürüm sunucuda doğrulanır, idempotent) ve kayıt route'unda kayıtla aynı transaction'da kabul yazımı; `/auth/complete` adımında aynı onay.
- Müşteri kabuğunda `needsReacceptance` bayrağı (oturum yüklenirken tek sorgu, Redis cache).
- Admin: yeni sürüm yayınlama ekranı (önizleme + diff + "yeniden onay gerektirir" anahtarı); `revalidateTag('legal')`.

---

## Çakışmalar / birleştirme önerisi

- **`/gizlilik-politikasi`, `/cerez-politikasi`, `/kvkk-aydinlatma-metni`:** Amaçları farklı (ayrı kalmalı, KVKK aydınlatma metni ayrı belge olmalı) ama uygulama birebir kopya. Tek `LegalDocument` şablonu ve tek dinamik rota altında birleştirilmeli; sahte tarih, `h1` eksikliği, OG devralma gibi hatalar tek yerde düzelsin.
- **`/guven`:** Zaten yasal sayfalara link listesi içeriyor (`app/(public)/guven/page.tsx:85-103`). Yasal belgeler için hub görevi görebilir; ayrı bir `/yasal` sayfası açmak yerine `/guven` bu rolü üstlenebilir.
- **Ödül/oyun ekranlarındaki kurallar:** Ödül, mağaza, sürpriz kutu, klan savaşı ekranlarında kural metinleri varsa (bu denetimde tek tek doğrulanmadı) şartlardaki ilgili bölümle tek kaynaktan beslenmeli; aksi hâlde ekranda yazan kural ile sözleşmedeki kural birbirinden ayrışır.
- **Kaldırma:** Önerilmez. Kayıt ekranındaki kabul beyanının hukuki dayanağı bu sayfa.

---

## Doğrulama (şüpheci inceleme)

### 1. "Şartlara onay kaydı tutulmuyor; Google/magic-link kayıtları şartları hiç görmüyor" — **Karar: doğrulandı (kısmen düzeltilerek; magic-link kısmı çürütüldü)**

- **Onay kaydı yok (doğru):** `app/api/auth/register/route.ts:57-63` `prisma.user.create` yalnız `name/email/password/role/emailVerified` yazıyor. `prisma/schema.prisma` `model User` içinde `terms*`, `consent*`, `accepted*` alanı yok; depoda `termsAccept|acceptTerms|consentAt|privacyAccepted` araması sıfır sonuç veriyor. Kayıt formunda onay kutusu da yok; yalnız pasif beyan metni var (`app/(auth)/auth/register/page.tsx:428-444`, `messages/tr.json:2398` "Kayıt olarak ...").
- **Google kısmı (doğru, ama yalnız giriş sayfasından):** `/auth/register` sayfasındaki Google butonu (`register/page.tsx:256-283`) beyan metniyle aynı kartta, yani orada kullanıcı en azından beyanı görüyor. Ancak `/auth/login` sayfasındaki Google butonu (`app/(auth)/auth/login/page.tsx:265-269`) yeni hesap da açabiliyor: `lib/auth.ts:42-46` GoogleProvider + `PrismaAdapter`, `lib/auth.ts:303-307` OAuth girişini koşulsuz kabul ediyor, `lib/auth.ts:316` `events.createUser` yalnız `emailVerified` set ediyor. Login sayfasında ve `/auth/complete` adımında şartlara hiçbir bağlantı/beyan yok (grep ile doğrulandı).
- **Magic-link kısmı (yanlış):** `app/api/auth/magic-link/route.ts:67-72` yalnız mevcut ve `emailVerified` dolu kullanıcıya bağlantı gönderiyor; yeni hesap açmıyor. Magic-link bir kayıt yolu değil.
- **Yeniden üretim:** Daha önce kaydı olmayan biri `/auth/login` → "Google ile giriş" → hesap oluşur → `/auth/complete` şifre adımı → `/customer`. Kullanıcı şartları hiç görmedi; DB'de hangi sürümü ne zaman kabul ettiğine dair satır yok. Daha sonra puan iptali/hesap kısıtlaması uygulandığında platform kabulü ispatlayamaz.
- **Önem notu:** Çalışma zamanı hatası değil, uyum/sözleşme açığı; "kritik" yerine **yüksek-orta** seviyesinde ele alınmalı. Çözüm raporun "Veri/API değişiklikleri" bölümündeki `LegalAcceptance` modeliyle örtüşüyor: kayıt route'unda transaction içinde kabul yazımı, OAuth ile yeni açılan hesaplar için `/auth/complete` adımında zorunlu onay (yeni hesap tespiti `events.createUser` ile işaretlenip complete adımında kontrol edilebilir), login sayfasındaki OAuth butonlarının altına aynı beyan.

### 2. "Yasal metnin 'Son güncelleme' tarihi render anındaki tarih (sahte)" — **Karar: doğrulandı**

- `app/(public)/kullanim-sartlari/page.tsx:60` `new Date().toLocaleDateString('tr-TR')`; birebir aynısı `cerez-politikasi/page.tsx:56`, `gizlilik-politikasi/page.tsx:56`, `kvkk-aydinlatma-metni/page.tsx:59`. Sayfa `getSeoSettings` üzerinden `unstable_cache` (`lib/seo-settings.ts:118`, revalidate 60) kullanıyor; sayfa statik/ISR üretilirse tarih build/yeniden doğrulama anı, dinamikse istek anı olur. Her iki durumda da gösterilen tarih metnin gerçek değişiklik tarihiyle ilgisiz: git geçmişine göre metin en son 2026-07-22'de (`dd9eb6c`) değişti, sayfa ise bugünün tarihini gösteriyor.
- **Yeniden üretim:** `/kullanim-sartlari` sayfasını farklı günlerde açın; metin değişmediği hâlde "Son güncelleme" her gün (veya her yeniden doğrulamada) ileri kayar. Ekran görüntüsüyle "metin X tarihinde şuydu" iddiası çürütülemez/ispatlanamaz hâle gelir.
- `app/sitemap.ts:36-40` `lastModified: new Date()` ikincil: SEO açısından arama motorlarına sürekli "değişti" sinyali veriyor, hukuki etkisi yok; aynı kaynaktan (`effectiveAt`) beslenmeli.
- **Önem notu:** Gerçek ve kullanıcıyı yanıltan bir hata; ancak tek başına veri kaybı/güvenlik açığı değil, **orta** seviye. Düzeltme sabit bir `effectiveAt` değerinin (kısa vadede kodda tek bir `const`, uzun vadede `LegalDocument.effectiveAt`) dört yasal sayfada ve sitemap'te ortak kullanılması.

---

## Uygulama (Dalga 2)

**Yüzey:** `p-blog-yasal` · **Tarih:** 2026-10-10 · URL korundu (`app/(okuma)/kullanim-sartlari`). Metin baştan yazıldı (sürüm 2.0) ve ortak `LegalDocument` kabuğunda: 12 numaralı bölüm, kalıcı çapalar (`#puanlar`, `#oyunlar`, `#oduller`, `#hile`, `#hesap-kapatma` …), "Kısaca" özeti, değişiklik geçmişi. **Sayısal kurallar koddan okunur**: puan tavanları `ECONOMY_CAPS` (`lib/economy/caps.ts`), turnuva ödülleri `TOURNAMENT_PRIZES`, en az oyuncu `TOURNAMENT_MIN_PARTICIPANTS` — ekranda yazan kural = uygulanan kural. Test: `__tests__/lib/legal-documents.test.ts`.

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Nasıl |
|---|---|---|---|
| 1 | Başlık/açıklama | ÇALIŞIYOR | |
| 2 | Canonical | ÇALIŞIYOR | |
| 3 | OG / Twitter | ÇALIŞIYOR | kendi url/başlık/açıklama (ana sayfa mirası yok) |
| 4 | WebPage LD | ÇALIŞIYOR | sürüm + tarihler |
| 5 | Breadcrumb LD | ÇALIŞIYOR | canonical tabanla |
| 6 | Görsel breadcrumb | ÇALIŞIYOR | |
| 7 | Sayfa başlığı | ÇALIŞIYOR | `h1`, ezme yansır |
| 8 | Kabul + hizmet tanımı | ÇALIŞIYOR | taraflar, tanımlar, modüller |
| 9 | Yükümlülükler | ÇALIŞIYOR | hesap ve işletme ayrı bölümler |
| 10 | Garanti / sonlandırma | ÇALIŞIYOR | süreç + itiraz yolu |
| 11 | Gizlilik/KVKK bağlantıları | ÇALIŞIYOR | odak halkalı `LegalLink`; Çerez Politikası ilgili belgelerde |
| 12 | Son güncelleme | ÇALIŞIYOR | sürüm + yürürlük + geçmiş |
| 13 | Layout | ÇALIŞIYOR | sakin okuma kabuğu |
| 14 | Hareketli arka plan | KALDIRILDI (okuma yüzeyinde) | |
| 15 | Yükleniyor | ÇALIŞIYOR | |
| 16 | DB fail-safe | ÇALIŞIYOR | |
| 17 | Footer | ÇALIŞIYOR | |
| 18 | Kayıt ekranından kabul | KISMİ (başka yüzey) | bağlantı var; kabul kaydı yok → ŞEMA İSTEĞİ + auth yüzeyi |
| 19 | Onay kaydı | KALAN | ŞEMA İSTEĞİ `LegalAcceptance` |
| 20 | Google ile kayıtta şartlar | KALAN (başka yüzey) | auth yüzeyi (`/auth/complete` onay adımı) |
| 21 | Sitemap | ÇALIŞIYOR | yürürlük tarihi |
| 22 | Puan/XP/rozet/lig kuralları | ÇALIŞIYOR | nakit değeri yok, devredilemez, defter, tavan tablosu (koddan), gün sınırı açıklaması |
| 23 | Oyun/turnuva/klan/kutu | ÇALIŞIYOR | turnuva ödülleri + en az oyuncu (koddan), klan emanet/iade/paylaşım, kutu ücretsiz ve günlük |
| 24 | Hile / sessiz yaptırım | ÇALIŞIYOR | "kazanım bildirimsiz geçersiz sayılabilir" açıkça + itiraz (KVKK m.11/1-g, insan incelemesi) |
| 25 | Hesap silme akıbeti | ÇALIŞIYOR | anonimleştirme, yorum metni, puan/ödül kaybı, abonelik engeli |
| 26 | İçerik lisansı + AI | ÇALIŞIYOR | |
| 27 | Yaş sınırı | KALAN | kodda yaş kapısı yok; sınır hukuki karar — metne uydurulmadı |
| 28 | Kimlik, hukuk, mahkeme | KISMİ | Türk hukuku + Tüketici Hakem Heyeti/Mahkemesi + iletişim; ticari unvan/MERSİS bilinmiyor |
| 29 | Sürüm geçmişi | ÇALIŞIYOR | yeniden onay → ŞEMA İSTEĞİ |
| 30 | İçindekiler / çapalar | ÇALIŞIYOR | numaralı bölümler ("madde 7") + derin bağlantı |
| 31 | İngilizce | ÇALIŞIYOR (kısmi kapsam) | TR-only, "bağlayıcı olan Türkçe" notu |
| 32 | Panelden erişim | KALAN (başka yüzey) | ayarlar/oyun ekranları bu sayfanın çapalarına bağlanabilir |
| 33 | Yazdır / PDF | ÇALIŞIYOR | |

### Kapanan bulgular
2 (tarih), 3 (ekonomi kapsamı, sayılar koddan), 4 (sessiz yaptırımın açıklanması + itiraz), 5 (hesap silme akıbeti), 6 (h1), 7 (OG + breadcrumb tabanı), 8 (ortak kabuk), 9 (okuma deneyimi), 11 (odak + Çerez bağlantısı). Kısmen: 10 (TR-only notu; panel bağlantıları başka yüzey), 12 (hukuk/iletişim var, ticari kimlik yok).

### Kalanlar
- **Bulgu 1 / ŞEMA İSTEĞİ:** `LegalAcceptance { id, userId, slug, version, acceptedAt, channel, ipHash, userAgent; @@unique([userId, slug, version]) }`; kayıt route'unda transaction içinde yazım ve OAuth için `/auth/complete` onayı auth yüzeyinin işi.
- Yaş sınırı, ticari unvan/MERSİS/adres: şirket/hukuk kararı gerekiyor.
- Not: ekonomi gün sınırı UTC'dir (`lib/economy/caps.ts`); §4.4 "zaman Europe/Istanbul" ilkesiyle ayrışıyor — metin gerçeği yazıyor, değişirse sabitten okunduğu için tablo kendiliğinden güncellenir (gün sınırı cümlesi elle güncellenmeli).
