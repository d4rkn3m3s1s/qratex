# /dealer/onboarding

**Amaç:** Yeni bayinin işletmesini kullanıma hazırlaması için 6 adımlı bir kurulum kontrol listesi (profil, konum, ilk QR, ilk ürün, ilk geri bildirim, plan). Adım durumları kalıcı bir bayrakta tutulmuyor, gerçek kayıtlardan türetiliyor (`app/api/dealer/onboarding/route.ts:8-15`).

**Genel puan:** 5.3/10 · **Karar:** yeniden tasarla. Veri modeli doğru kurulmuş ("durum kayıtlardan türetilir"), bunu koruyun. Ancak sayfa, layout'taki gate şeridi ve `OnboardingSheet` birbirinden kopuk üç ayrı "kurulum" deneyimi sunuyor. Bunlar tek bir aktivasyon modülünde birleştirilmeli.

İncelenen dosyalar:
- `app/dealer/onboarding/page.tsx`
- `app/dealer/layout.tsx`
- `app/api/dealer/onboarding/route.ts`
- `components/onboarding/onboarding-gate-banner.tsx`
- `components/onboarding/onboarding-sheet.tsx`
- `components/ui/progress.tsx`
- `components/layout/dashboard-page-hero.tsx`
- `lib/admin-toast.ts`
- `lib/api-auth.ts`
- `components/dashboard/sidebar.tsx`
- `proxy.ts`
- `prisma/schema.prisma` (User, QRCode, Product, Feedback, DealerLocation, DealerStaff)
- `messages/tr.json` (onboarding anahtarları)
- `app/dealer/settings/page.tsx` (hedef sayfa alanları)

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Çekirdek liste çalışıyor. Ama "plan" adımı ücretsiz bayide hiç tamamlanmıyor, "konum" adımı çok-şubeli `DealerLocation` modelini görmüyor, "profil" adımı açıklamayı kontrol etmiyor. Hata yanıtında sayfa çöküyor. |
| UX | 5/10 | Okunur ve sade bir liste. Ancak "Tamamlandı" mesajı %33'te çıkabiliyor, yönlendirmeler ilgili sekmeye/alana derin link vermiyor, sayfa sekme dönüşünde kendini yenilemiyor, aynı anda alt sayfa (Sheet) ve şerit de açılıyor. |
| Görsel | 6/10 | Hero ve tasarım dili diğer panellerle tutarlı. Kartlar düz bir liste; ilerleme hissi ve aktivasyon anı (kutlama) zayıf. |
| Mimari | 5/10 | API temiz ve kayıtlardan türetiliyor. Fakat aynı uç iki bileşende ayrı fetch ile çağrılıyor, tipler kopyalanmış, `r.ok` kontrolü yok, iki ayrı onboarding sistemi var (localStorage tabanlı Sheet ile DB tabanlı sihirbaz). |
| Performans | 5/10 | Sayfa tek başına hafif. Ama layout şeridi, kurulum bittikten sonra bile her rota değişiminde 4 Prisma sorgusu, oturum kontrolü ve token-replay kontrolü tetikliyor. Feedback sayımı sınırsız `count`. |
| Erişilebilirlik + Mobil | 5/10 | `Progress` bileşeni `value`'yu Radix Root'a iletmiyor, bu yüzden ekran okuyucu ilerlemeyi belirsiz okuyor. Adım satırları ve "Sıradaki adım" bandı dar ekranda sarmıyor. Sayfa `p-6` ile layout dolgusunu ikiye katlıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa hero'su (başlık, açıklama, roket ikonu) | ÇALIŞIYOR | `page.tsx:85-89` | `DashboardPageHero` = `AdminPremiumHero`, reduced-motion destekli (`components/admin/admin-premium-hero.tsx:162`) |
| 2 | Kurulum durumunu yükleme (GET `/api/dealer/onboarding`) | KISMİ | `page.tsx:72-78` | `r.ok` kontrolü yok; hata JSON'u da `setData`'ya gidiyor (Bulgu 1) |
| 3 | Yükleniyor iskeleti | ÇALIŞIYOR | `page.tsx:91-96` | 3 blok gösteriyor, gerçekte 6 adım + ilerleme kartı var. `aria-busy`/`role="status"` yok |
| 4 | Hata durumu (toast + "Veri yüklenemedi.") | KISMİ | `page.tsx:76`, `page.tsx:97-98` | Yalnız ağ/JSON parse hatasında devreye giriyor. "Yeniden dene" yok. Toast `lib/admin-toast.ts:20` ile "Dikkat: " önekli |
| 5 | "X/Y adım tamamlandı" sayacı | ÇALIŞIYOR | `page.tsx:105-107` | Opsiyonel adımları da sayıyor, "complete" ise yalnız zorunluları sayıyor (Bulgu 4) |
| 6 | Yüzde göstergesi | ÇALIŞIYOR | `page.tsx:80`, `page.tsx:108` | |
| 7 | İlerleme çubuğu | KISMİ | `page.tsx:110`, `components/ui/progress.tsx:15-24` | Görsel olarak çalışıyor. `value` Root'a geçmediği için `aria-valuenow` yok (Bulgu 6) |
| 8 | "Kurulum tamamlandı" bandı + "Panele git" | KISMİ | `page.tsx:111-118` | Yalnız zorunlu 2 adım bitince çıkıyor (2/6, %33'te bile). Tek seferlik kutlama/aktivasyon anı yok |
| 9 | "Sıradaki adım" CTA bandı | ÇALIŞIYOR | `page.tsx:119-130` | İlk tamamlanmamış adımı seçiyor. Dar ekranda sarmıyor |
| 10 | Adım kartları listesi | ÇALIŞIYOR | `page.tsx:136-180` | Bilinmeyen `key` sessizce atlanıyor (`page.tsx:139`) |
| 11 | Adım: İşletme profili | KISMİ | `route.ts:39`, `page.tsx:31-32` | Metin "ad ve açıklama" diyor, kontrol yalnız `businessName` (Bulgu 5) |
| 12 | Adım: Konum | KISMİ | `route.ts:40`, `route.ts:48`, `schema.prisma:746-763` | Yalnız `User.address/lat/lng` kontrol ediliyor. `DealerLocation` (çok-şube) sayılmıyor. Ayarlardaki adres alanına derin link yok |
| 13 | Adım: İlk QR kodu | ÇALIŞIYOR | `route.ts:34`, `route.ts:41`, `route.ts:49` | Pasif/süresi dolmuş QR da sayılıyor (kabul edilebilir) |
| 14 | Adım: İlk ürün | ÇALIŞIYOR | `route.ts:35`, `route.ts:42` | |
| 15 | Adım: İlk geri bildirim | KISMİ | `route.ts:36`, `route.ts:51` | Soft-delete edilmiş (`deletedAt`) geri bildirimler de sayılıyor. Sınırsız `count`. CTA "QR'ı paylaş" ama QR basım kiti/şablon yok |
| 16 | Adım: Plan seçimi | KISMİ | `route.ts:44`, `lib/plan-limits.ts:8`, `lib/billing-core.ts:124` | Ücretsiz bayide `pricingPlanId` null kalıyor, adım hiç tamamlanmıyor ve ilerleme kalıcı olarak 5/6'da takılıyor (Bulgu 3). Seçilen `subscriptionStatus` kullanılmıyor (`route.ts:31`) |
| 17 | "opsiyonel" rozeti | ÇALIŞIYOR | `page.tsx:160-164` | Metin küçük harf ve 10px; kontrast ve okunurluk zayıf |
| 18 | Tamamlanan adım görünümü (yeşil kart, üstü çizili başlık, tik) | ÇALIŞIYOR | `page.tsx:144`, `page.tsx:148-158` | Tamamlanan adımda "Düzenle/Gör" gibi bir aksiyon yok |
| 19 | Adım CTA butonları (Link) | ÇALIŞIYOR | `page.tsx:168-175` | Hepsi var olan sayfalara gidiyor (`app/dealer/settings`, `qr-codes`, `products`, `billing`) |
| 20 | Yetki: sayfa | ÇALIŞIYOR | `proxy.ts:52`, `proxy.ts:124` | `/dealer/*` DEALER rolüyle korunuyor |
| 21 | Yetki: API | ÇALIŞIYOR | `route.ts:17-19` | `requireAuth(['DEALER'])` + token-replay; veriler yalnız oturum sahibinin `id`'siyle süzülüyor, IDOR yok |
| 22 | Önbellek başlıkları | ÇALIŞIYOR | `route.ts:66` | `PRIVATE_NO_STORE_HEADERS` |
| 23 | Layout gate şeridi ("Kurulum bitene kadar panel sınırlıdır") | SAHTE | `onboarding-gate-banner.tsx:53` | Kodda kurulum durumuna bağlı hiçbir kısıtlama yok (`grep dealer/onboarding`: yalnız sidebar, banner ve sayfa). Uyarı doğru değil (Bulgu 2) |
| 24 | Şeritte "Kurulumu bitir" dalı | BOZUK (ölü kod) | `onboarding-gate-banner.tsx:37`, `onboarding-gate-banner.tsx:63-66` | `requiredDone === requiredTotal` olduğunda `complete=true` olur ve şerit zaten `null` döner. Bu dala hiç girilmez |
| 25 | `OnboardingSheet` (layout'ta, localStorage tabanlı 3 adımlı tur) | KISMİ / ÇAKIŞAN | `app/dealer/layout.tsx:46`, `onboarding-sheet.tsx:28-34`, `onboarding-sheet.tsx:60-73` | Sihirbaz sayfasının üstünde de açılıyor. Farklı adım seti ve farklı hedefler kullanıyor (feedback → `/dealer/feedbacks` ↔ sayfada `/dealer/qr-codes`). Rol/hesap ayırmayan tek bir anahtar kullanıyor (Bulgu 7) |
| 26 | Sidebar girişi "Kurulum" | KISMİ | `sidebar.tsx:236` | Kurulum bitse de en üstte kalıcı. Rozet/ilerleme göstergesi yok |
| 27 | Çok dillilik (i18n) | EKSİK | `page.tsx:28-65`, `page.tsx:86-87`, `page.tsx:106`, `page.tsx:114` | Tüm metin sabit Türkçe. Aynı layout'taki Sheet `useAppT` kullanıyor, sidebar etiketi i18n'li (`messages/en.json:2568`) |
| 28 | Sekmeye/odağa dönünce yeniden kontrol | EKSİK | `page.tsx:72-78` | Tek seferlik fetch. Kullanıcı yeni sekmede QR oluşturup döndüğünde durum güncellenmiyor |
| 29 | Sihirbazı gizle/atla, adımı "sonra yap" | EKSİK | — | Opsiyonel adımlar için erteleme/gizleme yok |
| 30 | Mobil yerleşim | KISMİ | `page.tsx:84`, `page.tsx:121`, `page.tsx:146-175` | `p-6` ile layout dolgusu (`layout.tsx:35`) birleşince dar ekranda ~36px yan boşluk oluşuyor. Satırlar `flex-wrap` değil, `shrink-0` buton metni sıkıştırıyor |
| 31 | Azaltılmış hareket | ÇALIŞIYOR (önemsiz) | `progress.tsx:28` | Sayfada animasyon yok. Progress `motion-reduce:transition-none` |
| 32 | Kurulum telemetrisi/huni (PostHog) | EKSİK | — | Adım tamamlama ve terk oranı ölçülmüyor; projede PostHog funnel altyapısı mevcut |

---

## Bulgular

### 1. Hata yanıtında sayfa çöküyor (`data.steps` undefined)
- **Önem:** yüksek · **Kategori:** hata yönetimi / correctness · **Efor:** S
- **Kanıt:** `page.tsx:73-75` (`.then((r) => r.json()).then((d) => setData(d))`), `page.tsx:81` (`data?.steps.find(...)`), `lib/api-auth.ts:58-77` (401/403 ve token-replay ihlalinde `{ error: ... }` JSON dönüyor).
- **Sorun:** API 401/403 (oturum düşmüş, token-replay ihlali) veya JSON gövdeli bir 4xx/5xx döndürdüğünde `r.json()` başarıyla `{ error: '...' }` çözüyor ve bu nesne `data` olarak yazılıyor. `data` truthy olduğu için `!data` dalı atlanıyor. `data?.steps.find` ifadesinde `steps` `undefined` olduğundan `TypeError` fırlıyor ve sayfa `app/dealer/error.tsx` hata sınırına düşüyor. Aynı uçtaki gate şeridi bunu doğru yapıyor (`onboarding-gate-banner.tsx:25-27`: `r.ok` ve `Array.isArray(data.steps)` kontrolü). Yani iki tüketici farklı davranıyor.
- **Öneri:** Bu ucu tek bir paylaşılan hook'a taşıyın: `useDealerOnboarding()` (SWR veya React Query, anahtar `/api/dealer/onboarding`). Hook `r.ok` kontrolü ve şema doğrulaması yapsın (zod `OnboardingSchema.safeParse`), hata durumunu tipli dönsün. Sayfa da şerit de bu hook'u kullansın; tip tanımı tek yerde (`lib/onboarding/types.ts`) olsun. 401'de giriş sayfasına yönlendirin, diğer hatalarda "Yeniden dene" butonlu boş durum gösterin.

### 2. Gate şeridi gerçek olmayan bir kısıtlama vaat ediyor
- **Önem:** yüksek · **Kategori:** ürün doğruluğu / güven · **Efor:** M
- **Kanıt:** `onboarding-gate-banner.tsx:53` ("Kurulum bitene kadar panel sınırlıdır."), `onboarding-gate-banner.tsx:12-17` (yorum: "erişimi TAMAMEN engellemez"). Depoda kurulum durumunu okuyan başka bir kod yok; `/api/dealer/onboarding` yalnız sayfa ve şeritte çağrılıyor.
- **Sorun:** Bayiye panelin kısıtlı olduğu söyleniyor ama hiçbir özellik kilitli değil. Bu SAHTE bir mesaj. Kullanıcıyı ya gereksiz yere strese sokuyor ya da (kısıtlama görmediği için) ürün mesajlarına güvenini zayıflatıyor. Ayrıca şerit `sticky top-0 z-30` (`onboarding-gate-banner.tsx:44`) ve her sayfada kalıcı; kapatılamıyor.
- **Öneri:** Önce ürün kararı verilmeli:
  - **(a) Yumuşak gating:** Metni dürüst hale getirin ("2 adımda müşterilerinden geri bildirim toplamaya başla"), şeridi kapatılabilir yapın (kapatma 24 saat için kullanıcıya özel saklansın), bir ilerleme mini çubuğu ekleyin.
  - **(b) Gerçek gating:** Kısıtlamayı sunucuda uygulayın; örneğin QR olmadan kampanya/AI içgörü sayfaları boş-durum + kurulum CTA'sı göstersin. Bu tek bir `getDealerActivation(dealerId)` yardımcısıyla server component'lerde kontrol edilsin.

  Hangisi seçilirse seçilsin, metin ile davranış aynı şeyi söylemeli.

### 3. "Planını seç" adımı ücretsiz bayilerde asla tamamlanmıyor
- **Önem:** orta · **Kategori:** veri doğruluğu / UX · **Efor:** S
- **Kanıt:** `route.ts:44` (`hasPlan = Boolean(user?.pricingPlanId)`), `lib/plan-limits.ts:8` ("Plan atanmamış (pricingPlanId = null) bayi DEFAULT_FREE_LIMITS'e tabidir"), `lib/billing-core.ts:124` (aktif olmayan abonelikte `pricingPlanId: null`).
- **Sorun:** Ücretsiz planda bilinçli olarak kalan bayi için bu adım kalıcı olarak açık kalıyor ve ilerleme hiçbir zaman %100'e ulaşmıyor (en iyi ihtimalle 5/6, %83). Kurulum listesi kılık değiştirmiş bir upsell'e dönüşüyor. Abonelik iptal edildiğinde "tamamlanmış" adımın geri açılması da kafa karıştırıcı. `subscriptionStatus` seçiliyor ama hiç kullanılmıyor (`route.ts:31`).
- **Öneri:** "Plan" adımını "Planını gözden geçir" olarak yeniden tanımlayın. Billing sayfası ziyareti veya ücretsiz planı açıkça onaylama (örneğin `User.onboardingState.planReviewedAt`) adımı tamamlasın. Alternatif olarak plan adımını ilerleme sayacından çıkarıp ayrı bir "Büyüt" kartına taşıyın. Kullanılmayan `subscriptionStatus` seçimini kaldırın ya da durumu ("deneme süren 5 gün") gösterin.

### 4. "Tamamlandı" ile "X/Y" ölçüleri birbiriyle çelişiyor
- **Önem:** orta · **Kategori:** UX / bilgi mimarisi · **Efor:** S
- **Kanıt:** `route.ts:55-65` (`complete` = yalnız zorunlular; `completedCount/total` = tüm 6 adım), `page.tsx:105-114`.
- **Sorun:** Profil ve QR tamamlanınca ekranda aynı anda "2/6 adım tamamlandı · %33" ve "Harika! Temel kurulum tamamlandı" yazıyor. İki farklı ölçü tek bir ilerleme çubuğunda karışıyor.
- **Öneri:** İki katmanlı ilerleme kullanın:
  - "Temel kurulum" (zorunlu adımlar, örneğin 2/2): tamamlandığında kutlama yapılsın.
  - "İşletmeni güçlendir" (opsiyonel adımlar, ayrı ve daha hafif çubuk).

  API'den `required: {done,total}` ve `optional: {done,total}` alanlarını ayrı döndürün; istemci hesap yapmasın.

### 5. Profil adımı açıklamayı kontrol etmiyor; konum adımı şubeleri görmüyor
- **Önem:** orta · **Kategori:** veri doğruluğu · **Efor:** S
- **Kanıt:**
  - Profil: `route.ts:13` (yorum "işletme adı+açıklama"), `route.ts:39` (yalnız `businessName`), `page.tsx:32` ("İşletme adı ve açıklaması").
  - Konum: `route.ts:40`, `schema.prisma:746-763` (`DealerLocation` modeli: çok-şube, `address/latitude/longitude`).
- **Sorun:**
  - Açıklama boşken adım tamamlanmış görünüyor; metin, kod ve yorum birbirini tutmuyor.
  - Şubesini `DealerLocation` ile ekleyen bayinin konum adımı açık kalıyor.
  - İki adımın hedefi de aynı `/dealer/settings`; ilgili alana (`#dealer-address`, `dealer/settings/page.tsx:546`) derin link yok.
- **Öneri:** Kuralları tek bir saf fonksiyonda (`lib/onboarding/rules.ts`) toplayın ve birim testi yazın:
  - `hasProfile = businessName && businessDesc`; ya da açıklamayı ayrı bir opsiyonel "vitrin" adımına bölün.
  - `hasLocation = user konumu || dealerLocation.count({ isActive:true }) > 0`.

  Her adıma `href` olarak sekme ve alan hedefi verin (`/dealer/settings?tab=profile#dealer-address`). Settings sayfasının `Tabs`'ı (`settings/page.tsx:397`) şu an URL'den sekme okumuyor; bunu da ekleyin.

### 6. Progress bileşeni ekran okuyucuya değer iletmiyor
- **Önem:** orta · **Kategori:** erişilebilirlik (paylaşılan bileşen) · **Efor:** S
- **Kanıt:** `components/ui/progress.tsx:15-24`. `value` destructure ediliyor ama `ProgressPrimitive.Root`'a geçirilmiyor; yalnız Indicator'ın `style.width`'inde kullanılıyor.
- **Sorun:** Radix Root `value` almadığı için `data-state="indeterminate"` oluyor ve `aria-valuenow` üretilmiyor. Ekran okuyucu "ilerleme çubuğu, belirsiz" diyor. Sorun bu sayfayla sınırlı değil; `Progress` kullanan tüm paneller etkileniyor.
- **Öneri:** Root'a `value={value}` geçirin. Bu sayfada ek olarak `aria-label="Kurulum ilerlemesi"` ve `getValueLabel={(v) => \`%${v} tamamlandı\`}` ekleyin. Değişikliği uygulama genelinde tek seferde yapın.

### 7. Üç ayrı kurulum deneyimi aynı anda üst üste biniyor
- **Önem:** orta · **Kategori:** mimari / UX tutarlılığı · **Efor:** M
- **Kanıt:**
  - `app/dealer/layout.tsx:42` (gate şeridi), `app/dealer/layout.tsx:46` (`OnboardingSheet`).
  - `onboarding-sheet.tsx:17` (tek `STORAGE_KEY = 'qratex-onboarding-done'`, rol/kullanıcı ayrımı yok).
  - `onboarding-sheet.tsx:24-31` (bayi turu: welcome → qr → `/dealer/feedbacks`).
  - `onboarding-sheet.tsx:74-77` ("Sonraki" basıldığında tur ortasında `router.push` ile sayfa değişiyor).
- **Sorun:**
  - Yeni bayi `/dealer/onboarding`'e geldiğinde, sihirbaz sayfasının üstüne alttan "Başlarken" Sheet'i de açılıyor. Sheet 3 adımlı, farklı içerikli ve farklı hedefli bir tur.
  - Sheet "tamamlandı" bilgisini cihazda tutuyor. Aynı tarayıcıda müşteri hesabıyla turu kapatan biri, bayi hesabında turu hiç görmüyor; ya da tersi.
  - Sheet'in ikinci adımı "Sonraki" ile kullanıcıyı başka sayfaya taşıyıp turu açık bırakıyor.
- **Öneri:** Sheet'i bayi rolü için kaldırın. "Hoş geldin" anını sihirbaz sayfasının ilk ziyaretine taşıyın: ilk girişte `/dealer` panosunda kurulum kartı ya da yönlendirme. Gerekirse "görüldü" durumunu sunucuda kullanıcıya bağlı saklayın (`User.onboardingState Json`: `welcomeSeenAt`, `dismissedSteps`, `completedAt`). Müşteri ve admin turları kalacaksa anahtarı `qratex-onboarding-done:${role}:${userId}` yapın.

### 8. Gate şeridi kurulum bittikten sonra da her gezinmede DB'ye gidiyor
- **Önem:** orta · **Kategori:** performans · **Efor:** S
- **Kanıt:** `onboarding-gate-banner.tsx:22-34` (`useEffect` bağımlılığı `[pathname]`; `complete` olsa da fetch ediyor), `route.ts:21-37` (4 sorgu; `feedback.count` sınırsız, ilişki süzgeçli), `lib/api-auth.ts:64-69` (token-replay kontrolü).
- **Sorun:** Bayi panelindeki her rota değişimi; oturum çözümleme, token-replay, `user.findUnique`, iki `count` ve ilişki join'li `feedback.count` demek. Kurulumu aylar önce bitirmiş bayiler de bu maliyeti sonsuza dek ödüyor. Yoğun bayide `feedback.count` binlerce satırı sayıyor; oysa yalnız "en az bir tane var mı" bilgisi gerekiyor.
- **Öneri:**
  - Varlık kontrollerini `findFirst({ select:{id:true} })` ile yapın; geri bildirimde `deletedAt: null` süzgeci ekleyin.
  - `complete` olduğunda şerit tekrar sorgu atmasın. Durumu SWR ile paylaşılan önbellekte tutun (`revalidateOnFocus`, `dedupingInterval: 60s`).
  - Daha iyisi: sunucuda `User.onboardingCompletedAt`'i bir kez yazın (zorunlular ilk tamamlandığında). Layout bunu oturum veya Redis'ten okusun; tamamlanmış bayi için hiç istek atılmasın.
  - Upstash'te `onboarding:${dealerId}` anahtarıyla 60 sn önbellek; QR/ürün/profil yazma uçlarında invalidasyon.

### 9. Sabit Türkçe metinler (i18n eksik) ve toast önekleri
- **Önem:** düşük · **Kategori:** dil tutarlılığı · **Efor:** S
- **Kanıt:** `page.tsx:28-65`, `page.tsx:86-87`, `page.tsx:98`, `page.tsx:106`, `page.tsx:114`, `page.tsx:122`; `onboarding-gate-banner.tsx:50-53`, `onboarding-gate-banner.tsx:65-69`; karşılaştırma: `onboarding-sheet.tsx:97-101` (`useAppT`), `messages/en.json:2058`. `lib/admin-toast.ts:18` "Basarili: " (Türkçe karakter eksik).
- **Sorun:** İngilizce arayüz seçen bayi, sidebar'da "Setup" görürken sayfa ve şeritte Türkçe metin görüyor. Admin toast yardımcısı bayi panelinde "Dikkat: " önekiyle kullanılıyor.
- **Öneri:** `META` sözlüğünü `messages/*.json` altında `dealerOnboarding.steps.<key>.{title,desc,cta}` anahtarlarına taşıyın. Bayi panelinde bayiye özel (öneksiz) toast yardımcısını kullanın.

### 10. Mobil yerleşim sıkışıyor ve çift dolgu var
- **Önem:** düşük · **Kategori:** mobil · **Efor:** S
- **Kanıt:** `page.tsx:84` (`p-6`), `app/dealer/layout.tsx:35` (layout zaten yan dolgu veriyor), `page.tsx:121` ve `page.tsx:146` (`flex items-center`, `flex-wrap` yok), `page.tsx:169` (`shrink-0` buton). Karşılaştırma: diğer bayi sayfaları `space-y-6` kabı kullanıyor (`app/dealer/qr-codes/page.tsx:394`).
- **Sorun:** 400px genişlikte yan boşluk ~36px'e çıkıyor. "Profili düzenle →" gibi butonlar başlık ve açıklama metnini 2-3 satıra sıkıştırıyor. "Sıradaki adım" bandında metin ile buton aynı satırda ezilebiliyor (görsel olarak doğrulanmadı; sınıflardan çıkarım).
- **Öneri:** Dış kapta `p-6` yerine `space-y-6` kullanın. Adım kartlarını `sm:` altında iki satıra bölün: üstte ikon + başlık, altta açıklama ve tam genişlik CTA. Bant için `flex-wrap gap-2` kullanın. Tüm kartı tıklanabilir yapın (CTA ayrıca dursun), dokunma hedefi en az 44px olsun.

### 11. Ölü kod: şeritteki "Kurulumu bitir" dalı
- **Önem:** düşük · **Kategori:** ölü kod · **Efor:** S
- **Kanıt:** `onboarding-gate-banner.tsx:37` (`state.complete` ise `null`), `onboarding-gate-banner.tsx:63-66`.
- **Sorun:** `complete`, tüm zorunlu adımların tamamlanmasıyla tanımlı (`route.ts:55`). Bu yüzden `requiredDone === requiredTotal` dalı hiç render edilmez.
- **Öneri:** Dalı kaldırın ya da şeridi, opsiyonel adımlar için hafif bir "işletmeni güçlendir" moduna dönüştürün.

### 12. Sayfa durumu sekmeye dönüşte tazelenmiyor; tamamlanan adımda aksiyon yok
- **Önem:** düşük · **Kategori:** UX · **Efor:** S
- **Kanıt:** `page.tsx:72-78` (tek seferlik fetch), `page.tsx:168` (tamamlanan adımda buton yok).
- **Sorun:** Kullanıcı CTA'yı yeni sekmede açıp QR oluşturduktan sonra döndüğünde adım hâlâ açık görünüyor. Tamamlanmış profil veya QR'a "Gör/Düzenle" yolu yok.
- **Öneri:** Paylaşılan SWR hook'unda `revalidateOnFocus` açık olsun. Tamamlanan adıma ikincil bir "Gör" linki ekleyin. Durum değiştiğinde (örneğin QR yeni tamamlandı) kısa bir onay mikro-animasyonu gösterin.

### Not: IDOR/yetki
API yalnız oturumdaki `user.id` ile sorgu yapıyor (`route.ts:19-36`); dışarıdan id alınmıyor, IDOR yüzeyi yok. Personel hesabı (`DealerStaff.userId`, `schema.prisma:2432-2447`) DEALER rolüyle giriş yapıyorsa kendi boş kurulumunu görür; personel hesaplarının rolü bu incelemede **doğrulanmadı**.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Gerçek aktivasyon akışı ("first value" odaklı)** (Square Dashboard, Toast, Google Business Profile). Profil → QR → çıktı al/masaya koy → ilk yorum zinciri, tek ekranda satır içi formlarla tamamlanabilmeli. Örneğin işletme adı ve açıklamasını kartın içinde düzenle, QR'ı tek tıkla oluşturup PDF masa kartı indir. Şu an her adım kullanıcıyı başka bir sayfaya atıyor ve geri dönüş yolu yok.
2. **QR yerleştirme kiti ve test taraması** (Medallia/Qualtrics dağıtım adımı). Basılabilir masa/kasa şablonları, "kendi telefonunla test et" butonu ve test geri bildiriminin anında görünmesi (test kaydı sayılmayacak şekilde işaretli).
3. **Kişiselleştirilmiş kurulum** (Toast, Yelp for Business). İşletme türü (restoran/kafe/mağaza) seçimine göre adım seti, önerilen anket şablonu ve kampanya önerisi.
4. **Kurulum durumu sunucuda kalıcı + erteleme/gizleme.** "Sonra hatırlat", opsiyonel adımı gizle, kurulum bittiğinde sidebar girişini otomatik "Yardım/Kurulum" altına taşı.
5. **Kurulum huni telemetrisi ve yeniden etkileşim.** Adım başına tamamlama ve terk oranı (PostHog), 48 saat içinde ilk QR'ı oluşturmamış bayiye e-posta/push hatırlatması (projede push merkezi ve mail altyapısı mevcut).
6. **Ekip daveti ve bildirim kanalları adımı** (Medallia, Square). "Ekibini davet et" (`/dealer/team`) ve "olumsuz yorumda bana bildir" (bildirim tercihleri) gibi değer üreten adımlar.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Yeni bayi ilk girişte 5 dakika içinde "ilk geri bildirimi aldım" anına ulaşmalı. Kurulum, paneli bloke eden bir uyarı değil, panonun içinde yaşayan ve bitince kendiliğinden çekilen bir aktivasyon kartı olmalı.

**Yerleşim:**
- **Üst bölüm, iki halka ilerleme:** "Temel kurulum 1/2" (büyük) ve "Güçlendir 1/4" (küçük). Yanında tahmini kalan süre ("~3 dk").
- **Sol (veya mobilde üstte) dikey stepper:** Adımlar `zorunlu → değer → büyüme` sırasıyla gruplanmış. Aktif adım genişlemiş halde, satır içi aksiyonu içeriyor:
  - *Profil:* ad, açıklama ve logo alanlarıyla mini form (PATCH `/api/dealer/settings`).
  - *Konum:* adres arama + "konumumu kullan" (settings'teki geocode mantığını `lib/geo` olarak paylaşın) ya da şube ekle (`DealerLocation`).
  - *QR:* "İlk QR'ımı oluştur" tek butonu, önizleme, PDF masa kartı indir, "telefonla test et".
  - *İlk geri bildirim:* canlı bekleme durumu; gelen ilk yorumun realtime bildirimi (`RealtimeNotifications` zaten layout'ta) ile adım otomatik tamamlanır.
  - *Plan:* "Ücretsiz planla devam et" / "Planları karşılaştır". İkisi de adımı tamamlar.
- **Kurulum bittiğinde:** Sayfa tek seferlik bir kutlama gösterir ve panoya yönlendirir. Sidebar'daki "Kurulum" girişi gizlenir ya da "Yardım" grubuna iner. Gate şeridi kalıcı olarak kapanır.
- **Pano entegrasyonu:** `/dealer` panosunda, kurulum bitene kadar üstte daraltılabilir "Kurulum 1/2" kartı. Ayrı sayfa, derin çalışma alanı olarak kalır.

**Motion/3D (ölçülü):**
- Adım tamamlandığında tik ikonunun çizilerek belirmesi (`m.path` + `pathLength`, 300 ms) ve halka ilerlemenin yaylı dolması.
- Temel kurulum bitince tek seferlik hafif konfeti veya parıltı (canvas-confetti gibi ~3KB; `prefers-reduced-motion`'da yalnız statik rozet).
- Stepper genişleme/daralma için `layout` animasyonu.
- 3D gerekmiyor. Bu bir iş akışı ekranı; three.js burada maliyetli ve dikkat dağıtıcı olur. Global LazyMotion (`m as Motion`) deseniyle `useReducedMotion` kontrolü zorunlu.

**Veri/API değişiklikleri:**
- **Şema:** `User.onboardingState Json?` (`welcomeSeenAt`, `dismissedSteps[]`, `planReviewedAt`, `completedAt`) ya da ayrı `DealerOnboarding` tablosu. Şema değişikliği canlı Neon'a migration gerektirir; dikkat edilmeli.
- **`GET /api/dealer/onboarding` yanıtı:** `{ steps:[{key, done, required, group, href, completedAt?}], required:{done,total}, optional:{done,total}, completedAt }`. Kurallar `lib/onboarding/rules.ts` içinde saf ve testli olsun. Varlık kontrolleri `findFirst` + `deletedAt:null` ile yapılsın, `DealerLocation` dahil edilsin.
- **`PATCH /api/dealer/onboarding`:** adım erteleme/gizleme, `planReviewedAt` ve `welcomeSeenAt` yazımı (zod doğrulamalı).
- **Önbellek:** Upstash `onboarding:${dealerId}` (60 sn), QR/ürün/profil/şube yazma uçlarında `del`. `completedAt` set olduktan sonra layout hiç istek atmasın.
- **İstemci:** tek `useDealerOnboarding()` SWR hook'u (sayfa, pano kartı ve şerit ortak kullanır), `revalidateOnFocus`.
- **Telemetri:** `onboarding_step_completed`, `onboarding_step_clicked`, `onboarding_dismissed` PostHog olayları.

---

## Çakışmalar / birleştirme önerisi

- **`components/onboarding/onboarding-sheet.tsx` (bayi rolü):** İşlevi bu sayfayla birebir çakışıyor; daha zayıf, cihazda saklanan ve farklı içerikli bir kopya. Bayi için kaldırılmalı, "hoş geldin" anı bu sihirbaza taşınmalı.
- **`components/onboarding/onboarding-gate-banner.tsx`:** Aynı veriyi ayrı fetch ve kopya tiplerle tüketiyor. Paylaşılan hook ve gerçeğe uygun metinle sihirbazın "uydusu" olarak kalmalı; tamamlanınca hiç çalışmamalı.
- **`/dealer` panosu (`app/dealer/dealer-dashboard-client.tsx`):** Kurulumdan hiç haberdar değil (grep'te onboarding referansı yok). Panoya daraltılabilir bir kurulum kartı eklenmeli. Böylece sayfa keşfi sidebar'a ve kalıcı şeride bağımlı olmaktan çıkar.
- **`/dealer/experience-guide`:** Adı rehber/tanıtım çağrıştırıyor; bu sayfayla amaç örtüşmesi olabilir. İçeriği bu incelemede **doğrulanmadı**, kendi raporunda kıyaslanmalı.
- **Karar:** Sayfa korunmalı ama tek kurulum modülüne dönüştürülmeli. Sihirbaz sayfası, pano kartı ve şerit aynı veri kaynağını (`useDealerOnboarding`) kullanmalı; Sheet bayi rolünden çıkarılmalı.

---

## Doğrulama (şüpheci inceleme)

### 1. "API hata JSON'unda istemci TypeError ile çöküyor" — **Karar: DOĞRULANDI** (ciddiyet: Orta; "Kritik/Yüksek" abartılı)

**Okunan zincir:**
- `app/dealer/onboarding/page.tsx:73-75`: `fetch(...).then((r) => r.json()).then((d) => setData(d))`. `r.ok` kontrolü yok, gelen gövde şekil doğrulaması olmadan state'e yazılıyor.
- `app/dealer/onboarding/page.tsx:81`: `data?.steps.find(...)`. Optional chaining yalnızca `data` üzerinde; `steps` `undefined` olduğunda `.find` çağrısı render sırasında `TypeError: Cannot read properties of undefined (reading 'find')` fırlatır. Bu satır atlansa bile `:137` `data.steps.map` aynı hatayı verirdi. `:80` ise `undefined / undefined` ile `NaN` üretir.
- `app/api/dealer/onboarding/route.ts`: `requireAuth(['DEALER'])` hata dönerse `auth.error` olduğu gibi döndürülüyor.
- `lib/api-auth.ts:58-59` (401 `{ error: 'Unauthorized' }`), `:60-62` (403 `{ error: 'Forbidden' }`), `:69-76` (token-replay 403 `{ error: 'Session güvenlik ihlali...' }`). Üç durumda da gövde geçerli JSON olduğu için `r.json()` başarılı olur, `.catch` dalı çalışmaz ve `data = { error }` olur. `data` truthy olduğu için `:97` `!data` dalı atlanır.
- `app/dealer/error.tsx`: hata sınırı devreye girer, `Sentry.captureException` ile her olayı raporlar.
- Karşılaştırma: `components/onboarding/onboarding-gate-banner.tsx:25-27` aynı ucu `r.ok ? r.json() : null` ve `Array.isArray(data.steps)` korumasıyla doğru tüketiyor. İddia bu noktada da doğru.

**Gerçekçi tetikleyici (yeniden üretim):**
1. Bayi `/dealer/onboarding` sayfasını açar. `proxy.ts:45-100` sayfa isteğinde yalnızca JWT varlığını ve `role === 'DEALER'` koşulunu denetler, token-replay kontrolü YAPMAZ. Sayfa render olur.
2. Bayinin IP adresi değişir (ör. mobilde Wi-Fi'dan hücresel ağa geçiş) veya User-Agent değişir. `lib/token-replay.ts:64` ve `:93` jti için kayıtlı ipHash/uaHash ile uyuşmazlık görür ve `ok: false` döner.
3. `GET /api/dealer/onboarding` 403 + `{ error: 'Session güvenlik ihlali...' }` döndürür. Sayfa `setData({ error })` yapar ve render'da `:81` TypeError fırlatır. Kullanıcı "tekrar giriş yapın" mesajı yerine genel hata ekranını görür; Sentry'ye gereksiz bir istisna düşer.
- 401 yolu daha dar bir pencere: oturum JWT'si sayfa yüklendikten sonra ve fetch tamamlanmadan önce sona ererse oluşur. 500 yolu ise (Prisma hatası) Next'in boş/HTML gövdesi nedeniyle `r.json()` reddine düşer ve mevcut `.catch` ile doğru ele alınır, yani çökme yaratmaz.

**Ciddiyet notu:** Veri sızıntısı veya güvenlik açığı yok. Token-replay durumunda kullanıcı zaten tüm bayi API'lerinden 403 alıyor, panel kullanılamaz durumda. Gerçek etki şunlar: (a) yanlış hata yüzeyi (yeniden giriş yönlendirmesi yerine çökme ekranı), (b) Sentry gürültüsü, (c) savunmasız tüketici deseni. Bu nedenle "Kritik/Yüksek" değil **Orta** olarak sınıflandırılmalı.

**Öneri (ürün seviyesi):** Sayfa ile şerit için ortak bir `useDealerOnboarding()` hook'u yazılmalı (rapordaki birleştirme önerisiyle uyumlu). Bu hook şunları yapmalı:
- `r.ok` kontrolü yapmalı.
- 401 veya token-replay kaynaklı 403 durumunda `signOut({ callbackUrl: '/auth/login' })` ya da "Oturumunuz güvenlik nedeniyle sonlandırıldı" ekranına yönlendirmeli.
- Yanıt şeklini (`Array.isArray(steps)`, sayısal `total > 0`) doğrulamalı veya zod ile parse etmeli.
- Hata için ayrı bir `error` state'i ve "Tekrar dene" düğmesi sunmalı.

Böylece aynı uç noktanın iki tüketicisi farklı hata davranışı göstermez.
