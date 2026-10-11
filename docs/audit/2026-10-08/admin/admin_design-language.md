# /admin/design-language

**Amaç:** Platform operatörüne/geliştiriciye admin, bayi ve müşteri panellerinin ortak "premium hero + kart" görsel gramerini özetleyen, repo içindeki `components/layout/DESIGN-LANGUAGE.md` dokümanına işaret eden ve ilgili iç sayfalara (erişilebilirlik, Core Web Vitals, e-posta ayarları) bağlantı veren **statik bir bilgi sayfası**.

**Genel puan: 4/10** · **Karar: birleştir** (`/admin/accessibility` ile tek bir "Tasarım sistemi ve kalite" merkezine birleştir; tasarım dili bölümünü metin özetinden **canlı stil rehberine + uyum (drift) panosuna** dönüştür)

Kapsam: `app/admin/design-language/page.tsx` (79 satır), `app/admin/design-language/layout.tsx` (10 satır), `app/admin/layout.tsx`, `components/admin/admin-premium-hero.tsx`, `components/layout/dashboard-page-hero.tsx`, `components/ui/card.tsx`, `lib/panel-surface.ts`, `lib/app-locale.tsx` (`useAppT`), `lib/admin-route-metadata.ts` → `lib/segment-layout-metadata.ts`, `messages/tr.json` + `messages/en.json` (`adminDesignLanguage.*`), `components/layout/DESIGN-LANGUAGE.md`, menü kayıtları (`components/dashboard/sidebar.tsx`, `app/admin/admin-utils.ts`, `lib/data/product-roadmap.json`), `proxy.ts`, bağlantı hedefleri (`app/admin/accessibility/page.tsx`, `app/admin/observability/page.tsx`, `app/admin/settings/settings-client.tsx`).

