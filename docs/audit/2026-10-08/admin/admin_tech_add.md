# /admin/tech/add

**Amaç:** Platform operatörünün tek ekrandan üç farklı "teknik varlık" oluşturması: özellik bayrağı (FeatureFlag), giden webhook (Webhook) ve partner API anahtarı (ApiKey). Sayfa yalnızca oluşturma formlarından ibaret; listeleme/yönetim için `/admin/features`, `/admin/webhooks`, `/admin/api-keys` sayfalarına link veriyor.

**Genel puan:** 4/10 · **Karar:** **birleştir** (üç formun da birebir kopyası kardeş liste sayfalarında zaten var; sayfa tek başına değer üretmiyor, üstelik kopyalar arasında sapma oluşmuş ve yanlış veri üretiyor)

İncelenen dosyalar: `app/admin/tech/add/page.tsx` (350 satır, tamamı), `app/admin/layout.tsx`, `components/dashboard/page-header.tsx`, `app/api/admin/features/route.ts`, `app/api/admin/webhooks/route.ts`, `app/api/admin/api-keys/route.ts`, `lib/validations-admin.ts`, `lib/webhook-dispatch.ts`, `lib/partner-api-auth.ts`, `app/api/partner/v1/{catalog,digest}/route.ts`, `app/api/internal/inngest/feature-flag-cleanup/route.ts`, `app/api/admin/tech-summary/route.ts`, `prisma/schema.prisma` (FeatureFlag, Webhook, ApiKey), kardeş sayfalar `app/admin/{features,webhooks,api-keys}/page.tsx`, `components/dashboard/sidebar.tsx`, `proxy.ts`. Kod çalıştırılmadı; tüm tespitler okuma ile doğrulandı.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Üç POST da kayıt oluşturuyor, ama oluşturulan bayrak hiçbir şeyi açıp kapatmıyor, webhook olaylarının 4'ünden 3'ü hiç tetiklenmiyor, API anahtarı scope'suz üretildiği için digest ucunda 403 alıyor. |
| UX | 4/10 | Oluşturduktan sonra kaydı görme/test etme/yönetme yolu yok; kullanıcı "oluşturuldu" toast'ından sonra boşlukta kalıyor; Enter ile gönderim yok. |
| Görsel | 5/10 | Temiz shadcn kartlar, ama kardeş sayfalar `AdminPremiumHero` kullanırken bu sayfa `PageHeader` kullanıyor; sekmeler buton yığını, hiyerarşi düz. |
| Mimari | 3/10 | Üç formun üçü de kardeş sayfalarda kopyalanmış; sabit kodlu olay listesi dispatcher tipinden ayrışmış (tek kaynak yok). |
| Performans | 8/10 | Hafif istemci bileşeni, ilk yüklemede istek yok; tek eksik layout içinde gereksiz çift padding gibi ufak şeyler. |
| Erişilebilirlik + mobil | 4/10 | `Label`'lar input'a bağlı değil, sekmeler `tablist` değil, `Link > Button` iç içe etkileşimli öğe, mobilde layout + `p-6` çift boşluk. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa başlığı (PageHeader "Teknoloji Ekle") | ÇALIŞIYOR | `page.tsx:152-155` | Kardeş sayfalar `AdminPremiumHero` kullanıyor; tutarsız. |
| 2 | Sekme çubuğu (Özellik bayrağı / Webhook / API anahtarı) | KISMİ | `page.tsx:158-175` | Çalışıyor ama `role="tablist"`/`aria-selected` yok, sekme URL'de tutulmuyor (`useState`, `:26`), dışarıdan belli sekmeye derin link verilemiyor. |
| 3 | Bayrak: Anahtar (key) alanı + otomatik normalize | KISMİ | `page.tsx:194-198`, `:47` | Yalnızca küçük harf + boşluk→`_`. Türkçe karakter, `-`, `.`, emoji kabul ediliyor; istemcide `maxLength` yok (sunucu 50, `features/route.ts:12`). |
| 4 | Bayrak: Özellik adı | ÇALIŞIYOR | `page.tsx:200-207`, `:52-55` | Boş kontrolü var. |
| 5 | Bayrak: Açıklama (opsiyonel) | ÇALIŞIYOR | `page.tsx:208-216` | İstemcide 500 sınırı yok; aşılırsa sunucu İngilizce zod mesajı döndürür. |
| 6 | Bayrak: "Varsayılan açık" switch | KISMİ | `page.tsx:32`, `:217-220` | Varsayılan `true` (sunucu varsayılanı `false`, `features/route.ts:15`). `Label` switch'e bağlı değil; etikete tıklamak hiçbir şey yapmıyor, ama `cursor-pointer` var. |
| 7 | Bayrak oluşturma (POST `/api/admin/features`) | ÇALIŞIYOR | `page.tsx:46-79`; `features/route.ts:58-113` | Benzersizlik kontrolü + audit log var. |
| 8 | Bayrağın platformdaki etkisi | SAHTE | Repo genelinde `featureFlag.findUnique/findFirst` yalnızca admin CRUD uçlarında; tüketici kod yok | Oluşturulan bayrağı hiçbir runtime kodu okumuyor; açık/kapalı olması hiçbir davranışı değiştirmiyor. |
| 9 | Bayrak: bitiş tarihi / sahip / metadata | EKSİK | API destekliyor: `features/route.ts:16-18`; cleanup: `internal/inngest/feature-flag-cleanup/route.ts:13-19` | `expiresAt` için otomatik kapatma işi var ama formda alan yok. |
| 10 | Webhook: URL alanı + doğrulama | KISMİ | `page.tsx:82-92`; `webhooks/route.ts:51-56` | Yalnızca `new URL()`. `http://`, `localhost`, özel IP, `169.254.169.254` kabul ediliyor (SSRF yüzeyi, Bulgu 4). |
| 11 | Webhook: Secret (HMAC) | KISMİ | `page.tsx:252-260` | Güvenli secret üretme yok, göster/gizle yok; secret DB'de düz metin (`schema.prisma:1218`) ve listede istemciye dönüyor (`webhooks/route.ts:16-21`). |
| 12 | Webhook: olay seçimi (4 checkbox) | BOZUK | `page.tsx:23`; `lib/webhook-dispatch.ts:15-20`; tek çağrı `app/api/feedbacks/route.ts:404` | `quest.completed`, `reward.claimed` dispatcher tipinde bile yok; `badge.earned` tipte var ama hiçbir yerde tetiklenmiyor. Yalnız `feedback.created` gerçekten gönderiliyor. |
| 13 | Hiç olay seçilmezse sessizce `feedback.created`'a düşme | KISMİ | `page.tsx:101`; `webhooks/route.ts:57-59` | Kullanıcı tüm kutuları kaldırırsa uyarı almadan başka bir aboneliğe kayıt oluyor. |
| 14 | Webhook ekleme (POST `/api/admin/webhooks`) | ÇALIŞIYOR | `page.tsx:81-115`; `webhooks/route.ts:28-86` | Rate limit + audit log var. Hata kontrolü `res.ok` değil `data.error` üzerinden (`:105`). |
| 15 | Webhook test ping / teslim doğrulama | EKSİK | — | Kardeş sayfada teslim geçmişi var (`webhooks/page.tsx:68-77`), burada yok. |
| 16 | API anahtarı: isim alanı | ÇALIŞIYOR | `page.tsx:304-311`, `:117-122` | — |
| 17 | API anahtarı: scope seçimi | EKSİK | `page.tsx:129` yalnız `{ name }`; `api-keys/route.ts:62`; `partner/v1/digest/route.ts:19-21` | Scope `null` kaydediliyor → `read:partner_digest` isteyen digest ucu 403 döner (`partner-api-auth.ts:30-34`). |
| 18 | API anahtarı oluşturma + ham anahtarı bir kez gösterme | ÇALIŞIYOR | `page.tsx:117-141`, `:312-321`; `api-keys/route.ts:59-88` | SHA-256 hash, `qrx_` önekli, ham değer yalnız bu yanıtta. |
| 19 | "Kopyala" butonu | KISMİ | `page.tsx:143-148` | `navigator.clipboard.writeText` promise'i beklenmiyor; izin reddedilse de "Panoya kopyalandı" toast'ı çıkıyor. |
| 20 | Ham anahtarın yaşam döngüsü (onay, sızıntı önleme) | KISMİ | `page.tsx:44`, `:312` | Sekme değiştirip dönünce hâlâ ekranda; "kaydettim" onayı, sayfadan çıkış uyarısı, otomatik gizleme yok. |
| 21 | API kullanım örneği (Bearer başlığı, curl) | EKSİK | Karşılaştırma: `api-keys/page.tsx:88` açıklamada var | Bu sayfada anahtarın nasıl kullanılacağı hiç söylenmiyor. |
| 22 | "Listeler" hızlı linkleri | KISMİ | `page.tsx:331-347` | Çalışıyor ama `<Link><Button/></Link>` → `<a><button>` iç içe etkileşimli öğe (geçersiz HTML, çift tab durağı). `asChild` kullanılmalı. |
| 23 | Oluşturma sonrası kaydı gösterme / yönlendirme | EKSİK | `page.tsx:70-73`, `:106-109` | Yalnızca toast + form sıfırlama; oluşan kayda link, "listeye git" ya da satır önizlemesi yok. |
| 24 | Kaydetme sırasında spinner + çift gönderim engeli | ÇALIŞIYOR | `page.tsx:221-224`, `:281-284`, `:322-325` | — |
| 25 | Hata yönetimi | KISMİ | `page.tsx:68`, `:104`, `:131` | `res.json()` korumasız; JSON olmayan yanıtta (proxy 502, gate yönlendirmesi HTML) kullanıcı "Unexpected token '<'…" gibi İngilizce ham hata görür. 429 mesajı doğru gösteriliyor. |
| 26 | Yetki kontrolü | ÇALIŞIYOR | `proxy.ts:51`, `:79`; üç route'ta `requireAuth(['ADMIN'])` | Rol + gizli kapı (gate) cookie; API uçları ayrıca korunuyor. |
| 27 | Denetim kaydı (audit log) | ÇALIŞIYOR | `features/route.ts:96-105`, `webhooks/route.ts:71-80`, `api-keys/route.ts:74-83` | Kullanıcı arayüzünde görünmüyor ama sunucuda yazılıyor. |
| 28 | Form etiket–alan ilişkisi | BOZUK | `page.tsx:193-198`, `:201`, `:209`, `:218`, `:245`, `:253`, `:305` | Hiçbir `Label`'da `htmlFor`, hiçbir input'ta `id` yok; ekran okuyucu alanları isimsiz okur. |
| 29 | Enter ile gönderme (`<form onSubmit>`) | EKSİK | Sayfada `<form>` yok | Klavye kullanıcısı her seferinde butona tab'lamak zorunda. |
| 30 | Mobil yerleşim | KISMİ | `page.tsx:151` `p-6` + `app/admin/layout.tsx:33`, `:38` | Layout zaten yatay/dikey boşluk veriyor; 400px'te her yanda ~36px boşluk kalıyor. Kardeş `features/page.tsx:181` `space-y-6` kullanıyor. |
| 31 | Çok dil (i18n) | EKSİK | Sidebar etiketi `messages/en.json:2527`'den; sayfa metinleri sabit Türkçe | EN locale'de menü "Add Technology", sayfa Türkçe. |
| 32 | Sunucu tarafı oran sınırlama | KISMİ | `webhooks/route.ts:31`, `api-keys/route.ts:36` var; `features/route.ts:58-113` yok | Ayrıca `checkAdminRateLimit` bellek içi (`lib/rate-limit.ts:303-315`), instance başına. |

