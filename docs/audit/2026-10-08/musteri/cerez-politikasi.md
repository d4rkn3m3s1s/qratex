# /cerez-politikasi

**Amaç:** Ziyaretçiye ve son kullanıcıya platformda hangi çerezlerin/yerel depolama öğelerinin hangi amaçla kullanıldığını açıklamak, tercihlerini nasıl yöneteceğini göstermek (KVKK + Kişisel Verileri Koruma Kurulu'nun 2022 Çerez Rehberi + GDPR/ePrivacy açık rıza gereği).

**Genel puan: 3.5 / 10** · **Karar: yeniden inşa** (sayfa metni gerçek davranışla çelişiyor; arkasında çalışan bir rıza mekanizması yok. Görsel kabuğu korunabilir, ama içerik ve rıza altyapısının sıfırdan kurulması gerekiyor.)

> Kapsam: `app/(public)/cerez-politikasi/page.tsx`, `app/(public)/layout.tsx`, `components/layout/cookie-consent-banner.tsx`, `components/seo/*`, `lib/seo-settings.ts`, `components/analytics/posthog-provider.tsx`, `app/layout.tsx`, `components/landing/LandingBackground.tsx`, `app/api/settings/background/route.ts`, `app/sitemap.ts`, `messages/{tr,en}.json`. Kod değiştirilmedi, DB'ye dokunulmadı, uygulama çalıştırılmadı (bulgular statik okumaya dayanıyor).

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 2/10 | Sayfanın verdiği üç temel söz ("analitik tercihe bağlı", "tercihinizi bildirimden güncelleyin", "son güncelleme tarihi") kodda karşılığı olmayan ya da yanlış ifadeler. |
| UX | 4/10 | Tek kartta 5 kısa paragraf var; çerez tablosu, tercih merkezi, içindekiler ve iletişim kanalı yok. Kullanıcı okuduktan sonra yapabileceği hiçbir şey yok. |
| Görsel | 4/10 | Diğer hukuki sayfalarla aynı jenerik shadcn `Card` şablonu; marka kimliği yok, tipografik hiyerarşi zayıf (tek başlık h3, gövde `text-sm muted`). |
| Mimari | 4/10 | Rıza durumu `localStorage`'a yazılıyor ama hiçbir yerde okunmuyor. Hukuki sayfalar kopyala-yapıştır; metin TSX içine gömülü, sürümlenmemiş. |
| Performans | 7/10 | Sayfanın kendisi hafif bir RSC (önbellekli tek Settings okuması). Layout'taki arka plan efekti ise her görüntülemede önbelleksiz bir ek API + DB çağrısı yapıyor. |
| Erişilebilirlik + Mobil | 5/10 | Skip-link ve breadcrumb doğru. Sayfada `h1` yok (başlık `h3`), metin küçük ve düşük kontrastlı; mobilde düzen bozulmuyor ama okuma deneyimi zayıf. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | `generateMetadata`: başlık/açıklama (admin SEO override destekli) | ÇALIŞIYOR | `page.tsx:8-17`, `lib/seo-settings.ts:139-143` | Override yoksa sabit TR metin. |
| 2 | Canonical URL | ÇALIŞIYOR | `page.tsx:15`, `lib/seo-settings.ts:145-147` | `canonicalBase || siteUrl`. |
| 3 | WebPage JSON-LD | ÇALIŞIYOR | `page.tsx:27`, `components/seo/webpage-json-ld.tsx:12-26` | `sanitizeSeoString` ile etiketler temizleniyor. |
| 4 | Breadcrumb JSON-LD | KISMİ | `page.tsx:28`, `components/seo/breadcrumb-json-ld.tsx:10-16`, `lib/site-config.ts:26-29` | URL, admin'deki `canonicalBase` yerine env `siteUrl` ile kuruluyor; ikisi farklıysa canonical ile çelişiyor. |
| 5 | Görsel breadcrumb (Ana Sayfa > Çerez Politikası) | ÇALIŞIYOR | `page.tsx:30`, `components/seo/breadcrumb-nav.tsx:10-34` | `aria-current="page"` ve focus ring doğru. |
| 6 | Sayfa başlığı | KISMİ | `page.tsx:33`, `components/ui/card.tsx:44` | `CardTitle` bir `h3`; sayfada `h1` yok. Admin override başlığı metadata'ya yansıyor ama görünen başlığa ve breadcrumb'a yansımıyor (sabit metin). |
| 7 | Giriş paragrafı | ÇALIŞIYOR | `page.tsx:36-39` | Genel ve kısa. |
| 8 | "Zorunlu çerezler" açıklaması | KISMİ | `page.tsx:40-43` | Çerez adı, sağlayıcı ve süre yok. Gerçekte `next-auth` oturum çerezleri, `admin_gate` (`app/api/admin/gate/route.ts:68`), `qratex-locale` (`lib/locale-shared.ts:11`) kullanılıyor ve hiçbiri listelenmiyor. |
| 9 | "Analitik çerezler … Tercihe bağlıdır" | SAHTE | `page.tsx:44-47` ↔ `app/layout.tsx:168-170`, `components/analytics/posthog-provider.tsx:12-29,48-51` | PostHog (autocapture + session replay) rızaya bakılmadan, ilk render'da başlıyor. Rızayı okuyan bir kod yok. |
| 10 | "Pazarlama çerezleri" | SAHTE | `page.tsx:48-51` | Kodda pazarlama/reklam pikseli yok (gtag/fbq/clarity araması boş döndü). Var olmayan bir kategori anlatılıyor; gerçekte kullanılan PostHog ise anılmıyor. |
| 11 | "Tercihlerinizi çerez bildirimi üzerinden güncelleyebilirsiniz" | BOZUK | `page.tsx:53-54`, `cookie-consent-banner.tsx:18-21,41` | Bir kez seçim yapılınca banner bir daha görünmüyor. Yeniden açacak bir buton, link ya da footer girişi yok. |
| 12 | "Zorunlu çerezlerin devre dışı bırakılması …" uyarısı | KISMİ | `page.tsx:53-55` | Zorunlu çerezleri kapatacak bir arayüz yok (olması da gerekmez). Cümle yanıltıcı; "tarayıcı ayarlarından" diye yönlendirilmeli. |
| 13 | "Son güncelleme" tarihi | SAHTE | `page.tsx:56` | `new Date()`, yani render/ISR anının tarihi. Metin değişmese de tarih sürekli "bugün" görünüyor. Hukuki belgede yanıltıcı. |
| 14 | Çerez onay banner'ı (layout) | KISMİ | `app/(public)/layout.tsx:31`, `cookie-consent-banner.tsx:14-104` | Görünüyor ve seçimi kaydediyor, ama kaydı okuyan tek tüketici PWA install banner'ı (`components/pwa/install-banner.tsx:52`). |
| 15 | Banner: "Opsiyonelleri Reddet" | SAHTE | `cookie-consent-banner.tsx:31-39` | `optionalRejected: true` yazılıyor ama hiçbir yerde okunmuyor (repo genelinde tek eşleşme yazıldığı satır). Analitik çalışmaya devam ediyor. |
| 16 | Banner: "Tümünü Kabul Et" | KISMİ | `cookie-consent-banner.tsx:23-29` | Kayıt yazılıyor ve PWA olayı tetikleniyor. Kabul, analitiği başlatan bir şeye bağlı değil, çünkü analitik zaten çalışıyor. |
| 17 | Banner → bu sayfaya link | ÇALIŞIYOR | `cookie-consent-banner.tsx:65-70` | |
| 18 | Footer "Çerez Politikası" linki | ÇALIŞIYOR | `components/layout/footer.tsx:30` | Footer'da "Çerez tercihleri" girişi yok (bkz. #11). |
| 19 | `/guven` sayfasından link | ÇALIŞIYOR | `app/(public)/guven/page.tsx:94` | |
| 20 | Sitemap girişi | KISMİ | `app/sitemap.ts:54-58` | `lastModified: new Date()` her üretimde değişiyor, yani arama motoruna sahte "güncellendi" sinyali gidiyor. |
| 21 | Çok dillilik | EKSİK | `messages/en.json:2286-2296` ↔ `page.tsx` | Banner EN'e çevrilmiş ("Cookie Policy"), ama link tıklanınca yalnızca TR metin açılıyor. |
| 22 | Çerez envanter tablosu (ad / sağlayıcı / amaç / süre / tür) | EKSİK | — | KVKK Çerez Rehberi ve GDPR uygulamasında beklenen asgari içerik. |
| 23 | Kategori bazlı tercih merkezi (toggle) | EKSİK | — | Sadece iki buton var; kategori seçimi yok. |
| 24 | Üçüncü taraf/aktarım bilgisi (PostHog EU, Vercel Analytics/Speed Insights) | EKSİK | `posthog-provider.tsx:19`, `app/layout.tsx:168-169` | Yurt dışına aktarım KVKK m.9 kapsamında ayrıca açıklanmalı. |
| 25 | `localStorage` / PWA önbelleği / konum önbelleği açıklaması | EKSİK | `NEARBY_LOC_STORAGE_KEY`, `ACCESSIBILITY_STORAGE_KEY`, `qratex-locale`, `pwa-install-dismissed`, `qratex_cookie_consent_v1` | Benzer teknolojiler de rızaya ve aydınlatmaya tabi. Konum verisi özellikle hassas. |
| 26 | İçindekiler / bölüm çapaları | EKSİK | — | |
| 27 | Veri sorumlusu ve başvuru kanalı | EKSİK | KVKK sayfasında var: `kvkk-aydinlatma-metni/page.tsx:57` | Bu sayfada iletişim bilgisi yok. |
| 28 | Müşteri panelinden erişim | EKSİK | `app/customer`, `components/customer` içinde `cerez|gizlilik-politikasi|kvkk` araması boş döndü | Giriş yapmış tüketici hukuki metinlere ve tercihlerine panel içinden ulaşamıyor. |
| 29 | Yükleniyor durumu | ÇALIŞIYOR (aşırı) | `app/(public)/loading.tsx:13-20` | Statik bir metin sayfası için tam ekran `z-[100]` yükleme ekranı orantısız. |
| 30 | Hareketli arka plan | KISMİ | `app/(public)/layout.tsx:18`, `LandingBackground.tsx:36-48`, `app/api/settings/background/route.ts:7,12-24` | Sunucu ilk değeri zaten geçiriyor, buna rağmen istemci her görüntülemede `no-store` + `force-dynamic` ile ek bir DB sorgusu yapıyor. |
| 31 | Azaltılmış hareket desteği | ÇALIŞIYOR | `LandingBackground.tsx:50-56` | |
| 32 | İçeriğe atla (skip link) | ÇALIŞIYOR | `app/(public)/layout.tsx:19`, `main` `tabIndex={-1}` (`:22-28`) | |
| 33 | Rıza kaydı sürümleme / denetim izi | EKSİK | `CONSENT_KEY = 'qratex_cookie_consent_v1'` (`cookie-consent-banner.tsx:11`) | Anahtarda "v1" var ama politika değişince yeniden sorma mantığı yok. Rıza sunucuda kayıtlı değil, ispatlanamıyor. |
| 34 | Yazdır / PDF / sürüm geçmişi | EKSİK | — | |

**Durum sayımı:** ÇALIŞIYOR 11 · KISMİ 8 · BOZUK 1 · SAHTE 4 · EKSİK 10 (toplam 34 kalem; #29 ÇALIŞIYOR olarak sayıldı)

---

## Bulgular (önem sırasıyla)

### 1. KRİTİK · Hukuki uyum / Gizlilik: Analitik ve session replay rızadan bağımsız çalışıyor, sayfa ise bunun tersini söylüyor
- **Kanıt:** `page.tsx:44-47` ("Analitik çerezler … Tercihe bağlıdır"); `app/layout.tsx:168-170` (`<Analytics/>`, `<SpeedInsights/>`, `<PostHogProvider/>` koşulsuz); `components/analytics/posthog-provider.tsx:18-25` (`autocapture: true`, `disable_session_recording: false`, ilk `useEffect`'te init); `cookie-consent-banner.tsx:31-39` (`optionalRejected` yazılıyor). Repo genelinde `optionalRejected` / `qratex_cookie_consent` okuyan kod yok.
- **Sorun:** Kullanıcı "Opsiyonelleri Reddet"e bassa bile PostHog çerez ve `localStorage` (`ph_*`) bırakıyor, tıklamaları ve oturum kaydını topluyor. Kök layout'ta olduğu için bu müşteri panelini de kapsıyor: puan, ödül, geri bildirim metni yazılan ekranlar kaydediliyor (girdi maskeleme varsayılanı **doğrulanmadı**). Analitik çerezler KVKK Çerez Rehberi'ne göre açık rızaya tabi. Politika metninin "tercihe bağlı" demesi durumu teknik bir eksiklikten yanıltıcı beyana çeviriyor. `NEXT_PUBLIC_POSTHOG_KEY` canlıda tanımlıysa (2026-08-13 PostHog funnel çalışması bunu düşündürüyor, `.env` okunmadı) risk fiilen gerçekleşiyor.
- **Profesyonel öneri:** Tek bir **Consent Manager** katmanı kurulmalı:
  1. `lib/consent/` altında tipli bir model: `{ version, necessary: true, analytics: boolean, marketing: boolean, decidedAt }`. Bunun yanında `useConsent()` hook'u (`useSyncExternalStore` + `storage` event) ve `onConsentChange` yayın kanalı olmalı.
  2. `PostHogProvider` yalnızca `analytics === true` iken `init` etmeli. Rıza geri çekilince `posthog.opt_out_capturing()` + `posthog.reset()` çağrılmalı ve `ph_*` anahtarları silinmeli. Alternatif olarak rıza gelene kadar `persistence: 'memory'` ve `disable_session_recording: true` ile cookieless başlatılabilir.
  3. Vercel Analytics/Speed Insights cookieless ama yine de politikada "çerezsiz ölçüm" diye listelenmeli. İstenirse `beforeSend` ile rızaya bağlanabilir.
  4. Giriş yapmış kullanıcının rızası sunucuya da yazılmalı (ör. `ConsentRecord { userId?, anonId, version, choices Json, ip hash, userAgent, createdAt }`). Böylece cihazlar arası tutarlılık ve KVKK ispat yükü karşılanır.
- **Efor:** L

### 2. YÜKSEK · İşlevsellik: "Tercihinizi çerez bildiriminden güncelleyin" yolu yok
- **Kanıt:** `page.tsx:53-54`; `cookie-consent-banner.tsx:18-21` (`visible = !consent`, yani kayıt varsa banner hiç açılmıyor); `footer.tsx:26-32` (tercih girişi yok).
- **Sorun:** Rızayı geri çekmenin vermek kadar kolay olması gerekir. Şu an tek yol tarayıcı depolamasını elle silmek.
- **Öneri:** Banner'ı iki parçaya ayır: kısa bilgilendirme (banner) ve **Tercih Merkezi** (sheet/dialog, kategori başına `Switch`, açıklama, "Seçimleri kaydet"). Tercih Merkezi üç yerden açılabilmeli: (a) bu sayfadaki birincil CTA, (b) footer'daki "Çerez tercihleri" butonu, (c) müşteri panelindeki *Ayarlar → Gizlilik*. Açma işi global bir olayla yapılmalı (`window.dispatchEvent(new CustomEvent('qratex:open-consent'))`); banner bileşeni bunu dinler.
- **Efor:** M

### 3. YÜKSEK · Veri doğruluğu: "Son güncelleme" ve sitemap `lastModified` uydurma
- **Kanıt:** `page.tsx:56` (`new Date().toLocaleDateString('tr-TR')`); `app/sitemap.ts:55-56`. Aynı kalıp `gizlilik-politikasi/page.tsx:56` ve `kvkk-aydinlatma-metni/page.tsx:59` dosyalarında da var.
- **Sorun:** Hukuki belgenin yürürlük/güncelleme tarihi render anını gösteriyor. Kullanıcı ve denetçi metnin ne zaman değiştiğini bilemiyor, arama motoru da sürekli değişmiş sinyali alıyor.
- **Öneri:** Hukuki metinleri sürümlü içerik olarak tut: `content/legal/cerez-politikasi.mdx` (frontmatter: `version`, `effectiveDate`, `changelog[]`) ya da DB'de `LegalDocument { slug, version, effectiveAt, body }`. Sayfa ve sitemap tarihi buradan okumalı. `version` değişince Consent Manager rızayı yeniden istemeli (bkz. #1, `CONSENT_KEY` v1 → v2 mantığı).
- **Efor:** M

### 4. YÜKSEK · İçerik doğruluğu: Var olmayan "pazarlama çerezleri" anlatılıyor, gerçek çerezler listelenmiyor
- **Kanıt:** `page.tsx:48-51` (pazarlama çerezleri). Kodda reklam/pazarlama pikseli yok (gtag/fbq/clarity araması boş). Gerçekte kullanılanlar: `next-auth` oturum çerezleri, `admin_gate` (`app/api/admin/gate/route.ts:68`), `qratex-locale` (`lib/locale-shared.ts:11`), PostHog (`ph_*`). `localStorage` tarafında `qratex_cookie_consent_v1`, `qratex-theme`, `qratex-locale`, `pwa-install-dismissed`, erişilebilirlik tercihleri ve **yakın konum önbelleği** (`NEARBY_LOC_STORAGE_KEY`) var; ayrıca PWA service worker önbelleği kullanılıyor.
- **Sorun:** Aydınlatma metni gerçeği yansıtmıyor. Kullanıcıya anlamlı bir seçim sunulamıyor.
- **Öneri:** Tek kaynaklı bir **çerez envanteri** oluştur: `lib/consent/inventory.ts` (`{ name, provider, category, purpose, duration, type: 'cookie'|'localStorage'|'cache', thirdCountry? }`). Hem sayfadaki tablo hem Tercih Merkezi'ndeki kategori açıklamaları buradan üretilsin. Yeni bir anahtar eklendiğinde envantere eklemeyi zorunlu kılan basit bir lint/test (ör. `localStorage.setItem(` literal anahtarlarını envanterle karşılaştıran jest testi) eklenebilir. Pazarlama kategorisi gerçekten kullanılana kadar kaldırılmalı ya da "şu an kullanılmıyor" diye açıkça belirtilmeli.
- **Efor:** M

### 5. ORTA · i18n: Banner İngilizce, hedef sayfa yalnızca Türkçe
- **Kanıt:** `messages/en.json:2286-2296` (EN "Cookie Policy"); `page.tsx` tamamen sabit TR metin, `useAppT`/`getTranslations` kullanılmıyor.
- **Sorun:** EN arayüzdeki kullanıcı linke tıklayınca anlamadığı bir hukuki metinle karşılaşıyor. Yabancı ziyaretçide aydınlatma yükümlülüğü yerine getirilmemiş oluyor.
- **Öneri:** Hukuki MDX'leri dil bazlı tut (`cerez-politikasi.tr.mdx` / `.en.mdx`), locale cookie'sine göre seç. EN sürümü yoksa açık bir "This document is available in Turkish only" uyarısı göster ve `hreflang` ver.
- **Efor:** M

### 6. ORTA · Erişilebilirlik / SEO: Sayfada `h1` yok, başlık override'ı görünen başlığa yansımıyor
- **Kanıt:** `page.tsx:33` → `components/ui/card.tsx:44` (`<h3>`); `components/layout/header.tsx` içinde `h1` yok (grep boş). `page.tsx:23` `title` değişkeni yalnızca JSON-LD'de kullanılıyor, `CardTitle` ve breadcrumb sabit metin.
- **Sorun:** Ekran okuyucu kullanıcıları başlık navigasyonunda sayfa başlığını bulamıyor; admin SEO override'ı ile görünen başlık birbirinden kopuyor.
- **Öneri:** Ortak bir `LegalDocumentLayout` bileşeninde `h1` (görünür başlık) + `h2` bölüm başlıkları kullan. Başlık tek kaynaktan (`title`) beslensin.
- **Efor:** S

### 7. ORTA · Mimari: Hukuki sayfalar kopyala-yapıştır şablonla yazılmış
- **Kanıt:** `cerez-politikasi/page.tsx`, `gizlilik-politikasi/page.tsx`, `kvkk-aydinlatma-metni/page.tsx` aynı iskelete sahip (metadata + JSON-LD + breadcrumb + Card + sahte tarih). Path ve başlık her dosyada 3-4 kez tekrarlanıyor (`page.tsx:9,15,22,27,28,30`).
- **Sorun:** Bir hata (ör. sahte tarih) her sayfaya ayrı ayrı yayılıyor; tutarlı bir hukuki deneyim kurulamıyor.
- **Öneri:** `app/(public)/(legal)/[slug]/page.tsx` + `generateStaticParams`, ya da ortak `LegalDocumentLayout` + MDX içerik. Metadata, JSON-LD, breadcrumb, içindekiler, tarih ve sürüm geçmişi tek yerde üretilsin.
- **Efor:** M

### 8. DÜŞÜK · SEO tutarlılığı: Breadcrumb JSON-LD ile canonical farklı tabandan üretiliyor
- **Kanıt:** `page.tsx:15` (`getCanonicalBase(seo)`) ↔ `breadcrumb-json-ld.tsx:15` → `lib/site-config.ts:26-29` (env `siteUrl`).
- **Sorun:** Admin `canonicalBase`'i farklı bir alan adına ayarlarsa yapılandırılmış veri ile canonical çelişir.
- **Öneri:** `BreadcrumbJsonLd`'ye `base` prop'u geçir ya da içeride `getSeoSettings()` kullan.
- **Efor:** S

### 9. DÜŞÜK · Performans (layout kaynaklı): Her public görüntülemede gereksiz `no-store` API + DB çağrısı
- **Kanıt:** `app/(public)/layout.tsx:13,18` (sunucu `getBackgroundEffect()` 60 sn önbellekli değeri geçiriyor); `LandingBackground.tsx:36-48` (istemci yine `fetch('/api/settings/background', { cache: 'no-store' })`); `app/api/settings/background/route.ts:7,14` (`force-dynamic`, önbelleksiz Prisma).
- **Sorun:** Statik bir metin sayfası, her ziyarette canlı Neon'a ek bir sorgu atıyor.
- **Öneri:** İstemci fetch'ini kaldır. Canlı güncelleme gerekiyorsa admin kaydında `revalidateTag('settings')` yeterli. Ya da route'u `unstable_cache`/Redis ile sar ve `s-maxage` ver.
- **Efor:** S

### 10. DÜŞÜK · UX: Statik bir metin sayfası için tam ekran yükleme katmanı
- **Kanıt:** `app/(public)/loading.tsx:13-20` (`fixed inset-0 z-[100]`).
- **Sorun:** Banner ya da footer linkinden geçişte kısa da olsa tüm ekran kaplanıyor; okuma sayfası için orantısız.
- **Öneri:** `(legal)` grubuna içerik iskeleti (başlık + paragraf skeleton'ı) gösteren hafif bir `loading.tsx` ver.
- **Efor:** S

### 11. DÜŞÜK · Sağlamlık: Banner'da `localStorage` erişimi korumasız
- **Kanıt:** `cookie-consent-banner.tsx:19,24,32` (try/catch yok).
- **Sorun:** Depolamanın engellendiği ortamlarda (bazı gizli mod/WebView'ler) `getItem`/`setItem` hata fırlatabilir: banner kapanmaz ya da efekt patlar.
- **Öneri:** Consent Manager içinde güvenli depolama sarmalayıcısı kullan. Hata durumunda bellek içi rızaya düş ve analitiği kapalı tut.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

Starbucks Rewards, Duolingo, Revolut, Monzo ve Spotify'ın gizlilik/çerez merkezlerinde standart olup burada olmayanlar:

1. **Tercih Merkezi:** kategori başına anahtar, "Tümünü reddet" ile "Tümünü kabul et"in eşit ağırlıkta sunulması, kaydedilen seçimin özeti ve tarihi (Revolut/Monzo, Spotify "Cookie Settings").
2. **Çerez envanter tablosu:** ad, sağlayıcı, amaç, süre, yurt dışı aktarım; mobilde kart görünümüne dönüşen responsive tablo (Spotify, Duolingo).
3. **Hesaba bağlı rıza:** giriş yapan kullanıcının tercihinin cihazlar arası senkronu ve panelde *Ayarlar → Gizlilik ve veriler* sekmesi (Starbucks app, Revolut).
4. **Sürüm geçmişi ve değişiklik bildirimi:** "Bu politika 12.09.2026'da güncellendi, değişenler: …" ve sürüm değişince rızanın yeniden sorulması.
5. **Okunabilir özet katmanı:** üstte "Kısaca" kutusu (3-4 madde), altta tam metin (Monzo'nun sade dil yaklaşımı).
6. **İçindekiler + derin linkler:** bölüm çapaları, kopyalanabilir başlık linkleri, yazdırma dostu stil.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Kullanıcı 10 saniyede "hangi verim, kimde, ne kadar süre duruyor?" sorusunun cevabını görsün ve tek dokunuşla seçimini değiştirebilsin. Sayfa bir "metin duvarı" değil, **gizlilik kontrol yüzeyi** gibi çalışsın.

**Yerleşim (masaüstü iki kolon, mobilde tek kolon):**
1. **Başlık şeridi:** `h1` "Çerez Politikası", yürürlük tarihi + sürüm rozeti (`v2 · 12 Eyl 2026`), "Değişiklik geçmişi" bağlantısı.
2. **Mevcut tercihlerin kartı (birincil):** "Şu an: Zorunlu ✓ · Analitik ✗ · Pazarlama —" özeti ve "Tercihleri yönet" butonu (Tercih Merkezi sheet'ini açar). Rıza yoksa "Henüz seçim yapmadınız" durumu.
3. **Kısaca:** 3-4 maddelik sade dil özeti.
4. **Kategoriler:** her kategori için açılır bir bölüm. İçinde amaç, örnekler ve envanter tablosundan filtrelenmiş satırlar.
5. **Benzer teknolojiler:** `localStorage`, PWA önbelleği, konum önbelleği; her biri için silme yolu.
6. **Üçüncü taraflar ve aktarım:** PostHog (AB bölgesi), Vercel; KVKK m.9 bilgisi.
7. **Haklarınız ve başvuru:** KVKK sayfasına bağlantı, başvuru adresi.
8. **Yan kolon (masaüstü):** yapışkan içindekiler, mobilde üstte açılır "Bu sayfada" menüsü.

**Motion / 3B:** Bu bir güven sayfası; 3B ya da gösterişli animasyon **uygun değil**. Hareket şunlarla sınırlı kalsın: Tercih Merkezi sheet'inin giriş/çıkışı (`Motion` + spring, `useReducedMotion` ile kapatılabilir), anahtar değiştiğinde özet kartında kısa bir "Kaydedildi ✓" mikro-onayı ve içindekilerde aktif bölüm göstergesi. Hareketli `LandingBackground` bu sayfada sakin moda (`none` ya da statik gradyan) alınmalı; okunabilirlik ve kontrast için metin zemini opak olmalı.

**Veri / API değişiklikleri:**
- `lib/consent/` (model, `useConsent`, güvenli depolama, olay kanalı) ve `lib/consent/inventory.ts` (tek kaynaklı envanter).
- `PostHogProvider`'ı rızaya bağla: init/opt-out/reset; rıza gelene kadar session replay kapalı.
- Opsiyonel: `POST /api/consent` (auth varsa `userId`, yoksa anonim id). Prisma'da `ConsentRecord` modeli (sürüm, seçimler, zaman damgası, IP hash'i). Rate-limit uygulanmalı ve kayıt yalnızca eklenebilir (append-only) olmalı.
- Hukuki içerik: sürümlü MDX ya da `LegalDocument` tablosu. Sayfa, sitemap ve rıza sürümü aynı kaynaktan beslenmeli.
- Müşteri paneline *Ayarlar → Gizlilik* girişi: aynı Tercih Merkezi bileşeni, hesap senkronu ile.

---

## Çakışmalar / birleştirme önerisi

- **`/gizlilik-politikasi`, `/kvkk-aydinlatma-metni`, `/kullanim-sartlari`, `/guven`:** Bu sayfalar aynı şablonu, aynı sahte tarih hatasını ve aynı yüzeysel içerik düzeyini paylaşıyor. Çerez politikasının **ayrı bir URL'de kalması gerekiyor**, çünkü banner'dan doğrudan bağlanıyor ve mevzuat ayrı bir aydınlatma bekliyor. Bu yüzden URL'ler birleştirilmemeli. Bunun yerine ortak bir `(legal)` route grubu + `LegalDocumentLayout` + sürümlü içerik altyapısında **birleştirilmeli**. `/guven` sayfası bu belgelerin hub'ı (özet kartları + son güncelleme tarihleri) olarak konumlandırılabilir.
- **Çerez banner'ı (`cookie-consent-banner.tsx`) ile bu sayfa:** İkisi aynı ürünün iki yüzü. Banner ile sayfadaki Tercih Merkezi aynı `useConsent` kaynağını kullanmalı; şu an banner yalnızca yazıyor, sayfa ise yalnızca anlatıyor ve aralarında bir veri bağı yok.

---

## Doğrulama (şüpheci inceleme)

Yöntem: İddialar, ilgili kod baştan okunarak çürütülmeye çalışıldı (salt okunur; build, test, prisma ya da DB erişimi yapılmadı). Okunan dosyalar: `app/(public)/cerez-politikasi/page.tsx`, `app/layout.tsx`, `app/(public)/layout.tsx`, `components/analytics/posthog-provider.tsx`, `lib/analytics.ts`, `components/layout/cookie-consent-banner.tsx`, `components/pwa/install-banner.tsx`, `components/layout/footer.tsx`, `app/sitemap.ts`, `lib/seo-settings.ts`, `messages/tr.json`.

### 1. Çerez rızası hiçbir yerde uygulanmıyor (PostHog autocapture + session replay) — **DOĞRULANDI** (önem: Yüksek)

- `app/layout.tsx:170`: `<PostHogProvider />` kök layout'ta, hiçbir koşula bağlanmadan render ediliyor. Bu nedenle public, müşteri, bayi ve admin olmak üzere **tüm** route'larda çalışıyor.
- `components/analytics/posthog-provider.tsx:12-29, 48-51`: Tek kapı `NEXT_PUBLIC_POSTHOG_KEY`. Key varsa ilk mount'ta `posthog.init({ autocapture: true, disable_session_recording: false, capture_pageleave: true })` çalışıyor. Rıza okunmuyor, `opt_out_capturing` ya da `opt_in_capturing` çağrısı yok ve `persistence` ayarı yapılmamış. Varsayılan değer `localStorage+cookie` olduğundan `ph_*` çerezi yazılıyor.
- `PageviewTracker` (`posthog-provider.tsx:35-43`) ve `lib/analytics.ts:6-25` (`track` / `identify`) da yalnızca key'e bakıyor.
- `cookie-consent-banner.tsx:31-39` `optionalRejected: true` değerini `localStorage`'a yazıyor. Depo genelinde `qratex_cookie_consent|optionalRejected` araması yalnızca banner dosyasında eşleşiyor. Rıza olayının tek dinleyicisi `components/pwa/install-banner.tsx:52-53` ve o da yalnızca PWA popup'ını gösteriyor. Sonuç olarak **rıza, analitik davranışı üzerinde hiçbir etki yaratmıyor**.
- Canlıda geçerli mi? Yerel `.env` dosyasında `POSTHOG` anahtarı yok. Ancak proje hafızasındaki `session-2026-08-13-work.md` notuna göre key Vercel'de tanımlı ve deploy'a gömülü olduğu doğrulanmış (EU cloud). Bu, kodla değil proje kaydıyla desteklenen bir bilgi; Vercel ortamı bu incelemede ayrıca kontrol edilmedi.
- Ek bulgu: Banner yalnızca `app/(public)/layout.tsx:31` içinde render ediliyor. Panele doğrudan giren (örneğin bookmark ya da PWA ile açan) kullanıcı banner'ı hiç görmüyor, buna karşın panelde session replay kaydediliyor.

**Yeniden üretim:** Temiz bir tarayıcıda canlı siteye girin ve "Opsiyonelleri Reddet"e basın. DevTools → Network'te `eu.i.posthog.com` adresine giden `/e/` ve `/s/` (recording) istekleri devam ediyor. Application → Cookies altında `ph_phc_…_posthog` çerezi duruyor. Bu davranış, `page.tsx:44-47` içindeki "Analitik çerezler … Tercihe bağlıdır." beyanıyla çelişiyor.

### 2. "Son güncelleme" tarihi render anından üretiliyor — **DOĞRULANDI** (önem: iddia edilenden düşük, Orta/Düşük)

- `page.tsx:56`: `new Date().toLocaleDateString('tr-TR')`. Aynı satır `gizlilik-politikasi/page.tsx:56`, `kvkk-aydinlatma-metni/page.tsx:59` ve `kullanim-sartlari/page.tsx:60` dosyalarında da var. `app/sitemap.ts` içinde bu URL'lerin hepsi `lastModified: new Date()` kullanıyor.
- Düzeltme: Sayfanın statik mi ISR mi olduğu (layout'taki `getBackgroundEffect` ve `unstable_cache` revalidate 60 nedeniyle) kesin doğrulanmadı. Bu yüzden gösterilen tarih "her render" ya da "son build/yeniden üretim" olabilir. Her iki durumda da tarih metnin gerçek değişiklik tarihini göstermiyor ve kullanıcıya yanlış bilgi veriyor. Bu durum, değişiklik takibini ve rıza sürümlemesini anlamsız kılıyor.
- Etkisi bir güvenlik ya da veri sızıntısı değil; bir hukuki doğruluk ve SEO sinyali sorunu. Bu nedenle "KRİTİK/YÜKSEK" sınıfı abartılı.

**Yeniden üretim:** Metin değişmeden iki farklı gün (ya da iki deploy arasında) sayfayı açın. Görünen "Son güncelleme" tarihi değişmiş olacak.

### 3. Politikada vaat edilen tercih güncelleme yolu yok — **DOĞRULANDI** (önem: Yüksek; 1. bulguyla birlikte)

- `page.tsx:53-54`: "Çerez tercihlerinizi çerez bildirimi üzerinden güncelleyebilirsiniz." deniyor.
- `cookie-consent-banner.tsx:18-21`: Kayıt varsa `visible=false` oluyor. Banner'ı yeniden açan bir dışa aktarım (export), olay ya da prop yok; `CONSENT_KEY`'i silen başka bir kod da yok (bkz. 1. bulgudaki grep).
- `footer.tsx:26-32`: Yalnızca politika linkleri var; "Çerez tercihleri" adlı bir eylem bulunmuyor. Müşteri panelinde de benzer bir ayar bulunamadı (grep ile `cookieConsent` yalnızca banner ve mesaj dosyalarında geçiyor).
- Rızanın, verildiği kadar kolay geri alınabilmesi gerekir (KVKK Çerez Rehberi / GDPR m.7(3)). Buna karşın kullanıcı tarayıcı depolamasını elle temizlemek zorunda kalıyor. Bulgu, 1. bulgu düzeltilse bile geçerliliğini koruyor.

**Yeniden üretim:** Banner'da "Tümünü Kabul Et"e basın, ardından `/cerez-politikasi` sayfasına ve footer'a gidin. Tercihi değiştirecek ya da banner'ı yeniden açacak hiçbir kontrol bulunmuyor.

---

## Uygulama (Dalga 2)

**Yüzey:** `p-blog-yasal` · **Tarih:** 2026-10-10 · URL korundu (`app/(okuma)/cerez-politikasi`). Rıza altyapısı (P0-31: `lib/consent`, tercih merkezi, PostHog kapısı, `ConsentRecord`) önceki dalgada kuruldu; bu dalgada sayfa ortak `LegalDocument` kabuğuna taşındı. Sürüm/tarih tek kaynak: `lib/legal/documents.ts` (çerez sürümü `lib/consent/inventory.ts`'ten). Test: `__tests__/lib/legal-documents.test.ts`.

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Nasıl |
|---|---|---|---|
| 1 | Metadata + admin ezmesi | ÇALIŞIYOR | `buildLegalMetadata` (OG article + Twitter dahil) |
| 2 | Canonical | ÇALIŞIYOR | |
| 3 | WebPage LD | ÇALIŞIYOR | sürüm, datePublished/dateModified (yürürlük), inLanguage |
| 4 | Breadcrumb LD | ÇALIŞIYOR | canonical tabanla (env `siteUrl` değil) |
| 5 | Görsel breadcrumb | ÇALIŞIYOR | DS `Breadcrumbs` |
| 6 | Sayfa başlığı | ÇALIŞIYOR | `h1`, admin ezmesi görünen başlığa da yansır |
| 7 | Giriş | ÇALIŞIYOR | + "Kısaca" kartı |
| 8 | Zorunlu çerezler | ÇALIŞIYOR | envanter tablosu (ad, sağlayıcı, tür, amaç, süre) |
| 9 | "Analitik tercihe bağlı" | ÇALIŞIYOR | beyan artık doğru (P0-31 kapısı) |
| 10 | Pazarlama | ÇALIŞIYOR | "kullanmıyoruz; eklenirse önce politika güncellenir" — tercih merkeziyle tutarlı |
| 11 | Tercihi güncelleme | ÇALIŞIYOR | `ConsentSummaryCard` + "Tercihleri yönet" + sayfa altı bağlantısı |
| 12 | Zorunlu çerez uyarısı | ÇALIŞIYOR | "tarayıcı ayarlarından" yönlendirmesi (`#silme`) |
| 13 | Son güncelleme | ÇALIŞIYOR | sürüm rozeti + yürürlük tarihi + değişiklik geçmişi |
| 14–16 | Banner kabul/ret | ÇALIŞIYOR | P0-31 (bu yüzey dışı, doğrulandı) |
| 17–19 | Banner/footer/`/guven` bağlantıları | ÇALIŞIYOR | |
| 20 | Sitemap | ÇALIŞIYOR | `lastModified` = yürürlük tarihi |
| 21 | Çok dil | ÇALIŞIYOR (kısmi kapsam) | EN arayüzde "yalnız Türkçe, bağlayıcı olan Türkçe" notu |
| 22 | Envanter tablosu | ÇALIŞIYOR | mobilde kart listesi |
| 23 | Tercih merkezi | ÇALIŞIYOR | P0-31 |
| 24 | Üçüncü taraf/aktarım | ÇALIŞIYOR | Gizlilik Politikası sağlayıcı tablosuna derin bağlantı |
| 25 | Yerel depolama/önbellek | ÇALIŞIYOR | envanterde |
| 26 | İçindekiler | ÇALIŞIYOR | masaüstü scroll-spy, mobil açılır, numaralı bölümler |
| 27 | Veri sorumlusu/başvuru | ÇALIŞIYOR | "Haklarınız ve iletişim" + ilgili belgeler kutusu |
| 28 | Müşteri panelinden erişim | ÇALIŞIYOR (başka yüzey) | Ayarlar › Gizlilik'te tercih kartı (P0); panel içi yasal belge bağlantıları ayarlar yüzeyinin işi |
| 29 | Yükleniyor | ÇALIŞIYOR | hafif statik iskelet |
| 30 | Hareketli arka plan | KALDIRILDI (okuma yüzeyinde) | ek `no-store` istek de yok |
| 31–32 | Azaltılmış hareket, skip-link | ÇALIŞIYOR | |
| 33 | Rıza sürümleme / denetim izi | ÇALIŞIYOR | P0-31 (`CONSENT_VERSION`, `ConsentRecord`) |
| 34 | Yazdır / sürüm geçmişi | ÇALIŞIYOR | "Yazdır / PDF" + yazdırma görünümü (krom gizli, açık zemin) + değişiklik geçmişi |

### Kapanan bulgular
1–4 (P0-31 + metin), 6 (h1), 7 (ortak `LegalDocument`), 8 (breadcrumb tabanı), 9 (bu sayfada ek DB isteği yok), 10 (hafif yükleme), 11 (P0). Kısmen: 5 (TR-only notu; EN metin yok).

### Kalanlar
- EN çeviri: hukuk onaylı İngilizce metin gerekiyor.
- Eski sürümlerin tam metin arşivi yok (yalnız değişiklik özeti); tam arşiv için ŞEMA İSTEĞİ `LegalDocumentVersion`.
