# Sistem Denetimi — Mobil, Erişilebilirlik ve i18n

> Tarih: 2026-10-08 · Dal: `feat/moment-engine` · Kapsam: tüm `app/` + `components/` + `i18n/` + `messages/` + `public/manifest.json` + `next.config.js`
> Yöntem: salt okunur kod incelemesi, Grep/Glob envanteri, WCAG 2.2 kontrast oranlarının tema token'larından hesaplanması, `.next` (2026-09-02 build) chunk içeriğinin doğrulanması. Kod, veritabanı, build ve test ÇALIŞTIRILMADI.

---

## 1. Özet ve Puan

**Genel puan: 4,5 / 10** (Mobil 6/10 · Erişilebilirlik 4/10 · i18n 3,5/10)

Qratex'in **kabuk katmanı** (layout, header, temel UI primitive'leri) mobil ve erişilebilirlik açısından bilinçli biçimde yazılmış: `Input` 44 px yükseklik + mobilde `text-base` (iOS zoom yok), `Button` varsayılan 44 px, skip-link, `viewportFit: 'cover'` + safe-area dolguları, zoom serbest (`maximumScale: 5`), `MotionConfig reducedMotion="user"`, global `prefers-reduced-motion` CSS'i, global arama combobox ARIA'sı, PWA kurulum bandında odak tuzağı, çevrimdışı şeridi `role="status"`. TR/EN katalogları birebir eşit (3560 / 3560 anahtar, eksik yok).

Sorun, bu kalitenin **sayfa ve özellik katmanına inmemesi**:

1. **i18n yarım kalmış bir göç.** 526 `.tsx` dosyasının yalnızca 139'u (%26) çeviri altyapısını kullanıyor; yorum dışı en az **3.753 satır** sabit Türkçe metin var (yalnızca Türkçe'ye özgü harf içeren satırlar sayıldı — gerçek sayı daha yüksek). Kullanıcının dili seçtiği **ayarlar sayfasının kendisi** ve QR kart aktivasyon sayfası `/c/[token]` tamamen Türkçe. API'ler ~1.000+ Türkçe hata dizgesi döndürüyor ve hiçbiri locale bilmiyor.
2. **Locale mimarisi istemci-öncelikli ve pahalı.** Her iki katalog (TR+EN, ~98 KB gzip) kök sağlayıcı üzerinden **her sayfaya** gönderiliyor; SSR her zaman `lang="tr"` ve Türkçe basıyor, EN kullanıcı her sert yüklemede Türkçe→İngilizce sıçraması görüyor.
3. **Kontrast token'ları WCAG AA'yı birden çok yerde geçemiyor** (koyu temada `text-destructive` 1,93:1; koyu temada `text-primary` 3,49:1; switch kapalı durumu koyu temada 1,26–1,32:1 ile neredeyse görünmez).
4. **Mobilin birincil girişi olan QR geri bildirim sayfası** (yıldız puanı, fotoğraf yükleme, NPS) ekran okuyucu ve klavye için kırık.
5. **Mobil navigasyon** tek bir sol-alt FAB + 27 öğelik çekmeceye dayanıyor; çekmece her grup aç/kapa işleminde yeniden mount olup kaydırmayı ve odağı sıfırlıyor.

---

## 2. Mevcut Durum Haritası

### 2.1 i18n altyapısı

| Katman | Dosya | Durum |
|---|---|---|
| Sözlük yükleyici | `i18n/request.ts:7-8` | `tr.json` ve `en.json` **statik import**; `t(locale, key, vars)` nokta-yolu çözücü, eksik anahtarda anahtarın kendisini döndürür |
| İstemci sağlayıcı | `lib/app-locale.tsx:19-50` | `AppLocaleProvider` (kökte, `components/providers.tsx`), başlangıç `defaultLocale='tr'`, `useEffect` ile localStorage → oturum tercihi sırasıyla düzeltir |
| Sunucu locale | `lib/server-locale.ts` | Cookie `qratex-locale`'den okur; **yalnızca `generateMetadata`'da** kullanılıyor (örn. `app/customer/layout.tsx:14`) |
| Dil seçici | `components/layout/language-switcher.tsx` | localStorage + cookie + `PATCH /api/user/profile` + oturum güncelleme |
| Katalog | `messages/tr.json` (206 KB), `messages/en.json` (196 KB) | 106 namespace, 3560 anahtar, birebir eşit; `dealerAiInsights.*.json` `scripts/merge-dealer-ai-insights.mjs` ile birleştiriliyor (kaynak çiftlenmesi) |
| Biçimlendirme | `lib/utils.ts:16-84` | `formatDate/formatRelativeTime` varsayılan `'tr'`, `formatNumber/formatCurrency` sabit `'tr-TR'` |
| URL/SEO | `app/layout.tsx:68,148` | Locale URL'de yok; `hreflang` yalnızca `tr`; `<html lang="tr">` sabit |

### 2.2 Mobil kabuk