**Sayım:** ÇALIŞIYOR 10 · KISMİ 12 · BOZUK 2 · SAHTE 1 · EKSİK 7 (toplam 32)

---

## Bulgular

### 1. Webhook olay listesi sahte: 4 seçenekten 3'ü hiç tetiklenmiyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / işlevsellik · **Efor:** S
- **Kanıt:** `app/admin/tech/add/page.tsx:23` → `['feedback.created', 'badge.earned', 'quest.completed', 'reward.claimed']`. Dispatcher tipi `lib/webhook-dispatch.ts:15-20` yalnızca `feedback.created | feedback.replied | remedy.created | incident.created | badge.earned`. Repo genelinde `dispatchWebhookEvent(` tek çağrısı: `app/api/feedbacks/route.ts:404` (`feedback.created`). Kardeş sayfa bu sorunu düzeltmiş ve yorumla belgelemiş: `app/admin/webhooks/page.tsx:23-30` ("Dispatcher'ın gerçekten fire ettiği olaylarla hizalı").
- **Sorun:** Operatör `quest.completed` veya `reward.claimed` seçip bir partner entegrasyonu kurduğunda, hiçbir zaman istek gelmeyecek; hata da görmeyecek. API bu değerleri doğrulamadan kabul ediyor (`lib/validations-admin.ts:82` `z.array(z.string())`). `badge.earned` iki sayfada da seçilebiliyor ama hiçbir yerde tetiklenmiyor. Kopyalanmış iki form arasında sapma, veri yanlışlığına dönüşmüş.
- **Öneri:** Olay kataloğunu tek kaynakta topla: `lib/webhook-events.ts` içinde `WEBHOOK_EVENTS = [{ id, label, description, samplePayload, emitted: true|false }] as const`; `WebhookEvent` tipi buradan türetilsin. Sunucu şeması `z.array(z.enum(EMITTED_EVENT_IDS)).min(1)` olsun; istemci listeyi aynı modülden okusun. Henüz tetiklenmeyen olaylar UI'da "yakında" olarak kapalı gösterilsin ya da hiç gösterilmesin. `badge.earned` için ödül/rozet verme yoluna (karakter rozeti atama noktası) `dispatchWebhookEvent` eklenmeli ya da listeden çıkarılmalı. Mevcut DB'de geçersiz olay içeren webhook kayıtları için tek seferlik bir denetim sorgusu ile operatöre uyarı gösterilmeli.

