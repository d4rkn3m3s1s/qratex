# /dealer/billing

**Amaç:** Bayinin (işletme sahibinin) mevcut planını, abonelik durumunu ve QR kotasını görmesi; Stripe Checkout ile plan satın alması/değiştirmesi ve Stripe Billing Portal üzerinden aboneliğini (kart, iptal) yönetmesi. Ürünün gelir döngüsünün tek self-servis giriş noktası.

**Genel puan: 4.5/10** · **Karar: yeniden tasarla** (sayfa iskeleti ve API ayrımı sağlam; ancak abonelik iş mantığında para/veri bütünlüğü açıkları var ve sayfa bir "faturalama merkezi" olmaktan çok "plan listesi" düzeyinde.)

Kapsam: `app/dealer/billing/page.tsx` (218 satır, tek istemci bileşeni), `app/dealer/layout.tsx`, `app/api/dealer/billing/route.ts`, `app/api/dealer/billing/checkout/route.ts`, `app/api/dealer/billing/portal/route.ts`, `lib/billing-core.ts`, `lib/stripe.ts`, `lib/plan-limits.ts`, `app/api/webhooks/stripe/route.ts`, `prisma/schema.prisma` (`PricingPlan` 1430-1452, `User` 111-118), `lib/admin-toast.ts`, `components/ui/card.tsx`, `components/ui/badge.tsx`, ilişkili yerler (`app/api/qr-codes/route.ts`, `app/dealer/qr-codes/page.tsx`, `app/api/dealer/onboarding/route.ts`, `app/api/admin/pricing/route.ts`, `app/admin/pricing/page.tsx`, `components/landing/PricingSection.tsx`).

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | İlk abonelik satın alma ve portal açma çalışıyor; ama mevcut abone için "plan değiştir" ikinci bir abonelik açıyor, webhook senkronu sıra/plan eşlemesinde kırılgan, fatura geçmişi/ödeme yöntemi/şube kotası yok. |
| UX | 4/10 | Plan değişikliğinin etkisi (proration, tarih, ne kaybedilir) hiç anlatılmıyor; "İletişime geçin" ölü buton; ödeme dönüşünde sayfa kendini yenilemiyor; iptal edilmiş abonelikte "Yenileme" tarihi gösteriliyor. |
| Görsel | 5/10 | shadcn kartlarıyla temiz ama jenerik; kota yalnızca "2 / 3" metni, ilerleme göstergesi ve hiyerarşi yok; fiyat "499 TRY" biçiminde. |
| Mimari | 5/10 | Route → `billing-core` ayrımı ve `stripePriceId`'nin istemciye sızdırılmaması iyi; ancak plan kimliği abonelik `metadata`'sından okunuyor (fiyattan değil), webhook olay sırası/tekilliği yok, istemcide `r.ok` kontrolü yok. |
| Performans | 7/10 | Tek GET, 4 paralel sorgu (`Promise.all`); `getDealerPlanLimits` kullanıcıyı ikinci kez okuyor (küçük tekrar). Cache gerekmiyor (kişisel, no-store doğru). |
| Erişilebilirlik + Mobil | 5/10 | Grid mobilde tek sütuna iniyor; fakat layout + sayfa çift kenar boşluğu, `<p>` içinde `<div>` (Badge) geçersiz DOM, yükleniyor durumunda `aria-busy`/canlı bölge yok, i18n yok (EN kullanıcı Türkçe görür). |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa başlığı (DashboardPageHero) | ÇALIŞIYOR | page.tsx:99-103 | Başlık "Abonelik ve Faturalama", menü etiketi "Abonelik" (messages/tr.json:2567) — küçük tutarsızlık. |
| 2 | Abonelik verisini yükleme (GET /api/dealer/billing) | KISMİ | page.tsx:51-58; route.ts:14-78 | `r.ok` kontrol edilmiyor; 401/403 JSON gövdesi `data` olarak set ediliyor → çöküş (Bulgu 4). |
| 3 | Yükleniyor iskeleti | ÇALIŞIYOR | page.tsx:105-110 | İki gri blok; gerçek yerleşimi taklit etmiyor, `aria-busy` yok. |
| 4 | Hata durumu ("Veri yüklenemedi.") | KISMİ | page.tsx:111-112 | Yeniden dene butonu yok; yalnız ağ hatasında devreye giriyor. |
| 5 | Checkout başarı dönüşü bildirimi | KISMİ | page.tsx:62-65; billing-core.ts:70 | Toast "birkaç saniye içinde güncellenir" diyor ama sayfa yeniden sorgulamıyor/poll etmiyor; `?status=success` URL'de kalıyor, F5'te toast tekrar çıkıyor. |
| 6 | Checkout iptal dönüşü bildirimi | ÇALIŞIYOR | page.tsx:66; billing-core.ts:71 | Aynı URL parametresi temizlenmiyor. |
| 7 | Mevcut plan adı | ÇALIŞIYOR | page.tsx:123; plan-limits.ts:30-55 | Plan pasifleştirilmişse "Ücretsiz" gösterir (plan-limits.ts:47-48) ama `planId` hâlâ dolu. |
| 8 | Abonelik durum rozeti | KISMİ | page.tsx:38-44, 124-128 | `unpaid`, `incomplete_expired`, `paused` için çeviri yok → ham İngilizce gösterilir; iptal-dönem-sonunda (`cancel_at_period_end`) hiç bilinmiyor (şemada alan yok, schema.prisma:115-118). Badge `<p>` içinde `<div>` (badge.tsx:45, card.tsx:59-61). |
| 9 | QR kota kullanımı | KISMİ | page.tsx:133-139; route.ts:47 | Yalnız metin; ilerleme çubuğu, %80/%100 uyarısı yok. |
| 10 | Şube kotası gösterimi | EKSİK | route.ts:46 (`limits.maxBranches` dönüyor) | UI'da hiç kullanılmıyor; ayrıca `maxBranches` hiçbir yerde uygulanmıyor (grep: plan-limits dışında kullanım yok). |
| 11 | Yenileme tarihi | KISMİ | page.tsx:140-145; billing-core.ts:113-122 | İptal edilmiş/past_due abonelikte de `currentPeriodEnd` yazılıyor → "Yenileme" etiketi yanıltıcı. |
| 12 | "Aboneliği yönet" (Stripe Billing Portal) | KISMİ | page.tsx:85-95, 147-152; portal/route.ts; billing-core.ts:81-97 | Çalışıyor; ancak `hasCustomer` checkout başlatılıp terk edildiğinde de true (billing-core.ts:32-37) → ücretsiz kullanıcıya boş portal butonu. |
| 13 | Stripe kapalı uyarı bandı | KISMİ | page.tsx:156-161 | "Bizimle iletişime geçin" diyor ama hiçbir iletişim kanalı/linki yok. |
| 14 | Plan kartları ızgarası | ÇALIŞIYOR | page.tsx:164-213; route.ts:29-45 | `isActive` + `order` sıralaması doğru. Ücretsiz kademe kartı yok. |
| 15 | "Popüler" rozeti + vurgulu kenar | ÇALIŞIYOR | page.tsx:168, 172 | Görsel vurgu çok zayıf (`border-primary/40`). |
| 16 | Fiyat gösterimi | KISMİ | page.tsx:175-177; schema.prisma:1434 | `Float` para + "499 TRY" metni; `Intl.NumberFormat(currency)` yok; DB fiyatı Stripe Price ile senkron değil (Bulgu 6). |
| 17 | Dönem etiketi (ay/yıl/tek seferlik) | KISMİ | page.tsx:178; admin/pricing/route.ts:12 | `lifetime` plan "tek seferlik" yazar ama checkout her zaman `mode: 'subscription'` (billing-core.ts:67) → tek seferlik Price ile Stripe hatası. |
| 18 | Plan açıklaması | ÇALIŞIYOR | page.tsx:182 | — |
| 19 | Plan QR limiti satırı | ÇALIŞIYOR | page.tsx:184-187 | — |
| 20 | Plan özellik listesi | KISMİ | page.tsx:188-193; route.ts:69 | Sessizce ilk 5 özellik; "+N özellik daha" yok. `key={f}` tekrar eden özellikte çakışır; Json içinde string olmayan öğe React çöküşü verir (yalnız `Array.isArray` kontrolü). |
| 21 | Plan şube limiti satırı | EKSİK | page.tsx:183-194 | `maxBranches` API'den geliyor (route.ts:71), kartta yok. |
| 22 | "Mevcut planınız" (devre dışı) | ÇALIŞIYOR | page.tsx:195-198 | — |
| 23 | "Bu plana geç" (Stripe Checkout) | BOZUK (mevcut abone için) / ÇALIŞIYOR (ilk abonelik) | page.tsx:69-83, 199-203; checkout/route.ts; billing-core.ts:51-78 | Aktif abonesi olan bayi için yeni, paralel bir abonelik oluşturur → çift ücret (Bulgu 1). Yalnız tıklanan kartın butonu kilitleniyor, diğerleri tıklanabilir. |
| 24 | "İletişime geçin" butonu | SAHTE | page.tsx:204-207 | Kalıcı `disabled`, hiçbir aksiyon yok. Admin panelinde `stripePriceId` girecek UI olmadığı için (app/admin/pricing/page.tsx'te "stripe" geçmiyor) pratikte TÜM planlar bu ölü butonu gösterir. |
| 25 | Checkout hız sınırı (10/dk) | ÇALIŞIYOR | checkout/route.ts:28-34 | — |
| 26 | Rol kontrolü (yalnız DEALER) | ÇALIŞIYOR | route.ts:15; checkout/route.ts:18; portal/route.ts:14; proxy.ts:52 | Tüm sorgular oturum kullanıcı id'siyle; IDOR yüzeyi yok. |
| 27 | Webhook → User senkronu | KISMİ | webhooks/stripe/route.ts:17-73; billing-core.ts:104-137 | İmza doğrulaması iyi; olay sırası/tekillik yok, plan metadata'dan, past_due anında plan düşürme (Bulgu 2, 3, 5). |
| 28 | Ücretsiz kademe kartı / düşürme yolu | EKSİK | page.tsx:164-213 | Ücretsiz plan ızgarada yok; düşürme yalnız portaldan iptal ile. |
| 29 | Fatura/ödeme geçmişi | EKSİK | — | Stripe Invoice listesi çekilmiyor. |
| 30 | Ödeme yöntemi özeti | EKSİK | — | Kart son 4 hane/son kullanma tarihi yok. |
| 31 | Aylık/yıllık geçiş anahtarı | EKSİK | — | `interval` var, gruplama/karşılaştırma yok. |
| 32 | Plan karşılaştırma tablosu | EKSİK | — | — |
| 33 | i18n | EKSİK | page.tsx:38-44, 100-207 | Tüm metin sabit Türkçe; uygulamanın `messages/en.json`'u var, sidebar i18n kullanıyor. |
| 34 | Toast metin dili | KISMİ | lib/admin-toast.ts:17-19 | Ön ek "Basarili: " (ş yok) — global ama bu sayfada da görünür. |
| 35 | Mobil düzen | KISMİ | page.tsx:98; layout.tsx:35, 40 | Grid tek sütuna iniyor; ancak `p-6` + layout yatay padding → mobilde ~36px çift kenar boşluğu (qr-codes sayfası `space-y-6 pb-8` kullanıyor, qr-codes/page.tsx:394). |
| 36 | Onboarding "plan" adımı bağlantısı | ÇALIŞIYOR | api/dealer/onboarding/route.ts:44, 52 | — |
| 37 | QR kota aşımında bu sayfaya yönlendirme | EKSİK | qr-codes/page.tsx:219-221; api/qr-codes/route.ts:100-110 | 402 + `PLAN_LIMIT_REACHED` yalnız toast; "Planı yükselt" CTA/link yok. |
| 38 | Azaltılmış hareket desteği | ÇALIŞIYOR (gereksiz) | page.tsx:108, 149, 201 | Yalnız `animate-pulse`/`animate-spin`; özel motion yok. |

**Sayım:** ÇALIŞIYOR 13 · KISMİ 15 · BOZUK 1 · SAHTE 1 · EKSİK 8 (toplam 38).

---

## Bulgular

### 1. Mevcut abone "Bu plana geç" ile İKİNCİ bir abonelik açıyor → çift ücretlendirme
- **Önem:** kritik · **Kategori:** veri-bütünlüğü / para
- **Kanıt:** page.tsx:199-203 (aktif abone için de buton gösteriliyor, yalnız `isCurrent` hariç); billing-core.ts:51-78 (`createCheckoutSession` kullanıcının mevcut `stripeSubscriptionId`/`subscriptionStatus`'unu hiç kontrol etmiyor, her seferinde `mode: 'subscription'` ile yeni oturum açıyor); billing-core.ts:117-126 (son gelen abonelik `stripeSubscriptionId`'yi ezer).
- **Sorun:** "Pro" abonesi bayi "Business"a geçmek için butona basınca Stripe yeni bir abonelik oluşturur; eski abonelik iptal edilmez. Bayi iki abonelikten ücretlendirilir. Üstelik eski abonelik daha sonra (portal veya ödeme hatası) `customer.subscription.deleted/updated` gönderdiğinde `syncSubscriptionToUser` bu eski olayla `pricingPlanId: null`, `subscriptionStatus: 'canceled'` yazar → yeni ve hâlâ ödenen planın ayrıcalıkları silinir.
- **Profesyonel öneri:** Plan değişikliğini yeni Checkout yerine **mevcut aboneliğin güncellenmesi** olarak modelle: `stripe.subscriptions.update(subId, { items: [{ id, price }], proration_behavior: 'create_prorations' })` ya da Billing Portal'ın `subscription_update` akışına derin link (`flow_data`). `createCheckoutSession` başında aktif/trialing abonelik varsa 409 dön ve UI'da "Planı değiştir" diyaloguna yönlendir. Diyalogda `stripe.invoices.retrieveUpcoming` (veya `createPreview`) ile proration önizlemesi göster. `syncSubscriptionToUser` yalnız `subscription.id === user.stripeSubscriptionId` (veya kullanıcıda abonelik yoksa) iken plan/durum yazsın; başka bir aboneliğin olayı yalnız audit'e düşsün.
- **Efor:** M

### 2. Plan, fiyattan değil abonelik metadata'sından çözülüyor
- **Önem:** yüksek · **Kategori:** veri-bütünlüğü
- **Kanıt:** billing-core.ts:73 (`subscription_data.metadata.planId` checkout anında sabitleniyor), billing-core.ts:112, 124 (`pricingPlanId = metadata.planId`).
- **Sorun:** Abonelik Stripe tarafında (portal plan değişikliği, Stripe Dashboard'dan destek ekibi müdahalesi, Bulgu 1 düzeltmesi sonrası `subscriptions.update`) farklı bir Price'a geçerse metadata eski planı göstermeye devam eder; bayiye ödediğinden farklı bir kota uygulanır. (Portalın plan değişikliğine izin verip vermediği Stripe Dashboard ayarına bağlı — doğrulanmadı; ama `subscriptions.update` yolu açıldığı anda kesin sorun.)
- **Profesyonel öneri:** `subscription.items.data[0].price.id` → `PricingPlan.stripePriceId` eşlemesiyle planı çöz (`stripePriceId` alanına `@unique` ekle). Metadata yalnız `dealerId` için tutulsun. Eşleşmeyen Price için plan atama yapma, audit + admin bildirimi üret.
- **Efor:** S

### 3. Webhook olay sırası ve tekilliği yönetilmiyor
- **Önem:** yüksek · **Kategori:** veri-bütünlüğü / yarış koşulu
- **Kanıt:** webhooks/stripe/route.ts:51-68 (olay `created` zamanı veya `event.id` tekilliği kontrol edilmiyor); 76-84 (event id yalnız analitik olarak sonradan loglanıyor); billing-core.ts:117-126 (koşulsuz `update`).
- **Sorun:** Stripe olay sırasını garanti etmez. `checkout.session.completed` (aboneliği `retrieve` ile taze çeker) ile `customer.subscription.created` (olay anındaki eski snapshot, ör. `incomplete`) yarışınca eski snapshot sonradan yazılıp planı `null`'a çekebilir. Ayrıca `metadata.dealerId`'si silinmiş bir kullanıcı için `prisma.user.update` hata fırlatır → 500 → Stripe 3 gün boyunca tekrar dener.
- **Profesyonel öneri:** (a) Her olayda nesneyi `stripe.subscriptions.retrieve(id)` ile taze çekip yaz (olay yükünü kaynak-doğruluk saymamak); (b) `User`'a `subscriptionSyncedAt` ekleyip `event.created` daha eskiyse yazmayı atla; (c) `StripeEvent(id @id)` tablosu ile işlenmiş olay tekilliği (puan ekonomisi kurallarındaki "atomik tek seferlik" desenine paralel); (d) kullanıcı bulunamazsa 200 + uyarı.
- **Efor:** M

### 4. İstemci `r.ok` kontrol etmiyor → 401/403/429'da sayfa çöküyor veya yanlış mesaj
- **Önem:** yüksek · **Kategori:** hata-yönetimi
- **Kanıt:** page.tsx:53-55 (`r.json()` → `setData(d)`), api-auth.ts:23-26, 40-43, 72-75 (hata gövdesi `{ error }`); page.tsx:123 (`data.limits.planName`).
- **Sorun:** Oturum süresi dolduğunda veya token-replay korumasında 403 döndüğünde `data = { error: '...' }` set edilir; `!data` false olduğu için render `data.limits.planName`'e gider → `TypeError` → `app/dealer/error.tsx` hata sınırı. Kullanıcı "Veri yüklenemedi" yerine genel hata ekranı görür. GET route'unda try/catch de yok (route.ts:19-48) → DB hatasında HTML 500, `r.json()` patlar (bu yol en azından toast'a düşüyor).
- **Profesyonel öneri:** Paylaşılan `fetchJson` yardımcısı (status kontrolü + tipli hata) veya SWR/React Query ile `{ data, error, isLoading, mutate }`; 401'de yeniden giriş yönlendirmesi, diğerlerinde "Yeniden dene" butonlu hata kartı. Route'u try/catch ile sarıp `{ error }` + 500 dön.
- **Efor:** S

### 5. `past_due` olduğu anda plan ayrıcalıkları siliniyor, iptal dönem sonu bilinmiyor
- **Önem:** orta · **Kategori:** iş-mantığı / UX
- **Kanıt:** billing-core.ts:15 (`ACTIVE_STATUSES = active, trialing`), 124 (değilse `pricingPlanId: null`); schema.prisma:115-118 (`cancelAtPeriodEnd` alanı yok); page.tsx:140-145.
- **Sorun:** Kart bir kez reddedildiğinde (Stripe akıllı yeniden deneme penceresi içinde) bayi anında 3 QR'lık ücretsiz kademeye düşer; ödeme düzeldiğinde geri gelir. Arada QR oluşturamaz, uyarı da almaz (sayfa sadece "Ödeme gecikti" rozeti gösterir, kart güncelleme CTA'sı yok). Portaldan "dönem sonunda iptal" seçen bayi "Aktif · Yenileme: 12.11.2026" görür — yenilenmeyecek olmasına rağmen.
- **Profesyonel öneri:** `past_due` için 7 günlük grace (ayrıcalık korunur, sayfada kırmızı "Ödemeniz alınamadı — kartı güncelle" bandı + portal `payment_method_update` derin linki). `cancelAtPeriodEnd` ve `cancelAt` alanlarını User'a ekle; UI'da "12.11.2026'da sona erecek · Yeniden etkinleştir" durumu. `canceled` durumunda "Yenileme" yerine "Sona erdi" etiketi.
- **Efor:** M

### 6. Gösterilen fiyat Stripe'ta tahsil edilen fiyatla senkron değil
- **Önem:** orta · **Kategori:** veri-doğruluğu / yasal
- **Kanıt:** route.ts:36-37, 66-67 (fiyat `PricingPlan.price`/`currency`'den); billing-core.ts:69 (tahsilat `stripePriceId` ile); admin/pricing/route.ts:24, 71 (iki alan bağımsız girilir); schema.prisma:1434 (`Float`).
- **Sorun:** Admin DB fiyatını 499 yapıp Stripe Price'ı 599 bırakırsa bayi 499 görüp 599 öder. KDV dahil/hariç bilgisi de yok. Para `Float`.
- **Profesyonel öneri:** Ödenebilir planlarda fiyatı `stripe.prices.retrieve` ile (Redis'te 1 saat cache) göster veya admin kaydında `stripePriceId` girildiğinde `unit_amount`/`currency`/`recurring.interval`'ı Stripe'tan çekip DB'ye yaz ve uyuşmazlıkta kaydı reddet. `Intl.NumberFormat('tr-TR', { style: 'currency', currency })` ile "₺499,00" biçimi ve "KDV dahil" notu.
- **Efor:** S

### 7. Self-servis ödeme pratikte erişilemez: admin `stripePriceId` UI'ı yok → tüm planlar "İletişime geçin" (ölü buton)
- **Önem:** orta · **Kategori:** sahte-özellik / ürün
- **Kanıt:** page.tsx:199, 204-207 (`payable && stripeEnabled` değilse kalıcı disabled buton); app/admin/pricing/page.tsx (dosyada "stripe" geçmiyor); admin/pricing/route.ts:24 (alan yalnız API'de).
- **Sorun:** Stripe anahtarı tanımlı olsa bile admin panelinden Price ID girilemediği için satın alma butonu hiç görünmez; yerine hiçbir şey yapmayan "İletişime geçin" çıkar. Stripe kapalı bandı da (page.tsx:159) iletişim kanalı vermiyor.
- **Profesyonel öneri:** Admin fiyatlandırma formuna `stripePriceId` alanı + "Stripe'tan doğrula" butonu. Ödenemeyen planlarda "İletişime geçin" butonunu gerçek bir aksiyona bağla: talep formu (Dialog: işletme adı, şube sayısı, not) → `SupportTicket`/admin bildirimi; ya da en azından destek e-postası/WhatsApp metni görünür olsun.
- **Efor:** S

### 8. Lifetime (tek seferlik) plan abonelik modunda checkout'a gidiyor
- **Önem:** orta · **Kategori:** hata
- **Kanıt:** admin/pricing/route.ts:12 (`lifetime` geçerli değer); page.tsx:178 ("tek seferlik"); billing-core.ts:67 (her zaman `mode: 'subscription'`).
- **Sorun:** Lifetime plana tek seferlik Price bağlanırsa Stripe `subscription` modunda recurring olmayan Price'ı reddeder → kullanıcı "Ödeme oturumu başlatılamadı" görür. Bağlanmazsa da tek seferlik ödemeyi tamamlayan webhook yolu yok (`payment` modu için `checkout.session.completed` yalnız `session.subscription` varsa işleniyor, webhooks/stripe/route.ts:56).
- **Profesyonel öneri:** `interval === 'lifetime'` için `mode: 'payment'` + webhook'ta `session.mode === 'payment'` dalı (plan ata, `subscriptionStatus: 'lifetime'`). Ya da lifetime'ı ürün olarak kaldır.
- **Efor:** S

### 9. Ödeme dönüşü sonrası durum güncellenmiyor ve URL temizlenmiyor
- **Önem:** orta · **Kategori:** UX
- **Kanıt:** page.tsx:60-67 (tek seferlik fetch, `history.replaceState` yok); billing-core.ts:70 (`session_id` dönüş URL'inde yok).
- **Sorun:** Webhook birkaç saniye geciktiğinde bayi ödeme yapmış ama "Ücretsiz" görür; sayfayı yenilerse "Aboneliğiniz etkinleştiriliyor" toast'ı tekrar çıkar.
- **Profesyonel öneri:** `success_url`'e `?session_id={CHECKOUT_SESSION_ID}` ekle; dönüşte `GET /api/dealer/billing/checkout/status?session_id=` ile oturumu doğrula (ve gerekirse senkronu tetikle), `status === active` olana dek 2 sn aralıkla en fazla ~20 sn poll; bitince `router.replace('/dealer/billing')`. Başarıda kısa bir onay animasyonu (aşağıdaki vizyon).
- **Efor:** S

### 10. Şube limiti ne gösteriliyor ne uygulanıyor
- **Önem:** orta · **Kategori:** eksik-özellik / gelir kaçağı
- **Kanıt:** schema.prisma:1439-1440 (`maxBranches`, `pricePerBranch`); route.ts:41, 71 (UI'a gidiyor); page.tsx (kullanılmıyor); `maxBranches` plan-limits.ts dışında hiçbir route'ta kontrol edilmiyor.
- **Sorun:** Plan kartında satılan bir değer (şube sayısı) kullanıcıya gösterilmiyor; `pricePerBranch` hiç kullanılmıyor. Plan farklılaştırması yalnız QR sayısına indirgenmiş.
- **Profesyonel öneri:** Şube kavramı veri modelinde netleşene kadar plan kartından ve admin formundan kaldır; netleşince `canCreateBranch` + kullanım ölçeri ekle. Yarım kalmış metrik satılmamalı.
- **Efor:** M (ürün kararı gerektirir)

### 11. `ensureStripeCustomer` idempotent değil (eşzamanlı iki checkout → iki Customer)
- **Önem:** düşük · **Kategori:** yarış koşulu
- **Kanıt:** billing-core.ts:25-38 (oku → yoksa oluştur → yaz; kilit/koşullu update yok); page.tsx:200 (yalnız tıklanan kart kilitleniyor, diğer kartlar ve ikinci sekme serbest).
- **Sorun:** Hızlı iki tıklama/iki sekme yetim Stripe Customer üretir; ikinci `update` ilkini ezer.
- **Profesyonel öneri:** `stripe.customers.create` için `idempotencyKey: 'cust_' + dealerId` ve `updateMany({ where: { id, stripeCustomerId: null } })` koşullu yazım; UI'da herhangi bir istek sürerken tüm plan butonlarını kilitle (`busy !== null`).
- **Efor:** S

### 12. Geçersiz DOM, erişilebilirlik ve i18n açıkları
- **Önem:** düşük · **Kategori:** erişilebilirlik / tutarlılık
- **Kanıt:** page.tsx:122-129 (`CardDescription` = `<p>`, card.tsx:59-61; içinde `Badge` = `<div>`, badge.tsx:45); page.tsx:105-110 (iskelette `aria-busy`/`role="status"` yok); page.tsx:98 (`p-6`, layout.tsx:35 zaten yatay padding veriyor); page.tsx tümü sabit Türkçe (messages/en.json mevcut); lib/admin-toast.ts:17 ("Basarili:").
- **Sorun:** `<div>` `<p>` içinde geçersiz; ekran okuyucu yükleme/ödeme yönlendirmesini duyurmuyor; mobilde gereksiz geniş kenar; EN kullanıcı Türkçe metin görür; toast önekleri Türkçe karakter içermiyor.
- **Profesyonel öneri:** Durum rozetini `CardHeader` içinde ayrı satıra taşı; yükleme kabına `aria-busy` + `role="status"`; sayfa kabını diğer bayi sayfaları gibi `space-y-6 pb-8` yap; metinleri `dealerBilling.*` anahtarlarına taşı; `admin-toast` öneklerini düzelt (ayrı global iş).
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

Kıyas: Square Dashboard (Subscriptions & Billing), Toast (Billing), Yelp for Business (Ads & Billing), Medallia/Qualtrics (kurumsal lisans + kullanım), ayrıca Stripe-tabanlı SaaS standardı (Linear, Notion, Vercel Usage).

1. **Fatura ve ödeme geçmişi:** Stripe Invoice listesi (tarih, tutar, durum, PDF/hosted link) — Square ve Toast'ta faturalama sayfasının ana öğesi. Türkiye için e-Arşiv/e-Fatura uyumu ayrı bir değerlendirme gerektirir (Stripe'ın TR işletme desteği ve iyzico/PayTR alternatifi — doğrulanmadı, ürün/hukuk kararı).
2. **Kullanım ölçerleri ve eşik uyarıları:** QR (ve ileride şube, ekip üyesi, AI çağrısı) için ilerleme çubukları; %80'de banner + e-posta, %100'de QR oluşturma ekranında "Planı yükselt" CTA'sı (şu an yalnız toast, qr-codes/page.tsx:219-221).
3. **Plan değiştirme önizlemesi:** Yükseltme/düşürmede proration tutarı, yeni yenileme tarihi, kaybedilecek özellikler ve "QR sayınız yeni limiti aşıyor" kontrolü.
4. **Aylık/yıllık anahtar ve plan karşılaştırma tablosu:** Yıllık indirim yüzdesi, özellik satırlarının karşılaştırmalı matrisi (Medallia/Qualtrics fiyat sayfası, Yelp paket karşılaştırması).
5. **Ödeme yöntemi ve fatura bilgisi kartı:** Kart markası/son 4/son kullanma, fatura adresi, vergi no/vergi dairesi (TR B2B için kritik); güncelleme portal derin linkleriyle.
6. **İptal/geri kazanım akışı ve deneme süresi:** İptal nedeni anketi (Qratex zaten bir geri bildirim ürünü — kendi anketini burada kullanması doğal), "1 ay %50" teklif, `trial_period_days` ile deneme başlatma.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Bayi bu sayfaya üç sorudan biriyle gelir: "Ne ödüyorum ve ne zaman?", "Kotam doluyor mu?", "Bir üst plana geçersem ne kazanırım, ne öderim?". Sayfa bu üç soruyu ilk ekranda, tıklamadan cevaplamalı; para hareketi içeren her aksiyon önizleme + onaydan geçmeli.

**Yerleşim (masaüstü, mobilde tek sütun):**
1. **Durum şeridi (üst):** Plan adı + durum (Aktif / Deneme · 9 gün kaldı / Ödeme alınamadı / 12 Kasım'da sona erecek), sonraki tahsilat tutarı ve tarihi, birincil CTA (duruma göre "Kartı güncelle", "Yeniden etkinleştir", "Planı yükselt"). `past_due` ve `cancel_at_period_end` durumları renkli bant olarak en üstte.
2. **Kullanım kartı:** QR kullanımı halka/çubuk ölçer (`role="meter"`, `aria-valuenow`), eşik renkleri; şube metriği yalnız uygulandığında.
3. **Planlar:** Aylık/yıllık segment kontrolü; ücretsiz kademe dahil kartlar; mevcut plan "Şu anki planınız" rozetiyle; diğerlerinde "Yükselt"/"Düşür" etiketleri (fiyat karşılaştırmasıyla). Altta açılır karşılaştırma tablosu.
4. **Plan değiştir diyaloğu:** Proration önizlemesi (Stripe upcoming invoice), yeni limitler, limit aşımı uyarısı, "Onayla ve öde".
5. **Ödeme yöntemi + fatura bilgileri** kartı ve **Faturalar** tablosu (son 12, "Tümü" portal).

**Motion / 3D:** 3D burada yersiz — para ekranı güven ve netlik ister. Ölçülü framer-motion (`m as Motion`, global LazyMotion): kullanım ölçerinin ilk dolumu (0.6 sn, `useReducedMotion` ile anında), plan değişince kartlar arası `layoutId` ile "mevcut plan" rozetinin kayması, başarılı ödeme dönüşünde poll tamamlanınca durum şeridinde kısa bir onay geçişi. Konfeti/abartılı kutlama yok.

**Veri / API değişiklikleri:**
- `User`'a `cancelAtPeriodEnd Boolean`, `subscriptionSyncedAt DateTime?`; `PricingPlan.stripePriceId @unique`; yeni `StripeEvent { id String @id, type, processedAt }` tablosu.
- `GET /api/dealer/billing` → ek alanlar: `nextInvoice { amount, currency, date }`, `paymentMethod { brand, last4, exp }`, `cancelAtPeriodEnd` (Stripe çağrıları Redis'te 60 sn kişisel cache, Stripe kapalıysa atlanır).
- `GET /api/dealer/billing/invoices` (Stripe `invoices.list`, sayfalı).
- `POST /api/dealer/billing/preview-change` (upcoming invoice) ve `POST /api/dealer/billing/change-plan` (`subscriptions.update`); `checkout` yalnız aboneliği olmayanlar için.
- `GET /api/dealer/billing/checkout/status?session_id=` (dönüş doğrulama).
- Webhook: taze `retrieve`, Price → plan eşlemesi, olay tekilliği, `invoice.payment_failed` / `invoice.paid` olaylarıyla bayiye bildirim (mevcut push/bildirim merkezine).
- İstemci: SWR/React Query + tipli `fetchJson`; metinler `messages/*.json`'a.

---

## Çakışmalar / birleştirme önerisi

- **`components/landing/PricingSection.tsx`** fiyatları `lib/landing-content` içindeki sabit `pricingPlanDefs`'ten alıyor (PricingSection.tsx:9, 37), bu sayfa ise DB `PricingPlan`'dan. Pazarlama sayfasında görülen fiyat/özellik ile bayinin panelde gördüğü farklı olabilir. Öneri: landing'in de aynı DB kaynağını (build-time fail-safe ile, bkz. statik sayfa DB yardımcısı kuralı) kullanması; tek "plan kataloğu" kaynağı.
- **`/admin/users` plan atama** (users-client.tsx:225-228, api/admin/users/[id]/plan/route.ts:62) ile Stripe senkronu aynı `pricingPlanId` alanına yazıyor; Stripe abonesi bir bayiye admin elle plan atarsa bir sonraki webhook bunu ezer. Öneri: `planSource: 'stripe' | 'manual'` alanı; manuel atama varken webhook planı değiştirmesin, sayfada "Planınız Qratex ekibi tarafından atandı" bilgisi.
- **`/dealer/qr-codes`** kota aşımı mesajı (qr-codes/page.tsx:219-221) bu sayfaya bağlanmalı (toast içinde "Planı yükselt" aksiyonu).
- **`/dealer/settings`** ile birleştirme gerekmiyor; billing ayrı kalmalı ama ayarlar sayfasından ve kullanıcı menüsünden ("Abonelik") erişilebilir olmalı. Sidebar'da "Sistem" grubunun en altına gömülü konum (sidebar.tsx:269) gelir sayfası için zayıf; header kullanıcı menüsüne ve kota uyarılarına bağlanması önerilir.
- Kaldırma/birleştirme: **hayır** — tek ödeme giriş noktası; yeniden tasarlanıp güçlendirilmeli.

---

## Doğrulama (şüpheci inceleme)

> Salt okunur inceleme; kod/DB değiştirilmedi. Genel not: yerel `.env` içinde `STRIPE_SECRET_KEY` tanımlı değil (Vercel üretim ortamı doğrulanmadı). Stripe üretimde kapalıysa `isStripeConfigured()` false döner, "Bu plana geç" butonu hiç görünmez (page.tsx:199) ve 1–3 numaralı bulgular şu an **gizil** (Stripe açıldığı gün canlıya çıkar). Kod mantığı olarak gerçekler.

### 1. Plan değiştirme ikinci Stripe aboneliği oluşturuyor — **DOĞRULANDI**
- Kanıt: page.tsx:166 ve 195-203 yalnız mevcut planın butonunu kapatır; başka planlarda `subscribe()` çağrılır. `checkout/route.ts:43` doğrudan `createCheckoutSession`'a gider; billing-core.ts:51-78 `stripeSubscriptionId`/`subscriptionStatus` kontrolü yapmadan her seferinde yeni `mode: 'subscription'` Checkout açar. Eski aboneliği iptal eden veya `subscriptions.update` kullanan hiçbir kod yok (repo genelinde grep: `subscriptions.update` yok).
- Senaryo: Bayi A planına (abonelik S1) aktif abone → B planı kartında "Bu plana geç" → Checkout öder → S2 oluşur. S1 iptal edilmez; her iki abonelik de faturalanır (çift ücret). billing-core.ts:117-126 koşulsuz yazdığı için S1'in bir sonraki dönem yenilemesindeki `customer.subscription.updated` olayı `stripeSubscriptionId=S1`, `pricingPlanId=A` yazar (ödenen B planı geri alınır); bayi portalda S1'i iptal ederse `deleted` olayı `pricingPlanId=null`, `status=canceled` yazar — S2 hâlâ aktif ve ödeniyor olsa bile ücretsiz kademeye düşer.

### 2. Plan ataması metadata'dan, tahsil edilen Price'tan değil — **BELİRSİZ**
- Kanıt doğru: billing-core.ts:73 metadata yazar, :112 ve :124 planı yalnız `subscription.metadata.planId`'den türetir; `subscription.items.data[0].price.id` hiç okunmaz.
- Ancak somut tetikleyici kod tabanında yok: uygulama `subscriptions.update` çağırmıyor, portal oturumu (billing-core.ts:92-95) `configuration` vermeden Stripe varsayılan portal yapılandırmasını kullanıyor ve bu yapılandırmada plan değiştirmenin açık olup olmadığı Stripe Dashboard'a bağlı (doğrulanmadı). Dashboard'dan elle müdahale operatör eylemi. Portal'da "plan değiştir" açıksa veya ileride `change-plan` uç noktası eklenirse doğrudan gerçek hataya dönüşür; tasarım zayıflığı olarak not edilmeli, şu an kanıtlanmış kullanıcı etkisi yok.

### 3. Webhook olay sırası/tekilliği yok — **DOĞRULANDI** (önem: orta)
- Kanıt: route.ts:62-66 olay yükünü doğrudan `syncSubscriptionToUser`'a verir; `event.created` karşılaştırması, `event.id` tekillik tablosu veya `stripe.subscriptions.retrieve` ile taze okuma yok (taze okuma yalnız `checkout.session.completed` dalında, route.ts:57). analyticsEvent kaydı (route.ts:77-83) yalnız loglama; tekillik için okunmuyor. Stripe olay sırası garanti etmez ve başarısız teslimleri günlerce yeniden dener.
- Senaryo (gelir kaybı): bir `customer.subscription.updated` (status=active) teslimi geçici DB hatasıyla 500 döner (route.ts:69-72) → abonelik dönem sonunda silinir, `deleted` işlenir (plan=null) → Stripe eski `updated` olayını yeniden dener → billing-core.ts:124 planı ve `status=active`'i geri yazar; bayi ödeme yapmadan ücretli kotayı kalıcı olarak kullanır (sonradan düzeltecek olay gelmez).
- Silinmiş kullanıcı kısmı da doğru: admin `prisma.user.delete` (app/api/admin/users/route.ts:676) Stripe aboneliğini iptal etmiyor; o aboneliğin sonraki olaylarında billing-core.ts:117 `prisma.user.update` P2025 fırlatır → 500 → Stripe ~3 gün yeniden dener. Daha önemlisi silinen bayinin kartı Stripe'ta faturalanmaya devam eder.

### 4. İstemci HTTP durumunu kontrol etmiyor; 401/403 sayfayı çökertir — **DOĞRULANDI** (önem: orta, veri etkisi yok)
- Kanıt: page.tsx:53-55 `r.ok` bakmadan `setData(d)`; api-auth.ts:23-26 (401) ve 72-75 (token-replay 403) JSON gövde döner. proxy.ts:105-118 `/api/*` için oturum kontrolü yapmaz, sayfa yolları ise yalnız `!!token` kontrol eder (proxy.ts:97-99) — token-replay kontrolü sayfa gezinmesinde değil yalnız API'de çalışır.
- Senaryo: Bayi oturumu wifi'da açtı, telefon mobil veriye geçti (IP değişti) → sayfa proxy'den geçer, `GET /api/dealer/billing` 403 `{error}` döner → `data={error}`, page.tsx:111 `!data` false → page.tsx:123 `data.limits.planName` TypeError → app/dealer/error.tsx hata sınırı gösterilir; "Lütfen tekrar giriş yapın" mesajı kullanıcıya hiç ulaşmaz. (Not: 500'de Next.js JSON olmayan gövde döndürürse `r.json()` reddeder ve `catch` toast'a düşer; çökme yalnız JSON hata gövdelerinde.) Etki UX düzeyinde; "KRİTİK/YÜKSEK" etiketi abartılı, "Orta" uygundur.