Sayfa **hiçbir API ucu çağırmıyor, hiçbir Prisma modeli kullanmıyor, state tutmuyor**: `page.tsx` içinde `fetch` / `useSWR` / server action / `useState` yok (`page.tsx:1-79`). Bu yüzden IDOR, N+1, yarış koşulu gibi veri katmanı riskleri bu sayfada **yok**; bulguların ağırlığı ürün değeri, doğruluk/tutarlılık ve mimaridedir.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Dört sabit metin kartı + bir dosya yolu + üç bağlantı; "Uygulama durumu" başlıklı kart gerçek bir durum göstermiyor, canlı örnek/token görünümü yok. |
| UX | 4/10 | Operatöre "tasarım dilimiz ne durumda, hangi ekranlar sapıyor?" sorusunun cevabını vermiyor; tasarım kuralını metinle anlatıp görsel örnek göstermiyor; e-posta ayarları bağlantısı konu dışı. |
| Görsel | 5/10 | Panel kabuğuyla tutarlı ve temiz; ancak sayfa kendi koyduğu kuralları çiğniyor (mor/cyan/amber şeritler, "eyebrow = panel bağlamı" kuralına aykırı eyebrow). |
| Mimari | 5/10 | Durumsuz içerik için gereksiz `'use client'`; kaynak doküman ile sayfa metni elle senkron tutulan iki ayrı kopya; `/admin/accessibility` ile neredeyse birebir iskelet; ölü i18n anahtarları. |
| Performans | 9/10 | Veri yok, ağ yok; tek maliyet hero'nun `next-themes` + `useReducedMotion` istemci hidrasyonu ve tüm sayfanın istemci paketine girmesi. |
| Erişilebilirlik + mobil | 6/10 | Global `:focus-visible`, `aria-hidden` ikonlar, mobilde tek sütun düzgün; fakat h1→h3 başlık atlaması, bağlantı grubunun başlıksız/landmark'sız olması, iç bağlantıda yanıltıcı "harici" ikonu ve koyu temada hero başlığının ilk karede okunmaz parlaması var. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Rota yetkisi (yalnız ADMIN rolü + gizli kapı cookie'si) | ÇALIŞIYOR | `proxy.ts:51`, `proxy.ts:79-84`, `proxy.ts:124` | Veri taşımadığı için IDOR yüzeyi yok. |
| 2 | Sayfa metadata'sı (TR/EN başlık + açıklama, `%s \| Admin` şablonu) | ÇALIŞIYOR | `app/admin/design-language/layout.tsx:4-6`, `app/admin/layout.tsx:11-20`, `messages/tr.json:155-156` | — |
| 3 | Admin kabuğu (sidebar, header, skip-link, Web Vitals raporlayıcı) | ÇALIŞIYOR | `app/admin/layout.tsx:2-6`, `:32` | Ortak layout'tan gelir. |
| 4 | Sidebar menü girişi "Tasarım dili" | KISMİ | `components/dashboard/sidebar.tsx:199`, `:201` | Bir alttaki "Menü grupları" ile **aynı ikon** (`LayoutTemplate`) — yan yana iki öğe görsel olarak ayırt edilemiyor. |
| 5 | Hızlı erişim girişi | KISMİ | `app/admin/admin-utils.ts:95` | Etiket sabit Türkçe (`'Tasarım dili'`), i18n'den geçmiyor; EN arayüzde TR kalır. |
| 6 | Ürün yol haritasında "shipped" kaydı | ÇALIŞIYOR | `lib/data/product-roadmap.json:134-140` | "Gönderildi" olarak işaretli; sayfanın gerçek değeri bu iddiayı zayıf karşılıyor. |
| 7 | Premium hero (eyebrow, h1, açıklama, ikon) | ÇALIŞIYOR | `page.tsx:23-29`, `components/admin/admin-premium-hero.tsx:150-272` | `tone="auto"`. |
| 8 | Hero azaltılmış hareket desteği (nefes animasyonu, ping noktası, `animate-in`) | ÇALIŞIYOR | `admin-premium-hero.tsx:35-43`, `:126`, `:207-214` | `useReducedMotion` korumalı. |
| 9 | Hero koyu tema ilk-kare render'ı | KISMİ | `admin-premium-hero.tsx:164-170`, `:231-233` | `mounted` olana kadar `showDarkPanel=false` → koyu temada başlık bir kare boyunca `from-slate-900 … bg-clip-text text-transparent` ile koyu zemin üstünde koyu render olur (paylaşılan bileşen sorunu, tüm sayfaları etkiler). |
| 10 | Eyebrow metni "Tasarım" | KISMİ | `page.tsx:24`, `messages/tr.json:2731`, `components/layout/DESIGN-LANGUAGE.md:8` | Doküman "eyebrow = panel bağlamı (Yönetim paneli…)" diyor; tasarım dili sayfası kendi kuralına uymuyor. |
| 11 | Blok kartı: "Üst bölüm (kahraman)" kuralı | ÇALIŞIYOR | `page.tsx:15`, `:32-42`, `messages/tr.json:2735-2738` | Yalnız metin; hero'nun neye benzediğini göstermiyor. |
| 12 | Blok kartı: "Kart ve yüzeyler" kuralı | ÇALIŞIYOR | `page.tsx:16`, `messages/tr.json:2739-2742` | Yalnız metin. |
| 13 | Blok kartı: "Kaçınılanlar" | ÇALIŞIYOR | `page.tsx:17`, `messages/tr.json:2743-2746` | Yalnız metin; "yanlış/doğru" görsel karşılaştırma yok. |
| 14 | Blok kartı: "Uygulama durumu" | SAHTE | `page.tsx:18`, `messages/tr.json:2747-2750` | Başlık durum vaat ediyor; içerik "zamanla taşınır" cümlesi. Gerçek bir uyum oranı, liste ya da tarih yok. |
| 15 | Kartların accent şerit renkleri (primary/cyan/violet/emerald/amber) | KISMİ | `page.tsx:14-19`, `:34`, `:46`, `lib/panel-surface.ts:7-13` | Renkler anlam taşımıyor ve sayfanın "yerel şeritler yerine primary vurgusu" kuralıyla (`messages/tr.json:2741`) ve dokümanın "mor → primary" taşımasıyla (`DESIGN-LANGUAGE.md:32`, `:35`) çelişiyor. |
| 16 | "Geliştirici notu" kartı + dosya yolu | KISMİ | `page.tsx:45-54`, `messages/tr.json:2752-2753` | `<code>` düz metin, tıklanamaz; üretimde dosya servis edilmiyor, operatör içeriği okuyamaz. Kopyala düğmesi / repo bağlantısı yok. |
| 17 | "Tarihçe DESIGN-LANGUAGE.md dosyasında" iddiası | KISMİ | `messages/tr.json:2749`, `components/layout/DESIGN-LANGUAGE.md:22-36` | Dokümanda tarihli bir tarihçe yok; "Son tur", "Bu tur" gibi zamansız maddeler var. |
| 18 | Bağlantı: Erişilebilirlik merkezi | ÇALIŞIYOR | `page.tsx:57-62` → `app/admin/accessibility/page.tsx` | Karşılıklı bağlantı mevcut (`accessibility/page.tsx:86`). |
| 19 | Bağlantı: Core Web Vitals (`/admin/observability#core-web-vitals`) | KISMİ | `page.tsx:63-69`, hedef çapa `app/admin/observability/page.tsx:218` | Çapa doğru; ancak iç bağlantıda `ExternalLink` ikonu (`page.tsx:68`) "yeni sitede açılır" izlenimi veriyor. |
| 20 | Bağlantı: E-posta ve gönderim (`/admin/settings?tab=auth`) | KISMİ | `page.tsx:70-75`, `app/admin/settings/settings-client.tsx:173`, `:280-287`, `:1514-1560` | Sekme parametresi okunuyor, hedef doğru; ama konu tasarım diliyle ilgisiz — bilgi mimarisini bulandırıyor. |
| 21 | Müşteri / bayi deneyim rehberi bağlantıları | EKSİK | `messages/tr.json` `adminDesignLanguage.linkCustomerExperienceGuide*`, `linkDealerExperienceGuide*`; repo genelinde kullanım yok (grep 0 sonuç) | Çevirisi yazılmış, ipucu metni bile var; bileşende render edilmiyor → ölü i18n anahtarı ya da kaybolmuş özellik. |
| 22 | TR/EN yerelleştirme | ÇALIŞIYOR | `page.tsx:12`, `messages/en.json:2730-2761` | Sayfa içi tüm metinler anahtarlı. |
| 23 | Duyarlı yerleşim (mobil tek sütun, `sm` iki sütun, sarmalanan bağlantılar) | ÇALIŞIYOR | `page.tsx:22`, `:31`, `:56` | `max-w-4xl` ile geniş ekranda dar bir sütun; içerik az olduğu için kabul edilebilir. |
| 24 | Başlık hiyerarşisi | KISMİ | hero `h1` (`admin-premium-hero.tsx:227`), `CardTitle` → `h3` (`components/ui/card.tsx:43-50`) | h2 yok, h1→h3 atlaması (WCAG 1.3.1 / iyi uygulama). |
| 25 | Bağlantı grubunun bölüm başlığı / `nav` landmark'ı | EKSİK | `page.tsx:56-76` | Üç bağlantı başlıksız bir `div`; ekran okuyucuda bağlamsız. |
| 26 | Klavye odağı | ÇALIŞIYOR | `app/globals.css:131` (`:focus-visible`) | Bağlantılarda özel odak stili yok ama global halka devrede. |
| 27 | Yükleniyor / hata durumu | ÇALIŞIYOR | `app/admin/loading.tsx`, `app/admin/error.tsx` | Veri olmadığı için yalnız segment düzeyinde anlamlı. |
| 28 | Canlı bileşen önizlemesi (hero tonları, kart varyantları, accent'ler) | EKSİK | `page.tsx` tamamı | Bir tasarım dili sayfasının asıl beklenen özelliği. |
| 29 | Tema token görüntüleyici (renk, radius, gölge, tipografi; açık/koyu) | EKSİK | `page.tsx` tamamı | Token'lar `globals.css`, `lib/brand-colors`, `lib/theme-presets`, `lib/chart-palette`'te dağınık (`DESIGN-LANGUAGE.md:36`). |
| 30 | Uyum / sapma (drift) ölçümü | EKSİK | `page.tsx` tamamı | Statik grep: `components/` altında 408 sabit hex, 41 mor/violet/pink sınıfı; `app/customer` 24, `app/admin` 15 (bkz. Bulgu 2). Sayfa bunu göstermiyor. |
| 31 | Kaynak tek-doğruluk (sayfa ↔ markdown senkronu) | KISMİ | `page.tsx:36-38` (i18n metni) vs `components/layout/DESIGN-LANGUAGE.md` | İki ayrı elle yazılmış kopya; biri güncellenince diğeri sessizce eskir. |
| 32 | Önerilen bileşen adıyla tutarlılık | KISMİ | `page.tsx:4` (`AdminPremiumHero`) vs `DESIGN-LANGUAGE.md:7` ve `components/layout/dashboard-page-hero.tsx:9-13` (`DashboardPageHero` takma adı) | Sayfa, kendi önerdiği nötr adı değil eski admin adını import ediyor. |

**Durum dağılımı:** ÇALIŞIYOR 14 · KISMİ 13 · BOZUK 0 · SAHTE 1 · EKSİK 4 (toplam 32)

---

## Bulgular

### 1. Sayfa bir "tasarım dili" sayfası değil, bir metin özeti — kuralları göstermiyor, ölçmüyor
- **Önem:** yüksek · **Kategori:** ürün / işlevsellik · **Efor:** L
- **Kanıt:** `page.tsx:14-43` (dört blok yalnız `CardTitle` + `CardDescription`), `page.tsx:45-54` (yalnız dosya yolu), `messages/tr.json:2747-2750` ("Uygulama durumu" kartı).
- **Sorun:** Tasarım dili sayfasının işi, ekibe "doğru olan bu, böyle görünür, şuradan kullan" demek ve sapmayı görünür kılmaktır. Bu sayfa hero'yu, kart yüzeyini veya "kaçınılanları" bir kez bile render etmiyor; okuyucu `DashboardPageHero`'nun `tone="dark"` ile nasıl göründüğünü görmek için başka bir sayfaya gitmek zorunda. "Uygulama durumu" kartı durum vaat edip hiçbir veri vermiyor (SAHTE). Yol haritasında "shipped" olarak işaretli (`lib/data/product-roadmap.json:134-140`), yani ekip bunu bitmiş sayıyor.
- **Profesyonel öneri:** Sayfayı **canlı stil rehberine** çevir (Storybook "Docs" sayfası / Linear'ın iç UI kit sayfası benzeri):
  1. **Bileşen vitrini:** `DashboardPageHero` için `tone` = `auto` / `dark` / `light` yan yana canlı örnek; `PREMIUM_PANEL_CARD_BASE` + her accent; `Card` `glass` / `gradient` / `hover` varyantları. Her örneğin altında kopyalanabilir JSX parçacığı (Clipboard API, "Kopyalandı" geri bildirimi).
  2. **Doğru / yanlış çiftleri:** "Kaçınılanlar" maddesini iki küçük önizlemeyle (ör. mor gradient CTA ✗ / `primary` vurgulu Card ✓) göster.
  3. **Yerinde tema anahtarı:** önizleme alanına sayfa temasından bağımsız açık/koyu geçişi (`data-theme` kapsamlı sarmalayıcı) — hero'nun iki tondaki davranışı tek bakışta görülsün.
  Veri gerekmez; tamamen bileşen tabanlı bir Server Component + küçük istemci adaları (kopyala, tema önizleme anahtarı).

### 2. Uyum/sapma ölçümü yok — "zamanla taşınır" iddiası doğrulanamaz
- **Önem:** yüksek · **Kategori:** ürün / gözlemlenebilirlik · **Efor:** L
- **Kanıt:** `messages/tr.json:2749` ("mevcut ekranlar zamanla aynı karta taşınır"); statik grep sonuçları (2026-10-08, `*.tsx`): `components/` 408 sabit `#rrggbb`, 41 `purple|violet|fuchsia|pink` Tailwind sınıfı; `app/customer` 2 hex / 24 mor-tonlu sınıf; `app/admin` 4 / 15 (`app/admin/observability/page.tsx`, `app/admin/gate-settings/page.tsx` dahil); `app/dealer` 0 / 3. `app/dealer` + `app/customer` altındaki 69 `page.tsx`'ten 39'u `PageHeader` / `DashboardPageHero` / `AdminPremiumHero` kullanıyor. (Sayılar kaba grep'tir; e-posta şablonları, 3B shader renkleri gibi meşru istisnaları ayıklamaz — "doğrulanmadı: hangi kısmı gerçek ihlal".)
- **Sorun:** Operatör hangi ekranın standarda uymadığını bilemiyor; tasarım borcu görünmez, dolayısıyla planlanamaz. Sayfa "uygulama durumu" diye bir başlık taşıyıp bu soruya cevap vermiyor.
- **Profesyonel öneri:** **Build-time üretilen bir "tasarım uyum raporu"** ekle:
  - `scripts/design-audit.ts` (CI'da veya `prebuild`'de çalışan, ts-morph / basit AST taraması) → her `app/**/page.tsx` için: ortak hero kullanıyor mu, sabit hex sayısı, token dışı renk sınıfı sayısı, `Card` yerine çıplak `div` kart deseni → `lib/data/design-audit.json` üret (DB'ye dokunmadan, `product-roadmap.json` deseniyle aynı).
  - Sayfada: genel uyum yüzdesi (KPI karosu), panel bazında (admin/bayi/müşteri) çubuk, en çok ihlal içeren 10 dosyalık tablo (dosya yolu, ihlal türü, sayı), "istisna" işaretleme (allowlist dosyası).
  - Kıyas: PostHog / Stripe iç araçlarındaki "lint debt" panoları; ESLint kuralı (`no-restricted-syntax` ile sabit hex) eklenirse rapor ve kural aynı listeyi paylaşır.

### 3. Sayfa kendi koyduğu kuralları çiğniyor
- **Önem:** orta · **Kategori:** görsel tutarlılık · **Efor:** S
- **Kanıt:** Kural: "yerel hex şeritler yerine primary vurgusu" (`messages/tr.json:2741`), "mor → primary" taşıması (`DESIGN-LANGUAGE.md:32`, `:35`), "Eyebrow: panel bağlamı (Yönetim paneli…)" (`DESIGN-LANGUAGE.md:8`). Uygulama: kartlarda `cyan`, `violet`, `emerald`, `amber` şeritleri (`page.tsx:15-18`, `:46`); eyebrow "Tasarım" (`page.tsx:24`, `messages/tr.json:2731`); import edilen ad `AdminPremiumHero` (`page.tsx:4`) — doküman `DashboardPageHero` diyor (`DESIGN-LANGUAGE.md:7`).
- **Sorun:** Tasarım dilinin vitrin sayfası, kuralın istisnası gibi görünüyor; okuyucu hangisinin doğru olduğunu ayırt edemez. Accent renklerinin hiçbir anlamı yok (durum, öncelik, kategori değil).
- **Profesyonel öneri:** Accent'e **anlam** ver ya da kaldır: `premiumPanelCardAccentClass` yalnız anlamsal kullanımda (ör. `emerald` = uyumlu, `amber` = taşınıyor, `primary` = kural) ve bunu sayfada lejantla açıkla. Eyebrow'u panel bağlamına çek ("Yönetim paneli · Tasarım"), import'u `DashboardPageHero`'ya geçir. Rehber sayfası referans uygulama olmalı.

### 4. İki elle senkron tutulan kaynak: i18n metni ve `DESIGN-LANGUAGE.md`
- **Önem:** orta · **Kategori:** mimari · **Efor:** M
- **Kanıt:** Sayfa metni `messages/tr.json:2730-2761` + `messages/en.json:2730-2761`; tam metin `components/layout/DESIGN-LANGUAGE.md:1-36`. Sayfadaki "Tarihçe DESIGN-LANGUAGE.md dosyasında" (`messages/tr.json:2749`) iddiası doğru değil — dokümanda tarihli tarihçe yok, "Son tur" / "Bu tur" gibi zamansız maddeler var (`DESIGN-LANGUAGE.md:33-34`). Doküman yalnız Türkçe; EN arayüzde "Full prose… live in-repo" yalnız TR bir dosyaya yönlendiriyor.
- **Sorun:** Üç kopya (TR json, EN json, md) birbirinden bağımsız eskir; operatör üretimde md'yi göremez (`page.tsx:52` düz `<code>`).
- **Profesyonel öneri:** Tek kaynak: kuralları yapılandırılmış veri olarak tut (`lib/design-language/rules.ts`: `{ id, title: {tr,en}, body: {tr,en}, doExample, dontExample, since: '2026-08-12' }`), sayfa ve md bundan beslensin (md'yi script üretebilir ya da md'yi sayfaya build-time'da `fs` ile okuyup render et — Server Component'te mümkün). "Uygulama durumu" maddelerini tarihli changelog kayıtlarına çevir (`{ date, scope, files[] }`), sayfada zaman çizelgesi olarak göster.

### 5. Ölü i18n anahtarları: müşteri / bayi deneyim rehberi bağlantıları
- **Önem:** orta · **Kategori:** ölü kod / eksik özellik · **Efor:** S
- **Kanıt:** `adminDesignLanguage.linkCustomerExperienceGuide`, `linkDealerExperienceGuide`, `linkCustomerExperienceGuideHint`, `linkDealerExperienceGuideHint` (`messages/tr.json` ve `messages/en.json`, `adminDesignLanguage` bloğu) — repo genelinde `*.ts(x)` içinde kullanım yok.
- **Sorun:** Ya bir özellik yarım kalmış (rol panellerinin deneyim rehberlerine bağlantı), ya da temizlenmemiş artık. Rol panellerinin aynı dili kullandığını göstermenin en doğal yolu tam da bu bağlantılardı.
- **Profesyonel öneri:** Karar ver: rehber sayfaları varsa, admin'in rol değiştirmeden **önizleme** yapabileceği bir "panel önizleme" bağlantısı (salt-okunur, örnek veriyle) ekle; yoksa anahtarları kaldır. Admin'in müşteri hesabıyla giriş yapmasını ima eden ipucu metni ("Müşteri hesabıyla giriş yapıldığında açılır") operatör için kullanışsız.

### 6. Gereksiz `'use client'` — durumsuz sayfa istemci paketine giriyor
- **Önem:** düşük · **Kategori:** mimari / performans · **Efor:** S
- **Kanıt:** `page.tsx:1`, yalnız `useAppT` için (`page.tsx:7`, `:12`); sunucu tarafı çeviri mevcut: `t(locale, key)` + `getServerLocale()` (`app/admin/layout.tsx:8-9`, `:12-13`).
- **Sorun:** Tamamen statik içerik istemcide hidrate ediliyor; `/admin/accessibility` ile aynı desen (o raporda da tespit edildi).
- **Profesyonel öneri:** Sayfayı Server Component yap; yalnız hero (zaten `'use client'`) ve gelecekteki etkileşimli adalar (kopyala, tema önizleme) istemcide kalsın.

### 7. Paylaşılan hero: koyu temada başlığın ilk karede okunmaz render'ı
- **Önem:** düşük (sayfa başına) / orta (sistem geneli) · **Kategori:** görsel hata · **Efor:** S
- **Kanıt:** `components/admin/admin-premium-hero.tsx:164-170` (`mounted` false iken `showDarkPanel` false), `:231-233` (açık mod sınıfı `from-slate-900 via-slate-800 to-primary bg-clip-text text-transparent`, `dark:` varyantı yok).
- **Sorun:** Koyu temalı kullanıcıda ilk hidrasyon karesinde h1 koyu zemin üstünde koyu gradient metin olarak çizilir, ardından beyaza atlar — 50 admin sayfasını etkileyen kısa bir parlama (tarayıcıda gözle doğrulanmadı; kod akışından çıkarım).
- **Profesyonel öneri:** JS'e bağlı `showDarkPanel` yerine yalnız CSS `dark:` varyantları kullan (`dark:bg-none dark:text-white`), `mounted` bekleme mantığını kaldır. Tasarım dili sayfası bu bileşenin referans uygulaması olduğu için düzeltme burada belgelenmeli.

### 8. Bilgi mimarisi: konu dışı bağlantı, başlıksız bağlantı grubu, yanıltıcı ikon
- **Önem:** düşük · **Kategori:** UX / erişilebilirlik · **Efor:** S
- **Kanıt:** E-posta ayarları bağlantısı `page.tsx:70-75` (hedef `settings-client.tsx:1514-1560`, SMTP/Resend env açıklaması — tasarımla ilgisiz); bağlantı grubu `page.tsx:56` başlıksız `div`; iç bağlantıda `ExternalLink` ikonu `page.tsx:68`; h1→h3 atlaması (`admin-premium-hero.tsx:227`, `card.tsx:43-50`); sidebar'da aynı ikon `sidebar.tsx:199`, `:201`.
- **Sorun:** Operatör sayfanın neden e-posta ayarına yönlendirdiğini anlayamaz (muhtemelen mail tasarımı kastedildi, ama hedef gönderim altyapısı). Ekran okuyucu kullanıcısı bağlantı grubunu bağlamsız duyar.
- **Profesyonel öneri:** Bağlantıları "İlgili kalite sayfaları" başlıklı `<nav aria-labelledby>` içine al; e-posta bağlantısını **e-posta şablon tasarımı** önizlemesine (ör. `/admin/intern-emails` şablon galerisi) çevir ya da kaldır; iç bağlantıda `ArrowRight` kullan; `CardTitle`'ı bölüm içinde `as="h2"` olacak şekilde parametrelendir; sidebar'da `Palette`/`Swatch` benzeri ayırt edici ikon seç.

---

## Eksik özellikler (kıyas ürünlerle)

- **Canlı bileşen galerisi + kopyalanabilir kod** (Storybook Docs, Linear iç UI kit, Stripe "Sail" belgeleri): her kabuk/kart varyantı render edilmiş örnek ve JSX parçacığıyla.
- **Tema token gezgini**: renk (HSL değeri, kontrast oranı AA/AAA rozeti), radius, gölge, tipografi ölçeği, `chart-palette`; açık/koyu yan yana; `theme-presets` ile admin tema kartları arasındaki ilişki (Retool / Radix Themes belgeleri).
- **Uyum (drift) panosu**: ekran başına standart uyum puanı, en çok ihlal içeren dosyalar, zaman içinde eğilim (PostHog'un "lint debt" iç panoları, Chromatic'in UI review'u).
- **Tarihli değişiklik günlüğü**: hangi tarihte hangi kural eklendi / hangi ekran taşındı; commit bağlantısıyla.
- **Doğru / yanlış örnek çiftleri** (Material, Atlassian Design System "Do / Don't" deseni).
- **Hareket (motion) ilkeleri bölümü**: `LazyMotion` + `m as Motion` kuralı, süre/easing token'ları, `prefers-reduced-motion` sözleşmesi, 3B (three.js) kullanım sınırları — projede bu kurallar fiilen var ama hiçbir yerde ürün içinde belgelenmiyor.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör/geliştirici bu sayfayı açtığında üç soruya 10 saniyede cevap alır: (1) *Doğru olan ne ve nasıl görünüyor?* (2) *Kodu nereden alırım?* (3) *Sistem ne kadar uyumlu, en büyük borç nerede?*

**Yerleşim (birleştirilmiş "Tasarım sistemi ve kalite" merkezi, `/admin/design-system`):**
1. **Hero** (`DashboardPageHero`, eyebrow "Yönetim paneli · Tasarım sistemi") + sağ `aside`'da üç KPI karosu: genel uyum %, token dışı renk sayısı, son kural güncellemesi tarihi.
2. **Sekmeler** (URL'e yazılan `?tab=` — `settings-client.tsx:280-298` deseniyle): `Bileşenler` · `Token'lar` · `Hareket` · `Erişilebilirlik` (mevcut `/admin/accessibility` içeriği buraya) · `Uyum raporu` · `Değişiklik günlüğü`.
3. **Bileşenler sekmesi:** sol dar liste (Hero, Kart, Accent, Boş durum, Yükleniyor), sağda canlı önizleme + "Doğru / Yanlış" çifti + kopyalanabilir kod; önizleme alanında yerel açık/koyu anahtarı.
4. **Uyum raporu sekmesi:** panel bazında yatay çubuk, sıralanabilir ihlal tablosu (dosya, tür, sayı, "istisna" rozeti), dosya yoluna tıklayınca editör bağlantısı (`vscode://file/...` yalnız geliştirme ortamında).

**Motion / 3B:** Ölçülü. Bu bir başvuru sayfası; 3B veya parçacık efekti **eklenmemeli** (doküman zaten parçacıkları kaldırmayı kural yapmış — `DESIGN-LANGUAGE.md:26`, `:28`). Yalnız: sekme geçişlerinde 150–200 ms opaklık/y-kaydırma (`m as Motion`, `MotionConfig reducedMotion="user"`), "Kopyalandı" geri bildiriminde küçük ölçek. Hareket bölümü, motion token'larını (süre, easing) canlı oynatılabilir mini örneklerle göstermeli ve azaltılmış hareket açıkken nasıl davrandığını aynı yerde göstermeli.

**Veri / API değişiklikleri:**
- DB veya API gerekmez. `scripts/design-audit.ts` → `lib/data/design-audit.json` (build-time, `product-roadmap.json` gibi statik içe aktarma). Build-time DB fail-safe kuralına zaten uyar, çünkü DB'ye hiç dokunmaz.
- `lib/design-language/rules.ts` tek kaynak; `DESIGN-LANGUAGE.md` bu kaynaktan üretilir veya sayfa md'yi Server Component'te `fs` ile okur.
- Sayfa Server Component; istemci adaları: `CopySnippetButton`, `ThemePreviewToggle`, sekme durumu.
- İsteğe bağlı: aynı tarama ESLint kuralı olarak CI'da çalışır, rapor ile kural aynı allowlist'i paylaşır.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/accessibility`** — Aynı iskelet (premium hero + accent'li 4 kart + bağlantı listesi), karşılıklı bağlantılı, ikisi de statik bilgi sayfası ve ikisi de yol haritasında aynı "Tasarım ve tutarlılık" grubunda (`lib/data/product-roadmap.json:130-148`). O sayfanın raporu da aynı birleştirmeyi öneriyor. **Öneri: tek "Tasarım sistemi ve kalite" merkezinde sekme olarak birleştir**, eski rotalardan `?tab=` ile yönlendir (`next.config` redirects).
- **`/admin/themes`** — Tema token'larının *düzenlendiği* yer (`app/admin/themes/page.tsx`, `applyRuntimeThemeToRoot`); tasarım dili ise kuralların *belgelendiği* yer. Birleştirme değil, **çapraz bağlantı**: Token sekmesinde "Düzenle → /admin/themes", tema sayfasında "Bu token'lar nerede kullanılıyor → Tasarım sistemi".
- **`/admin/settings?tab=appearance`** — Görünüm ayarları; tema sayfasıyla örtüşmesi ayrı bir denetim konusu, bu sayfayla doğrudan çakışmıyor.
- **`/admin/observability#core-web-vitals`** — Çakışma yok; yalnız bağlantı. Birleşik merkezde "Performans" kartı olarak CWV özetini (p75 LCP/INP/CLS) göstermek değer katar.
- Sidebar'da `design_language` ve `accessibility` iki ayrı giriş (`components/dashboard/sidebar.tsx:199`, `:204`) — birleşmeden sonra tek girişe inmeli; zaten kalabalık admin menüsünü bir öğe hafifletir.

---

## Uygulama (Dalga 2)

Rota `/admin/design-language` emekliye ayrıldı → `/admin/design-system` (varsayılan sekme "Yaşayan rehber"; kalıcı yönlendirme, sorgu korunur). Temel ajanın QDL v2 yaşayan rehberi (token/kontrast/motion/bileşen bölümleri) `components/admin/a-tasarim-sistemi/guide/*` altına taşındı ve birleşik merkezin ilk sekmesi oldu. Uyum raporu: `lib/design-system/drift-scan.ts` → `lib/data/design-drift.json` (üretici: `UPDATE_DESIGN_DRIFT=1 npx jest __tests__/admin/a-tasarim-sistemi/drift.test.ts`). Sayfa sunucu bileşeni; sekmeler `next/dynamic` ile tembel.

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum |
|---|---|---|
| 1 | Rota yetkisi | ÇALIŞIYOR — proxy + sayfada `requireAuth(['ADMIN'])`. |
| 2 | Metadata | ÇALIŞIYOR — "Tasarım Sistemi". |
| 3 | Admin kabuğu | ÇALIŞIYOR. |
| 4 | Sidebar girişi (aynı ikon) | ÇALIŞIYOR — registry'de tek giriş `admin.design-system` (Palette), eski üç rota `redirectFrom` (navigasyon ajanı). |
| 5 | Hızlı erişim etiketi | Sahiplik dışı (navigasyon). |
| 6 | Yol haritası "shipped" | ÇALIŞIYOR — iddia artık gerçek: canlı rehber + uyum raporu. |
| 7 | Premium hero | KALDIRILDI → ortak `PageHeader` (compact, ops). |
| 8 | Hero azaltılmış hareket | ÇALIŞIYOR — `PageHeader` sürekli animasyon içermez. |
| 9 | Hero koyu tema ilk kare | KALDIRILDI — `AdminPremiumHero` bu yüzeyde kullanılmıyor. |
| 10 | Eyebrow "Tasarım" | ÇALIŞIYOR — "Yönetim paneli · Tasarım". |
| 11–13 | Metin blok kartları | ÇALIŞIYOR (dönüştürüldü) — canlı token, tipografi, ölçek, motion, bileşen, durum örnekleri + Yap/Yapma tablosu. |
| 14 | "Uygulama durumu" (SAHTE) | ÇALIŞIYOR — gerçek uyum raporu: kurala uyan dosya %, sabit hex, ham palet, 12px altı metin; alan bazında çubuk, en çok ihlal içeren 25 dosya, ölçüm tarihi. |
| 15 | Anlamsız accent şeritleri | KALDIRILDI — ton yalnız anlamlı yerde (kontrast kartı başarı/tehlike). |
| 16 | Geliştirici notu + dosya yolu | ÇALIŞIYOR — "Kaynaklar" kartında yollar (token, Tailwind, katalog, motion, durumlar, tema modeli). |
| 17 | "Tarihçe md'de" iddiası | KALDIRILDI — yanlış iddia silindi. |
| 18 | Bağlantı: Erişilebilirlik | ÇALIŞIYOR — aynı sayfada sekme. |
| 19 | Bağlantı: CWV | ÇALIŞIYOR — `ArrowRight` (yanıltıcı harici ikon kaldırıldı). |
| 20 | Bağlantı: E-posta ayarları | KALDIRILDI — konu dışıydı. |
| 21 | Müşteri/bayi rehber bağlantıları (ölü anahtar) | KALDIRILDI — sayfa bu anahtarları kullanmıyor (`messages/*` sahibince temizlenebilir). |
| 22 | TR/EN | ÇALIŞIYOR (TR) — Dalga 2 ops düzeni. |
| 23 | Duyarlı yerleşim | ÇALIŞIYOR — `PanelPage`, tablolar kendi kabında kayar, ≥ 44px hedefler. |
| 24 | Başlık hiyerarşisi | ÇALIŞIYOR — tek h1, bölümler h2 (`SectionCard`), alt başlıklar h3. |
| 25 | Bağlantı grubu landmark | ÇALIŞIYOR — `<nav aria-label="İlgili kalite sayfaları">` + bölüm atlama `<nav>`. |
| 26 | Klavye odağı | ÇALIŞIYOR. |
| 27 | Yükleniyor/hata | ÇALIŞIYOR — `PanelErrorBoundary` + sekme iskeleti. |
| 28 | Canlı bileşen önizlemesi (EKSİK) | ÇALIŞIYOR — Button/Badge/Alert/Input/Switch/Progress, QueryState oynatıcı, EmptyState/ErrorState/StatTile/ConfirmAction (örnek veriler açıkça etiketli; `Math.random` kaldırıldı). |
| 29 | Token görüntüleyici (EKSİK) | ÇALIŞIYOR — belgeden canlı okunan renkler + kontrast oranları, radius/elevation/boşluk/z-index; "Açık/Koyu modda gör". |
| 30 | Uyum ölçümü (EKSİK) | ÇALIŞIYOR — bkz. 14. |
| 31 | Tek kaynak | ÇALIŞIYOR — örnekler koddaki katalogdan (`lib/design/tokens.ts`, `lib/motion`) çizilir. |
| 32 | Önerilen bileşen adı | ÇALIŞIYOR — `PageHeader`. |

### Kapanan bulgular
1 (canlı stil rehberi), 2 (uyum raporu), 3 (kendi kurallarına uyum), 4 (elle kopya kaynak → koddan çizim), 5 (ölü bağlantı anahtarları kullanılmıyor), 6 (sunucu bileşeni + tembel istemci adaları), 8 (bilgi mimarisi). **7/8.**

### Kalanlar
- Bulgu 7 (`AdminPremiumHero` ilk kare koyu metin): paylaşılan bileşen; bu yüzey artık kullanmıyor, sahibine bırakıldı.
- Tarihli kural değişiklik günlüğü yok (kaynak veri yok; uydurulmadı).
- Uyum raporu anlık görüntüdür; CI/prebuild üretimi ve ESLint kuralı eklenmedi (`scripts/*` yasağı).
