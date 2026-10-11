# /admin/pricing

**Amaç:** Bayilerin (DEALER) satın alabileceği abonelik planlarını (`PricingPlan`) oluşturmak, düzenlemek ve silmek. Bu planlar, bayi kota uygulamasını (`lib/plan-limits.ts`), bayi faturalama sayfasını (`/api/dealer/billing`) ve Stripe Checkout'u (`lib/billing-core.ts`) doğrudan besler. Yani bu sayfa platformun **gelir kaynağının ayar paneli**dir.

**Genel puan:** 3.8 / 10
**Karar:** **Yeniden tasarla.** Veri modeli ve API iskeleti sağlam (zod doğrulama, ADMIN yetkisi, audit log). Ama formun kendisi pratikte kullanılamıyor (her tuş vuruşunda odak kayboluyor). Stripe bağlantısı arayüzde hiç yok. Silme işlemi onay istemeden ve abone kontrolü yapmadan çalışıyor. Sayfa bir "kart listesi + modal" olmaktan çıkıp küçük bir **Plan & Abonelik konsoluna** dönüşmeli.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | CRUD API çalışıyor. Ancak form bileşeni her render'da yeniden tanımlandığı için alanlara yazı yazılamıyor. `interval` alanı yazıyla değiştirilemiyor. `maxQRCodes=0` sınırsıza dönüşüyor. `stripePriceId` arayüzde yok. |
| UX | 3/10 | Silme tek tıkla ve geri alınamaz. Yükleme hatası "Henüz plan yok" gibi görünüyor. Doğrulama hataları `[object Object]` olarak çıkıyor. Düzenleme taslağı "Yeni plan" formuna sızıyor. |
| Görsel | 5/10 | Ortak `AdminPremiumHero` ve kart dili tutarlı. Fiyat ise "TRY 299 / monthly" gibi ham kodla basılıyor. Popüler vurgusu ve hiyerarşi sıradan. Hero butonundaki zümrüt rengi sabit yazılmış ve temadan kopuk. |
| Mimari | 4/10 | Form, render içinde tanımlanmış bir bileşen (anti-pattern). Fiyatların tek doğruluk kaynağı yok: landing sabit kodlu, Stripe fiyatı ayrı, veritabanı fiyatı ayrı. Audit kaydı mutasyonla aynı transaction'da değil. `pricePerBranch` ölü alan. |
| Performans | 7/10 | Veri küçük (en fazla 200 plan), tek GET var, N+1 yok. Odak kaybına yol açan remount dışında sorun yok. |
| Erişilebilirlik + Mobil | 4/10 | `Label`'lar input'lara bağlı değil. Silme ikon butonunun `aria-label`'ı yok. Durum yalnızca renkle veriliyor. Grid mobilde düzgün akıyor, dialog `max-h-[90vh]` ile kaydırılabiliyor. Azaltılmış hareket global olarak destekleniyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Hero başlık (eyebrow "Gelir", başlık, açıklama, ikon) | ÇALIŞIYOR | `app/admin/pricing/page.tsx:355-360` | Açıklama ("gerçek veritabanından yönetilir") operatöre bilgi vermiyor. |
| 2 | "Yeni plan" butonu ve oluşturma dialog'u | ÇALIŞIYOR | `page.tsx:361-374` | Açılış çalışıyor. İçindeki form bozuk (bkz. #16-24). |
| 3 | Plan listesinin yüklenmesi (GET `/api/admin/pricing`) | ÇALIŞIYOR | `page.tsx:88-124`, `app/api/admin/pricing/route.ts:34-43` | `order asc, createdAt asc` sırasıyla, en fazla 200 kayıt. |
| 4 | Yükleniyor durumu | ÇALIŞIYOR | `page.tsx:378-379` | Bu sayfada i18n kullanan tek metin bu (`adminInlineLoading.pricingPlans`). |
| 5 | Boş durum | KISMİ | `page.tsx:380-383` | Yalnızca metin var. "İlk planı oluştur" çağrısı ya da şablon yok. |
| 6 | Hata durumu | BOZUK | `page.tsx:115-117` → `380-383` | Yükleme başarısız olunca `plans=[]` kalıyor ve ekranda "Henüz fiyat planı yok" yazıyor. Hata, boş veri gibi görünüyor. Yeniden dene butonu yok. |
| 7 | Plan kartı: ad + açıklama | ÇALIŞIYOR | `page.tsx:390-394` | |
| 8 | Popüler rozeti + ring vurgusu | ÇALIŞIYOR | `page.tsx:388, 395-399` | Birden fazla plan aynı anda "popüler" olabiliyor (API'de kısıt yok). |
| 9 | Fiyat gösterimi | KISMİ | `page.tsx:402-405` | "TRY 1.000 / monthly" biçiminde: para birimi ham ISO kodu, döngü İngilizce ham enum. `Intl.NumberFormat` currency kullanılmıyor. |
| 10 | QR / şube limit rozetleri | ÇALIŞIYOR | `page.tsx:407-409` | Formdaki 0→null hatası yüzünden "0 QR" hiçbir zaman görünmüyor (bkz. #21). |
| 11 | Aktif/Pasif rozeti | ÇALIŞIYOR | `page.tsx:410` | |
| 12 | Özellik listesi | KISMİ | `page.tsx:413-420` | Yalnızca ilk 5 özellik gösteriliyor, "+N daha" ibaresi yok. `key={feature}` kullanıldığı için aynı satır iki kez girilirse React key çakışması oluşuyor. |
| 13 | Kart giriş animasyonu (stagger) | ÇALIŞIYOR | `page.tsx:387` | Ölçülü. Gecikme 10 kartta sınırlanmış. `MotionConfig reducedMotion="user"` global (`components/providers.tsx:232`). |
| 14 | Düzenle → dialog ön doldurma | ÇALIŞIYOR | `page.tsx:128-144, 437-445` | |
| 15 | Sil butonu | KISMİ (riskli) | `page.tsx:215-228, 426`; API `route.ts:149-172` | Onay yok, geri alma yok, kalıcı silme. Abonesi olan plan da silinebiliyor (bkz. Bulgu 2). |
| 16 | Form: Plan adı | BOZUK | `page.tsx:230, 235, 372, 443` | `Form` render içinde tanımlandığı için her tuş vuruşunda input yeniden mount oluyor ve odak kayboluyor. |
| 17 | Form: Fiyat | BOZUK | `page.tsx:239-243` | Odak kaybı. Ondalıklı giriş (örn. "299.") davranışı doğrulanmadı. |
| 18 | Form: Açıklama | BOZUK | `page.tsx:247-251` | Odak kaybı. 500 karakter sınırı istemcide yok. |
| 19 | Form: Para birimi | BOZUK | `page.tsx:255-259` | Odak kaybı. Serbest metin, ISO 4217 kontrolü yok ("XX" de kabul ediliyor). |
| 20 | Form: Döngü (interval) | BOZUK | `page.tsx:261-272` | Serbest `Input`. `onChange` yalnızca tam eşleşmeyi kabul ediyor, bu yüzden "monthly"den bir harf silmek reddediliyor. Değer yalnızca tümünü seçip yapıştırarak değişiyor. Select olmalı. |
| 21 | Form: Maks QR | BOZUK | `page.tsx:276-286` (`Number(v) \|\| null`) | "0" girilince `null` = **sınırsız** kaydediliyor. Negatif ve ondalık değerler sunucuda reddediliyor. |
| 22 | Form: Maks şube | BOZUK | `page.tsx:289-299` | Aynı 0→sınırsız hatası. `maxBranches` hiçbir yerde uygulanmıyor (yalnızca gösterim). |
| 23 | Form: Şube başına fiyat | SAHTE | `page.tsx:302-313`; repo genelinde grep | Kaydediliyor ama hiçbir okuyucu yok: billing, kartlar, Stripe ve bayi sayfası bu alanı kullanmıyor. |
| 24 | Form: Özellikler (satır satır) | BOZUK | `page.tsx:316-321` | Odak kaybı. Sıralama ve vurgulama yok. 200 karakter / 80 satır sınırı istemcide yok. |
| 25 | Form: Popüler switch | ÇALIŞIYOR | `page.tsx:324-327` | Remount oluyor ama tıklamayla durum korunuyor. |
| 26 | Form: Aktif switch | ÇALIŞIYOR | `page.tsx:328-331` | Pasifleştirmenin abonelere etkisi (ücretsiz kademeye düşme, `lib/plan-limits.ts:47-49`) arayüzde açıklanmıyor. |
| 27 | İptal butonu | ÇALIŞIYOR | `page.tsx:334-344` | Yalnızca bu buton formu sıfırlıyor. X, Escape ve overlay sıfırlamıyor (bkz. Bulgu 7). |
| 28 | Oluştur / Güncelle + istemci doğrulaması | KISMİ | `page.tsx:163-213` | İstemci yalnızca "ad ≥ 2 karakter, en az 1 özellik" kontrol ediyor. Sunucudaki zod hatası nesne olarak dönüyor ve toast'ta `[object Object]` görünüyor. |
| 29 | Toast bildirimleri | KISMİ | `lib/admin-toast.ts` | "Basarili:" / "Dikkat:" önekleri Türkçe karaktersiz yazılmış (global sorun). |
| 30 | Stripe Price ID alanı | EKSİK | API `route.ts:24,71,125` kabul ediyor; UI'da alan yok | Commit `f72af9a` "admin/pricing: plana stripePriceId girişi" diyor ama `page.tsx` hiç değiştirilmemiş. |
| 31 | Plan sıralaması (order) | EKSİK | API `route.ts:27, 56-58` | Model ve API destekliyor, arayüzde sürükle-bırak ya da yukarı/aşağı yok. |
| 32 | Plan başına abone sayısı / gelir | EKSİK | `prisma/schema.prisma:1448` (`dealers User[]`) | İlişki var ama sayılmıyor ve gösterilmiyor. |
| 33 | Silme onayı / arşivleme | EKSİK | `page.tsx:426` | |
| 34 | Yetki (ADMIN + gizli kapı) | ÇALIŞIYOR | `route.ts:35,46,93,150` → `lib/api-auth.ts:52-79` | Token-replay kontrolü dahil. Admin olmayanın erişim yolu (IDOR) tespit edilmedi. |
| 35 | Audit log (oluşturma/güncelleme/silme) | ÇALIŞIYOR | `route.ts:78-87, 134-144, 161-170` | Mutasyondan ayrı yazılıyor, transaction yok. |
| 36 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:385`, `components/ui/dialog.tsx:38-39` | Grid 1→2→3 sütun. Dialog `max-h-[90vh] overflow-y-auto`. |
| 37 | Azaltılmış hareket | ÇALIŞIYOR | `components/providers.tsx:232` | |
| 38 | Erişilebilirlik etiketleri | BOZUK | `page.tsx:234, 238, 247...; 426` | `Label`'larda `htmlFor`, input'larda `id` yok. Silme ikon butonunun erişilebilir adı yok. |
| 39 | i18n | KISMİ | `page.tsx:379` dışında tümü sabit Türkçe | EN locale'de sayfa Türkçe kalıyor. Döngü etiketi TR/EN karışık. |
| 40 | Landing fiyatlarıyla senkron | EKSİK | `lib/landing-content.ts:47-51`, `components/landing/PricingSection.tsx:9,36` | Public fiyatlar (₺0/₺299/₺699) sabit kodlu. Burada yapılan hiçbir değişiklik landing'e yansımıyor. |

**Sayım:** ÇALIŞIYOR 17 · KISMİ 8 · BOZUK 9 · SAHTE 1 · EKSİK 5 (toplam 40)

---

## Bulgular

### 1. [KRİTİK] [hata/UX] Form bileşeni render içinde tanımlanmış, her tuş vuruşunda odak kayboluyor
- **Kanıt:** `app/admin/pricing/page.tsx:230` `const Form = ({ onSubmit, submitLabel }) => (...)`. Kullanım yerleri: `:372` ve `:443` (`<Form .../>`). React Compiler kapalı (`next.config` / `package.json` içinde `reactCompiler` yok).
- **Sorun:** `Form` her render'da yeni bir fonksiyon kimliği alıyor, React bunu farklı bir bileşen tipi olarak görüyor. Sonuçta her `setFormData` çağrısında alt ağaç unmount ve yeniden mount ediliyor ve odaktaki `<input>` DOM'dan kalkıyor. Operatör "Plan adı" alanına tek harf yazabiliyor, sonra tekrar tıklaması gerekiyor. Bu tüm metin ve sayı alanlarında geçerli. Sayfanın ana işi (plan yazmak) fiilen kullanılamıyor.
- **Öneri:** Formu modül seviyesinde ayrı bir bileşene taşıyın: `PlanForm({ value, onChange, onSubmit, saving, mode })`. Daha iyisi, sayfanın geri kalanında da kullanılan bir desenle `react-hook-form` + `zodResolver` kullanın. İstemci ve sunucu **aynı zod şemasını** paylaşsın (`lib/validations/pricing.ts` içinden hem `route.ts` hem form import etsin). Böylece alan bazlı hata mesajları satır içinde gösterilir ve sunucu doğrulaması tekrar yazılmaz.
- **Efor:** S

### 2. [KRİTİK] [veri bütünlüğü/gelir] Onaysız kalıcı silme: aboneli plan silinince bayiler sessizce ücretsiz kademeye düşüyor, Stripe webhook'u kırılıyor
- **Kanıt:** `page.tsx:426` (onClick doğrudan `deletePlan`), `route.ts:157-160` (`prisma.pricingPlan.delete`, abone kontrolü yok). `prisma/schema.prisma:111-112` `onDelete: SetNull`. `lib/plan-limits.ts:46-49` (plan yoksa `defaultFreeLimits()` → 3 QR). `lib/billing-core.ts:112,124` (webhook, metadata'daki `planId`'yi `pricingPlanId`'ye yazıyor).
- **Sorun:** Tek bir yanlış tıklama şu zinciri başlatıyor:
  - (a) O plana bağlı tüm bayilerin `pricingPlanId` alanı NULL oluyor ve bayiler anında 3 QR / 1 şube kotasına düşüyor.
  - (b) Stripe aboneliği ise ücret almaya devam ediyor (müşteri para ödüyor, hizmet alamıyor).
  - (c) Sonraki `customer.subscription.updated` webhook'unda `planId` artık var olmayan bir ID'ye işaret ediyor. `prisma.user.update` FK ihlaliyle (P2003) patlıyor, webhook 500 dönüyor ve Stripe yeniden deniyor. Bu son adım mantık olarak çıkarıldı; çalıştırılarak doğrulanmadı.
- **Öneri:**
  - Silmeyi **arşivleme** ile değiştirin: `archivedAt` alanı ekleyin ya da mevcut `isActive=false` + "yeni satışa kapalı" anlamını kullanın.
  - API'de `_count: { dealers }` > 0 ise DELETE'i 409 ile reddedin.
  - Arayüzde iki aşamalı onay dialog'u kullanın: plan adını yazarak onay ve "N aktif abone etkilenir" uyarısı.
  - Abonesi olmayan taslak planlar için hard delete kalabilir.
  - Webhook tarafında `planId` artık yoksa `pricingPlanId: null` + uyarı log'u yazan savunmacı bir dal ekleyin.
- **Efor:** M

### 3. [YÜKSEK] [eksik/gelir] `stripePriceId` arayüzde yok, hiçbir plan ödenebilir hale getirilemiyor
- **Kanıt:** API alanı kabul ediyor (`route.ts:24, 71, 125-127`), `page.tsx` tipinde ve formunda alan yok (`:27-55`). `lib/billing-core.ts:60` → "Bu plan için ödeme yapılandırılmamış". `app/api/dealer/billing/route.ts:73` → `payable: Boolean(p.stripePriceId)`. `git show --stat f72af9a` mesajı "admin/pricing: plana stripePriceId girişi" diyor ama `page.tsx` o commit'te değişmemiş.
- **Sorun:** Yönetici yeni bir plan açtığında bayi tarafında "satın al" butonu hiçbir zaman aktif olmuyor. Tek yol doğrudan veritabanı düzenlemesi, ki burada `DATABASE_URL` canlı Neon'u gösteriyor. Gelir döngüsü arayüz seviyesinde kopuk.
- **Öneri:**
  - Forma "Ödeme" bölümü ekleyin: Stripe Price ID alanı, `price_` önek doğrulaması, "Stripe'ta doğrula" butonu.
  - Bu buton yeni bir uç olan `POST /api/admin/pricing/verify-stripe` ile `stripe.prices.retrieve` çağırsın ve Stripe'taki tutar, para birimi ve döngünün buradaki `price`/`currency`/`interval` ile eşleşip eşleşmediğini göstersin.
  - Kartlarda "Ödenebilir / Stripe bağlı değil" durum rozeti gösterin.
- **Efor:** M

### 4. [YÜKSEK] [veri bütünlüğü] Görünen fiyat ile tahsil edilen fiyat birbirinden bağımsız
- **Kanıt:** `price` alanı serbestçe düzenleniyor (`route.ts:114`). Checkout ise yalnızca `stripePriceId` kullanıyor (`lib/billing-core.ts:69`). Landing fiyatları da ayrı ve sabit kodlu (`lib/landing-content.ts:47-51`).
- **Sorun:** Üç ayrı fiyat kaynağı var: landing sabiti, `PricingPlan.price` ve Stripe Price. Admin fiyatı 299'dan 399'a çektiğinde bayi sayfası 399 gösteriyor ama Stripe 299 tahsil ediyor, landing ise hâlâ ₺299 diyor. Bu tüketici hukuku ve güven açısından risk.
- **Öneri:** Tek doğruluk kaynağı belirleyin.
  - **Tercih edilen:** Admin bu sayfada fiyatı girer, sunucu Stripe'ta yeni bir `Price` oluşturur (Stripe Price'lar değiştirilemez) ve `stripePriceId`'yi otomatik günceller. Mevcut aboneler eski fiyatta kalır ve bu "grandfathered" olarak gösterilir.
  - Landing `PricingSection`'ı `isActive && showOnLanding` planlarını sunucudan, cache'li olarak okusun (Upstash, `revalidateTag('pricing')`). Bu helper build-time DB fail-safe kuralına uymalı: try/catch + varsayılan.
- **Efor:** L

### 5. [YÜKSEK] [hata] Limit alanlarında 0 değeri "sınırsız" olarak kaydediliyor
- **Kanıt:** `page.tsx:283, 296, 309`: `e.target.value === '' ? null : Number(e.target.value) || null`. `Number("0") || null` ifadesi `null` veriyor. `lib/plan-limits.ts:69-71`: `maxQRCodes == null` ise kota kontrolü atlanıyor.
- **Sorun:** "QR oluşturamayan" bir deneme ya da bilgi planı tanımlamak için 0 giren yönetici farkında olmadan **sınırsız** bir plan yaratıyor. Bu doğrudan gelir kaçağı.
- **Öneri:** Sayı ayrıştırmasını `Number.isFinite` ile yapın ve 0'ı koruyun. "Sınırsız"ı ayrı bir checkbox/toggle ile açıkça ifade edin ("Sınırsız ☐ / limit [ ]"). Boş alan ile 0 arasındaki farkı belirsiz bırakmayın. Input'lara `min=0 step=1 inputMode="numeric"` ekleyin.
- **Efor:** S

### 6. [YÜKSEK] [hata/UX] Döngü (interval) alanı yazarak değiştirilemiyor
- **Kanıt:** `page.tsx:261-272`. `onChange` yalnızca tam olarak `monthly|yearly|lifetime` değerlerini kabul ediyor, ara durumlar reddediliyor.
- **Sorun:** "monthly" metnini silip "yearly" yazmak imkânsız, çünkü her ara durum geri alınıyor. Etiket ham enum gösteriyor ("Döngü (monthly/yearly/lifetime)").
- **Öneri:** shadcn `Select` ya da segmentli `ToggleGroup` kullanın: Aylık / Yıllık / Ömür boyu. Kartta da yerelleştirilmiş etiket gösterin ("/ ay", "/ yıl", "tek seferlik").
- **Efor:** S

### 7. [ORTA] [hata] Düzenleme taslağı "Yeni plan" formuna sızıyor ve kopya plan oluşabiliyor
- **Kanıt:** Create dialog'u `onOpenChange={setCreateOpen}` (`:361`), edit dialog'u `onOpenChange={setEditOpen}` (`:437`). Sıfırlama yalnızca İptal butonunda yapılıyor (`:336-341`). İki dialog aynı `formData` state'ini paylaşıyor (`:86`).
- **Sorun:** Bir planı düzenleyip X ya da Escape ile çıkan yönetici "Yeni plan"a bastığında, düzenlediği planın tüm alanları dolu bir form görüyor. "Oluştur"a basarsa birebir kopya bir plan oluşuyor.
- **Öneri:** Create ve edit state'ini ayırın: `mode: 'create' | {edit: id}` + `formKey`. Dialog açılırken (`onOpenChange(true)`) formu deterministik olarak başlatın. Kapanışta kaydedilmemiş değişiklik varsa "Değişiklikler kaybolacak" onayı gösterin.
- **Efor:** S

### 8. [ORTA] [hata yönetimi] Sunucu doğrulama hataları `[object Object]` olarak görünüyor
- **Kanıt:** `route.ts:53, 100` → `{ error: parsed.error.flatten() }` (nesne). `page.tsx:176, 202` → `throw new Error(j.error || ...)`. `String({...})` sonucu `"[object Object]"`.
- **Sorun:** Ad 120 karakteri aşınca, açıklama 500'ü aşınca, negatif fiyat girilince, ondalıklı QR limitinde ya da 8 karakterden uzun para biriminde kullanıcı "Dikkat: [object Object]" görüyor.
- **Öneri:** API'yi `{ error: string, fieldErrors: Record<string,string[]> }` sözleşmesine çekin. Form alan bazlı hataları ilgili input'un altında göstersin. Bunu Bulgu 1'deki paylaşılan şema ile çözün.
- **Efor:** S

### 9. [ORTA] [UX] Yükleme hatası "boş liste" gibi görünüyor
- **Kanıt:** `page.tsx:115-117` (yalnızca toast), `:380-383` ("Henüz fiyat planı yok.").
- **Sorun:** Ağ ya da DB hatasında operatör "plan yok" sanıp yeniden plan oluşturmaya girişebilir. GET ucunda try/catch yok (`route.ts:34-43`), JSON olmayan bir 500 yanıtında `r.json()` ayrıştırma hatası veriyor.
- **Öneri:** `error` state'i ekleyin ve hata kartında "Yeniden dene" butonu gösterin. Veri çekmeyi diğer admin sayfalarında kullanılan SWR/React Query desenine taşıyın (`mutate` ile iyimser güncelleme). Sunucuda Prisma hatasını JSON 500'e çevirin.
- **Efor:** S

### 10. [ORTA] [mimari/ölü kod] `pricePerBranch` hiçbir yerde kullanılmıyor, `maxBranches` uygulanmıyor
- **Kanıt:** Repo genelinde `pricePerBranch` yalnızca `page.tsx` ve `route.ts` içinde geçiyor. `maxBranches` ise yalnızca `plan-limits.ts` dönüşünde ve `/dealer/billing` gösteriminde var. Kota kontrolü (`canCreateBranch` benzeri) yok.
- **Sorun:** Yönetici "Şube başına fiyat" girdiğinde bunun faturalamaya etki ettiğini sanıyor (SAHTE özellik). "Maks şube" de yalnızca kozmetik.
- **Öneri:** İki seçenek var:
  - (a) Şube bazlı ücretlendirme gerçekten planlanıyorsa Stripe'ta `quantity` tabanlı metered/per-seat Price olarak bağlayın ve şube oluşturma ucunda `maxBranches` kontrolünü uygulayın.
  - (b) Planlanmıyorsa alanı formdan kaldırın ve kartta "henüz uygulanmıyor" ibaresiyle açıkça işaretleyin.
- **Efor:** M

### 11. [ORTA] [erişilebilirlik] Etiketler input'lara bağlı değil, ikon butonunun adı yok
- **Kanıt:** `page.tsx:234-235, 238-243, 247-251, 256-259, 262-271, 276-312, 316-321, 325-330`: `Label` bileşenlerinde `htmlFor`, input'larda `id` yok. `:426` silme butonu yalnızca ikondan oluşuyor ve `aria-label` taşımıyor. Aktif/Pasif ve Popüler durumu yalnızca rozet rengiyle ayrışıyor.
- **Sorun:** Ekran okuyucu alanları "düzenleme metni, boş" olarak okuyor. Etikete tıklamak alanı odaklamıyor. Silme butonu "düğme" olarak duyuruluyor.
- **Öneri:** `useId()` ile `id`/`htmlFor` eşlemesi yapın. Silme butonuna `aria-label={\`${plan.name} planını sil\`}` verin. Switch'leri `Label htmlFor` ile bağlayın. Form hatalarını `aria-invalid` + `aria-describedby` ile duyurun.
- **Efor:** S

### 12. [ORTA] [ürün] Plan kartları operatöre karar verdirecek veri göstermiyor
- **Kanıt:** Kart yalnızca statik alanları gösteriyor (`page.tsx:388-429`). `dealers` ilişkisi sayılmıyor (`route.ts:38-41`).
- **Sorun:** Yönetici hangi planın kaç abonesi olduğunu, aylık yinelenen gelirini (MRR), Stripe'a bağlı olup olmadığını, son değişikliği kimin yaptığını göremiyor. Fiyat değişikliği ya da pasifleştirme kararını bilgisiz veriyor.
- **Öneri:** GET'e `include: { _count: { select: { dealers: true } } }` ekleyin. Abonelik durumuna göre (`subscriptionStatus in active,trialing`) grup sayımı yapın. Kartta "Aktif abone · MRR · Stripe durumu · Son güncelleme (audit log'dan)" satırı gösterin.
- **Efor:** M

### 13. [DÜŞÜK] [görsel/i18n] Fiyat biçimlendirmesi ve dil karışıklığı
- **Kanıt:** `page.tsx:403-404` ("TRY 1.000 / monthly"). `:379` dışında tüm metinler sabit Türkçe (`messages/*.json`'da yalnızca `adminInlineLoading.pricingPlans` var). `lib/admin-toast.ts` önekleri "Basarili" / "Dikkat" şeklinde.
- **Öneri:** `new Intl.NumberFormat(locale, { style: 'currency', currency })` kullanın (sonuç: "₺1.000"). Döngü etiketlerini i18n sözlüğüne taşıyın ve sayfa metinlerini `adminPricing.*` anahtarlarına alın. Toast öneklerini "Başarılı" olarak düzeltin (global).
- **Efor:** S

### 14. [DÜŞÜK] [mimari] Audit log mutasyonla atomik değil, eşzamanlı düzenleme koruması yok
- **Kanıt:** `route.ts:60-87, 109-144, 160-170`: ayrı `await` çağrıları, `$transaction` yok. PUT'ta `updatedAt` / versiyon kontrolü yok.
- **Sorun:** Audit yazımı başarısız olursa değişiklik iz bırakmadan kalıyor. İki yönetici aynı planı düzenlerse son yazan kazanıyor ve diğerinin değişikliği sessizce kayboluyor.
- **Öneri:** `prisma.$transaction([...])` kullanın. PUT gövdesine `expectedUpdatedAt` ekleyin ve uyuşmazlıkta 409 + "Bu plan başka biri tarafından değiştirildi" mesajı dönün.
- **Efor:** S

### 15. [DÜŞÜK] [görsel] Hero butonunun rengi temadan kopuk
- **Kanıt:** `page.tsx:363`: `bg-white text-emerald-900`. Hero `tone='auto'` açık temada açık zemin kullanıyor (`components/admin/admin-premium-hero.tsx` tone=auto dalı).
- **Sorun:** Açık temada beyaz buton neredeyse beyaz hero zemininde kayboluyor. Sabit zümrüt rengi `--primary` token'ını yok sayıyor. Görsel olarak doğrulanmadı, sınıflardan çıkarıldı.
- **Öneri:** Standart `Button` (default/primary varyantı) kullanın ve diğer admin sayfalarının hero aksiyonlarıyla hizalayın.
- **Efor:** S

---

## Eksik özellikler (kıyas: Stripe Dashboard Products/Prices, Retool iç araçları, Linear ayar ekranları)

1. **Stripe senkronu ve sağlık göstergesi:** Price oluşturma/bağlama, tutar ve döngü uyuşmazlığı uyarısı, "test/live mod" etiketi. Stripe Dashboard bir ürünün tüm fiyat versiyonlarını ve hangisinin varsayılan olduğunu gösterir.
2. **Fiyat versiyonlama ve "grandfathering":** Fiyat değişince mevcut aboneler eski fiyatta kalsın, yeniler yeni fiyattan başlasın. Değişiklik geçmişi audit log'dan zaman çizelgesi olarak görünsün.
3. **Plan başına metrikler:** Aktif abone, MRR, son 30 gün dönüşüm ve iptal. Gerekirse PostHog/insights'tan beslenen mini sparkline.
4. **Sıralama ve vitrin kontrolü:** Sürükle-bırak sıralama (`order`), "landing'de göster", "tek popüler plan" kuralı, canlı **önizleme** (bayi ve landing kart görünümünün yan yana gösterimi).
5. **Güvenli yaşam döngüsü:** Taslak → Yayında → Arşivlendi durumları, onaylı arşivleme, abone taşıma sihirbazı ("X planındaki 12 bayiyi Y planına taşı").
6. **Kampanya/kupon bağlantısı:** Plan bazlı indirim veya deneme süresi (`trial_period_days`) tanımı. `/admin/coupons` ile entegrasyon.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör sayfaya girdiğinde ilk bakışta şu üç soruya cevap almalı: "Hangi planlar satışta, kaç kişi hangi planda, ödeme hattı sağlıklı mı?" Düzenleme güvenli, geri alınabilir ve canlı önizlemeli olmalı.

**Yerleşim:**
- **Üst şerit (KPI satırı):** Toplam aktif abone · MRR · Stripe bağlantı durumu (yapılandırılmış / eksik Price ID'li plan sayısı) · Ücretsiz kademedeki bayi sayısı (`FREE_TIER_MAX_QRCODES`).
- **Ana alan, iki görünüm:**
  - (a) **Vitrin görünümü:** Planlar bayinin göreceği sırayla, sürükle-bırak sıralanabilir kartlar halinde dizilir. Her kartta durum çipi (Taslak/Yayında/Arşiv), Stripe çipi ve abone sayısı bulunur.
  - (b) **Tablo görünümü:** Stripe/Retool tarzı. Kolonlar ad, fiyat, döngü, limitler, abone, MRR, Stripe, son değişiklik. Satır tıklanınca sağ **yan panel** açılır.
- **Düzenleyici sağ panelde (Sheet) açılır, modal değil.** Solda form, sağda canlı bayi kartı önizlemesi yer alır. Form bölümleri: Temel bilgiler · Fiyat & ödeme (Stripe) · Limitler · Özellikler (sıralanabilir liste ve satır ekle/sil) · Görünürlük. Kaydedilmemiş değişiklik göstergesi ve "değişiklik özeti" onayı olur, örneğin "Fiyat 299 → 399; 14 aktif abone etkilenmez (grandfathered)".
- **Tehlikeli eylemler:** Ayrı "Tehlikeli bölge" kartında, plan adını yazarak onaylanır.

**Motion/3D:** Bu sayfa bir operasyon aracı, 3D gereksiz. Ölçülü öneriler:
- Sıralamada `Reorder` (framer-motion) ile yumuşak yer değiştirme.
- KPI sayıları değişince kısa sayı geçişi.
- Kaydetme sonrası kartta 300 ms'lik vurgu flaşı.
- Hepsi `MotionConfig reducedMotion="user"` altında kalmalı (mevcut).

**Veri/API değişiklikleri:**
- `lib/validations/pricing.ts`: istemci ve sunucunun paylaştığı zod şeması. API `{ error, fieldErrors }` döner.
- `GET /api/admin/pricing`: `_count.dealers`, aktif abone sayısı, MRR hesabı, `stripeLinked`.
- `POST /api/admin/pricing/:id/stripe-sync`: Stripe'ta Price oluşturur ya da doğrular ve `stripePriceId`'yi yazar.
- `PATCH /api/admin/pricing/reorder`: `{ ids: string[] }` ile toplu `order` günceller.
- `DELETE` yerine `POST /:id/archive`. Aboneli plan için 409.
- Şema: `status` (DRAFT/PUBLISHED/ARCHIVED), `showOnLanding`, `trialDays`. `pricePerBranch` için karar verilmeli (uygula ya da kaldır).
- Landing `PricingSection` DB'den cache'li okur: `unstable_cache` / Upstash + `revalidateTag('pricing')` + build-time fail-safe varsayılanı `pricingPlanDefs`.
- Webhook'ta silinmiş ya da arşivlenmiş `planId` için savunmacı dal.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/users` (plan atama):** `app/admin/users/users-client.tsx:352-361` aynı `/api/admin/pricing` ucunu okuyup bayilere elle plan atıyor (`/api/admin/users/[id]/plan`). Abone listesi ve plan taşıma bu sayfaya, plan detay panelindeki "Aboneler" sekmesine gelmeli. Users ekranında yalnızca kısayol kalmalı.
- **Landing fiyat bölümü (`components/landing/PricingSection.tsx` + `lib/landing-content.ts`):** Amaç olarak bu sayfayla çakışıyor ama veri olarak kopuk. Birleştirilmeli: landing bu sayfanın yönettiği planları okumalı.
- **`/admin/coupons`:** İndirim ve kampanyalar planlarla birlikte bir **"Gelir" hub'ı** altında toplanmalı: Planlar · Kuponlar · Abonelikler (yeni). Bugün hiçbir admin sayfası `subscriptionStatus` / Stripe abonelik durumunu göstermiyor.
- Sayfa **kaldırılmamalı**. Gelir döngüsünün tek admin ayar noktası olduğu için korunmalı, ama yukarıdaki kapsamla yeniden tasarlanmalı.

---

## Doğrulama (şüpheci inceleme)

Yöntem: Salt okunur kod okuması. Okunan dosyalar: `app/admin/pricing/page.tsx`, `app/api/admin/pricing/route.ts`, `prisma/schema.prisma`, `lib/plan-limits.ts`, `lib/billing-core.ts`, `app/api/webhooks/stripe/route.ts`, `app/api/dealer/billing/route.ts`, `app/dealer/billing/page.tsx`, `app/api/qr-codes/route.ts` ve `next.config.js`. Hiçbir şey çalıştırılmadı, DB'ye dokunulmadı.

### 1. Form render içinde tanımlanmış, metin alanlarına yazı yazılamıyor: **DOĞRULANDI**
- `page.tsx:230` `const Form = ({ onSubmit, submitLabel }) => (...)` her `AdminPricingPage` render'ında yeni bir fonksiyon referansı üretiyor. `:372` ve `:443` bunu `<Form />` olarak, yani bileşen tipi olarak kullanıyor. React tip kimliğine göre uzlaştırma yaptığı için her render'da eski alt ağaç unmount, yenisi mount ediliyor.
- `formData` state'i üst bileşende (`:86`). Her `onChange` (`:235`, `:242`, `:250`, `:258`, `:283`, `:296`, `:309`, `:320`) `setFormData` çağırıyor, üst bileşen yeniden render ediliyor, `Form` yeni tip oluyor ve odaktaki `<input>` DOM'dan kalkıyor.
- Hafifletici bir etken yok. `next.config.js:258-260` `compiler` bloğunda yalnızca `removeConsole` var, `reactCompiler` tanımlı değil (`experimental` bloğunda da yok). Compiler açık olsaydı bile `Form`, `formData`'yı kapsadığı için her değişiklikte yeniden oluşurdu.
- **Yeniden üretim:** "Yeni plan" → "Plan adı" alanına "P" yaz. Değer kaydedilir ama odak kaybolur, ikinci karakter için alana yeniden tıklamak gerekir. Textarea'da (özellikler) da aynı durum yaşanır. Switch'ler odak gerektirmediği için çalışır.
- Önem derecesi: Yüksek (sayfanın ana işlevi pratikte kullanılamıyor). Çözüm: `Form`'u modül seviyesinde ayrı bir `PlanForm` bileşenine taşıyıp `value`/`onChange` prop'larıyla beslemek ya da gövdeyi `{renderForm(...)}` olarak fonksiyon çağrısıyla vermek.

### 2. Aboneli plan onaysız kalıcı siliniyor: **DOĞRULANDI** (Stripe kısmı koşullu)
- Onay yok: `page.tsx:426` çöp kutusu doğrudan `deletePlan(plan.id)` çağırıyor, araya diyalog girmiyor. Buton "Düzenle"nin hemen yanında (`:423-428`).
- Sunucuda koruma yok: `route.ts:157-160` yalnızca planın var olup olmadığına bakıp `prisma.pricingPlan.delete` çağırıyor. `dealers` sayımı ya da `subscriptionStatus` kontrolü yapmıyor.
- Etki: `schema.prisma:111-112` `onDelete: SetNull` → bağlı bayilerin `pricingPlanId` alanı NULL oluyor. `lib/plan-limits.ts:46-48` → `defaultFreeLimits()` (3 QR, 1 şube, `:23-27`). `app/api/qr-codes/route.ts:101` `canCreateQRCode` üzerinden 402 dönmeye başlıyor. Bu, Stripe'sız elle atanmış planlar (`/api/admin/users/[id]/plan`) için de geçerli. Stripe yapılandırılmamış olsa bile somut veri kaybı var.
- Stripe kolu (koşullu): Silme işlemi Stripe aboneliğini iptal etmiyor, bu yüzden ücret alınmaya devam eder. Sonraki `customer.subscription.updated` (aktif) olayında `billing-core.ts:112,124` `pricingPlanId: planId` olarak silinmiş ID'yi yazmaya çalışıyor. FK ihlali olur (P2003, mantıksal çıkarım, çalıştırılmadı) → `webhooks/stripe/route.ts:69-72` 500 döner → Stripe yeniden dener. Aynı `update` içinde `subscriptionStatus`/`subscriptionCurrentPeriodEnd` da yazılamadığı için abonelik durumu senkronu tamamen durur. Bu kol, üretimde `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` tanımlıysa ve en az bir bayi o plana abone olduysa geçerli. Yerel `.env` dosyasında STRIPE anahtarı yok, üretim ortamı doğrulanmadı.
- Ek gözlem (iddiada yok): `plan-limits.ts:47` `!plan.isActive` durumunda da ücretsiz kademeye düşürüyor. Yani "Aktif" switch'ini kapatmak (`page.tsx:329`) da tüm abonelerini sessizce düşürüyor. Arşivleme tasarlanırken bu ayrım (yeni satışa kapalı ≠ mevcut aboneyi düşür) mutlaka yapılmalı.
- **Yeniden üretim:** Bayi X'e `/admin/users` üzerinden plan P (maxQRCodes=50) ata → `/admin/pricing` sayfasında P kartındaki çöp kutusuna tek tıkla → X'in `pricingPlanId` alanı NULL olur, X'in 4. QR oluşturma isteği 402 alır.

### 3. Limit alanında 0 girilince plan sınırsız oluyor: **DOĞRULANDI** (önem derecesi abartılmış)
- `page.tsx:283,296` `Number(e.target.value) || null` → `"0"` → `0 || null` → `null`. Sunucu şeması `route.ts:21-22` `min(0)` ile 0'ı kabul ederdi ama istemci hiç 0 göndermiyor. `plan-limits.ts:72-73` null limitte `allowed: true` döndürüyor.
- Somut senaryo: QR içermeyen bir "vitrin/menü" planı için maxQRCodes=0 girilir → plan sınırsız QR'lı kaydedilir → o plana atanan bayiler sınırsız QR açabilir.
- Hafifletici etkenler: Kontrollü input `value={formData.maxQRCodes ?? ''}` (`:279`) olduğu için 0 yazılır yazılmaz alan anında boşalıyor, kartta da "QR sınırsız" rozeti çıkıyor (`:408`). Admin bunu görsel olarak fark edebilir. `maxBranches` hiçbir yerde uygulanmıyor (grep: yalnızca `plan-limits.ts` içinde okunuyor, kota kontrolü yok), dolayısıyla şube alanının 0 → null dönüşümünün pratik etkisi yok. `pricePerBranch` 0 → null de zararsız.
- Önem derecesi: Orta/düşük (niş ama gerçek bir veri bütünlüğü hatası). Çözüm: `e.target.value === '' ? null : Number(e.target.value)` ile 0'ı korumak, "Sınırsız" seçimini ayrı bir açık checkbox ile ifade etmek ve istemci ile sunucunun ortak zod şemasını kullanmak.

### 4. stripePriceId arayüzde girilemiyor: **DOĞRULANDI** (ayrıntı kısmen yanlış, önem derecesi düşürülmeli)
- Doğru kısım: `page.tsx` içinde `PricingPlan`/`FormData` tiplerinde, formda ve `payload` (`:146-161`) içinde `stripePriceId` yok. API alanı kabul ediyor (`route.ts:24,71,125-127`). Kod tabanında başka hiçbir arayüz bu alanı yazmıyor (grep: yalnızca `admin/pricing/route.ts`, `dealer/billing/route.ts` ve `billing-core.ts` içinde geçiyor). Bu yüzden admin panelinden ödenebilir plan oluşturulamıyor. Olumlu bir yan: PUT çağrısında alan `undefined` kaldığı için (`route.ts:125`) mevcut bir `stripePriceId` düzenleme sırasında silinmiyor.
- Yanlış kısım: "Bayi tarafında checkout her zaman hata veriyor" doğru değil. `dealer/billing/route.ts:73` `payable: false` dönüyor, `app/dealer/billing/page.tsx:199-208` de bu planlar için devre dışı bir "İletişime geçin" butonu gösteriyor. Checkout hiç çağrılmıyor, hata mesajı oluşmuyor. `billing-core.ts:60` hatasına yalnızca doğrudan API çağrısıyla ulaşılabilir.
- Etki Stripe'ın üretimde açık olmasına bağlı (doğrulanmadı). Stripe kapalıysa hiçbir plan zaten ödenebilir değil (`page.tsx:156-160` uyarısı). Bu nedenle bulgu güvenlik/hata değil, işlevsel bir eksiklik. Önem derecesi: Orta.
- Çözüm: Plan formuna "Stripe Price ID" alanı (ya da tercihen sunucu tarafında `stripe.prices.retrieve` ile doğrulayan bir "Stripe ile eşle" eylemi) ve kartta "Ödenebilir / Stripe bağlı değil" durumu.


---

## Uygulama (Dalga 2)

**Yeni yapı:** `app/admin/pricing/page.tsx` sunucu bileşeni (yetki DB'den, `getPricingOverview` sunucuda ön yüklenir) → istemci adası `components/admin/a-fiyatlandirma/pricing-console.tsx` (react-query `initialData`). Sunucu mantığı `lib/admin-pricing/pricing.server.ts`, paylaşılan zod + saf yardımcılar `lib/admin-pricing/contract.ts` (form ve uçlar aynı şemayı kullanır). Yeni defineRoute BFF uçları (ADMIN + zod + rate limit): `GET /api/admin/pricing/console`, `POST /api/admin/pricing/plans`, `PATCH /api/admin/pricing/plans/:id` (iyimser kilit 409), `POST …/plans/:id/archive` (dryRun/confirm), `POST …/plans/:id/restore`, `GET …/plans/:id/history`, `PUT /api/admin/pricing/reorder`, `POST /api/admin/pricing/stripe` (doğrula), `POST /api/admin/pricing/stripe/create-price`. Eski `route.ts`: GET korunur (/admin/users plan seçici), POST/PUT 410, DELETE geriye uyumlu ama arşivdir ve `archivePlan`'a gider. Testler: `__tests__/lib/admin-pricing.test.ts` (20 test).

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum |
|---|---|---|
| 1 | Hero başlık | ÇALIŞIYOR — QDL `PageHeader` (ops); açıklama etkiyi anlatır (bayi faturalama + vitrin). |
| 2 | Yeni plan | ÇALIŞIYOR — modal yerine sağ çekmece (`EntityEditorSheet`); plan satışa kapalı oluşturulur. |
| 3 | Plan listesi yükleme | ÇALIŞIYOR — sunucuda ön yükleme + `/console` BFF; abone/MRR/son değişiklik ile. |
| 4 | Yükleniyor | ÇALIŞIYOR — QueryState iskeleti. |
| 5 | Boş durum | ÇALIŞIYOR — "Yeni plan" eylemli ilk kullanım boş durumu. |
| 6 | Hata durumu | ÇALIŞIYOR — QueryState hata + "Tekrar dene"; boş liste gibi görünmez. |
| 7 | Kart: ad + açıklama | ÇALIŞIYOR |
| 8 | Popüler rozeti | ÇALIŞIYOR — "Öne çıkan"; sunucuda tek plan kuralı (transaction içinde). |
| 9 | Fiyat gösterimi | ÇALIŞIYOR — `Intl.NumberFormat` ("₺299 / ay", "Ücretsiz", "tek seferlik"). |
| 10 | QR/şube rozetleri | ÇALIŞIYOR — 0 artık 0 olarak saklanır ve görünür. |
| 11 | Aktif/Pasif | ÇALIŞIYOR — "Satışta / Satışa kapalı"; aboneleri düşürmediği formda açıklanır. |
| 12 | Özellik listesi | ÇALIŞIYOR — ilk 4 + "+N özellik daha"; indeksli key; yinelenen özellik şemada reddedilir. |
| 13 | Giriş animasyonu | ÇALIŞIYOR — `fadeUp` + bütçeli `staggerDelay`, sıralamada `layout` geçişi; azaltılmış harekette kapalı. |
| 14 | Düzenle ön doldurma | ÇALIŞIYOR — `planToForm`, sürüm (updatedAt) taşınır. |
| 15 | Sil butonu | KALDIRILDI → "Arşivle": etki önizlemeli (işletme/ödeyen), plan adı yazılarak onay; aboneli plan onaysız 409; hard delete hiçbir yolda yok (C1). |
| 16-19 | Form: ad/fiyat/açıklama/para birimi | ÇALIŞIYOR — RHF + paylaşılan zod; odak kaybı yok; fiyat ≤2 ondalık; para birimi seçimi (TRY/USD/EUR). |
| 20 | Döngü | ÇALIŞIYOR — seçim (Aylık/Yıllık/Tek seferlik). |
| 21-22 | Maks QR / şube | ÇALIŞIYOR — "Sınırsız" ayrı anahtar; 0 = 0 (testli). Şube limiti uygulanıyor (bayi şube ucu). |
| 23 | Şube başına fiyat | KALDIRILDI — hiçbir faturalama yolu okumuyordu (SAHTE); formdan ve yeni uçlardan çıkarıldı, kolondaki eski değer korunur. |
| 24 | Özellikler | ÇALIŞIYOR — satır satır, sayaçlı, 80 satır/200 karakter istemcide ve sunucuda; ayrıca Özellik matrisi sekmesi. |
| 25-26 | Popüler / Aktif anahtarları | ÇALIŞIYOR — `SwitchField` kart varyantı, açıklamalı. |
| 27 | İptal | ÇALIŞIYOR — kirliyken X/Esc/dış tıklama dahil kapatma onayı; form her açılışta deterministik sıfırlanır (kopya plan sızıntısı yok). |
| 28 | Kaydet + doğrulama | ÇALIŞIYOR — alan bazlı hata (aria-invalid/describedby), sunucu `details` alanlara eşlenir; `[object Object]` yok; 409 çakışma bandı + "en son hâlini yükle". |
| 29 | Toast | ÇALIŞIYOR — sonner, Türkçe karakterli metinler. |
| 30 | Stripe Price ID | ÇALIŞIYOR — formda alan + "Stripe'ta doğrula"; kayıtta sunucu Stripe'tan okur, tutar/para birimi/döngü/pasiflik uyuşmazlığında reddeder; "Stripe eşlemesi" sekmesi (toplu doğrulama, "Stripe'ta oluştur ve eşle" — idempotent yeni Price). |
| 31 | Sıralama | ÇALIŞIYOR — yukarı/aşağı (klavye erişilebilir) + "Sırayı kaydet" → `PUT /reorder` (tam liste doğrulaması, denetimli). |
| 32 | Abone sayısı / gelir | ÇALIŞIYOR — kartta işletme/ödeyen/gecikmede/MRR; KPI şeridi. |
| 33 | Silme onayı / arşiv | ÇALIŞIYOR — Arşiv sekmesi + "Geri al" (satışa kapalı döner). |
| 34 | Yetki | ÇALIŞIYOR — sayfa `requireAuth(['ADMIN'])`, tüm yeni uçlar defineRoute. |
| 35 | Audit log | ÇALIŞIYOR — mutasyonla aynı transaction; yalnız değişen alanlar; düzenleyicide "Değişiklik geçmişi". |
| 36 | Mobil | ÇALIŞIYOR — çekmece tam genişlik, matris kendi kabında yatay kaydırma, dokunma hedefleri ≥44px. |
| 37 | Azaltılmış hareket | ÇALIŞIYOR |
| 38 | Erişilebilirlik | ÇALIŞIYOR — label/for, ikon butonlarda aria-label, durumlar ikon+metin, matris hücreleri `aria-pressed`. |
| 39 | i18n | KISMİ (bilinçli) — admin panelinin geri kalanı gibi Türkçe; `adminPricing.*` anahtarları i18n dalgasına. |
| 40 | Landing senkronu | ÇALIŞIYOR — landing `PricingPlan`'dan okuyor; her plan mutasyonu `revalidateTag('public-pricing')` ile vitrini anında tazeler. |

### Kapanan bulgular
1, 2, 3, 4 (Stripe uyuşmazlığında kayıt reddi + Stripe'ta yeni Price; landing tek kaynaktan, anında tazelenir), 5, 6, 7, 8, 9, 10 (pricePerBranch kaldırıldı), 11, 12, 13 (i18n anahtarları hariç), 14, 15 — **15/15**.

### Kalanlar
- i18n anahtarları (`adminPricing.*`): admin geneli i18n dalgasına bırakıldı.
- Deneme süresi, "vitrinde göster", Taslak/Yayında durumu ve abone taşıma sihirbazı şema alanı ister — **ŞEMA İSTEĞİ:** `PricingPlan.trialDays Int?`, `PricingPlan.showOnLanding Boolean @default(true)`. Şimdilik "Satışta" (isActive) vitrin görünürlüğünü belirler.
- MRR liste fiyatıyla tahmindir (eski fiyatlı Stripe abonelikleri farklı olabilir); arayüzde böyle etiketlidir.
