# /admin/accessibility

**Amaç:** Platform operatörüne/ekibe WCAG 2.2'nin dört ilkesini (Algılanabilir–Kullanılabilir–Anlaşılır–Sağlam) hatırlatan, dış referanslara (W3C, MDN, Deque axe) ve ilgili iç sayfalara (tasarım dili, CWV/RUM, e-posta ayarları) bağlantı veren statik bir bilgi sayfası.

**Genel puan: 4/10** · **Karar: birleştir** (`/admin/design-language` ile tek bir "Kalite standartları" merkezine birleştir ve erişilebilirlik bölümünü gerçek veriye dayalı bir "Erişilebilirlik sağlığı" panosuna dönüştür)

Kapsam: `app/admin/accessibility/page.tsx` (112 satır), `app/admin/accessibility/layout.tsx` (10 satır), `components/admin/admin-premium-hero.tsx`, `components/ui/card.tsx`, `lib/panel-surface.ts`, `lib/app-locale` (`useAppT`), `messages/tr.json` + `messages/en.json` (`adminAccessibility.*`), `app/admin/layout.tsx`, `proxy.ts`, bağlantı hedefleri (`app/admin/observability/page.tsx`, `app/admin/settings/settings-client.tsx`, `app/admin/design-language/page.tsx`). Sayfa **hiçbir API ucu çağırmıyor, hiçbir Prisma modeli kullanmıyor, hiçbir state tutmuyor** (`page.tsx` içinde `fetch`/`useSWR`/server action yok).

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Bağlantıların hepsi çalışıyor ama sayfa başlığında vaat edilen "kontrol listesi" yok; tek işlev 4 sabit metin + 7 bağlantı. |
| UX | 4/10 | Operatöre bir karar ya da aksiyon sunmuyor; "ne durumdayız?" sorusuna cevap vermiyor, alakasız bir bağlantı (e-posta ayarları) bilgi mimarisini bulandırıyor. |
| Görsel | 6/10 | Panel tasarım diliyle (premium hero, accent şeritli kartlar) tutarlı ve temiz; ancak accent renkleri anlamsız dönüşümlü ve ikon "checklist" ima ediyor. |
| Mimari | 5/10 | Durumsuz içerik için `'use client'` gereksiz; `/admin/design-language` ile neredeyse birebir kopya iskelet; bağlantı sınıfları 7 kez kopyalanmış. |
| Performans | 9/10 | Veri yok, ağ yok; tek maliyet hero'nun `next-themes` + `useReducedMotion` istemci hidrasyonu. |
| Erişilebilirlik + mobil | 7/10 | Global `:focus-visible` halkası, `aria-hidden` ikonlar, mobilde tek sütun düzgün; fakat başlık hiyerarşisi h1→h3 atlıyor ve yeni sekmede açılan bağlantılar ekran okuyucuya bildirilmiyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Rota yetkisi (yalnız ADMIN + gizli kapı cookie'si) | ÇALIŞIYOR | `proxy.ts:51`, `proxy.ts:79-84`, `proxy.ts:124` | Sayfa veri taşımadığı için IDOR yüzeyi yok. |
| 2 | Sayfa metadata'sı (başlık/açıklama, TR/EN) | ÇALIŞIYOR | `app/admin/accessibility/layout.tsx:4-6`, `messages/tr.json:157-158` | Açıklama "kontrol listesi" diyor; içerik buna uymuyor (bkz. #6). |
| 3 | Premium hero (eyebrow, h1 başlık, açıklama, ikon) | ÇALIŞIYOR | `page.tsx:22-28`, `components/admin/admin-premium-hero.tsx:148-...` (h1) | `tone="auto"` tema ile uyumlu. |
| 4 | Hero'da azaltılmış hareket desteği (nefes animasyonu, ping noktası, `animate-in`) | ÇALIŞIYOR | `admin-premium-hero.tsx:35-43`, `:73`, `:125`, eyebrow ping `useReducedMotion` korumalı | `MotionConfig reducedMotion="user"` global: `components/providers.tsx:232`. |
| 5 | Giriş/uyarı paragrafı ("hukuki denetim yerine geçmez") | ÇALIŞIYOR | `page.tsx:30`, `messages/tr.json:2766` | Doğru ve gerekli bir sorumluluk reddi. |
| 6 | "WCAG odaklı kontrol listesi" — 4 ilke kartı | SAHTE | `page.tsx:18`, `page.tsx:32-45`, `messages/tr.json:2764` | Başlık "kontrol listesi" diyor; kartlar yalnızca birer cümlelik ipucu. İşaretlenebilir madde, ilerleme, sahiplik, tarih yok. |
| 7 | Kart ikonu `ListChecks` | KISMİ | `page.tsx:38` | Görsel olarak "işaretlenebilir liste" vaadini güçlendiriyor; etkileşim yok → yanıltıcı affordance. |
| 8 | Kart accent rengi (cyan/emerald dönüşümlü) | KISMİ | `page.tsx:35` | `i % 2` ile atanıyor, anlam taşımıyor (ör. durum/öncelik değil). |
| 9 | Referans: WCAG 2.2 Quick Reference | ÇALIŞIYOR | `page.tsx:11`, `page.tsx:54-62` | `rel="noopener noreferrer"` doğru. |
| 10 | Referans: MDN Accessibility | ÇALIŞIYOR | `page.tsx:12`, `page.tsx:63-71` | Sabit `en-US`; TR arayüzde de İngilizce kaynağa gider (MDN'de TR karşılığı sınırlı, kabul edilebilir). |
| 11 | Referans: Deque axe kuralları | ÇALIŞIYOR | `page.tsx:13`, `page.tsx:72-80` | Projede axe entegrasyonu olmadığı için kopuk bir referans (bkz. Bulgu 2). |
| 12 | Dış bağlantılarda "yeni sekmede açılır" bildirimi | EKSİK | `page.tsx:56`, `:65`, `:74` (`target="_blank"`), ikon `aria-hidden` (`:61`) | Ekran okuyucu kullanıcısına bağlam değişikliği söylenmiyor (WCAG 3.2.5 / G201 danışma tekniği). |
| 13 | İç bağlantı: Tasarım dili özeti | ÇALIŞIYOR | `page.tsx:85-90` → `app/admin/design-language/page.tsx` | Karşılıklı bağlantı: `design-language/page.tsx:57-62`. |
| 14 | İç bağlantı: Performans ve CWV bölümü (`#core-web-vitals`) | ÇALIŞIYOR | `page.tsx:91-96` → `app/admin/observability/page.tsx:218` | Çapa mevcut, `scroll-mt-24` ile. |
| 15 | İç bağlantı: Panel RUM örnekleri (`#rum-web-vitals`) | ÇALIŞIYOR | `page.tsx:97-102` → `app/admin/observability/page.tsx:282` | Çapa mevcut. |
| 16 | İç bağlantı: E-posta gönderimi (`/admin/settings?tab=auth`) | KISMİ | `page.tsx:103-108` → `settings-client.tsx:173`, `:282` | Teknik olarak çalışıyor ama erişilebilirlikle ilgisi yok; bilgi mimarisini bulandırıyor (kopya-yapıştır kalıntısı, `design-language/page.tsx:70-75` ile aynı). |
| 17 | TR/EN çeviri anahtarları | ÇALIŞIYOR | `messages/tr.json:2762-2794`, `messages/en.json:2762-2794` | Tüm anahtarlar her iki dilde mevcut; dil karışıklığı yok. |
| 18 | Navigasyon kaydı (sidebar + hızlı erişim) | ÇALIŞIYOR | `components/dashboard/sidebar.tsx:205`, `app/admin/admin-utils.ts:97`, `messages/tr.json:2508` | Hızlı erişim etiketi sabit TR (`admin-utils.ts:97`) — dosyanın genel deseni, bu sayfaya özgü değil. |
| 19 | Başlık hiyerarşisi | KISMİ | h1: `admin-premium-hero.tsx` (h1), kartlar `CardTitle` = `h3` (`components/ui/card.tsx:44`) | h2 seviyesi atlanıyor; erişilebilirlik sayfasının kendisinde 1.3.1 iyi uygulamasına aykırı. |
| 20 | Klavye odak görünürlüğü | ÇALIŞIYOR | `app/globals.css:131-133` (global `:focus-visible` ring) | Bağlantılarda yerel `focus-visible` sınıfı yok ama global kural kapsıyor. |
| 21 | "Ana içeriğe atla" + odaklanabilir `<main>` | ÇALIŞIYOR | `app/admin/layout.tsx:31`, `:35-39` | Layout seviyesinde. |
| 22 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:21` (`max-w-4xl`), `:32` (`sm:grid-cols-2`), `:53` (`flex-col sm:flex-row`), `:84` (`flex-wrap`) | 400px'te tek sütun; bağlantı hedefleri ~40px yüksekliğinde (`py-2`/`py-2.5`), 24px minimumun üstünde. |
| 23 | Yükleniyor / boş / hata durumları | — (uygulanamaz) | Sayfada veri yükü yok | Gerçek veri eklenirse gerekecek. |
| 24 | Otomatik erişilebilirlik taraması (axe/Lighthouse) sonuçları | EKSİK | `package.json:22-23` (playwright var), `e2e/*.spec.ts` içinde axe yok, `@axe-core/playwright` bağımlılığı yok | Sayfa axe'a bağlantı veriyor ama projede axe çalışmıyor. |
| 25 | Sayfa/rota bazlı uyumluluk durumu (hangi ekran hangi kriteri geçiyor) | EKSİK | — | Kıyas ürünlerde standart. |
| 26 | Kullanıcı erişilebilirlik tercihlerinin benimsenme istatistiği | EKSİK | Tercihler mevcut: `lib/accessibility-prefs.ts:10-22`, `components/settings/accessibility-toggles.tsx`, `app/customer/settings/page.tsx:1025`, `app/dealer/settings/page.tsx:991`, kalıcılık `app/api/customer/settings/route.ts:27-34`, `:98` (`Settings` tablosu, `user_settings_<id>`) | Admin bu veriyi hiç görmüyor. |
| 27 | Durumsuz içerik için istemci bileşeni | KISMİ | `page.tsx:1` (`'use client'`) | Sunucu bileşeni olabilirdi (hero client kalarak). |

**Durum sayımı:** ÇALIŞIYOR 16 · KISMİ 6 · BOZUK 0 · SAHTE 1 · EKSİK 4 (uygulanamaz: 1)

---

## Bulgular

### 1. Başlık "kontrol listesi" vaat ediyor, içerik yalnızca dört cümlelik ipucu
- **Önem:** yüksek · **Kategori:** işlevsellik / ürün dürüstlüğü
- **Kanıt:** `messages/tr.json:2764` (`"title": "WCAG odaklı kontrol listesi"`), `messages/tr.json:158` (metadata "WCAG odaklı kontrol listesi"), `page.tsx:32-45` (kartlar yalnızca `title` + `hint`), `page.tsx:38` (`ListChecks` ikonu)
- **Sorun:** Operatör sayfaya bir kontrol listesi bekleyerek geliyor; karşısına işaretlenemeyen, sahibi/tarihi olmayan, WCAG başarı kriterlerine (ör. 1.4.3, 2.4.7, 2.5.8) bile bağlanmayan dört genel cümle çıkıyor. "Kontrol listesi" etiketi ve onay işaretli ikon, var olmayan bir işlevi ima ediyor — bu SAHTE kategorisinde.
- **Profesyonel öneri:** İki yoldan biri seçilmeli: (a) Kısa vadede başlığı dürüst hale getir ("WCAG ilkeleri ve referanslar") ve ikonu `BookOpen` gibi bilgi ikonuna çevir. (b) Hedef: gerçek, sürüm-kontrollü bir kontrol listesi. Maddeler `lib/a11y-checklist.ts` içinde tipli sabitler olarak (id, WCAG SC numarası, seviye A/AA, ilke, test yöntemi manuel/otomatik, ilgili bileşen) tanımlanır; durum (geçti/kaldı/kapsam dışı, not, son kontrol eden, tarih) `Settings` tablosunda `a11y_checklist_state` anahtarıyla JSON olarak ya da ayrı bir `A11yCheck` modeliyle tutulur; `PATCH /api/admin/a11y/checklist` ucu `requireAdmin` + zod + denetim günlüğü (`/admin/compliance` ile aynı audit akışı) ile yazar. UI: ilke başına gruplanmış, ilerleme çubuklu, filtrelenebilir (seviye, durum) satır listesi.
- **Efor:** S (a) / M (b)

### 2. Projede otomatik erişilebilirlik testi yok; sayfa bu boşluğu görünmez kılıyor
- **Önem:** yüksek · **Kategori:** kalite süreci / gözlemlenebilirlik
- **Kanıt:** `page.tsx:13` (axe kurallarına bağlantı), `package.json:22-23` (`playwright test`), `e2e/` (auth, critical-flows, smoke, squad-management, surveys — hiçbirinde axe yok), `eslint.config.mjs:4` yalnızca `eslint-config-next/core-web-vitals` (jsx-a11y'nin sınırlı alt kümesi)
- **Sorun:** Admin sayfası "axe kurallarına bakın" diyor ama ürün, regresyonları yakalayacak hiçbir otomatik tarama çalıştırmıyor. 100+ admin rotası, müşteri/bayi panelleri, three.js sahneleri ve yoğun framer-motion kullanımı olan bir üründe bu, erişilebilirlik borcunun sessizce birikmesi demek. Sayfa, operatöre "her şey yolunda" hissi veriyor çünkü hiçbir sinyal göstermiyor.
- **Profesyonel öneri:** `@axe-core/playwright` ekleyip mevcut `e2e/smoke.spec.ts` rotalarında `new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag22aa']).analyze()` çalıştır; CI'da sonuçları JSON artefakt olarak sakla ve kritik ihlalde build'i kır (önce "baseline" dosyası ile mevcut borcu dondur, yeniyi engelle). Sonuçları `POST /api/admin/a11y/scan-results` (CI token'ı ile) üzerinden `A11yScanRun` + `A11yViolation` (rota, kural id, etki: critical/serious/moderate/minor, düğüm sayısı, ilk görülme, son görülme) modellerine yaz. Bu sayfa da bu tabloyu okusun. ESLint tarafında `jsx-a11y/recommended` kurallarını açıkça ekle (`eslint.config.mjs`).
- **Efor:** L

### 3. Ürünün gerçekten çalışan erişilebilirlik özellikleri admin'e hiç yansımıyor
- **Önem:** orta · **Kategori:** veri / ürün içgörüsü
- **Kanıt:** `lib/accessibility-prefs.ts:1-22` (renk körü modu, yüksek kontrast, animasyon azaltma — `<html>` sınıfı olarak uygulanıyor), `components/settings/accessibility-toggles.tsx`, `app/customer/settings/page.tsx:1025`, `app/dealer/settings/page.tsx:991`, `app/api/customer/settings/route.ts:27-34` ve `:98` (`prisma.settings`, anahtar `user_settings_<id>`)
- **Sorun:** Kullanıcılar bu tercihleri açıyor ve DB'ye yazılıyor; ancak admin kaç kullanıcının yüksek kontrast/renk körü/azaltılmış hareket kullandığını, hangi rolde yoğunlaştığını bilmiyor. Bu, rozet küresi/3B sahneler/kutlama animasyonları gibi yoğun görsel özelliklerin önceliklendirilmesinde doğrudan karar verisi.
- **Profesyonel öneri:** `GET /api/admin/a11y/prefs-summary` — `Settings` tablosunda `key LIKE 'user_settings_%'` satırlarının `value->'preferences'` alanlarını Postgres JSON operatörleriyle tek sorguda say (`COUNT(*) FILTER (WHERE (value->'preferences'->>'highContrast')::boolean)` vb.), `user.role` ile join'leyerek rol kırılımı ver; Upstash Redis'te 10 dk önbellekle (projedeki mevcut cache deseni). Ayrıca `prefers-reduced-motion` gibi işletim sistemi seviyesindeki tercihleri `WebVitalsReporter`'ın (`app/admin/layout.tsx:44`) zaten gönderdiği RUM yüküne tek bir boolean olarak eklemek düşük maliyetli ve anonim bir sinyal olur. UI: üç KPI kutusu + rol kırılımı mini çubuk grafik.
- **Efor:** M

### 4. Alakasız "E-posta gönderimi" bağlantısı ve kopya iskelet
- **Önem:** orta · **Kategori:** bilgi mimarisi / mimari
- **Kanıt:** `page.tsx:103-108` (`/admin/settings?tab=auth`), aynısı `app/admin/design-language/page.tsx:70-75`; iki sayfanın iskeleti satır satır aynı (`page.tsx:21-45` ↔ `design-language/page.tsx:22-43`)
- **Sorun:** Erişilebilirlik sayfasında SMTP/Resend ayarına bağlantı vermenin bir gerekçesi yok (e-posta şablonlarının erişilebilirliği kastedildiyse bu açıkça söylenmeli ve ilgili yer `/admin/intern-emails` şablonları olurdu). İki sayfa aynı kalıptan kopyalanmış "statik bilgi kartı" sayfaları; navigasyonda iki ayrı giriş (`sidebar.tsx:199` ve `:205`) ile yer kaplıyor ama tek başına ikisi de karar verdirmiyor.
- **Profesyonel öneri:** Bağlantıyı kaldır ya da "E-posta şablonlarının erişilebilirliği (alt metin, kontrast, düz metin sürümü)" olarak yeniden çerçevele ve şablon düzenleyicisine yönlendir. Uzun vadede iki sayfayı birleştir (bkz. Çakışmalar).
- **Efor:** S

### 5. Erişilebilirlik sayfasının kendi erişilebilirlik kusurları
- **Önem:** düşük · **Kategori:** erişilebilirlik
- **Kanıt:** Başlık atlaması: hero h1 (`admin-premium-hero.tsx`, h1) → `CardTitle` h3 (`components/ui/card.tsx:44`), arada h2 yok (`page.tsx:37`, `:50`). Yeni sekme: `page.tsx:56`, `:65`, `:74` `target="_blank"`, dış bağlantı ikonu `aria-hidden` (`:61`, `:70`, `:79`).
- **Sorun:** Ekran okuyucu kullanıcıları başlık listesinde (rotor) h1'den doğrudan h3'e iniyor; dış bağlantıların yeni sekmede açıldığı yalnızca görsel ikonla anlatılıyor. Bir erişilebilirlik rehberi sayfasının bu kusurları taşıması güvenilirliği zedeler.
- **Profesyonel öneri:** Bölümleri `<section aria-labelledby>` + `<h2>` ile sar ("WCAG ilkeleri", "Referanslar", "İlgili paneller"); kartlarda `CardTitle`'ı `asChild` ya da `as="h3"` deseniyle h2 altında tut. Dış bağlantılar için ortak bir `ExternalLink` bileşeni oluştur: `<span className="sr-only">(yeni sekmede açılır)</span>` + i18n anahtarı, tek yerde `rel`/`target` ve odak stilleri. Bu bileşen sistem genelinde yeniden kullanılır.
- **Efor:** S

### 6. Durumsuz içerik için `'use client'` ve tekrar eden sınıf dizeleri
- **Önem:** düşük · **Kategori:** mimari / performans
- **Kanıt:** `page.tsx:1`; aynı uzun `className` dizesi 3 kez (`page.tsx:58`, `:67`, `:76`) ve 4 kez (`:87`, `:93`, `:99`, `:105`)
- **Sorun:** Sayfa yalnızca çeviri ve statik JSX içeriyor; tüm ağaç istemciye gönderiliyor ve hidrasyon gerektiriyor. Sınıf tekrarları stil sapmasına davetiye.
- **Profesyonel öneri:** Sayfayı sunucu bileşeni yap, çeviriyi `getServerLocale()` + `t()` (`app/admin/layout.tsx:8-9` deseni) ile al; yalnızca `AdminPremiumHero` istemci kalsın. Bağlantıları `{ href, labelKey, external }` dizisinden `map` ile üret.
- **Efor:** S

### 7. Anlamsız accent rengi ve ilke çevirisi
- **Önem:** düşük · **Kategori:** görsel / içerik
- **Kanıt:** `page.tsx:35` (`i % 2 === 0 ? 'cyan' : 'emerald'`); `messages/tr.json:2769-2770` ("Operable" → "Kullanılabilir")
- **Sorun:** Renk bir kodlama gibi görünüyor ama hiçbir bilgi taşımıyor (rengin tek başına anlam taşımaması ilkesinin tersine, burada anlamsız renk var). "Kullanılabilir" Türkçede "usability" ile karışır; W3C'nin yetkili Türkçe çevirisindeki terimle karşılaştırılmalı (doğrulanmadı).
- **Profesyonel öneri:** Renk, gerçek veri geldiğinde ilke başına durum (geçen/kalan oranı) için kullanılsın; o zamana kadar tek nötr accent. İlke adlarını W3C yetkili çevirisine hizala.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

Kıyas: Stripe Dashboard'un "health" kartları, Linear'ın tarama-sonucu → issue akışı, PostHog'un oturum/olay tabanlı içgörüleri, Retool iç araçları.

1. **Otomatik tarama panosu:** Son CI/axe çalışmasının özeti (kritik/ciddi/orta/küçük ihlal sayısı, rota bazlı ısı haritası, trend çizgisi, "yeni eklenen ihlaller" farkı).
2. **Gerçek, durumlu kontrol listesi:** WCAG 2.2 AA başarı kriterlerine bağlı maddeler; durum, sahip, son doğrulama tarihi, kanıt notu; denetim günlüğü.
3. **Kullanıcı tercih istatistikleri:** Yüksek kontrast / renk körü / azaltılmış hareket benimsenmesi, rol kırılımı; OS `prefers-reduced-motion` oranı (RUM'dan).
4. **İhlalden iş kalemine akış:** Bir ihlal satırından tek tıkla `/admin/ekip` kanbanına görev açma (ekip modülü zaten mevcut; bağlantı "rota + kural + düğüm seçici" ile önceden doldurulur).
5. **Kontrast denetleyicisi:** Tema paletindeki (`/admin/themes`) token çiftleri için otomatik WCAG kontrast oranı tablosu; açık/koyu tema ve "high-contrast" sınıfı için ayrı ayrı.
6. **Erişilebilirlik beyanı (accessibility statement) yönetimi:** Kamuya açık beyan sayfasının içeriğini, bilinen kısıtları ve iletişim kanalını yönetme; son güncelleme tarihi.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör sayfayı açtığında üç soruya 5 saniyede cevap alır: (1) Şu an kaç kritik erişilebilirlik ihlalimiz var ve artıyor mu? (2) Hangi ekranlar en kötü? (3) Kullanıcılarımızın ne kadarı erişilebilirlik ayarlarına ihtiyaç duyuyor? Referanslar ve ilke açıklamaları ikincil, katlanabilir bir "Rehber" bölümüne iner.

**Yerleşim (masaüstü, tek sayfa, üç bölüm):**
1. **Üst şerit — sağlık KPI'ları** (4 kutu): kritik ihlal sayısı (son taramaya göre + 7 gün farkı), ciddi ihlal, taranan rota sayısı / toplam, kontrol listesi tamamlanma yüzdesi. Hero küçültülüp sağ tarafa "Son tarama: 3 saat önce · CI #1234" durumu eklenir.
2. **Orta — ihlaller tablosu:** rota, kural (axe id + WCAG SC), etki rozeti, düğüm sayısı, ilk görülme; filtre (etki, rota grubu: admin/customer/dealer/public), arama, sıralama; satır aksiyonu "Görev oluştur" (ekip modülü) ve "Kural belgesi" (axe dış bağlantısı burada bağlamsal olarak anlam kazanır).
3. **Sağ/alt — kullanıcı tercihleri kartı:** üç tercih için benimsenme oranı + rol kırılımı mini çubukları.
4. **Alt — kontrol listesi** (manuel kriterler: klavye tuzağı, ekran okuyucu akışı, 3B sahnelerin alternatif metni vb.) ve katlanabilir **Rehber** (mevcut 4 ilke + referanslar).

**Mobil:** KPI'lar 2×2 ızgara; tablo satırları kart listesine dönüşür (rota + etki rozeti + sayı), filtreler alt sayfa (sheet) içinde.

**Motion/3D:** Bu sayfa bir operasyon aracı; 3D yersiz. Ölçülü motion: KPI sayılarında `m as Motion` ile kısa sayaç geçişi (≤300 ms), yeni ihlal satırlarında tek seferlik vurgu; tümü global `MotionConfig reducedMotion="user"` ve kullanıcı tercihi `reduce-animations` sınıfıyla kapanır. Hero'nun nefes animasyonu bu sayfada kaldırılabilir — erişilebilirlik sayfasında sürekli hareket ters mesaj verir.

**Veri/API değişiklikleri:**
- Prisma: `A11yScanRun { id, createdAt, commitSha, source, routeCount, totals Json }`, `A11yViolation { id, runId, route, ruleId, impact, wcagTags String[], nodeCount, firstSeenAt, lastSeenAt }`, isteğe bağlı `A11yCheck { id, criterionId, status, ownerId, note, checkedAt }`. (Şema değişiklikleri canlı Neon'a dikkatle, migration ile.)
- API: `POST /api/admin/a11y/scan-results` (CI token + imza), `GET /api/admin/a11y/summary` (Redis cache), `GET /api/admin/a11y/violations?impact=&route=&cursor=`, `PATCH /api/admin/a11y/checklist/:id` (`requireAdmin` + zod + audit), `GET /api/admin/a11y/prefs-summary`.
- CI: Playwright + `@axe-core/playwright`; baseline dosyasıyla "yeni ihlal" kapısı.
- Build-time DB fail-safe kuralına uygun: özet helper'ları try/catch + varsayılan değer döndürmeli.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/design-language`** (`app/admin/design-language/page.tsx`): Aynı iskelet (hero + 4 statik kart + bağlantı satırı), aynı alakasız e-posta bağlantısı, birbirine karşılıklı bağlantı. İkisi de "ekip için hatırlatma notu" niteliğinde ve tek başına karar verdirmiyor. **Öneri:** Tek bir `/admin/quality` ("Kalite standartları") merkezinde iki sekme: "Tasarım dili" ve "Erişilebilirlik". Eski rotalar kalıcı yönlendirme (`redirect`) ile korunur; sidebar'da (`components/dashboard/sidebar.tsx:199`, `:205`) ve hızlı erişimde (`app/admin/admin-utils.ts:95`, `:97`) tek giriş kalır.
- **`/admin/observability`** (`#core-web-vitals`, `#rum-web-vitals`): Performans verisi orada yaşamalı; erişilebilirlik sayfası yalnızca bağlantı vermeli (şu anki durum doğru). RUM yüküne `prefers-reduced-motion` eklenirse, ham veri observability'de, özet erişilebilirlik sekmesinde gösterilir.
- **`/admin/compliance`** (KVKK & Denetim): Erişilebilirlik beyanı ve kontrol listesi denetim günlüğü, uyumluluk alanıyla doğal bağ kurar; audit olayları aynı günlüğe yazılmalı, ayrı bir günlük icat edilmemeli.
- **Kaldırma değil, dönüştürme:** Sayfa bugünkü haliyle düşük değerli olsa da ürünün gerçek bir erişilebilirlik özelliği (`lib/accessibility-prefs.ts`) ve test altyapısı (Playwright) var; bu sayfa o ikisini birbirine bağlayan tek yer olmaya aday.

---

## Uygulama (Dalga 2)

Rota `/admin/accessibility` emekliye ayrıldı → `/admin/design-system?tab=erisilebilirlik` (kalıcı yönlendirme). Sekme: `components/admin/a-tasarim-sistemi/a11y/a11y-tab.tsx`; sunucu `lib/design-system/a11y.server.ts`, liste `lib/design-system/a11y-checklist.ts`; BFF `GET /api/admin/design-system/a11y`, `PATCH /api/admin/design-system/a11y/checklist` (`defineRoute`, ADMIN, zod, rate limit). Şema değişmedi: liste durumu `Settings.a11y_checklist_v1`, tercihler mevcut `Settings.user_settings_<id>.preferences`.

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum |
|---|---|---|
| 1 | Rota yetkisi | ÇALIŞIYOR. |
| 2 | Metadata ("kontrol listesi" vaadi) | ÇALIŞIYOR — vaat artık gerçek (bkz. 6). |
| 3 | Premium hero | KALDIRILDI → ortak `PageHeader`. |
| 4 | Hero nefes animasyonu | KALDIRILDI — erişilebilirlik ekranında sürekli hareket yok. |
| 5 | Hukuki uyarı | ÇALIŞIYOR — "Rehber ve referanslar" kartında. |
| 6 | "Kontrol listesi" (SAHTE) | ÇALIŞIYOR — 21 WCAG 2.2 A/AA kriteri, Qratex'e özgü test yönergesi, durum (Geçti/Kaldı/Kapsam dışı/Denetlenmedi), "Kaldı" için zorunlu not, kim/ne zaman, ilerleme çubuğu, duruma göre süzme; iyimser kilit (409) + denetim kaydı. |
| 7 | `ListChecks` ikonu | ÇALIŞIYOR — gerçekten işaretlenebilir listenin ikonu. |
| 8 | Anlamsız accent | KALDIRILDI — renk yalnız durum taşır. |
| 9–11 | Dış referanslar | ÇALIŞIYOR — WCAG 2.2 hızlı başvuru, W3C Türkçe yetkili çeviri, MDN. Axe bağlantısı kaldırıldı (projede axe yok). |
| 12 | "Yeni sekmede açılır" bildirimi (EKSİK) | ÇALIŞIYOR — `sr-only` metin. |
| 13 | İç bağlantı: Tasarım dili | ÇALIŞIYOR — aynı sayfada sekme. |
| 14 | İç bağlantı: CWV | ÇALIŞIYOR — rehber "Kaynaklar" kartında. |
| 15 | İç bağlantı: RUM | ÇALIŞIYOR. |
| 16 | E-posta bağlantısı | KALDIRILDI — konu dışıydı. |
| 17 | TR/EN anahtarları | ÇALIŞIYOR (TR) — W3C ilke adları: Algılanabilir, İşletilebilir, Anlaşılabilir, Sağlam. |
| 18 | Navigasyon kaydı | ÇALIŞIYOR — tek giriş (registry, navigasyon ajanı). |
| 19 | Başlık hiyerarşisi | ÇALIŞIYOR — h1 → h2 (kart) → h3 (ilke grupları). |
| 20 | Odak görünürlüğü | ÇALIŞIYOR — özel düğmelerde `focus-visible` halkası. |
| 21 | Ana içeriğe atla | ÇALIŞIYOR (layout). |
| 22 | Mobil yerleşim | ÇALIŞIYOR — 2×2 KPI, tablolar kendi kabında kayar, ≥ 44px hedefler. |
| 23 | Yükleniyor/boş/hata | ÇALIŞIYOR — `QueryState`. |
| 24 | Otomatik tarama sonuçları (EKSİK) | KALDIRILDI (dürüst not) — `@axe-core/playwright` kurulumu (npm install yasak) ve tarama modeli (şema) gerekir; ekranda "otomatik tarama henüz CI'a bağlı değil" yazılır, sahte sayı yok. Yerine canlı kontrast sözleşmesi + tüm tema paletleri için kontrast tablosu. |
| 25 | Rota bazlı uyumluluk (EKSİK) | KISMİ — tarama verisi yok; el ile liste kriter bazında; tasarım uyum raporu (rehber sekmesi) dosya bazında. |
| 26 | Tercih benimsenmesi (EKSİK) | ÇALIŞIYOR — yüksek kontrast / animasyon azaltma / renk körü / büyük yazı, rol kırılımı; tek SQL, 10 dk Redis; "yalnız hesaba kaydedilenler" açıkça yazılır. |
| 27 | Gereksiz `'use client'` | ÇALIŞIYOR — sayfa sunucu bileşeni; sekme tembel istemci adası. |

### Kapanan bulgular
1 (gerçek kontrol listesi), 3 (tercih istatistikleri), 4 (alakasız bağlantı + kopya iskelet → tek merkez), 5 (başlık hiyerarşisi, yeni sekme bildirimi), 6 (sunucu bileşeni, tekrar eden sınıflar), 7 (anlamsız accent, W3C terimleri). **6/7.**

### Kalanlar
- Bulgu 2 (otomatik axe taraması + CI kapısı): bağımlılık kurulumu ve şema gerekir. **ŞEMA İSTEĞİ:** `A11yScanRun { id, createdAt, commitSha, source, routeCount, totals Json }`, `A11yViolation { id, runId, route, ruleId, impact, wcagTags String[], nodeCount, firstSeenAt, lastSeenAt }`.
- İhlalden ekip kanbanına görev açma ve erişilebilirlik beyanı yönetimi yapılmadı (tarama verisi ve yasal içerik sahibi gerekli).
- RUM'a OS `prefers-reduced-motion` sinyali eklenmedi (observability yüzeyinin sahipliği).