| Öğe | Kanıt | Durum |
|---|---|---|
| Viewport | `app/layout.tsx:129-137` | `viewportFit: cover`, zoom serbest — iyi |
| Müşteri kabuğu | `app/customer/layout.tsx:33-50` | Safe-area sol/sağ dolgu, `main` altında `6.5rem + inset` boşluk (FAB'lar için) |
| Navigasyon | `components/dashboard/sidebar.tsx:736-754` | `lg` altında **yalnızca** sol-alt 56 px yuvarlak FAB → sol çekmece; alt sekme çubuğu yok |
| Header | `components/dashboard/header.tsx:338-583` | Sticky, safe-area-top, 40–48 px dokunma hedefleri, mobil arama Sheet'i — iyi |
| Yüzen katmanlar | install-banner `:135`, cookie `cookie-consent-banner.tsx:51`, chatbot `chatbot.tsx:291`, offline `offline-banner.tsx:25`, toaster `toaster.tsx:23` | Hepsi ekranın alt bandında |
| PWA | `next.config.js:3-12`, `public/manifest.json` | next-pwa, `/offline` fallback, `skipWaiting`; manifest SVG ikonlar, `portrait-primary` |

### 2.3 Erişilebilirlik altyapısı

| Öğe | Kanıt | Durum |
|---|---|---|
| Global odak halkası | `app/globals.css:131-133` | `:focus-visible` → `ring-2 ring-primary` — iyi |
| Azaltılmış hareket (OS) | `globals.css:801-819`, `providers.tsx:232` | CSS animasyon/geçiş kapatılıyor; framer `reducedMotion="user"` |
| Uygulama içi tercihler | `lib/accessibility-prefs.ts`, `globals.css:824-879` | `colorblind`, `high-contrast`, `reduce-animations` `<html>` sınıfları |
| Skip link | `components/layout/skip-to-main.tsx` | Var; etiket sabit Türkçe (`:12`) |
| Otomatik test | `playwright.config.ts:15`, `e2e/*`, `scripts/customer-responsive-scan.mjs` | Yalnızca Desktop Chrome; axe yok; responsive tarama sadece yatay taşma |

---

## 3. Bulgular (önem sırasına göre)

### B1 — [YÜKSEK] i18n göçü yarıda: kullanıcıya görünen metnin büyük kısmı sabit Türkçe, API'ler locale-kör

**Kanıt**
- Envanter: 526 `.tsx`'in 139'u `useAppT/useCustomerT/t(locale…)/getServerLocale` kullanıyor. Yorum dışı, Türkçe karakter içeren satır: **3.753** (admin 1.982, `app/customer` 440, `components/customer` 326, `components/team` 293, `app/dealer` 171, `app/(public)` 142).
- Dil seçiminin yapıldığı sayfa: `app/customer/settings/page.tsx` 66 sabit satır — `:649 "Ad Soyad"`, `:908-925` şifre etiketleri, `:964 "Dil"`, `:980 "Tema"`, `:221-437` tüm toast'lar. Yani EN'e geçen kullanıcı EN'e geçtiği ekranı Türkçe görmeye devam ediyor.
- QR kart aktivasyonu `app/c/[token]/page.tsx` — tek bir `t()` yok; `:69-135, 160-170, 200-440` tamamı Türkçe.
- Müşteri ana paneli `components/customer/dashboard/customer-dashboard.tsx:644-1048` — "Size Özel Fırsatlar", "Aktif Görevler", `{league} Ligi` (`:490, :1074, :1307` — ek birleştirme), hatta **sabit "2 Saat Kaldı"** (`:873`) gibi gerçek veriye bağlı olmayan metin.
- Temel primitive'ler: `components/ui/dialog.tsx:49` ve `components/ui/sheet.tsx:68` `aria-label="Kapat (Escape)"` — EN arayüzdeki **her** dialog/sheet Türkçe okunuyor. `offline-banner.tsx:33`, `app/offline/page.tsx`, `skip-to-main.tsx:12`, `chatbot.tsx:299,433,572,590,773` aynı durumda.
- Toast'lar: tüm `app` + `components`'te 374 sabit dizgeli `toast(...)` çağrısı.
- API: `app/api/**` içinde `error:` alanına yazılmış ~782 Türkçe, 89 ASCII-Türkçe ("id gerekli", "Kart silinemedi") ve kod-karışık ("Decision bulunamadı", "Run bulunamadı" — `app/api/admin/agents/outcomes/route.ts`) dizge; **hiçbir** API rotası `getServerLocale` çağırmıyor. İstemci bunları doğrudan gösteriyor (örn. `app/(public)/feedback/[code]/page.tsx:130`, `app/c/[token]/page.tsx:69,102`).
- `lib/*.ts` içinde DB'ye **render edilmiş metin** olarak yazılan 82 sabit Türkçe bildirim başlığı — bu bildirimler sonradan dil değiştirse bile Türkçe kalır.
- Belgeler gerçeği yansıtmıyor: `IMPROVEMENTS-MOBILE-TRANSLATION.md` "settings / my-card i18n'leştirildi" diyor; `my-card/page.tsx:380-460` toast'ları hâlâ sabit.

**Sorun:** EN seçeneği ürün olarak vaat ediliyor (dil seçici header'da, ayarlarda, QR sayfasında) ama deneyim tutarsız ve güven kırıcı: aynı ekranda iki dil, Türkçe hata mesajları, Türkçe ekran okuyucu etiketleri. Ayrıca yeni kod hâlâ sabit metinle yazılıyor (ör. `components/team/*` 293 satır, en yeni modül) — göç kendi kendine kapanmıyor, **büyüyor**.

**Öneri (ürün seviyesinde)**
1. **Karar:** EN bir ürün hedefi mi? Değilse dil seçiciyi kaldırıp `tr` tek dil ilan etmek dürüst ve ucuz seçenek. Hedefse aşağıdaki program uygulanmalı.
2. **Sınır-önce göç:** önce *kullanıcının ilk temas ettiği* yüzeyler — QR geri bildirim (`/feedback/[code]`), kart aktivasyonu (`/c/[token]`), auth, müşteri ana paneli, ayarlar, temel primitive'ler (dialog/sheet/skip-link/offline/chatbot). Admin paneli (1.982 satır) iç kullanım; en sona veya kapsam dışına.
3. **API hata sözleşmesi:** `{ error: { code: 'CARD_NOT_FOUND', params?: {...} } }` biçimine geç; insan-okur metni istemci `t('errors.CARD_NOT_FOUND')` ile üretsin. Geçiş süresince `lib/api-error.ts` gibi tek bir yardımcı hem `code` hem `message` (locale'e göre, `Accept-Language`/cookie) döndürsün. Böylece 1.000+ dizge tek tek değil, kod listesi üzerinden çevrilir.
4. **Bildirimler:** `Notification` kaydına `type` + `params` (JSON) yaz, başlık/gövdeyi okuma anında locale ile render et. Mevcut `title` alanı geriye uyumluluk için kalsın.
5. **Regresyon kapısı:** ESLint kuralı (`eslint-plugin-i18next/no-literal-string` veya özel bir kural: JSX metninde ve `toast*`/`aria-label`/`placeholder` argümanlarında `[çğışöüÇĞİŞÖÜ]` yasak) önce `app/customer`, `app/(public)`, `components/ui`, `components/customer` için `error`, diğerleri için `warn`. `.agent/skills/i18n-localization/scripts/i18n_checker.py` zaten var — CI'a bağlanmalı.

**Efor:** XL (program). İlk dalga (giriş yüzeyleri + primitive'ler + lint kapısı): L.

---

### B2 — [YÜKSEK] Locale mimarisi: iki katalog her sayfada, SSR hep Türkçe, EN kullanıcıda dil sıçraması

**Kanıt**
- `i18n/request.ts:7-8` iki JSON'u statik import ediyor; `lib/app-locale.tsx:5` (`'use client'`) bunu içe alıyor ve sağlayıcı kökte (`components/providers.tsx:221`). Mevcut build'de (`.next`, 2026-09-02) `static/chunks/51850-*.js` = 314 KB ham / **~98 KB gzip** ve içinde `layoutMetadata` namespace'i **iki kez** (TR+EN) geçiyor; aynı chunk `app/layout-*.js` tarafından yükleniyor → QR geri bildirim sayfası dahil **her sayfanın** ilk yükünde.
- `lib/app-locale.tsx:21` `useState<Locale>(defaultLocale)` → SSR ve ilk hidrasyon her zaman TR; `:24-29` effect sonrası EN'e geçiyor → EN kullanıcıda her sert yüklemede metin sıçraması (CLS + "yanlış dil" algısı).
- `app/layout.tsx:148` `lang="tr"` sabit; dil yalnızca istemcide `:33-37` ile değişiyor → ekran okuyucu SSR içeriğini yanlış dilde (TR telaffuz kurallarıyla) okuyabilir, arama motoru EN içeriği hiç görmez.
- Sunucu cookie'yi zaten okuyabiliyor (`lib/server-locale.ts`) ama bu bilgi sağlayıcıya aktarılmıyor.
- `lib/app-locale.tsx:25-26` önceliği **localStorage > oturum (DB) tercihi**: paylaşılan cihazda önceki kullanıcının dili, yeni kullanıcının DB tercihini ezer; yeni cihazda ilk girişte DB tercihi ancak localStorage boşsa uygulanır.
- QR geri bildirim sayfası kendi paralel locale state'ini tutuyor (`app/(public)/feedback/[code]/page.tsx:55-77`), `AppLocaleProvider`'ı ve `document.lang`'i güncellemiyor; dil butonu "EN/TR" metninden başka erişilebilir adı yok (`:299-301`).

**Sorun:** Performans (her sayfaya ~50 KB gereksiz katalog), doğruluk (yanlış `lang`), deneyim (dil sıçraması) ve tutarlılık (iki ayrı locale kaynağı) aynı kökten geliyor: locale'in **sunucuda belirlenip** aşağı akmaması.

**Öneri**
- **Sunucu-otoriter locale:** kök layout'ta `getServerLocale()` → `<html lang={locale}>` ve `<Providers initialLocale={locale} messages={messagesFor(locale)}>`. Sağlayıcı başlangıç state'ini prop'tan alsın; effect yalnızca "oturum tercihi ≠ cookie" ise cookie'yi düzeltip `router.refresh()` etsin.
- **Yalnızca aktif dilin kataloğunu gönder:** `messagesFor` sunucuda JSON'u seçsin; istemciye sadece o dil serileşsin. Daha ileri adım: namespace bazlı bölme (`customer`, `dealer`, `admin`, `public`) ve her segment layout'unun kendi namespace'ini sağlaması — admin'in 1.000+ anahtarı müşteri cihazına hiç inmesin.
- `next-intl`'e geçiş değerlendirilmeli (dosyanın kendi yorumu da bunu öneriyor, `i18n/request.ts:4`): RSC'de `getTranslations`, ICU çoğul/biçim, `NextIntlClientProvider` ile namespace bazlı gönderim hazır gelir. Mevcut `t(key)` imzası korunarak adaptör yazılabilir; büyük refaktör gerekmez.
- **Öncelik kuralı:** oturum açıkken DB tercihi > cookie > `Accept-Language` > `tr`. localStorage yalnız anonim kullanıcı için.
- QR sayfası ortak sağlayıcıyı kullansın; dil butonu `aria-label="Dili değiştir: English"` + `lang="en"` içeriği.

**Efor:** M (sunucu-otoriter locale + tek-dil gönderimi), L (next-intl + namespace bölme).

---

### B3 — [YÜKSEK] Tema kontrast token'ları WCAG AA'yı geçemiyor (metin ve kontrol sınırları)

**Kanıt** (token'lardan hesaplandı, `app/globals.css:9-105`; runtime tema preset'leri `applyRuntimeThemeToRoot` ile `--primary`'yi değiştirebilir — preset'ler ayrıca doğrulanmadı)

| Çift | Oran | Gereken |
|---|---|---|
| Koyu: `text-destructive` (0 62% 30%) / arka plan | **1,93:1** | 4,5:1 |
| Koyu: `text-primary` (262 83% 58%) / arka plan | **3,49:1** | 4,5:1 |
| Açık: `--warning` metin / arka plan | **2,02:1** | 4,5:1 |
| Açık: `--success` metin / arka plan | 3,17:1 | 4,5:1 |
| Açık: `--destructive` metin / arka plan | 3,58:1 | 4,5:1 |
| Açık: beyaz / `--info` | 2,85:1 | 4,5:1 |
| Açık: `--input` kenarlık / beyaz kart (input, switch kapalı) | **1,56:1** | 3:1 (1.4.11) |
| Koyu: `--input` / kart | **1,26:1** | 3:1 |
| Koyu: switch başparmağı (`bg-background`) / kapalı iz (`bg-input`) | **1,32:1** | 3:1 |

- `components/ui/switch.tsx:13,21`: kapalı switch `bg-input` iz + `bg-background` başparmak → koyu temada kapalı switch neredeyse görünmez; bildirim/gizlilik ayarlarının tamamı bu bileşende.
- `text-destructive` 99 yerde kullanılıyor; örn. kamera hatası `app/customer/scan/page.tsx:168` — QR tarama karanlık ortamda/koyu temada en sık kullanılan akış.
- Sabit Tailwind renkleri açık zeminde: `app/c/[token]/page.tsx:230` `text-emerald-400` (1,81:1), `:357` `text-amber-400` (**1,57:1**), `:385` `text-red-400` (2,6:1), `:402-405` `text-emerald-400/70`. `dark:` eşi olmayan `text-{amber|emerald|red|green|yellow}-{300,400}` kullanımı tüm projede 90 adet; müşteri tarafında 22 dosya (bir kısmı her zaman koyu oyun tuvallerinde — onlar sorun değil, görsel doğrulama gerekir).
- `text-[9–11px]` 528 kez, `text-xs` 1.430 kez; `text-muted-foreground/NN` (opaklıkla daha da soluklaştırılmış) 75, `text-white/[0-5]x` 115 — bu kombinasyonlar 4,5:1 altına iniyor (örn. `shop-client.tsx:208` `text-muted-foreground/30` + `text-[8px]`).
- `html.high-contrast` (`globals.css:835-845`) açık temada yalnız `--border` ve `--ring`'i değiştiriyor; `--muted-foreground`, `--input`, durum renkleri aynı kalıyor → "yüksek kontrast" modu yukarıdaki ihlalleri çözmüyor.

**Öneri**
- **Token düzeyinde düzelt, sayfa düzeyinde değil:** her semantik renk için `--x` (dolgu) ve `--x-text` (metin, AA garantili) ikilisi tanımla. Örnek hedefler: koyu `--destructive-text ≈ 0 90% 70%`, koyu `--primary-text ≈ 262 90% 75%`, açık `--warning-text ≈ 32 95% 30%`. `text-destructive` gibi yardımcılar `-text` varyantına yönlensin (tailwind `colors.destructive.text`).
- `--input` için ayrı `--input-border` (≥3:1, açık ≈ `220 10% 60%`, koyu ≈ `217 15% 45%`); switch kapalı izi bu token'ı kullansın ya da başparmağa kontrastlı kenarlık eklensin.
- `high-contrast` sınıfı tüm `-text` ve `-border` token'larını AAA'ya çeksin; `@media (prefers-contrast: more)` ile otomatik açılsın.
- **Doğrulama aracı:** `scripts/contrast-check.mjs` — `globals.css` + tüm `THEME_COLOR_PRESETS` için çiftleri hesaplayıp CI'da raporlasın (admin'in seçebildiği preset'ler de dahil; admin özel renk girerse `applyRuntimeThemeToRoot` AA'yı karşılamayan `primary`'yi reddetmeli veya `-text` türevini otomatik koyulaştırmalı).
- Minimum metin boyutu politikası: bilgi taşıyan metin için `text-[11px]` altı yasak (lint), opaklıkla soluklaştırma yerine `muted-foreground` token'ı.

**Efor:** M (token + bileşen yönlendirmesi), S (kontrast betiği).

---

### B4 — [YÜKSEK] QR geri bildirim sayfası (mobil birincil giriş) ekran okuyucu ve klavye için kırık

`app/(public)/feedback/[code]/page.tsx` — QR okutan anonim müşterinin ilk ve çoğu zaman tek gördüğü ekran.

**Kanıt**
- Yıldız puanı `:319-340`: 5 bağımsız `button`, `aria-label={\`${star} star\`}` (**İngilizce sabit**, TR arayüzde de), seçim durumu yok (`aria-pressed`/`aria-checked` yok), grup semantiği yok (`radiogroup` yok), `Label` (`:317`) gruba bağlı değil → ekran okuyucu "5 star, button" der, hangisinin seçili olduğunu asla söylemez. Ok tuşlarıyla gezinme yok.
- NPS `:394-407`: 11 adet 36×36 px buton (dokunma hedefi 44 px önerisinin altında; 2.5.8'in 24 px minimumunu geçiyor), seçili durum yalnız renkle belirtiliyor (1.4.1), `aria-pressed` yok, `Label` (`:393`) bağlı değil.
- Fotoğraf yükleme `:493-501`: `<input type="file" className="hidden">` → `display:none` olduğu için **klavyeyle odaklanamaz**; saran `label`'da metin yok, yalnız kamera ikonu → klavye ve ekran okuyucu kullanıcısı fotoğraf ekleyemez.
- Fotoğraf silme `:482-488`: **20×20 px**, erişilebilir adı yok (2.5.8 ihlali + 4.1.2 ihlali).
- Hızlı seçenekler `:415-425`: sabit Türkçe dizi; EN modunda da metin kutusuna Türkçe ekleniyor (veri kirliliği: işletmeye giden yorum dili karışıyor). Seçili durumu yok.
- Personel seçimi `:366-385`: `aria-pressed` yok; ad yoksa sabit "Personel".
- Başarı ekranı `:242-265`: `<p>` içinde `<div>` (geçersiz HTML → hidrasyon uyarısı, ekran okuyucuda bölünmüş okuma); `successMsg` hem `h2` hem `p` olarak iki kez (`:241,243`); "Kazanılan", "Puan", "SEVİYE ATLADIN!", "Yeni Seviye" sabit (`:247-260`); `animate-bounce` sürekli (`:259`).
- Gönder butonu `:518-524`: puan seçilmeden `disabled` — neden pasif olduğu açıklanmıyor; `:107-109`'daki "Lütfen bir puan seçin" toast'ına hiçbir zaman ulaşılmıyor (ölü kod).
- `:362` `t(...) || 'Hangi personelimizle…'` — `t` eksik anahtarda anahtarı döndürdüğü için fallback hiçbir zaman çalışmaz (aynı desen `components/rewards/surprise-box-modal.tsx:286,334`).

**Sorun:** Ürünün kuzey yıldızı metriği (geri bildirim gönderimi) bu ekranda. Erişilebilir olmayan puanlama + yükleme hem yasal risk (EAA/erişilebilirlik mevzuatı, kamu/zincir müşterileri) hem dönüşüm kaybı.

**Öneri — `RatingInput` / `ChoiceChips` / `PhotoPicker` paylaşılan bileşenleri**
- `components/ui/rating-input.tsx`: `role="radiogroup"` + `aria-labelledby`, her yıldız `role="radio"` + `aria-checked` + yerelleştirilmiş `aria-label` ("5 üzerinden 4 yıldız"), roving tabindex + ok tuşları, 44 px hedef, hover yalnız `(hover: hover)` cihazlarda. Aynı bileşen `app/customer/consumptions/[id]/page.tsx:368` ve anket sayfalarında da kullanılsın (şu an kopyalanmış kod).
- `ChoiceChips` (NPS, hızlı seçenekler, personel): `aria-pressed` veya radiogroup, seçili durumda ikon/kenarlık (renk dışı ipucu). Hızlı seçenekler `messages` içinde `publicFeedback.quickOptions.*` olarak; işletmeye giden metin locale'den bağımsız **etiket kodu** olarak da saklanmalı (analitik için `quickTags: ['STAFF_ATTENTIVE', …]`).
- `PhotoPicker`: görünür ama `sr-only` input + `label` içinde metin ("Fotoğraf ekle, 5'ten 2'si"), silme butonu ≥24 px (tercihen 44 px dokunma alanı) + `aria-label`, yükleme sonrası `aria-live` duyurusu. Mobilde `capture="environment"` seçeneği.
- Başarı ekranı: geçerli yapı, ödül özeti `role="status"`, `animate-bounce` reduced-motion'da kapalı.
- Gönder: devre dışı bırakmak yerine her zaman aktif + satır içi hata (`aria-describedby`, odak puan grubuna).

**Efor:** M.

---

### B5 — [YÜKSEK] Mobil navigasyon: alt sekme çubuğu yok, çekmece her etkileşimde yeniden mount oluyor

**Kanıt**
- `components/dashboard/sidebar.tsx:277-316` müşteri menüsü 27 öğe / 9 blok; mobilde erişim yalnızca sol-alt FAB → çekmece (`:736-751`). "QR tara", "Kartım", "Ödüller" gibi en sık işler: FAB → grup aç → bağlantı = **3 dokunuş**; QR tara menüde hiç yok (yalnız manifest kısayolu `public/manifest.json:69-76` ve ana panel kartları).
- `:508` `const SidebarContent = ({ mobile }) => (...)` render fonksiyonu **içinde** tanımlı bir bileşen ve `<SidebarContent mobile />` olarak kullanılıyor (`:732, :749`). Her `Sidebar` render'ında yeni bileşen tipi oluşur → React alt ağacı **söküp yeniden kurar**. Sonuç: çekmecede bir grubu açınca (`toggleGroup`, `:338`) nav'ın kaydırma konumu başa döner ve odaklı grup butonu DOM'dan silinir (klavye/VoiceOver odağı kaybolur, 2.4.3). Logo `Image priority` her seferinde yeniden mount olur.
- Aktif bağlantıda `aria-current="page"` yok (`:600-612`; tüm projede yalnız 2 kullanım).
- Masaüstü daraltılmış modda bağlantılar yalnız ikon (`:613-614`), `aria-label`/`title`/tooltip yok — yorum (`:650`) "ikon tooltip" dese de tooltip kodu yok → erişilebilir adsız 27 bağlantı.
- Çıkış butonu `:708-715`: 32 px, `aria-label` yok, `LogOut` ikonu → "button" diye okunur.
- Grup başlıkları için admin override (`:471-472`) tek dilli metin döndürür → i18n'i kırar.
- Header başlığı `components/dashboard/header.tsx:348` mobilde `hidden` → mobilde sayfa başlığı header'dan kalkıyor; sayfaların kendi `h1`'i tutarlı değil (doğrulanmadı — axe taraması gerekli).

**Öneri — Mobil "uygulama kabuğu"**
- `components/customer/mobile-tab-bar.tsx`: `lg` altında sabit alt sekme çubuğu, 4–5 hedef: **Ana Sayfa · Kartım · (merkez) QR Tara · Ödüller · Menü**. Yükseklik 56 px + `env(safe-area-inset-bottom)`; `nav aria-label`, `aria-current`, etiketli ikonlar (yalnız ikon değil). "Menü" mevcut çekmeceyi açar; FAB kaldırılır → sol-alt çakışmaları da biter (bkz. B6).
- Sekme hedefleri admin görünürlük ayarlarına (`menuVisibility/moduleControls`) bağlansın; sabit kodlanmasın.
- `SidebarContent`'i modül seviyesine taşı (`function SidebarNav(props)`), `openGroups` vb. state'i prop olarak geçir; veya `useMemo` ile değil, gerçek bileşen olarak çıkar. Bu tek değişiklik kaydırma/odak kaybını çözer.
- `aria-current`, daraltılmış modda Radix `Tooltip` + `aria-label`, çıkışa `aria-label={t('appShell.signOut')}` ve 44 px.
- Grup etiketi override'ı `{ tr, en }` nesnesi olarak saklansın.

**Efor:** L (tab bar + kabuk), S (remount + ARIA düzeltmeleri).

---

### B6 — [ORTA] Alt bant çakışması ve ilk açılışta "modal fırtınası"

**Kanıt**
- Mobilde ekranın alt 1rem'lik bandında aynı anda: menü FAB'ı sol-alt `z-50` (`sidebar.tsx:738`), chatbot FAB sağ-alt `z-[45]` (`chatbot.tsx:291`), PWA bandı sol 1rem'den başlayan tam genişlik `z-[40]` (`install-banner.tsx:135`), çerez bandı aynı konumda `z-[70]` (`cookie-consent-banner.tsx:51`), çevrimdışı şeridi `z-[100]` (`offline-banner.tsx:25`), Sonner toast'ları `bottom-right` (`toaster.tsx:23`; Sonner 600 px altında tam genişlik alttan açılır). PWA bandı menü FAB'ının **altında** kalıyor (yorum `install-banner.tsx:126` bunu kabul ediyor) → bandın sol kısmı örtülü; çerez bandı açıkken FAB örtülü.
- İlk müşteri girişinde birbirinden habersiz üç katman: `OnboardingSheet` (alt sheet, `components/onboarding/onboarding-sheet.tsx:57-66`), `WelcomeVideoModal` (tam ekran dialog, `welcome-video-modal.tsx:39-60`), `CustomerBirthdayBonusHost` — artı PWA ve çerez bantları. Hiçbiri diğerini beklemiyor.
- Form doğrulama hataları yalnızca geçici toast ile veriliyor (örn. `settings/page.tsx:353,357,388,392`), satır içi hata ve `aria-invalid` yok (3.3.1).

**Öneri**
- **Tek bir "yüzen katman yöneticisi"** (`lib/ui-z.ts` zaten var; onu bir `FloatingLayerProvider`'a dönüştür): alt bant için yuva sistemi (tab bar → üstünde toast yuvası → üstünde banner yuvası), her bileşen konumunu sağlayıcıdan alır, çakışma imkânsız olur.
- **İlk açılış orkestrasyonu:** `useFirstRunQueue()` — sırayla: çerez onayı → karşılama (video **veya** onboarding, ikisi değil) → doğum günü → PWA teklifi (en az 2. oturum veya ilk başarılı geri bildirim sonrası, "değer anı"nda). Durum DB'de (`user.onboardingState`) tutulsun ki cihaz değiştirince tekrar etmesin.
- Toast konumu mobilde `top-center`; doğrulama hataları satır içi (`Input` zaten `error/errorId` destekliyor — `components/ui/input.tsx:5-9`, sadece kullanılmıyor).

**Efor:** M.

---

### B7 — [ORTA] Azaltılmış hareket tutarsız: uygulama içi tercih JS animasyonlarına ulaşmıyor

**Kanıt**
- `providers.tsx:232` `MotionConfig reducedMotion="user"` yalnızca **OS** tercihine bakar; ayarlardaki `reduce-animations` sınıfı (`lib/accessibility-prefs.ts`) yalnızca CSS'i etkiler (`globals.css:825-831`). framer-motion inline-style animasyonları (projede yaygın, örn. `app/c/[token]/page.tsx:305-315` sonsuz boxShadow nabzı) uygulama içi tercihi **yok sayar**.
- `components/ui/backgrounds/` içindeki 21 `requestAnimationFrame` tabanlı arka plandan 14'ü hiçbir hareket tercihini kontrol etmiyor (aurora, birthday, christmas, cyberpunk, fireflies, galaxy, geometric, holographic, nebula, northern-lights, particles, starfield, valentine, waves); 5'i yalnız OS medya sorgusunu, oyunlar ise yalnız `reduce-animations` sınıfını kontrol ediyor (`game-shell.tsx:15`, `boss-3d.tsx:33`) — **iki ayrı kaynak, tek bir hook yok**.
- `lib/effects/confetti.ts:20-60` 3 saniyelik tam ekran konfeti; `disableForReducedMotion` kullanımı projede 0.
- `welcome-video-modal.tsx:124-131` `autoPlay loop`, duraklatma kontrolü yok (2.2.2), altyazı `<track>` yok (projede 0) — videoda konuşma varsa 1.2.2 ihlali (içerik doğrulanmadı). `HeroSection.tsx:83-93` arka plan videosu reduced-motion'da da oynuyor.
- `accessibility-class-sync.tsx:7-9` yorumu "layout'taki init script de aynı sınıfları erkenden ekler" diyor; ama `app/layout.tsx:19-32` yalnız temayı uyguluyor → yüksek kontrast/azaltılmış hareket kullanıcısı her yüklemede önce animasyonlu/normal kontrastlı ilk boyamayı görüyor.

**Öneri**
- Tek kaynak: `hooks/use-motion-preference.ts` → `prefersReduced = osMedia || htmlClass('reduce-animations')`, `MutationObserver` ile canlı. `MotionConfig reducedMotion={prefersReduced ? 'always' : 'never'}`; tüm canvas/three.js/rAF bileşenleri ve `confetti` bu hook'u (veya eşdeğer `isReducedMotion()` fonksiyonunu) kullanır. Reduced modda arka planlar tek statik kare çizer.
- Init script'e `qratex-a11y` okuma eklenmeli (3 satır).
- Videolar: görünür oynat/duraklat, reduced-motion'da `autoPlay` yok + poster; karşılama videosuna TR/EN WebVTT.

**Efor:** M.

---

### B8 — [ORTA] Özel modallar ve yalnız-hover kontroller: dialog semantiği, Escape, odak yönetimi yok; dokunmatikte görünmez

**Kanıt**
- Rozet detay modalı `app/customer/badges/badges-client.tsx:696-750`: `fixed inset-0` Motion.div, `role="dialog"`/`aria-modal` yok, Escape yok, odak tuzağı/geri dönüşü yok, kapat butonu `:744-750` adsız.
- Sürpriz kutu modalı `components/rewards/surprise-box-modal.tsx:72`: aynı (dialog rolü yok, Escape yok). Karşılaştırma: `character-reveal.tsx:316` ve `welcome-video-modal.tsx:84` doğru yapıyor — desen projede biliniyor ama paylaşılan bir bileşene dönüşmemiş.
- Yalnız hover ile görünen etkileşimli öğeler (`opacity-0 group-hover:opacity-100`, odak eşi olmadan; 33 yer):
  - Avatar değiştirme `app/customer/settings/page.tsx:567` — dokunmatikte görünmez, adsız.
  - Panel "Profili düzenle" `customer-dashboard.tsx:478` — `pointer-events-none` + hover → **dokunmatikte erişilemez**, klavyede görünmez odak alır.
  - Favori kaldır `customer-dashboard.tsx:833-837` (`sm:` ve üstünde gizli, adsız).
  - Ekip modülü silme butonları `components/team/task-detail-sheet.tsx:469,525`, `team-board.tsx:790`, `team-departments.tsx:217` — "mobil kanban" iddiasına rağmen telefonda görünmez.
  - Mağaza "yetersiz bakiye" katmanı `shop-client.tsx:217` — bilgi yalnız hover'da.
- Tailwind 3.4'te `future.hoverOnlyWhenSupported` kapalı (`tailwind.config.ts`) → dokunmatikte "yapışkan hover".

**Öneri**
- `components/ui/fullscreen-modal.tsx`: Radix Dialog üzerine kurulu, "sinematik" modallar için (rozet, sürpriz kutu, karakter reveal) — rol, Escape, odak tuzağı, odak iadesi, `aria-labelledby` bedava gelir; görsel serbest kalır.
- Lint kuralı: `opacity-0 group-hover:opacity-100` içeren etkileşimli öğede `group-focus-within:opacity-100 focus-visible:opacity-100` ve `@media (hover: none)` için `opacity-100` zorunlu. `future: { hoverOnlyWhenSupported: true }` aç.
- Silme/düzenleme gibi eylemleri mobilde satır sonu "⋯" menüsüne (DropdownMenu) taşı.

**Efor:** M.

---

### B9 — [ORTA] Adsız ikon kontrolleri, mobilde yalnız-ikon sekmeler, etiketsiz form alanları

**Kanıt**
- Sezgisel tarama (açılış etiketinde `aria-label/title/sr-only` olmayan, metin çocuğu olmayan `Button/button`): 159 aday (admin 61, dealer 34, team 22, customer 34, public 4). Örneklem elle doğrulandı; yanlış pozitifler ayıklandıktan sonra doğrulananlar: `favorites/page.tsx:169` (çöp kutusu), `rewards/page.tsx:582` (kopyala), `customer-dashboard.tsx:833` (kalp), `showcase-selector.tsx:314` (X, 24 px), `pacman-game.tsx:667-671` (▲◀▼▶ — "black up-pointing triangle" olarak okunur), `badges-client.tsx:744`, `sidebar.tsx:708`, `feedback/[code]/page.tsx:482`.
- Mobilde yalnız ikon kalan sekmeler: `settings/page.tsx:516-541` (6 sekme, metin `hidden sm:inline` → `display:none` erişilebilirlik ağacından da düşer → **VoiceOver'da 6 adsız sekme**, görsel olarak da anlamsız ikonlar), `quests/page.tsx:455-467`, `trends/page.tsx:504`, `feedbacks/page.tsx`.
- Etiketsiz alanlar: `settings/page.tsx:649-657, 908-930` (`<Label>` var ama `htmlFor`/`id` yok → bağsız; şifre alanlarında `autoComplete="current-password|new-password"` yok → mobil şifre yöneticisi çalışmaz). `customer/scan/page.tsx:220-228` manuel kod alanı yalnız placeholder ile etiketli, `<form>` yok → mobil klavyedeki "Git" tuşu hiçbir şey yapmıyor (`onKeyDown`/`enterKeyHint` yok; projede `enterKeyHint` 0).
- Login sayfası `aria-invalid` 0, `aria-describedby` 0 (register sayfası doğru yapıyor — `register/page.tsx`).

**Öneri**
- `IconButton` bileşeni: `label` prop'u **zorunlu** (TypeScript düzeyinde), `aria-label` + isteğe bağlı tooltip üretir; `size="icon"` Button kullanımı bu bileşene taşınır. Lint: `jsx-a11y/control-has-associated-label` + `jsx-a11y/label-has-associated-control` (`eslint-plugin-jsx-a11y` projede `eslint.config.mjs`'e eklenmeli — mevcut durumu doğrulanmadı).
- Mobil sekmeler: `sr-only sm:not-sr-only` deseni (görsel gizli, erişilebilir ad korunur) ya da yatay kaydırmalı metinli sekmeler.
- `FormField` sarmalayıcı (`label`, `id`, `error`, `description` → otomatik bağlama); tüm form ekranları `<form onSubmit>` + `enterKeyHint`.

**Efor:** M.

---

### B10 — [ORTA] PWA manifesti: yön kilidi, yanlış başlangıç sayfası, ikon kalitesi

**Kanıt** (`public/manifest.json`)
- `:9` `"orientation": "portrait-primary"` → kurulu uygulamada yatay mod kilitli: **WCAG 1.3.4 (Orientation, AA)** ihlali (tablet standında / sabit montajlı cihazda kullanan, motor engelli kullanıcı).
- `:5` `"start_url": "/"` → kurulu uygulamayı açan müşteri pazarlama landing'ine (three.js arka planlı, en ağır sayfa) düşüyor; `proxy.ts:90` yalnız STAFF'ı yönlendiriyor.
- İkonlar yalnızca SVG (`:13-60`) ve içinde `<text font-family="Arial">` ile çizilmiş "Q" (`public/icons/icon-192x192.svg`) — Android başlatıcı rasterleştirmesinde font farkı riski; gradyan mavi/indigo, `theme_color` `#9333ea` mor → marka tutarsızlığı. Maskable ikon `/logo/logo.png` (500×500, `sizes: "any"`) güvenli bölge dolgusu olmadan → yuvarlak maskede kırpılma riski (görsel doğrulanmadı). PNG 192/512 yok — Lighthouse kurulabilirlik denetiminin SVG'yi kabul edip etmediği doğrulanmadı.
- `id`, `screenshots` yok (Android'in zengin kurulum diyaloğu çıkmaz); `lang: "tr"` ve kısayol adları sabit Türkçe ("Dashboard" karışık); `background_color` `#0a0a0a` açık tema kullanıcısına siyah açılış ekranı.
- Kartı kasada gösterirken ekran kararmasını önleyecek Wake Lock yok (`my-card/page.tsx`; projede `wakeLock` 0).

**Öneri**
- `orientation` kaldır (veya `any`). `start_url: "/app?source=pwa"` + `app/app/route.ts` (rol bazlı yönlendirme: CUSTOMER → `/customer`, DEALER → `/dealer`, STAFF → `/staff`, anonim → `/auth/login`). `id: "/app"`.
- Manifest'i `app/manifest.ts` ile üret (locale'e göre ad/kısayol), PNG 192/512 + ayrı maskable PNG (%10 güvenli bölge), 2 dar + 1 geniş `screenshots`. İkon setini logodan otomatik üret (sharp zaten bağımlılık).
- "Kartımı göster" tam ekran modu: Wake Lock, maksimum boyutta QR, otomatik parlaklık uyarısı.

**Efor:** S.

---

### B11 — [ORTA] Yerel biçimlendirme ve metin birleştirme i18n'i içten kırıyor

**Kanıt**
- `lib/utils.ts:73-82` `formatNumber`/`formatCurrency` sabit `'tr-TR'`; `formatRelativeTime` 31 çağrının yalnızca 10'unda locale geçiliyor.
- Sabit `toLocaleString('tr-TR')`: `my-year/page.tsx:92`, `squads/page.tsx:142,166`, `animated-number.tsx:15`, `character-card.tsx:72`, `character-reveal.tsx:547`, `pacman-game.tsx:598,652`, `squad-leaderboard.tsx:94`, `rewards/page.tsx:753`, `ai-insights/page.tsx:597`; argümansız `toLocaleString()` 19 kez (cihaz locale'i → ekrandan ekrana farklı ayraç).
- Parça-birleştirme anahtarları: 36 adet `*Prefix/*Suffix/*Before/*After` (örn. `journeyScore.currentStagePrefix/Suffix`, `pwaInstall.iosStep1Before/After`); kodda `${badge.name} ${t('…Suffix')}` (`badges-client.tsx:216`), `+${points} ${t('…pointsEarned')}` (`consumptions/[id]/page.tsx:210`) — kelime sırası dile bağlı olduğundan ölçeklenmez.
- Çoğul desteği yok: 52 `{count}` dizgesi tek biçimli ("{count} consumptions" 1 için yanlış).

**Öneri**
- `useFormatters()` hook'u (locale'i sağlayıcıdan alır): `number`, `currency`, `date`, `relative`, `points` — `Intl` nesneleri memoize. `lib/utils.ts` biçimlendiricileri bu hook'a yönlensin; doğrudan `toLocaleString` lint ile yasak.
- ICU MessageFormat'a geçiş (next-intl ile gelir): `"{count, plural, one {# tüketim} other {# tüketim}}"`, `"{name} rozetini açtın"` gibi tam cümle şablonları; Prefix/Suffix anahtarları birleştirilip silinsin.

**Efor:** L.

---

### B12 — [ORTA] Oyunlar ve tuvaller: klavye/ekran okuyucu desteği yok, ama puan kazandırıyorlar

**Kanıt** (`components/customer/games/*`)
- 21 oyunun 10'u `<canvas>` kullanıyor; hiçbirinde `role`/`aria-label` yok. `frost-catcher`, `guardian-of-trust`, `troll-slayer`, `spam-defense`, `lucky-wheel` yalnız işaretçi/dokunma ile oynanıyor (keydown 0). Skor/süre/sonuç için `aria-live` 0 dosyada.
- DOM tabanlı oyunların çoğunda (`memory-match`, `word-spot`, `truth-vs-fake`, `speed-order`…) özel klavye/odak desteği tespit edilemedi (doğrulanmadı — DOM butonları doğal olarak odaklanabilir olabilir).
- Oyunlar puan ekonomisine bağlı (bkz. points-economy) → klavye/ekran okuyucu kullanıcısı bir **kazanç kanalından** dışlanıyor.

**Öneri**
- `GameShell`'e (`game-shell.tsx`) ortak katman: `canvas` için `role="img"` + dinamik `aria-label` (durum özeti), skor/süre/oyun sonu için `aria-live="polite"` bölge, "Nasıl oynanır" metni, klavye eşlemesi (ok/space/enter) zorunlu arayüz (`GameInputAdapter`).
- Erişilebilir alternatif: her gün için en az bir "erişilebilir oyun" (DOM tabanlı, sırayla oynanan — memory-match/truth-vs-fake) aynı günlük puan tavanını sağlasın; böylece ekonomi adaleti korunur.

**Efor:** L.

---

### B13 — [DÜŞÜK-ORTA] Otomatik kalite kapısı yok

**Kanıt**
- `playwright.config.ts:15` yalnız `Desktop Chrome`; mobil cihaz projesi yok.
- axe/`@axe-core/playwright` bağımlılığı ve testi yok; `e2e/*.spec.ts`'de a11y kontrolü yok.
- `scripts/customer-responsive-scan.mjs:9-35` yalnız yatay taşma ölçüyor ve rota listesi bayat: mevcut olmayan `/customer/journey-timeline` var; `games`, `event`, `my-year`, `progress-hub`, `spending-overview`, `category-leaderboard`, `experiences`, `ekip` yok.
- `MOBILE-OPTIMIZATION-CHECKLIST.md` test kutularının hepsi boş.

**Öneri**
- Playwright'a `iPhone 13` ve `Pixel 7` projeleri; kritik akış e2e'leri (QR geri bildirim, kart aktivasyonu, tarama, ödül kullanma) mobilde koşsun.
- `@axe-core/playwright` ile rota listesi tabanlı tarama (`wcag2a, wcag2aa, wcag21aa, wcag22aa` etiketleri), ilk aşamada yalnız "critical/serious" ihlalde kır; rota listesi `sidebar.tsx`'teki `customerNavItems`'tan **üretilsin** (bayatlamasın).
- Kontrast betiği (B3) + i18n lint (B1) + responsive taramayı tek `npm run audit:ux` altında topla; CI'da PR başına koş.

**Efor:** M.

---

### Diğer gözlemler (kısa)

- `components/layout/page-transition.tsx:25` ve birçok sayfa `min-h-screen` (100vh) kullanıyor; iOS'ta adres çubuğu yüzünden taşma. Kabuk zaten `min-h-dvh` kullanıyor — tutarlılık için `min-h-dvh`'e çekilmeli (`h-screen` 10, `100vh` 5 yer).
- `app/customer/customer-shell.css:12` `overscroll-behavior-y: contain` `#dashboard-main`'e uygulanıyor ama kaydırıcı `body` (main sabit yükseklikte değil) → etkisiz kural.
- `app/offline/page.tsx:29-34` "Yeniden dene" bağlantısı mevcut sayfayı değil `/`'yi açıyor; etiket yanıltıcı. `location.reload()` olmalı.
- Grafik bileşenleri (`components/charts/*`) metin alternatifi/tablo eşdeğeri sunmuyor (müşteri tarafında kullanılmıyor; bayi/admin için geçerli).
- `customer-dashboard.tsx:873` "2 Saat Kaldı" ve `:283` boşluklu Türkçe dosya adı (`/images/badges/sürpriz kutusu.svg`) — URL-encoding ve CDN önbellek riski.
- `lang` karışık içerik: dil seçicide "English" seçeneği `lang="en"` taşımıyor (`language-switcher.tsx:74`), ekran okuyucu TR telaffuzla okur.

---

## 4. Hedef Mimari / Tasarım Önerisi

### 4.1 Locale akışı (hedef)

```
İstek ─► proxy.ts ──(cookie yoksa: Accept-Language → cookie yaz)──►
         RootLayout (RSC)
           locale = getServerLocale()          // oturum DB tercihi > cookie > header > 'tr'
           messages = loadMessages(locale, ['common','appShell', segmentNs])
           <html lang={locale}>
             <Providers locale messages>       // istemciye yalnız 1 dil, yalnız gereken namespace
               ├─ RSC sayfalar: getT(locale)   // sunucuda çeviri, istemciye metin olarak gider
               └─ Client: useT() / useFormatters()
API ─► apiError(code, params)  →  { error: { code, params }, message: t(locale, `errors.${code}`) }
Bildirim ─► { type, params }   →  okuma anında render
```

- **Kaynak gerçeklik:** `messages/{locale}/{namespace}.json` (namespace başına dosya; birleştirme betiği gereksizleşir).
- **Tip güvenliği:** anahtarlar `typeof tr` üzerinden tiplenmiş (`t('customerScan.openCamera')` derleme zamanında doğrulanır), eksik anahtar lint/CI'da yakalanır.
- **Biçimlendirme:** `useFormatters()` tek yer; ICU çoğul/seçim.

### 4.2 Mobil uygulama kabuğu (hedef)

```
┌──────────────── Header (sticky, safe-top) ────────────────┐
│ [Sayfa başlığı h1]                  [🔍] [🔔] [👤]         │
└───────────────────────────────────────────────────────────┘
│                    içerik (pb = tabbar + inset)            │
│                                                            │
│  ── toast yuvası (top-center mobil) ──                     │
│  ── banner yuvası (PWA/çerez, tabbar'ın üstünde) ──        │
┌──────────────── MobileTabBar (safe-bottom) ───────────────┐
│  Ana Sayfa   Kartım   [ QR Tara ]   Ödüller   Menü        │
└───────────────────────────────────────────────────────────┘
Chatbot: Menü içinde veya header'da ikon (FAB değil)
```

- `FloatingLayerProvider` alt bant yuvalarını yönetir; `useFirstRunQueue` ilk açılış katmanlarını sıraya koyar.
- Desktop'ta mevcut sidebar korunur (sadece remount ve ARIA düzeltmeleriyle).

### 4.3 Erişilebilirlik tasarım sistemi katmanı

| Bileşen | Sağladığı garanti |
|---|---|
| `IconButton` (label zorunlu) | Adsız ikon butonu imkânsız |
| `RatingInput`, `ChoiceChips` | radiogroup/aria-pressed, ok tuşları, 44 px |
| `PhotoPicker` | Klavyeyle erişilebilir yükleme, adlı silme |
| `FormField` | label/id/error/description otomatik bağlama |
| `FullscreenModal` | Radix Dialog semantiği + serbest görsel |
| `useMotionPreference` | OS + uygulama tercihi tek kaynak (framer, canvas, confetti, video) |
| Token seti `--x` / `--x-text` / `--x-border` | AA kontrast token düzeyinde garanti |

---

## 5. Adım Adım Geçiş Planı

**Dalga 0 — Kapılar (1 sprint, önce bunlar; yeni borcu durdurur)**
1. `eslint-plugin-jsx-a11y` (önerilen kurallar) + i18n literal kuralı — `app/customer`, `app/(public)`, `app/c`, `components/ui`, `components/customer` için `error`. (S)
2. `scripts/contrast-check.mjs` + Playwright mobil projeleri + axe taraması (critical/serious). Rota listesi `customerNavItems`'tan üretilsin. (M)

**Dalga 1 — Kritik giriş yüzeyleri (1–2 sprint)**
3. `RatingInput`, `ChoiceChips`, `PhotoPicker`, `IconButton`, `FormField` bileşenleri; QR geri bildirim sayfası (B4), kart aktivasyonu `/c/[token]` (B1 + kontrast), tarama sayfası formu (B9) bunlara taşınır ve tamamen çevrilir. (M)
4. Kontrast token düzeltmesi: `-text` / `-border` token'ları, switch, `high-contrast` genişletmesi, `prefers-contrast` (B3). (M)
5. `SidebarContent` remount düzeltmesi + `aria-current` + daraltılmış mod etiketleri + çıkış butonu (B5'in S kısmı). (S)
6. Primitive'lerdeki sabit metinler (dialog/sheet "Kapat", skip-link, offline, chatbot) çeviriye. (S)

**Dalga 2 — Locale mimarisi (1 sprint)**
7. Sunucu-otoriter locale: `<html lang>`, `initialLocale` + tek dil katalog gönderimi; öncelik sırası DB > cookie > header (B2). (M)
8. `useFormatters()`; `lib/utils.ts` biçimlendiricileri bağlanır; sabit `'tr-TR'` ve argümansız `toLocaleString` lint ile yasak (B11'in ilk yarısı). (M)
9. API hata sözleşmesi `apiError(code, params)` — önce müşteri ve public rotaları (B1). (M)

**Dalga 3 — Mobil kabuk ve deneyim (1–2 sprint)**
10. `MobileTabBar` + FAB kaldırma + `FloatingLayerProvider` + `useFirstRunQueue` (B5, B6). (L)
11. `useMotionPreference` tek kaynak; arka planlar, confetti, videolar, init script (B7). (M)
12. `FullscreenModal` ile rozet/sürpriz kutu modalları; hover-only kontrollerin düzeltilmesi; `hoverOnlyWhenSupported` (B8). (M)
13. Manifest: `orientation` kaldır, `/app` başlangıç yönlendiricisi, PNG + maskable ikonlar, `screenshots`, `app/manifest.ts` ile locale'li üretim; Kartım için Wake Lock modu (B10). (S)

**Dalga 4 — Kapsamın tamamlanması (sürekli)**
14. Müşteri sayfalarının kalan sabit metinleri (settings 66, my-card 42, dashboard 42, ai-insights 45, surprise-boxes 34…), ardından bayi, en son admin (B1). (XL, dosya başına küçük PR'lar)
15. ICU/next-intl'e geçiş, Prefix/Suffix anahtarlarının tam cümleye birleştirilmesi, çoğul biçimler (B11). (L)
16. Bildirimlerin `type + params` modeline geçişi (B1). (M)
17. Oyunlar için `GameShell` erişilebilirlik katmanı ve "erişilebilir günlük oyun" (B12). (L)

**Başarı ölçütleri**
- axe critical/serious = 0 (müşteri + public rotalar, mobil ve masaüstü).
- Kontrast betiği: tüm token çiftleri ve admin preset'leri AA.
- `app/customer` + `app/(public)` + `components/ui` + `components/customer` için sabit literal lint ihlali = 0.
- İlk yük JS: katalog payı ~98 KB gzip → tek dil + namespace ile hedef < 15 KB.
- Mobilde birincil işler (QR tara, Kartım, Ödüller) ≤ 1 dokunuş.