### 2. Özellik bayrağı oluşturmak platformda hiçbir şeyi değiştirmiyor
- **Önem:** yüksek · **Kategori:** işlevsellik / ürün doğruluğu · **Efor:** M
- **Kanıt:** `featureFlag` erişimleri yalnızca `app/api/admin/features/route.ts` (CRUD), `app/api/admin/tech-summary/route.ts:19-20` ve `app/api/admin/modules/overview/route.ts:37` (sayım) ve `app/api/internal/inngest/feature-flag-cleanup/route.ts:13` (süresi dolanı kapatma). `isFeatureEnabled`/`getFeatureFlag` benzeri bir okuyucu yok. Buna rağmen kart açıklaması "Platformda açıp kapatacağınız özellik anahtarı" (`page.tsx:187`), `/admin/features` ise "modülleri canlıda kontrollü yayınlayabilirsiniz" diyor (`app/admin/features/page.tsx:190-192`).
- **Sorun:** Operatöre bir kontrol yüzeyi vaat ediliyor ama bu yüzey hiçbir koda bağlı değil. Bir olay anında "AI analizini kapat" bayrağı oluşturup kapatan operatör, gerçekte hiçbir şeyi durdurmamış olur. Bu, operasyonel güvenlik açısından yanıltıcı.
- **Öneri:** `lib/feature-flags.ts` içinde sunucu tarafı `isFeatureEnabled(key, ctx?)` yazılmalı: Upstash Redis'te kısa TTL'li (ör. 30 sn) önbellek, DB kaynak-doğruluk, yazma uçlarında `revalidate`/cache sil. İstemci için `useFeatureFlag(key)` hook'u ve tek bir `/api/flags` (genel, yalnız açık anahtarlar) ucu. Ardından gerçek kullanım noktaları (AI analiz, push, oyunlar) bu fonksiyona bağlanmalı. Bağlanana kadar UI'da her bayrağın yanında "kodda referans yok" rozeti gösterilmeli (build sırasında üretilen anahtar manifestiyle karşılaştırma). Kıyas: Linear/PostHog'da bayrağın değerlendirme sayısı ve son değerlendirme zamanı gösterilir; bu da "ölü bayrak" sorununu görünür kılar.

### 3. API anahtarı scope'suz üretiliyor, tek gerçek uç (digest) 403 dönüyor
- **Önem:** yüksek · **Kategori:** işlevsellik / güvenlik tasarımı · **Efor:** M
- **Kanıt:** İstek gövdesi yalnız `{ name }` (`page.tsx:129`); sunucu `scope` yoksa `null` yazıyor (`app/api/admin/api-keys/route.ts:62`, `:68`). `app/api/partner/v1/digest/route.ts:19-21` `'read:partner_digest'` istiyor; `lib/partner-api-auth.ts:30-34` scope dizisinde yoksa 403. `catalog` ucu scope istemiyor (`partner/v1/catalog/route.ts:10`), yani anahtarın tek işe yaradığı yer statik katalog.
- **Sorun:** Operatör partner için anahtar üretip veriyor, partner digest'i çekmeye çalışınca "Gerekli yetki: read:partner_digest" alıyor; arayüzden scope eklemenin yolu da yok (anahtarlar düzenlenemiyor). Ayrıca anahtarda son kullanma tarihi, rotasyon ve IP kısıtı yok; `lastUsedAt` her istekte DB'ye yazılıyor (`partner-api-auth.ts:36-39`).
- **Öneri:** Oluşturma akışına scope seçici (checkbox grubu, `lib/partner-integration-catalog.ts`'ten beslenen; "en az yetki" varsayılanı), opsiyonel `expiresAt` ve ortam etiketi (test/canlı, önek `qrx_test_`/`qrx_live_`) eklensin. Şema: `ApiKey`'e `expiresAt`, `revokedAt` alanları; silme yerine iptal (audit için). `lastUsedAt` yazımı Redis'te biriktirilip dakikada bir toplu yazılsın (projede token-replay için aynı desen var). Stripe Dashboard'daki "restricted key" deneyimi hedef alınmalı: anahtar oluşturulurken kaynak bazlı izin matrisi.

### 4. Webhook URL'si için SSRF koruması yok; secret düz metin ve listede istemciye dönüyor
- **Önem:** orta · **Kategori:** güvenlik · **Efor:** M
- **Kanıt:** İstemci `new URL(url)` (`page.tsx:87-92`), sunucu aynı (`app/api/admin/webhooks/route.ts:51-56`); şema/host kısıtı yok. Dispatcher sunucudan doğrudan `fetch(webhook.url)` yapıyor (`lib/webhook-dispatch.ts:43`) ve hata mesajını AnalyticsEvent'e yazıyor (`:113`), bu da teslim geçmişinde operatöre geri yansıyor (blind SSRF sinyali). `secret` `@db.Text` düz metin (`prisma/schema.prisma:1218`); `GET /api/admin/webhooks` `secret`'i dışlamadan dönüyor (`webhooks/route.ts:16-21`). İmzada zaman damgası yok (`webhook-dispatch.ts:42-48`) → yeniden oynatma (replay) koruması yok.
- **Sorun:** Yalnız ADMIN (ve gizli kapı) erişebildiği için doğrudan sömürü riski sınırlı, ama ele geçirilmiş bir admin oturumu iç ağ/metadata uçlarını yoklayabilir; secret'lar her liste çağrısında tarayıcıya iniyor.
- **Öneri:** `lib/safe-url.ts`: yalnız `https:`, DNS çözümlemesi sonrası özel/loopback/link-local aralıkları reddet (oluşturma anında ve teslim anında). Secret'ı sunucuda üret (`whsec_` + 32 bayt), oluşturma yanıtında bir kez göster, DB'de uygulama anahtarıyla şifrele (AES-GCM); GET yanıtında yalnız `hasSecret: true` dön. İmzayı `t=<unix>,v1=<hmac(t.body)>` biçimine geçir (Stripe deseni) ve partner dokümanında 5 dk tolerans belirt.

### 5. Üç formun da kopyası kardeş sayfalarda var; sayfa kendi başına değer üretmiyor
- **Önem:** orta · **Kategori:** mimari / bilgi mimarisi · **Efor:** M
- **Kanıt:** Bayrak oluşturma diyalogu `app/admin/features/page.tsx:113-116`, `:255-308`; webhook formu `app/admin/webhooks/page.tsx:86-108`; API anahtarı formu `app/admin/api-keys/page.tsx:40-63`, `:91-123` (bu sayfadaki `:117-148` ile neredeyse satır satır aynı). Sidebar'da dört ayrı giriş: `components/dashboard/sidebar.tsx:206`, `:221`, `:222`, `:225`. `/admin/features` bu sayfaya, bu sayfa da `/admin/features`'a link veriyor (`features/page.tsx:196`, `page.tsx:335`).
- **Sorun:** Bulgu 1'deki sapma doğrudan bu kopyalamanın sonucu. Kullanıcı aynı işi dört menü girişinden yapabiliyor; hangisinin "doğru" yer olduğu belirsiz. Bakım maliyeti üç kat.
- **Öneri:** Bkz. "Çakışmalar". Formlar `components/admin/integrations/{feature-flag-form,webhook-form,api-key-form}.tsx` olarak tek bileşene çıkarılsın; sayfa kaldırılıp `/admin/tech/add` → `/admin/integrations?create=webhook` yönlendirmesi eklensin.

### 6. Oluşturma sonrası akış çıkmaz sokak; doğrulama/test adımı yok
- **Önem:** orta · **Kategori:** UX · **Efor:** M
- **Kanıt:** Başarıda yalnız toast + form sıfırlama: `page.tsx:70-73`, `:106-109`, `:133-135`. Yanıttaki `feature`/`webhook` nesnesi kullanılmıyor (`features/route.ts:107`, `webhooks/route.ts:81`).
- **Sorun:** Operatör ne oluşturduğunu göremiyor, webhook'un ulaşılabilir olduğunu doğrulayamıyor, bayrağı hemen kapatamıyor. Stripe'ta webhook endpoint oluşturulduktan sonra detay sayfasına gidilir ve "Send test event" sunulur.
- **Öneri:** Oluşturma bir sheet/diyalogda yapılsın; başarı halinde detay görünümüne geçilsin: webhook için "Test olayı gönder" (yeni `POST /api/admin/webhooks/:id/test`, `deliverOne` yeniden kullanılır, sonuç satır içi gösterilir), API anahtarı için hazır `curl` örneği, bayrak için anında aç/kapa ve "kodda kullanım" bilgisi.

### 7. Form erişilebilirliği: etiketler alanlara bağlı değil, sekmeler semantik değil, iç içe etkileşimli öğe
- **Önem:** orta · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:** `htmlFor`/`id` yok: `page.tsx:193-198`, `:201-206`, `:209-215`, `:218-219`, `:245-250`, `:253-259`, `:305-310`. Sekmeler düz `Button` (`:164-173`), `role="tablist"`/`aria-selected`/ok tuşu gezintisi yok. `<Link><Button/></Link>` (`:335-345`). Olay checkbox'ları native ve stilsiz (`:266-275`), proje genelindeki shadcn `Checkbox` ile tutarsız. `<form>` olmadığından Enter ile gönderim yok.
- **Öneri:** shadcn `Tabs` (Radix; klavye ve aria hazır) + `Form`/`FormField` (react-hook-form + zod, sunucuyla aynı şema paylaşılarak) kullanılsın. Linkler `Button asChild` ile. Doğrulama hataları `aria-invalid` + `aria-describedby` ile alan altında gösterilsin, toast yerine.

### 8. Hata yönetimi JSON olmayan yanıtlarda ham İngilizce istisna gösteriyor; kopyalama sahte başarı bildiriyor
- **Önem:** düşük · **Kategori:** hata yönetimi / dil · **Efor:** S
- **Kanıt:** `await res.json()` korumasız: `page.tsx:68`, `:104`, `:131`; catch bloğu `e.message`'ı doğrudan toast'a basıyor (`:75`, `:111`, `:137`). Webhook ve API anahtarında `res.ok` hiç kontrol edilmiyor (`:105`, `:132`). Kopyalama: `:145-146` promise beklenmiyor.
- **Sorun:** Gate cookie süresi dolduğunda proxy HTML yönlendirme döndürürse kullanıcı "Unexpected token '<', \"<!DOCTYPE\"..." görür. Pano izni reddedilirse kullanıcı anahtarı kopyaladığını sanıp sayfadan çıkar ve ham anahtar sonsuza dek kaybolur.
- **Öneri:** Ortak `adminFetchJson()` yardımcı fonksiyonu (status'a göre Türkçe mesaj, 401/403'te gate'e yönlendirme, 429'da `Retry-After` gösterimi). Kopyalama `await` edilsin, hata halinde metni seçili hale getirip "Ctrl+C ile kopyalayın" denilsin; ham anahtar kutusunda "Kaydettim" onayı olmadan kapatma engellensin.

### 9. Bayrak anahtarı normalizasyonu zayıf; varsayılan "açık" riskli
- **Önem:** düşük · **Kategori:** veri bütünlüğü · **Efor:** S
- **Kanıt:** `page.tsx:47`, `:196` yalnız `toLowerCase().replace(/\s/g,'_')`; sunucu yalnız uzunluk kontrolü (`features/route.ts:12`). Varsayılan `featureEnabled = true` (`page.tsx:32`) iken API varsayılanı `false` (`features/route.ts:15`). `findUnique` → `create` arasında yarış: eşzamanlı istekte P2002 → genel 500 "oluşturulamadı" (`features/route.ts:74-93`, `:108-111`).
- **Öneri:** Hem istemci hem sunucuda `^[a-z][a-z0-9_]{2,49}$` regex'i (Türkçe karakterler `ı→i` translit). Yeni bayrak varsayılan kapalı olsun (güvenli yayın ilkesi). P2002 yakalanıp 409 "Bu key zaten kullanılıyor" dönsün. Features POST'una da `checkAdminRateLimit` eklensin.

### 10. Görsel tutarsızlık ve mobil boşluk
- **Önem:** düşük · **Kategori:** görsel / mobil · **Efor:** S
- **Kanıt:** `PageHeader` (`page.tsx:152`) vs kardeşlerde `AdminPremiumHero` (`webhooks/page.tsx:123`, `api-keys/page.tsx:86`). Kök `p-6` (`page.tsx:151`) layout'un `pl/pr` + `py` boşluğunun üstüne ekleniyor (`app/admin/layout.tsx:33`, `:38`). Üç kartta üç farklı ikon kutusu sınıf yazımı (`:182` vs `:234`, `:294`). Sayfa metinleri sabit Türkçe, menü etiketi i18n'den (`messages/en.json:2527`).
- **Öneri:** Admin sayfa iskeleti (`AdminPageShell`) tek bir başlık bileşeni ve padding kuralı ile standartlaştırılsın; metinler `next-intl` anahtarlarına taşınsın.

---

## Eksik özellikler (kıyas: Stripe Dashboard, Linear, PostHog, Retool)

1. **Webhook test olayı ve teslim günlüğü** (Stripe: "Send test webhook", istek/yanıt gövdesi, yeniden deneme). Burada yalnız oluşturma var; teslim geçmişi sadece kardeş sayfada özet olarak var.
2. **Kısıtlı (scoped) ve süreli API anahtarı, rotasyon, iptal** (Stripe restricted keys, "Roll key" ile eski anahtara geçiş süresi).
3. **Bayrak hedefleme ve kademeli yayın** (PostHog/LaunchDarkly: yüzde rollout, rol/bayi segmenti, ortam, değerlendirme sayısı, "son kullanım"). Mevcut model yalnız boolean.
4. **Değişiklik geçmişi görünümü**: audit log yazılıyor ama ilgili varlığın yanında "kim, ne zaman, ne değişti" zaman çizelgesi yok.
5. **Webhook secret'ın sunucuda üretilmesi + imza doğrulama kod örnekleri** (Node/PHP snippet).
6. **Komut paleti / hızlı oluşturma** (Linear: `C` kısayolu ile her yerden oluştur) — ayrı bir "ekle" sayfası yerine.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör "Entegrasyonlar" adlı tek bir merkezde üç varlık türünü görür, yönetir ve oluşturur; oluşturma her zaman bağlam içinde (liste üzerinde açılan bir sheet) olur ve oluşturulan kaydın doğrulanmasıyla (test ping, curl, bayrak kullanım durumu) biter. Ayrı bir "Teknoloji Ekle" sayfası kalmaz.

**Yerleşim:**
- `/admin/integrations` — üstte üç özet kutu (bayrak açık/kapalı, webhook aktif + son 24 saat başarı oranı, API anahtarı + son kullanım), altında shadcn `Tabs`: *Özellik bayrakları · Webhook'lar · API anahtarları*. Sekme `?tab=` parametresinde tutulur.
- Her sekmede: arama + filtre (durum, olay, scope) içeren tablo; sağ üstte "Yeni …" butonu → sağdan açılan `Sheet` (mobilde tam ekran alt sayfa).
- Sheet adımları: *Form* → *Sonuç* (webhook: secret bir kez + "Test gönder" butonu ve satır içi yanıt kodu; API anahtarı: ham anahtar + "Kaydettim" onayı + curl örneği; bayrak: aç/kapa + "kodda N yerde kullanılıyor").
- `/admin/tech/add?type=webhook` → `/admin/integrations?tab=webhooks&create=1` kalıcı yönlendirme (dashboard'daki "Ekle" butonu `admin-dashboard-client.tsx:566` ve features linki `features/page.tsx:196` güncellenir).

**Motion/3D:** 3D gereksiz; bu bir operasyon aracı. Ölçülü motion yeterli: sheet giriş/çıkışı (Radix'in kendi geçişi), test ping sonucunda durum rozetinin `m` ile 150 ms renk geçişi, yeni satırın tabloya hafif vurguyla girişi. `useReducedMotion` ile hepsi anlık geçişe düşmeli. Ham anahtar kutusunda dikkat çekici ama sakin bir amber kenarlık nabzı (bir kez) yeterli.

**Veri/API değişiklikleri:**
- `lib/webhook-events.ts` (tek olay kataloğu) + şemada `z.enum`.
- `POST /api/admin/webhooks/:id/test`, `PATCH /api/admin/webhooks/:id` (aktif/pasif, olaylar), GET'ten `secret` çıkarılması, secret şifreleme.
- `ApiKey`: `expiresAt`, `revokedAt`, `environment`; `POST /api/admin/api-keys/:id/roll`.
- `lib/feature-flags.ts` (`isFeatureEnabled` + Redis önbellek) ve `FeatureFlag`'e opsiyonel `rolloutPercent`, `targeting Json`.
- Paylaşılan form bileşenleri `components/admin/integrations/*` ve istemci–sunucu ortak zod şemaları (`lib/validations-admin.ts`'ten import).

---

## Çakışmalar / birleştirme önerisi

- **`/admin/features`** — bayrak oluşturma diyaloğu zaten var (`app/admin/features/page.tsx:255-308`); bu sayfadaki bayrak formu birebir kopya.
- **`/admin/webhooks`** — webhook oluşturma formu + liste + teslim geçmişi var; bu sayfadaki form onun **eski ve hatalı** kopyası (olay listesi sapması, Bulgu 1).
- **`/admin/api-keys`** — anahtar oluşturma formu satır satır aynı (`api-keys/page.tsx:40-123` ↔ `page.tsx:117-148`, `:290-328`).
- **`/admin/modules`, `/admin/api-catalog`** — aynı "teknoloji/entegrasyon" alanına dağılmış diğer girişler; Entegrasyonlar merkezine bağlanmalı (bu raporda derinlemesine okunmadı, yalnız sidebar konumu doğrulandı: `sidebar.tsx:223-224`).

**Öneri:** `/admin/tech/add` **kaldırılsın** ve işlevi `/admin/features`, `/admin/webhooks`, `/admin/api-keys`'in tek bir `/admin/integrations` merkezinde birleştirilmesiyle karşılansın. Sidebar'daki dört giriş (`sidebar.tsx:206`, `:221`, `:222`, `:225`) tek girişe insin. Geçiş süresince eski URL'ler yönlendirme ile korunmalı.

---

## Doğrulama (şüpheci inceleme)

İnceleme salt okunur yapıldı; kod, veritabanı ve sunucu çalıştırılmadı. Her iddia, çağıran ve çağrılan taraflarıyla birlikte baştan okundu.

### 1. Webhook formu hiç tetiklenmeyen olaylara abonelik oluşturuyor: **DOĞRULANDI**
- `app/admin/tech/add/page.tsx:23` dört olay sunuyor; `lib/webhook-dispatch.ts:15-20` `WebhookEvent` tipinde `quest.completed` ve `reward.claimed` yok.
- Repo genelinde (`app`, `lib`, `components`) `dispatchWebhookEvent` için **tek** çağrı var: `app/api/feedbacks/route.ts:403-404` (`feedback.created`). Yani `badge.earned` de dahil, `feedback.created` dışındaki hiçbir olay fiilen ateşlenmiyor.
- Sunucu doğrulaması `lib/validations-admin.ts:82` `z.array(z.string())`: bilinmeyen olay adı sessizce kabul ediliyor; `app/api/admin/webhooks/route.ts:57-66` olduğu gibi yazıyor.
- **Yeniden üretim:** Bu sayfada yalnız `reward.claimed` işaretlenip webhook kaydedilir → "Webhook eklendi" toast'u gelir → hiçbir koşulda POST gönderilmez, `/admin/webhooks` teslim özetinde hiç kayıt oluşmaz; hata da gösterilmez.
- **Düzeltme notu (iddiaya ek):** "Kardeş `/admin/webhooks` sayfası listeyi düzeltmiş" ifadesi kısmen yanlış. `app/admin/webhooks/page.tsx:23-30` yorumu "dispatcher'ın gerçekten fire ettiği olaylarla hizalı" diyor, ama tipteki `feedback.replied`, `remedy.created`, `incident.created`, `badge.earned` için de hiçbir çağıran yok. Kardeş sayfa yalnız *tiple* hizalı, *gerçek tetikleyicilerle* değil. Doğru çözüm: tek bir olay kataloğu (`lib/webhook-events.ts`) içinde her olayın "yayında/planlı" durumunu tutmak, sunucu şemasını `z.enum(LIVE_EVENTS)` yapmak ve iki formu bu katalogdan beslemek; ya da eksik olayların dispatch çağrılarını ilgili yazma yollarına (rozet kazanımı, yanıt, remedy, incident) eklemek.

### 2. Özellik bayrakları hiçbir davranışı kontrol etmiyor: **DOĞRULANDI**
- `featureFlag` / `FeatureFlag` / `/api/admin/features` geçen tüm dosyalar (node_modules ve üretilmiş client hariç): `app/admin/features/page.tsx`, bu sayfa, `app/api/admin/features/route.ts` (CRUD), `app/api/admin/tech-summary/route.ts:19-20` ve `app/api/admin/modules/overview/route.ts:37` (sayım), `app/api/internal/inngest/feature-flag-cleanup/route.ts:13` + `lib/inngest/functions.ts:124` (süresi dolanı kapatma), `prisma/seed.ts`. Bayrak değerini okuyup bir davranışı dallandıran hiçbir tüketici yok; `isFeatureEnabled` benzeri yardımcı mevcut değil.
- Seed'deki anahtarlar (`gamification`, `ai_analysis`, `push_notifications`, `leaderboard`, `vip_club`, `dark_mode`, `light_mode`) kod tabanında bayrak olarak okunmuyor. `lib/module-controls.ts:49`'daki `feature_flags` ayrı bir modül-kontrol kaydı, FeatureFlag tablosunu okumuyor; gerçek özellik anahtarlaması `lib/innovation-config.ts` (`features.*`) üzerinden yürüyor.
- **Yeniden üretim:** Operatör olay anında `ai_analysis` bayrağını kapatır → `/admin/features`'ta "kapalı" görünür → AI analiz akışı aynen çalışmaya devam eder. Arayüz (`page.tsx:187` "Platformda açıp kapatacağınız özellik anahtarı") yanlış bir güvence veriyor.
- Etki doğrudan veri kaybı değil, ama kill-switch sanılan şeyin işlememesi somut bir operasyonel risk. Çözüm: ya `lib/feature-flags.ts` (Redis önbellekli `isFeatureEnabled(key)`) yazılıp kritik yollar bağlanmalı ve bayrak listesinde "kodda kullanılıyor/kullanılmıyor" rozeti gösterilmeli, ya da bayrak yüzeyi `innovation-config` ile birleştirilip bu tablo kaldırılmalı.

### 3. Bu sayfadan üretilen API anahtarı partner digest ucunda 403 alıyor: **DOĞRULANDI**
- `page.tsx:129` yalnız `{ name }` gönderiyor; `app/api/admin/api-keys/route.ts:62,68` `scope` gelmezse `null` → `undefined` yazıyor.
- `app/api/partner/v1/digest/route.ts:19-21` `'read:partner_digest'` istiyor; `lib/partner-api-auth.ts:30-34` scope boşsa 403 `Gerekli yetki: read:partner_digest` döndürüyor. Yalnız `app/api/partner/v1/catalog/route.ts:10` scope istemiyor.
- Anahtarın scope'unu sonradan düzenleyen bir uç yok (`app/api/admin/api-keys/route.ts` yalnız GET/POST/DELETE); kardeş `/admin/api-keys` sayfası da (`app/admin/api-keys/page.tsx:48-51`) yalnız `{ name }` gönderiyor. Arayüzden scope'lu anahtar üretmenin yolu yok; yalnız elle `fetch` ile `scope` gönderen bir admin bunu yapabilir.
- **Yeniden üretim:** Bu sayfada "Partner X" anahtarı oluşturulur → `curl -H "Authorization: Bearer qrx_..." /api/partner/v1/digest` → `403 {"error":"Gerekli yetki: read:partner_digest"}`. Partner entegrasyonu arayüzden kurulamıyor.
- Önem: güvenlik değil, işlevsel kırılma (orta). Çözüm: sunucuda bilinen scope kataloğu (`z.enum`), formda scope çoklu seçimi (varsayılan en az yetki), `PATCH /api/admin/api-keys/:id` ile scope güncelleme ve listede scope rozetleri.

### 4. Webhook URL'sinde SSRF koruması yok, secret düz metin ve liste GET'inde dönüyor: **DOĞRULANDI (düşük–orta önem, bir alt iddia düzeltildi)**
- SSRF: `page.tsx:87-92` ve `app/api/admin/webhooks/route.ts:51-56` yalnız `new URL()` ile biçim kontrolü yapıyor; şema (`http/https`), host, özel IP/loopback/link-local kontrolü yok. `lib/webhook-dispatch.ts:43` sunucu tarafında `fetch` ediyor (yönlendirmeleri varsayılan olarak izler); sonuç `status` ve `err.message` (`:53-59`, `:108-113`) AnalyticsEvent'e yazılıp `app/admin/webhooks/page.tsx:222-225`'te gösteriliyor → kör SSRF + durum kodu kehaneti. Tetikleme için `feedback.created` gerekiyor; bunu herhangi bir müşteri QR akışı üretebilir.
- Secret: `prisma/schema.prisma:1218` düz metin `String?`; `app/api/admin/webhooks/route.ts:16-20` `include` kullanıyor, `select` ile dışlamıyor → tüm webhook secret'ları GET yanıtında tarayıcıya iniyor (`app/admin/webhooks/page.tsx:16` tipte `secret` alanı var). POST yanıtı (`:81`) da secret'ı geri döndürüyor.
- Ön koşul: Uçlar `requireAuth(['ADMIN'])` + `proxy.ts:79-84` gizli kapı cookie'si arkasında. Somut senaryo yalnız ele geçirilmiş bir admin oturumuyla (ör. XSS veya çalınmış oturum) kurulabiliyor: saldırgan GET ile tüm secret'ları okur ve partnerlere geçerli imzalı sahte webhook gönderebilir ya da iç ağ adreslerini yoklayabilir. Bu yüzden KRİTİK/YÜKSEK değil, savunma derinliği bulgusu.
- **Düzeltme (iddiaya karşı):** "İmzada timestamp olmadığından replay koruması yok" kısmen yanlış. `lib/webhook-dispatch.ts:94-98` `timestamp`'i imzalanan gövdenin içine koyuyor; alıcı gövdedeki `timestamp`'i doğrulayarak tazelik penceresi uygulayabilir. Eksik olan, başlıkta ayrı bir `X-Qratex-Timestamp` ve benzersiz teslim kimliği (`X-Qratex-Delivery-Id`), yani alıcı tarafında standart bir replay/idempotency sözleşmesi. Bu bir sertleştirme önerisi, açık değil.
- Çözüm: Kayıt ve teslim anında URL doğrulayıcı (yalnız `https`, DNS çözümü sonrası özel/loopback/link-local/metadata aralıklarını reddet, `redirect: 'manual'`); secret'ı uygulama anahtarıyla şifreleyip GET/POST yanıtlarından çıkarmak (yalnız oluşturma anında bir kez göster, sonra "yeniden üret"); teslim başlıklarına timestamp + delivery-id eklemek.

### Özet
| # | İddia | Karar | Gerçek önem |
|---|-------|-------|-------------|
| 1 | Tetiklenmeyen webhook olayları | Doğrulandı (kardeş sayfa da kısmen etkilenmiş) | Yüksek (sessiz entegrasyon kırılması) |
| 2 | Özellik bayrakları etkisiz | Doğrulandı | Yüksek (yanlış kill-switch güveni) |
| 3 | Scope'suz API anahtarı → digest 403 | Doğrulandı | Orta (işlevsel) |
| 4 | SSRF + düz metin secret GET'te | Doğrulandı, replay alt iddiası düzeltildi | Düşük–orta (yalnız admin ele geçirilirse) |

## Uygulama (Dalga 2)

**Yeni yer:** `/admin/integrations` (Entegrasyon Merkezi) — sekmeler: API anahtarları · Webhook'lar · Partnerler · API kataloğu · Dokümantasyon. Eski rota `permanentRedirect` ile ilgili sekmeye yönlenir (sorgu parametreleri korunur).

**Mimari:** BFF `/api/admin/integrations/*` (hepsi `defineRoute`: ADMIN + zod + Redis'li rate limit + idempotency; `requireAuth` artık admin gizli kapısını da API'de doğruluyor). Servis `lib/integrations/server.ts`; sözleşme `lib/integrations/contract.ts` (kapsam + olay kataloğu tek kaynak); meta zarfı `lib/integrations/meta.ts`; SSRF `lib/integrations/url-safety.ts`; sır kasası `lib/integrations/secret-box.ts`; UI `components/admin/a-entegrasyonlar/**` (QDL v2 PanelPage/SectionTabs/DataTable/DetailSheet/QueryState, ops kaydı, azaltılmış hareket). Sunucu bileşeni KPI + aktif sekmenin ilk verisini ön yükler; katalog ve dokümantasyon sekmeleri lazy. Testler: `__tests__/lib/integrations.test.ts` (23 test).

**Şema kısıtı:** Şema dalgası kapalı olduğu için yaşam döngüsü alanları mevcut Json kolonlarında sürümlü zarfla tutuluyor (`ApiKey.scope` → `{v:2, scopes, dealerId, partnerId, expiresAt, revokedAt, suffix, ipAllowlist…}`, `Webhook.events` → `{v:2, events, description, partnerId, archivedAt, disabledReason, secretHint}`, `Partner.metadata` → irtibat/bayiler/arşiv). Okuyucular eski dizi biçimini de anlar.

**Karar uygulandı: birleştir.** `/admin/tech/add` kaldırıldı ve kalıcı yönlendirmeye dönüştü: `?type=webhook` → Webhook'lar sekmesi + yeni webhook diyaloğu, `?type=apikey` → API anahtarları + yeni anahtar diyaloğu, diğer (özellik bayrağı) → `/admin/features` (bayrak oluşturma oradaki diyalogda; o yüzeyin sahibi ayrı).

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum |
|---|---|---|
| 1 | PageHeader | KALDIRILDI — sayfa yönlendirme |
| 2 | Sekme çubuğu | ÇALIŞIYOR (taşındı) — merkezde Radix `SectionTabs`, URL'de `?tab=` |
| 3–7 | Bayrak formu alanları ve oluşturma | KALDIRILDI (bu yüzeyden) — `/admin/features` diyaloğu tek yer |
| 8 | Bayrağın platform etkisi | KALAN (sahiplik dışı) — `/admin/features` yüzeyinin konusu |
| 9 | Bayrak bitiş tarihi/sahip | KALDIRILDI (bu yüzeyden) — `/admin/features` |
| 10 | Webhook URL + doğrulama | ÇALIŞIYOR (taşındı) — https + SSRF |
| 11 | Webhook secret | ÇALIŞIYOR (taşındı) — sunucuda üretim, bir kez göster, şifreli saklama, GET'te yok |
| 12 | Olay seçimi | ÇALIŞIYOR (taşındı) — yalnız tetiklenen olaylar, sunucuda `z.enum` (`quest.completed`/`reward.claimed` artık kaydedilemez) |
| 13 | Sessiz varsayılan olay | ÇALIŞIYOR — en az bir olay zorunlu |
| 14 | Webhook ekleme | ÇALIŞIYOR (taşındı) |
| 15 | Test ping | ÇALIŞIYOR — oluşturma sonrası test adımı |
| 16 | API anahtarı isim | ÇALIŞIYOR (taşındı) |
| 17 | Kapsam seçimi | ÇALIŞIYOR (taşındı) |
| 18 | Ham anahtar bir kez | ÇALIŞIYOR (taşındı) |
| 19 | Kopyala | ÇALIŞIYOR — başarısızlık gizlenmez |
| 20 | Ham anahtar yaşam döngüsü | ÇALIŞIYOR — "kaydettim" onayı, kilitli diyalog, kapanınca silinir |
| 21 | cURL örneği | ÇALIŞIYOR |
| 22 | "Listeler" linkleri | KALDIRILDI — oluşturma liste üzerinde bağlam içinde |
| 23 | Oluşturma sonrası yönlendirme | ÇALIŞIYOR — yeni kayıt listede + detay çekmecesi; webhook'ta test adımı |
| 24 | Spinner + çift gönderim engeli | ÇALIŞIYOR + Idempotency-Key |
| 25 | Hata yönetimi | ÇALIŞIYOR — JSON olmayan yanıtta Türkçe mesaj, 401 açıklaması |
| 26 | Yetki | ÇALIŞIYOR |
| 27 | Audit | ÇALIŞIYOR — transaction, UI'da Etkinlik |
| 28 | Etiket–alan ilişkisi | ÇALIŞIYOR |
| 29 | Enter ile gönderme | ÇALIŞIYOR |
| 30 | Mobil | ÇALIŞIYOR |
| 31 | i18n | KALAN — tam Türkçe; EN kapsam dışı |
| 32 | Rate limit | ÇALIŞIYOR — Redis öncelikli (bayrak POST'u `/admin/features` yüzeyinde) |

### Kapanan bulgular
1 sahte olay listesi · 3 kapsamsız anahtar · 4 SSRF + secret · 5 kopya formlar (sayfa kaldırıldı) · 6 çıkmaz sokak (test/cURL/detay) · 7 erişilebilirlik · 8 hata/kopyala · 10 görsel tutarsızlık/mobil. **Toplam 8/10.**

### Kalanlar (sahiplik dışı)
- Bulgu 2 (bayrakların etkisizliği) ve 9 (bayrak anahtarı normalizasyonu/varsayılan) `/admin/features` yüzeyine ait.
