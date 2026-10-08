# API Mimarisi Denetimi: Qratex `app/api` (398 route) ve `lib/` katmanı

**Tarih:** 2026-10-08 · **Boyut:** mimari-api · **Kapsam:** `app/api/**/route.ts` (398 dosya, 47.521 satır), `lib/` (216 düz dosya + 7 alt klasör), `proxy.ts`, istemci veri çekme kalıpları (`app/`, `components/`, `hooks/`, `lib/use-*`)
**Yöntem:** Salt okunur. Grep/Glob ile envanter çıkarıldı, ardından örnek route'lar ve tüm yardımcılar okundu. Sayılar dosya bazlıdır (ilgili kalıbı içeren route dosyası adedi). Kod çalıştırılmadı, veritabanına dokunulmadı.

---

## 1. Özet

**Puan: 5/10**

Qratex'in API katmanında birkaç sağlam temel var: `requireAuth` 248 route'ta kullanılıyor, yanıtların 357'si `no-store` başlığı taşıyor, DB'ye dayalı atomik rate-limit (`checkRateLimitDb`) ve Redis'e öncelik veren, hata durumunda DB'ye düşen bir sıcak katman var, DB kesintisi için `503 + retryable` yardımcısı mevcut, puan cüzdanı (`creditPointsAndXp`/`debitPoints`) ve idempotent sonlandırıcılar (ör. `finishSquadBattle`) iyi tasarlanmış.

Sorun şu ki bu temeller **isteğe bağlı** kalmış. Her route kendi iskeletini yeniden yazıyor ve sonuçta ortaya çıkan tutarsızlıkların bir kısmı artık kod kokusu olmaktan çıkıp güvenlik ve ekonomi riskine dönüşmüş:

1. **Kimlik doğrulama üç ayrı yoldan yapılıyor.** 80 route `getServerSession`'ı doğrudan çağırıyor. Bu yüzden `requireAuth` içindeki token-replay korumasını atlıyorlar ve bunların 30'unda rol kontrolü hiç yok. Puan basan uçlar (spin, görev ödülü, streak, doğum günü, turnuva, sezonluk etkinlik, referans) bu gruptan.
2. **Rol dizisi kiracı (tenant) anlamını taşımıyor.** 55 bayi route'u `['DEALER','ADMIN']` kabul ediyor, ama içlerinden 32'si `dealerId = session.user.id` kullanıyor. ADMIN böyle bir route'u çağırdığında kendi kimliğiyle sahte bir bayi gibi veri yazabiliyor.
3. **Standart bileşenler yazılmış ama kullanılmıyor.** `apiOk`/`apiError` 0 route'ta, `createApiRoute` 1 route'ta, `cachedJson` 0 route'ta, `ApiResponse<T>` tipi 0 yerde kullanılıyor.
4. **Hatalar sessizce kayboluyor.** `onRequestError` tanımlı değil. Sentry'ye hata gönderen yalnızca 6 route var. Prisma kullanan 103 route'ta try/catch yok. 19 dosya hata durumunda `200 + sıfırlarla dolu veri` dönüyor.
5. **İstemcide tek bir veri katmanı yok.** 198 dosyada 573 ham `fetch('/api…')` çağrısı var. React Query yalnızca 10 dosyada kullanılıyor. 200 sayfanın 151'i `'use client'`.

Hedef mimari, bu dağınık yapıyı **tek bir route fabrikası (`defineRoute`) + paylaşılan zod sözleşmeleri + tipli istemci** etrafında toplamak. Geçiş, istemcilerin bugün okuduğu `success`/`error` alanları korunarak kırılmadan yapılabilir (bkz. §5–6).

---

## 2. Mevcut durum haritası

### 2.1 Route dağılımı

| Alan | Route | Kimlik doğrulama deseni |
|---|---:|---|
| `admin/*` | 142 | 193 handler'da `requireAuth(['ADMIN'])`; ekip modülü (18) `requireTeamAccess`; 2 sapma (`admin/insights`: doğrudan `getServerSession`, `admin/users/hall-of-fame`: `createApiRoute`) |
| `dealer/*` | 83 | 74× `['DEALER','ADMIN']`, 41× `['DEALER']`, 6× `['DEALER','ADMIN','STAFF']`; 3 route doğrudan `getServerSession` |
| `customer/*` | 66 | 17× `['CUSTOMER','ADMIN']`, 4× `['CUSTOMER']`, 3× `requireAuth()` (rolsüz); **~45 route doğrudan `getServerSession`** |
| `gamification/*`, `streak`, `referral`, `birthday`, `vip`, `surprise-box` … (kök) | ~45 | Çoğunlukla doğrudan `getServerSession` |
| `cron/*` | 10 | Her dosyada kopyalanmış `validBearer` + `timingSafeEqual` |
| `internal/inngest/*` | 19 | `lib/inngest/internal-http.ts` `authorizeInternalJobRequest` |
| `auth/*`, `public/*`, `settings/*`, `track`, `webhooks`, `partner` | ~25 | Public veya kendine özgü (Stripe imzası, partner API anahtarı) |

### 2.2 Kesişen kaygıların kapsamı (398 route üzerinden)

| Kaygı | Mevcut araç | Kapsam |
|---|---|---|
| Kimlik doğrulama + token-replay | `lib/api-auth.ts:52` `requireAuth` | 248 (+18 `requireTeamAccess` üzerinden) |
| Doğrudan oturum (replay korumasız) | `getServerSession` | **80** |
| Route sarmalayıcı | `lib/api-route.ts:53` `createApiRoute` | **1** |
| Zarf yardımcıları | `lib/api-http.ts:34,44` `apiOk`/`apiError` | **0** |
| | `lib/api-route.ts:33,41` `jsonOk`/`jsonError` | 1 |
| zod ile doğrulama | inline `z.object` (182 adet) + `lib/validations*.ts` | 122 dosya zod import ediyor; 25'i `lib/validations` kullanıyor |
| JSON gövdesini şemasız okuyan | — | **51** |
| Rate limit | `lib/rate-limit.ts` | 44 (bunların 15'i bellek içi, serverless'te etkisiz) |
| DB kesintisinde 503 | `responseIfDatabaseUnavailable` | 114 |
| Sentry'ye hata bildirimi | `lib/capture-api-error.ts` | **6** |
| `console.error` | — | 234 |
| Prisma kullanıp try/catch'i olmayan | — | **103** |
| Redis cache | `redisGetJson`/`redisSetJson` (elle) | 16 |
| Next cache | `unstable_cache` / `revalidateTag` | 3 / 8 |
| Modül kapısı | `assertModuleEnabled` | 23 route, katalogdaki 45 anahtarın ~10'u |
| Idempotency | `lib/idempotency.ts` | 9 |
| `export const dynamic = 'force-dynamic'` | — | 389 |
| Server Action (`'use server'`) | — | **0** (mimari tamamen route handler üzerine kurulu; bu tutarlı) |

### 2.3 İstemci tarafı

| Kalıp | Ölçüm |
|---|---|
| Ham `fetch('/api…')` | 198 dosya / 573 çağrı |
| `@tanstack/react-query` (`useQuery`/`useMutation`) | 10 dosya (`QueryClientProvider` → `components/providers.tsx:207`) |
| SWR | 0 |
| Merkezi API istemcisi / fetcher | Yok (yalnızca dosya-içi `safeFetch` kopyaları: `components/customer/dashboard/customer-dashboard.tsx:149`) |
| `'use client'` sayfa oranı | 151 / 200 |
| Polling (`setInterval` + fetch) | 15 dosya; `visibilityState` kontrolü **0** |
| SSE (`EventSource`) | 2 (`lib/use-notification-stream.ts`, `app/admin/agent-council/page.tsx`) |
| `AbortController` | 7 dosya |
| İstemci `data.success` / `data.error` okuması | 625 / 342 (zarf değişikliğinde kırılma yüzeyi bu) |

### 2.4 `lib/` katman yapısı

- 216 düz dosya. Saf mantık için `*-core.ts` adlandırması var (11 dosya, iyi bir başlangıç) ama alan klasörü yok.
- Prisma'ya erişen 83 lib dosyasından yalnızca 2'si `server-only` ile korunuyor. 5 lib dosyası `'use client'` hook'u (`lib/use-mini-game.ts`, `lib/use-notification-stream.ts` …); `hooks/` klasöründe ise yalnızca 4 dosya var.
- AI istemcisi üç ayrı dosyaya bölünmüş: `lib/ai-engine.ts` (1.195 satır, maliyet koruması burada), `lib/groq.ts` (maliyet koruması yok), `lib/openai.ts` (kendi başlığında "Legacy compat wrapper" diyor, tek tüketicisi `app/api/ai/analyze/route.ts`).
- İş mantığı büyük oranda route dosyalarında duruyor: 349 route doğrudan `@/lib/prisma` import ediyor, 18'i `$queryRaw` çalıştırıyor. En büyük route'lar: `ai/analyze` 995, `admin/users` 706, `feedbacks` 567, `admin/analytics` 567 satır.

---

## 3. Bulgular (önem sırasıyla)

### B1 [YÜKSEK]: Kimlik doğrulama üç paralel yoldan; 80 route token-replay korumasını atlıyor, puan basan uçların bir kısmında rol kontrolü yok

**Kanıt**
- Merkezi koruma yalnızca `requireAuth` içinde: `lib/api-auth.ts:63-77` (jti → IP/UA hash → `checkTokenReplay`). `getSessionOr401` (`:20`) 0 route'ta kullanılıyor.
- 80 route `getServerSession(authOptions)`'ı doğrudan çağırıyor. Örnekler: `app/api/notifications/route.ts:16,85,166`, `app/api/gamification/spin/route.ts:36,163`, `app/api/streak/route.ts:17,85`, `app/api/customer/shop/gift/route.ts:12`.
- Bu 80 route'un 30'unda hiç rol karşılaştırması yok. Puan basanlar arasında: `gamification/spin` (`creditPointsAndXp` `:78`), `gamification/quests/[id]/claim` (`:97`), `streak` (`:184`), `birthday` (`:207`), `customer/tournament` (`:163`), `customer/seasonal-event` (`:153`), `referral` (`:216-222`, `:328`). Yani DEALER, STAFF veya ADMIN hesabıyla da çağrılabiliyorlar. Bunun ekonomiye gerçek etkisi doğrulanmadı (bu hesapların puanı harcayıp harcayamadığı ayrı bir konu), ama politika olarak yanlış.
- Rol hatası için dönen kod tutarsız: `app/api/ai/generate-reply/route.ts:63-65` yanlış rolde 403 yerine **401** dönüyor. Aynı desen `customer/*` altında ~25 dosyada var. İstemci 401'i "oturum düştü" diye yorumlayabilir.

**Sorun:** Güvenlik politikası (replay tespiti, rol, ileride ban/iptal) tek bir yerde değil, route yazarının hafızasında duruyor. `requireAuth`'a eklenen her yeni kontrol, bu 80 route'a hiçbir zaman ulaşmayacak.

**Öneri**
- Kısa vadede 80 route'u `requireAuth([...])`'a geçirin. Puan basan uçların hepsi `['CUSTOMER']` olmalı (bayi ve personel hesapları müşteri ekonomisine katılmıyorsa).
- Kalıcı çözüm olarak ESLint `no-restricted-imports` kuralıyla `app/api/**` altında `next-auth`'un `getServerSession` import'unu yasaklayın (`auth/[...nextauth]` hariç). Kural CI'da hata versin.
- `requireAuth` 401 (oturum yok) ile 403'ü (rol uymuyor) zaten doğru ayırıyor. Route'lar bunu kendileri yeniden yazmasın.

**Efor:** M (80 dosyada mekanik değişiklik + lint kuralı)

---

### B2 [YÜKSEK]: `['DEALER','ADMIN']` rol dizisi kiracı anlamını taşımıyor; ADMIN bayi uçlarında kendi kimliğiyle veri yazabiliyor

**Kanıt**
- 55 bayi route'u ADMIN kabul ediyor, 32'si `dealerId = session.user.id` kullanıyor, 14'ü `?dealerId=` sorgu parametresi okuyor. 11 route'ta ADMIN için hiçbir dal yok: `dealer/analytics`, `dealer/campaigns/[id]/performance`, `dealer/cards/scan/[token]`, `dealer/consumption-reviews/[id]/remedy`, `dealer/feedbacks/[id]/remedy`, `dealer/feedbacks/[id]/similar`, `dealer/feedbacks/[id]/viewed`, `dealer/notification-badges`, `dealer/notifications/stream`, `dealer/reviews`, `dealer/surveys/[id]/results`.
- `app/api/dealer/consumptions/route.ts:127` ADMIN'i kabul ediyor, ardından `:240-249` `consumption.create({ dealerId: session.user.id })` çalışıyor. ADMIN çağırırsa admin kullanıcısı "bayi" olarak bir tüketim kaydı oluşur ve müşteriye pasif puan yazılır (`:327-350`).
- `app/api/dealer/cards/scan/[token]/route.ts:18,84-92`: ADMIN taradığında `cardAuditLog` kaydına `dealerId: <admin id>` yazılıyor.
- Aynı belirsizlik müşteri tarafında da var: 17 route `['CUSTOMER','ADMIN']` kabul ediyor.
- `lib/api-auth.ts:130` `dealerScopeWhere` yalnızca 1 route'ta kullanılıyor. Bu yardımcı ADMIN için `{}` (tüm kiracılar) dönüyor ve bu da yazma yolları için tehlikeli bir varsayılan.

**Sorun:** Rol listesi "kimin girebileceğini" söylüyor ama "hangi kiracı adına iş yapıldığını" söylemiyor. Admin desteği (impersonation) kazara ve denetimsiz olarak var.

**Öneri:** Route bağlamına açık bir **aktör/kiracı** modeli ekleyin:
```ts
ctx.actor = { userId, role, tenantId }   // DEALER: kendi id'si · STAFF: staffProfile.dealerId · ADMIN: yalnızca açık impersonation ile
```
- Varsayılan olarak bayi uçlarından ADMIN'i çıkarın. Admin'in bayi verisini görmesi gerekiyorsa `defineRoute({ tenant: 'dealer', allowAdminImpersonation: true })` ile açın. Bu durumda `X-Act-As-Dealer` başlığı veya `?dealerId=` zorunlu olsun, eksikse 400 dönülsün. Her impersonation'a audit kaydı düşülsün ve yazma işlemleri varsayılan olarak salt-okunur tutulsun.
- STAFF zaten `getStaffDealerId` ile 10 route'ta doğru çözülüyor. Bu mantığı aynı `tenantId` çözücüsünde birleştirin.

**Efor:** M

---

### B3 [YÜKSEK]: Tüketim akışında puan cüzdanı atlanıyor; kayıt ile puan iki ayrı işlemde (ekonomi değişmezi ihlali)

**Kanıt**
- `app/api/dealer/consumptions/route.ts:240` `consumption.create` tek başına çalışıyor. Pasif puan `:327-350` aralığında **ayrı** bir `$transaction([...])` veya doğrudan `prisma.user.update({ points: { increment } })` ile yazılıyor.
- Dosyada `creditPointsAndXp` ve `points_credited` analitik olayı **yok** (grep sonucu: yalnızca `:335` `$transaction`). Oysa projenin kendi kuralı, puan basan her yolun `creditPointsAndXp` + `points_credited` kullanmasını şart koşuyor. Diğer 23 route bu kurala uyuyor (ör. `surprise-box/[id]/open/route.ts:54-68`).
- Admin manuel puanı (`app/api/admin/users/route.ts:399-403`) da doğrudan `increment` kullanıyor. Burada audit kaydı var (`:420`), ama dolandırıcılık panelinde görünürlük yok.

**Sorun:** Kısmi başarısızlıkta tüketim kaydı oluşur ama puan yazılmaz. Bayi yeniden denediğinde (idempotency anahtarı yok) çift tüketim oluşur. Hız/dolandırıcılık motoru en yüksek hacimli puan kaynağını göremez.

**Öneri:** Tüketim oluşturma ve pasif puanı tek bir domain servisine taşıyın: `lib/domains/consumption/create-consumption.ts`. Tek `$transaction` içinde `consumption.create` → `creditPointsAndXp` → `squad.totalPoints` → `analyticsEvent(points_credited)` sırası işlesin. `dealer/offline-sync` route'u da aynı servisi çağırsın. İstemciden `Idempotency-Key` alınsın (`lib/idempotency.ts` hazır).

**Efor:** S–M

---

### B4 [YÜKSEK]: Hata gözlemlenebilirliği kör; hatalar ya kayboluyor ya da başarı gibi sunuluyor

**Kanıt**
- `instrumentation.ts:6-17` yalnızca `register()` export ediyor. **`onRequestError` yok**, yani Next'in yakalanmamış route hataları Sentry'ye gitmiyor.
- `captureApiError` yalnızca 6 route'ta kullanılıyor (`auth/register`, `dealer/feedbacks/[id]/reply`, `feedbacks`, `gamification/quests/[id]/claim`, `gamification/rewards`, `gamification/spin`). 234 route yalnızca `console.error` yazıyor. `sentry.server.config.ts:9-20` içinde console entegrasyonu yok.
- Prisma kullanan 103 route'ta try/catch yok (52 admin, 21 dealer, 16 customer, 8 internal…). Bunlar hata durumunda gövdesiz bir 500 döner. İstemcideki `await res.json()` çağrısı da patlar. DB kesintisinde 503/retryable yolu da devreye girmez.
- `app/api/dealer/stats/route.ts:465-501` hata durumunda `success: true` ve sıfırlarla dolu bir panel dönüyor (`status: 200`). Benzer "fallback/degraded" deseni 19 dosyada var. Bayi panelde "0 geri bildirim" görür ve sistemin bozuk olduğunu anlamaz.
- `lib/capture-api-error.ts:5` `@sentry/nextjs`'i statik import ediyor. Bu, `sentry.server.config.ts:3` içindeki "SDK yalnızca DSN varsa yüklensin" niyetiyle çelişiyor (aynı durum `lib/token-replay.ts:17` için de geçerli).

**Öneri**
- `instrumentation.ts` içine `export const onRequestError = Sentry.captureRequestError` ekleyin. Bu tek satır, yakalanmamış tüm route hatalarını görünür yapar.
- `defineRoute` (§5) içindeki merkezi catch her beklenmeyen hatayı `requestId` ile Sentry'ye göndersin, yanıta `requestId` koysun ve `x-request-id` başlığıyla dönsün. Böylece destek talebinde kullanıcı bu kimliği verebilir.
- "Başarı gibi görünen fallback" desenini kaldırın. Hata durumunda `{ success:false, code:'DEGRADED', retryable:true }` + 503 dönün ve UI'da "veriler şu an yüklenemedi, yeniden dene" durumunu gösterin. Kısmi veri gerçekten değerliyse `partial: true` bayrağıyla açıkça işaretleyin.

**Efor:** S (`onRequestError`) + M (fallback'lerin temizlenmesi)

---

### B5 [ORTA]: Yanıt zarfı ve hata sözleşmesi tutarsız; yazılmış standartlar kullanılmıyor

**Kanıt**
- Üç rakip "standart" var ve hiçbiri benimsenmemiş:
  - `lib/api-http.ts:34-58` `apiOk`/`apiError` → `{ success, error, code?, retryable? }`, **0 kullanım**. Dosya yorumu "yeni route'lar bunu kullanmalı" diyor.
  - `lib/api-route.ts:33-46` `jsonOk`/`jsonError` → `{ error }` (**`success` alanı yok**), 1 kullanım.
  - `types/index.ts:396` `ApiResponse<T> { success, data?, error?, message? }`, **0 kullanım**.
- 86 route yanıtında `success` alanı hiç yok. Buna karşılık istemci 625 yerde `data.success` okuyor. Başarı yanıtları da iki şekilde geliyor: `{ success, data: {...} }` (ör. `customer/settings`, istemci tarafında `data.data.notifications`: `app/customer/settings/page.tsx:163-165`) ve `{ success, ...alanlar }`.
- Hata kodu (`code`) yalnızca 7 dosyada, `details` 13 dosyada, zod `issues`/`flatten` 25 dosyada var. Geri kalan 78 dosya yalnızca `errors[0].message` döndürüyor, dolayısıyla form alan bazında hata gösteremiyor.
- Mesaj dili karışık: 61 dosyada İngilizce `Unauthorized`, 27 dosyada `Internal server error`, geri kalanında Türkçe. Bu mesajlar 615 `toast.error` çağrısıyla kullanıcıya doğrudan gösteriliyor. Anahtar tabanlı mesaj çevirisi (`lib/translate-known-message.ts`) yalnızca 2 sayfada kullanılıyor.

**Öneri:** Geriye uyumlu bir zarf v2 tanımlayın (istemcinin okuduğu alanlar korunsun):
```ts
// başarı
{ success: true, data: T, requestId }
// hata
{ success: false, error: string /* Türkçe, gösterilebilir */, code: ApiErrorCode, details?: ZodIssue[], retryable?: boolean, requestId }
```
- `ApiErrorCode` kapalı bir union olsun: `UNAUTHENTICATED | FORBIDDEN | NOT_FOUND | VALIDATION | RATE_LIMITED | MODULE_DISABLED | CONFLICT | INSUFFICIENT_POINTS | SERVICE_UNAVAILABLE | INTERNAL`.
- Hata mesajı sunucuda Türkçe üretilsin. İstemci `code`'a göre davranış seçsin: 401'de yeniden giriş, 429'da `Retry-After` geri sayımı, VALIDATION'da alan altında hata.
- `jsonError`/`apiError`/`ApiResponse` üçlüsünü tek bir modülde birleştirin (`lib/server/http/response.ts`), eskilerini `@deprecated` ile işaretleyin.

**Efor:** M (helper) + L (kademeli geçiş, bkz. §6)

---

### B6 [ORTA]: Girdi doğrulama kısmi ve dağınık; sözleşme istemciyle paylaşılmıyor

**Kanıt**
- JSON gövdesini zod olmadan okuyan 51 route var. Örnekler: `admin/gamification/settings`, `admin/settings/modules`, `admin/squads/*`, `customer/shop`, `customer/shop/gift`, `customer/squads`, `customer/squads/join`, `customer/showcase`, `dealer/campaigns/[id]`, `dealer/staff/[id]`, `dealer/surveys/[id]`, `dealer/offline-sync`, `gamification/badges*`, `gamification/progress`, `push/subscribe`, `notifications`, `user/password`, `chat`.
- Bu route'larda elle tip kontrolü yapılıyor (ör. `app/api/customer/shop/gift/route.ts:22-31`). Doğru yazılmış olsalar bile tekrar kullanılabilir değiller ve sınırlar (uzunluk, enum) route'tan route'a değişiyor.
- `z.object` 182 kez route içinde inline tanımlanmış. Paylaşılan `lib/validations.ts` (23 şema) ve `lib/validations-admin.ts` (15 şema) yalnızca 25 route'ta kullanılıyor. İstemci formlarında `zodResolver` yalnızca 2 dosyada var, yani istemci ile sunucu kuralları ayrı ayrı yazılıyor.
- Sorgu parametresi parse'ı: `clampPageParam`/`clampTakeParam` yardımcıları (`lib/api-http.ts:62-84`) 6 route'ta kullanılıyor. Ham `parseInt` kullananlar: `app/api/admin/squads/route.ts:14-15` (üst sınır yok, `NaN` gelirse Prisma hatası), `app/api/admin/agents/runs/route.ts:17` (`Math.min(NaN,100)` sonucu `NaN`).

**Öneri:** Sözleşmeleri alan bazında `lib/contracts/<alan>.ts` altına taşıyın (`body`, `query`, `params` ve `response` şemaları). `defineRoute` bunları zorunlu girdi olarak alsın, istemci formları `zodResolver(contract.body)` ile aynı şemayı kullansın. Query için `z.coerce.number().int().min(1).max(100).default(20)` gibi ortak `paginationQuery` parçaları tanımlayın. Bir sonraki adımda bu şemalardan OpenAPI üretilebilir (B14).

**Efor:** L (kademeli)

---

### B7 [ORTA]: Rate-limit ve AI maliyet koruması tutarsız; bazı limitler serverless'te fiilen yok

**Kanıt**
- Yalnızca 44 route rate-limit kullanıyor.
- Bellek içi limiter'lar hâlâ 15 admin mutasyon route'unda kullanılıyor (`checkAdminRateLimit`, `lib/rate-limit.ts:303-320`; `checkAdminSeoRateLimit`, `:283-300`). Dosyanın kendi başlığı (`:4-8`) bellek içi Map'in serverless'te "TEK başına güvenilir değil" olduğunu söylüyor.
- LLM çağıran ama ne rate-limit ne `ai-cost-guard` kullanan route'lar: `admin/agents/conversation`, `admin/agents/conversation/stream`, `admin/agents/run`, `admin/character-test`, `admin/team/ai`, `admin/team/ai-qa`, `ai/generate-reply`, `customer/ai-recommendations`, `customer/consumptions/[id]/review`, `dealer/action-items`, `dealer/ai-proactive-analysis`, `dealer/feedbacks/[id]/reply`. Bazıları dolaylı olarak `lib/ai-engine.ts:116,307` maliyet korumasına takılıyor, ama yalnızca `dealerId` geçirilen yollarda.
- `lib/groq.ts:187` `suggestResponseWithGroq` maliyet korumasından tamamen bağımsız çalışıyor.
- Yeniden kullanılabilir oran politikası yok. Her route kendi `bucket` adını, sınırını ve `Retry-After` hesabını yazıyor (ör. `app/api/dealer/consumptions/route.ts:181-208`, bellek içi ve DB katmanı yan yana).

**Öneri**
- `defineRoute({ rateLimit: 'ai' | 'mutation' | 'public-write' | { bucket, max, windowMs } })` ile adlandırılmış politikalar tanımlayın. Hepsi `checkRateLimitDb` üzerinden (Redis'e öncelik veren) çalışsın, 429 yanıtı ve `Retry-After` başlığı merkezde üretilsin.
- Bellek içi `checkRateLimit`/`checkAdminRateLimit`/`checkAdminSeoRateLimit`/`getLoginLockout` fonksiyonlarını kaldırın.
- AI çağrılarını tek bir geçitten (`lib/ai/gateway.ts`) geçirin: kiracı veya kullanıcı bazlı günlük token bütçesi, rate-limit ve prompt-injection kontrolü orada uygulansın. `lib/groq.ts` ile `lib/openai.ts` bu geçidin sağlayıcı adaptörüne indirgensin.

**Efor:** M

---

### B8 [ORTA]: Modül kapısı API'de kısmi ve tip güvencesiz; menü gizlenince API açık kalıyor

**Kanıt**
- `MODULE_CATALOG` (`lib/module-controls.ts:17`) 45 anahtar tanımlıyor. API'de `assertModuleEnabled` ile korunan yalnızca ~10 anahtar var (23 route): campaigns, discovery, donations, quests, referrals, remedy_offers, rewards, squads, surprise_boxes + iki katalog dışı anahtar.
- `surprise_boxes` admin tarafında kapılı (`app/api/admin/surprise-box/route.ts:13`), ama müşterinin kutu açtığı `app/api/surprise-box/route.ts` ve `surprise-box/[id]/open` route'larında kapı **yok**. Modül kapatılınca admin gönderemez ama müşteri açmaya devam eder.
- Katalogda olmayan anahtarlar kullanılıyor: `app/api/customer/lounge/route.ts:16` → `'vip_lounge'`, `app/api/dealer/experience-pulse/route.ts:20` → `'dealer_shift_pulse'`. `moduleKey: string` olduğu için derleyici bunu yakalamıyor ve bu modüller yönetici panelinden kapatılamıyor.
- Bayi modüllerinin (voc_wall, heatmap, benchmark, copilot, churn_risk, roi, action_items…) API uçlarında kapı yok. Bunlar yalnızca menüden gizleniyor.

**Öneri:** `ModuleKey` tipini `MODULE_CATALOG`'dan türetin (`as const` + `typeof`) ve `assertModuleEnabled(key: ModuleKey)` imzasıyla katalog dışı anahtarları derleme hatasına çevirin. `defineRoute({ module: 'surprise_boxes' })` deklaratif olsun. `admin/api-catalog` üreticisi (`lib/data/admin-api-catalog.json`) route ile modül eşleşmesini de çıkarıp "kapısız modül uçları" raporu üretsin. `admin/modules/overview` (`:56-76`) içindeki elle tutulan endpoint listesi de bu kaynaktan beslensin.

**Efor:** S–M

---

### B9 [ORTA]: İstemci veri katmanı yok; React Query kurulu ama kullanılmıyor, panel açılışları istek şelalesine dönüyor

**Kanıt**
- 198 dosyada 573 ham `fetch('/api…')` var. Tipli bir istemci, ortak hata işleme, iptal (`AbortController` yalnızca 7 dosyada) ya da tekilleştirme yok. Aynı `res.json()` + `data.success` + `toast.error(data.error || …)` bloğu yüzlerce kez tekrarlanıyor (ör. `app/customer/settings/page.tsx:161-171, 301-311, 330-340, 420-430`).
- `QueryClientProvider` kurulu ve makul varsayılanlara sahip (`components/providers.tsx:207-215`), ama yalnızca 10 dosyada kullanılıyor.
- 200 sayfanın 151'i `'use client'`. Veri, hidrasyondan sonra `useEffect` ile çekiliyor. İlk boyamada iskelet görünüyor, sunucu bileşeni avantajı kullanılmıyor.
- Müşteri ana panelinde açılışta 7 paralel istek atılıyor ve her 60 saniyede 7'si birden yenileniyor (`components/customer/dashboard/customer-dashboard.tsx:160-194`, `refetchInterval: 60_000`). Her istek ayrı bir fonksiyon çağrısı, oturum çözümü ve token-replay kontrolü demek.
- Bildirimlerde çift taşıma var: `components/dashboard/notification-center.tsx:145-148` her 20 saniyede, sekme gizli olsa bile poll ediyor (projede `visibilityState` kontrolü 0). Bayi düzeninde buna ek olarak SSE açılıyor (`app/dealer/layout.tsx:48` `RealtimeNotifications`). SSE route'u da sunucuda 60 saniyelik bir fonksiyonu açık tutup DB'yi poll ediyor (`app/api/dealer/notifications/stream/route.ts:8, 67-100`). Sonuçta bayi başına aynı veri için iki kanal çalışıyor ve serverless süre maliyeti oluşuyor.

**Öneri**
- `lib/api-client.ts`: `api.get<T>(path, { query, signal })` ve `api.post<T>(path, body)` gibi fonksiyonlar; zarf v2'yi çözsün, hata durumunda `ApiError(code, message, details, requestId)` fırlatsın, 401'de oturum yenilemeye yönlendirsin, 429'da `Retry-After`'ı taşısın.
- Alan bazlı React Query hook'ları (`hooks/queries/customer.ts` → `useCustomerStats()` vb.) ve standart query key fabrikası yazın. Mutasyonlar `invalidateQueries` ile ilgili listeleri tazelesin.
- Panel açılışları için iki yol var: (a) sunucu bileşeninde `lib/domains/*` servislerini doğrudan çağırıp `HydrationBoundary` ile istemciye aktarmak, (b) tek bir `GET /api/customer/dashboard` BFF ucu (7 isteği 1'e indirir). (a) öncelikli olmalı.
- Bildirim için tek kanal seçin. Öneri: SSE'yi kaldırıp sekme görünürken 20–30 saniyede bir poll, gizliyken durdurma (`refetchIntervalInBackground: false`). Gerçek zamanlılık gerçekten gerekiyorsa sunucuda DB poll eden SSE yerine bir yayın servisi düşünün (Upstash Redis zaten var).

**Efor:** L (kademeli; önce en çok kullanılan 15 ekran)

---

### B10 [ORTA]: Önbellek iki ayrı sistemle elle yönetiliyor; ortak yardımcı yazılmış ama kullanılmıyor

**Kanıt**
- Redis: 16 route aynı kalıbı elle yazıyor: `await import('@/lib/redis')` → `redisGetJson` → hesapla → `redisSetJson(key, payload, ttl)` (ör. `app/api/dealer/analytics/route.ts:65-67, 422`; `app/api/admin/analytics/route.ts:42-44, 542`). Bunun için yazılmış `cachedJson` (`lib/redis.ts:81-88`) **0** kullanımda.
- Anahtarlarda sürüm yok (`dealer-analytics:${dealerId}:${period}`, `admin:tenant-health`). Yanıt şekli değiştiğinde dağıtım sonrası TTL dolana kadar eski şekil servis edilir. Redis için invalidation yok, yalnızca TTL (30–300 sn) var.
- Next cache: `unstable_cache` 3 yerde (`admin/dashboard/route.ts:18`, `leaderboard/route.ts:38,62`, `lib/module-gate.ts:85`), `revalidateTag` 8 yerde. Hangi verinin hangi katmanda tutulduğu tek bir yerden görülemiyor.
- 389 route'ta `export const dynamic = 'force-dynamic'` var. Route handler'larda bu zaten varsayılan davranış, yani gürültü. CDN önbelleğine uygun yalnızca 2 public uç var (`settings/theme`, `public/stats`). `settings/background` ve `settings/seasonal-concept` public ve herkes için aynı olduğu halde `no-store` dönüyor.

**Öneri:** Tek bir `cached({ key: ['dealer-analytics', 'v2', dealerId, period], ttl: 45, tags: ['dealer:'+dealerId] }, fetcher)` yardımcısı yazın. Anahtara şema sürümünü otomatik eklesin, etiket başına Redis set'i tutarak `invalidateTag('dealer:x')` desteklesin ve `defineRoute({ cache })` ile deklaratif olsun. Herkese aynı yanıtı veren public uçlara `s-maxage` + `stale-while-revalidate` başlıkları ekleyin. `force-dynamic` satırlarını toplu temizleyin.

**Efor:** M

---

### B11 [ORTA]: Yinelenen ve sahipsiz uçlar; üç ayrı zamanlayıcı katmanı

**Kanıt**
- **Streak:** `app/api/streak/route.ts` (240 satır, POST ile `creditPointsAndXp` `:184` çağırıyor, rol kontrolü yok, **istemcide tüketicisi bulunamadı**), `app/api/customer/streak` (login streak; tüketicisi `components/customer/login-streak-card.tsx`) ve `app/api/customer/games/streak` (tüketicisi `games-hub.tsx`). Kullanılmayan ama puan basan bir uç gereksiz saldırı yüzeyi demek.
- **Push:** `app/api/push/subscribe` (tüketici bulunamadı) ile `app/api/customer/push` (`hooks/use-push-notifications.ts:88,117`) aynı işi yapıyor.
- **Oyunlar:** `customer/games/pacman/{start,complete}` ile genel `customer/games/[game]/{start,complete}` paralel duruyor. Genel route'un yorumu "pacman hariç tümü" diyor.
- **Zamanlayıcılar:** `vercel.json` cron'u (`/api/cron/daily`, alt görevleri route→route import ile çağırıyor: `app/api/cron/daily/route.ts:5-11`), harici cron-job.org ve Inngest cron'ları (`lib/inngest/functions.ts`, 20 fonksiyon, ör. `outbox` `*/2 * * * *`). Aynı iş iki yerde yazılmış: `cron/cleanup-counters` ↔ `internal/inngest/rate-limit-cleanup` (ikisi de `rateLimitCounter.deleteMany`), `cron/squad-battles` ↔ `internal/inngest/squad-battles-finish` (ikisi de `finishSquadBattle`, idempotent olduğu için zararsız ama gereksiz).
- Inngest fonksiyonları işi doğrudan yapmıyor, kendi deployment'ına HTTP ile geri çağrı yapıyor (`lib/inngest/internal-http.ts` `invokeInternalCron`). Bu, iki fonksiyon çağrısı ve iki zaman aşımı penceresi demek.
- Cron yetkilendirmesi 10 dosyada kopyalanmış (`validBearer` + `timingSafeEqual`). Hazır olan `authorizeInternalJobRequest` (`lib/inngest/internal-http.ts:27`) bu dosyalarda kullanılmıyor.

**Öneri**
- `lib/jobs/registry.ts` içinde her işi tek bir fonksiyon olarak tanımlayın (`{ name, run(), schedule }`). Cron route'u, Inngest ve admin "şimdi çalıştır" düğmesi aynı `run()` fonksiyonunu doğrudan çağırsın. Route→route import ve kendi kendine HTTP çağrısı kalksın.
- Hangi zamanlayıcının sahip olduğu her iş için tek bir yerde yazsın.
- Sahipsiz uçları önce 2 hafta loglayıp (çağrılıyor mu?) sonra kaldırın.

**Efor:** M

---

### B12 [ORTA]: İş mantığı route dosyalarında; servis katmanı ve sunucu/istemci sınırı belirsiz

**Kanıt**
- 47.521 satırlık route kodunun büyük kısmı iş mantığı. 349 route doğrudan Prisma kullanıyor. Örnekler: `app/api/ai/analyze/route.ts` (995 satır), `app/api/admin/users/route.ts` (706), `app/api/admin/bootstrap/route.ts` (496, gövde şemasız).
- Aynı iş kuralı birden fazla route'ta yaşıyor (B3 ve B11'deki örnekler). Test edilebilirlik düşük: 46 test dosyasının yalnızca 7'si API route testi (`__tests__/api/*`), `lib` testleri ise saf `*-core.ts` mantığını kapsıyor. Bu, servis katmanına taşımanın neden değerli olduğunu gösteriyor.
- Prisma kullanan 83 lib dosyasından yalnızca 2'si `import 'server-only'` içeriyor. Bugün istemci bileşenlerinden Prisma'lı lib'e sızma tespit edilmedi (400 istemci dosyası örneklendi), ama koruma derleme zamanında değil, alışkanlıkla sağlanıyor.
- `lib/` 216 düz dosyadan oluşuyor. `wallet.ts` (Apple/Google pass) ile `points-wallet.ts` (puan) gibi isim çakışmaları, alan sınırlarının görünmediğini gösteriyor.

**Öneri:** Hedef katmanlama (§5): `app/api/**/route.ts` (ince: sözleşme + `defineRoute`) → `lib/domains/<alan>/*.ts` (use-case'ler, transaction sınırları, `server-only`) → `lib/domains/<alan>/*-core.ts` (saf, test edilebilir). Taşıma büyük route'lardan ve puan basan yollardan başlasın. Her taşınan use-case, mevcut jest altyapısıyla birim testi kazansın.

**Efor:** XL (kademeli, alan bazında)

---

### B13 [DÜŞÜK]: Partner API anahtarı modeli zayıf

**Kanıt:** `prisma/schema.prisma:1232-1246` `ApiKey` modelinde `keyHash` alanı için `@unique` ya da index yok; sorgu `findFirst({ where: { keyHash } })` ile yapılıyor (`lib/partner-api-auth.ts:23-26`), indexlenmiş olan yalnızca `keyPrefix`. Son kullanma tarihi veya iptal alanı yok. Anahtar bir kiracıya bağlı değil: `app/api/partner/v1/digest/route.ts:28-30` çağıranın verdiği `?dealerId=` ile herhangi bir bayinin özetini dönüyor. Partner uçlarında rate-limit yok. Her istekte `lastUsedAt` yazılıyor (`:36-39`).

**Öneri:** `keyHash @unique`, `expiresAt`, `revokedAt`, isteğe bağlı `dealerId` (kiracı bağlama) ve scope listesi ekleyin. Kiracıya bağlı anahtarın `dealerId` parametresini yok sayın. Anahtar başına rate-limit politikası tanımlayın. `lastUsedAt` yazımını kısın (token-replay'deki `TOUCH_INTERVAL` deseni burada da uygulanabilir).

**Efor:** S

---

### B14 [DÜŞÜK]: Sözleşme belgesi ve API testleri gerçekliği yansıtmıyor

**Kanıt:** `openapi.yaml` 398 yoldan yalnızca 9'unu tanımlıyor, son değişiklik 2026-05-12. `__tests__/api/contract.test.ts` yalnızca bu YAML'ın yapısını doğruluyor, gerçek route'ları değil. `lib/data/admin-api-catalog.json` route ve metot envanterini otomatik üretiyor, ama auth, modül ve şema bilgisi içermiyor.

**Öneri:** Sözleşmeler `lib/contracts/*` altında zod olarak durduğunda (B6), OpenAPI'yi bunlardan üretin (`@asteasolutions/zod-to-openapi`) ve `openapi.yaml`'ı elle yazmayı bırakın. Mevcut katalog üreticisini `defineRoute` meta verisini okuyacak şekilde genişletin (roller, kiracı, modül, rate-limit, şema var mı) ve bunu hem admin `api-catalog` sayfasında hem de CI raporunda kullanın.

**Efor:** M

---

### B15 [DÜŞÜK]: IP çıkarımı ve JWT tazeliği

**Kanıt**
- İstemci IP'si üç farklı yoldan okunuyor: `getClientIp` (`lib/request-metadata.ts:15`, 2 route + `getAuditRequestMeta` üzerinden 50 route), `getClientIdentifier` (`lib/rate-limit.ts:208`, 7 route) ve ham `x-forwarded-for` (7 route, ör. `app/api/dealer/cards/scan/[token]/route.ts:94`). Sırası ve geri dönüş başlıkları farklı. Rate-limit anahtarı ile audit IP'si aynı istek için farklı değer alabilir. Başlığın platformda üzerine yazılıp yazılmadığı (sahteciliğe karşı) doğrulanmadı.
- Rol JWT'ye girişte yazılıyor ve `requireAuth` bunu DB'ye karşı doğrulamıyor (`lib/auth.ts:212-262`). Rol düşürme veya hesap kapatma 24 saatlik oturum ömrü boyunca etkisiz kalır. Ekip modülü bunu kendisi çözmüş: `lib/team-access.ts:17-21` güncel rolü DB'den okuyor. `trigger === 'update'` dalı istemcinin `points`/`level` alanlarını token'a yazmasına izin veriyor (`lib/auth.ts:272-281`). Bu yalnızca görüntüyü etkiliyor, sunucuda otorite olarak kullanılmıyor.

**Öneri:** Tek bir `getRequestContext()` fonksiyonu IP, UA ve requestId'yi bir kez çözsün ve hem rate-limit hem audit bunu kullansın. `requireAuth` içine, token-replay'in Redis sıcak katman desenini izleyen bir `sessionVersion` kontrolü ekleyin: `User.sessionVersion` artırıldığında (rol değişikliği, ban, şifre sıfırlama) eski token'lar Redis'te ~1 ms'lik bir kontrolle reddedilsin. Session update dalından `points`/`level` alanlarını kaldırın; bu değerler yalnızca sunucudan gelsin.

**Efor:** S–M

---

### Not: Proxy ile route arasındaki yetki bölünmesi

`proxy.ts:105-119` `/api/*` isteklerine yalnızca CORS ve güvenlik başlıkları ekliyor, kimlik doğrulama tamamen route'lara bırakılmış. Bu model doğru, ama sonucu şu: **sayfa düzeyindeki her politika (ör. admin gizli kapısı, `proxy.ts:79-88`) API'de geçersiz.** Gizli kapının API tarafında uygulanmaması ve cookie'nin HMAC'inin doğrulanmaması `guvenlik-admin-api.md` B1'de ayrıntılı ele alındı, burada tekrarlanmıyor. Mimari çıkarım şu: "panel erişim politikası" `defineRoute`'un bir parçası olmalı (`auth: { roles: ['ADMIN'], adminGate: true }`), yalnızca proxy'de değil. Ayrıca `app/api/customer/innovation/nearby` ve `radar` route'ları `customer/` altında duruyor ama kimlik doğrulaması yok. Bilinçli olarak public olabilirler, ama yol adı yanıltıcı; `public/` altına taşınmaları ad alanını dürüst kılar.

---

## 4. Güçlü yönler (korunmalı)

- `checkRateLimitDb` (`lib/rate-limit.ts:23-70`): Redis'e öncelik veren, tek SQL ile atomik `INSERT … ON CONFLICT` çalışan ve hata durumunda eski yola düşen bir yapı. Hedef rate-limit politikalarının çekirdeği olarak kalmalı.
- Token-replay'in Redis sıcak katman ve DB kaynak-doğruluk deseni (`lib/token-replay.ts:1-15`). `sessionVersion` için de bu desen kullanılmalı.
- `responseIfDatabaseUnavailable` (`lib/api-http.ts:18-29`): retryable 503 dönüyor. Merkezi catch'e taşınmalı.
- Puan cüzdanı (`lib/points-wallet.ts:27,75`) ve atomik claim deseni (`lib/gamification-engine.ts:16-23`).
- Ekip modülü (`lib/team-access.ts`): rolü DB'den doğrulayan, alan-özel erişim yardımcısının iyi bir örneği. `defineRoute`'taki `auth` eklentileri bu modele göre tasarlanabilir.
- `createApiRoute` (`lib/api-route.ts:53-83`): hedef fabrikanın doğru yöndeki ilk adımı. Yeniden yazmak yerine genişletilmeli.

---

## 5. Hedef mimari

### 5.1 Katmanlar

```
app/api/<alan>/.../route.ts         ← İNCE: export const POST = defineRoute(contract, handler)
        │
lib/server/http/                    ← defineRoute, response (zarf v2), errors (ApiError/ApiErrorCode),
        │                              context (actor/tenant/requestId/ip), policies (rateLimit, cache, module)
lib/contracts/<alan>.ts             ← zod: body/query/params/response  (istemci + sunucu + OpenAPI ortak)
        │
lib/domains/<alan>/*.ts             ← 'server-only' use-case'ler; transaction sınırları; prisma burada
lib/domains/<alan>/*-core.ts        ← saf mantık (mevcut *-core.ts dosyaları buraya taşınır)
lib/ai/gateway.ts                   ← tek AI geçidi: bütçe + rate-limit + injection + sağlayıcı adaptörleri
lib/jobs/registry.ts                ← tüm zamanlanmış işler; cron/Inngest/admin aynı run()'ı çağırır
        │
lib/api-client.ts + hooks/queries/  ← tipli istemci + React Query hook'ları (contracts'tan tip alır)
```

### 5.2 `defineRoute` sözleşmesi (öneri)

```ts
export const POST = defineRoute(
  {
    auth: { roles: ['DEALER'], tenant: 'dealer', allowAdminImpersonation: false },
    module: 'campaigns',                        // ModuleKey: katalogdan türetilmiş union
    input: { body: CreateCampaignBody, query: undefined },
    rateLimit: 'mutation',                      // adlandırılmış politika → checkRateLimitDb
    idempotent: true,                           // Idempotency-Key başlığı → lib/idempotency
    cache: undefined,                           // GET'lerde { key, ttl, tags }
  },
  async ({ actor, body, request }) => {
    const campaign = await campaigns.create(actor.tenantId, body);
    return ok({ campaign });                    // → { success: true, data: { campaign }, requestId }
  }
);
```

Fabrikanın merkezde garanti ettikleri:
- `requireAuth` (replay + sessionVersion) çalışır, rol/kiracı çözülür ve gerekiyorsa admin gate kontrol edilir.
- zod doğrulaması yapılır; başarısızlıkta `422/400 { code: 'VALIDATION', details }` döner.
- Modül kapısı, rate-limit, idempotency ve cache uygulanır.
- Merkezi catch: `ApiError` → ilgili kod; Prisma bağlantı hatası → 503 retryable; diğer hatalar → Sentry + 500 `{ code:'INTERNAL', requestId }`.
- Her yanıta `no-store` (aksi belirtilmedikçe) ve `x-request-id` eklenir.
- Meta veri statik olarak okunabilir; katalog, OpenAPI ve CI raporu bundan üretilir.

### 5.3 Zarf v2 (geriye uyumlu)

İstemci bugün 625 yerde `data.success` ve 342 yerde `data.error` okuyor. Bu yüzden v2 bu iki alanı **korur**, yalnızca `code`, `details`, `retryable`, `requestId` ekler ve başarı yükünü `data` altına toplar. Geçiş döneminde `ok()` yardımcısı `legacySpread: true` seçeneğiyle alanları kök düzeye de yayabilir. İstemciler `api-client`'a taşındıkça bu bayrak kaldırılır.

### 5.4 İstemci

- `api-client` zarfı çözer ve `ApiError` fırlatır. 401'de `signIn`'e yönlendirir, 429'da `retryAfter`'ı UI'ya iletir, `MODULE_DISABLED`'da standart bir "bu özellik geçici olarak kapalı" boş durumunu gösterir.
- Ekranlar `useQuery(customerKeys.stats(), …)` ile çalışır. Panel açılışları sunucu bileşeninde prefetch ve `HydrationBoundary` ile beslenir.
- Polling yalnızca görünür sekmede çalışır. Bildirimler tek kanaldan gelir.

---

## 6. Adım adım geçiş planı

**Faz 0: Korkuluklar (1–2 gün, S).** Sonraki adımların ölçülebilir olması için önce bunlar.
1. `instrumentation.ts` içine `onRequestError` ekle (B4).
2. ESLint: `app/api/**` altında `next-auth` `getServerSession` import'unu ve bellek içi limiter import'larını yasakla (mevcut ihlaller için geçici izin listesi, sayı yalnızca azalabilir).
3. `scripts/` altındaki katalog üreticisini route başına şu metrikleri çıkaracak şekilde genişlet: auth yolu, zod var mı, rate-limit, zarf, modül, try/catch. CI'da rapor olarak yayınla. Bu rapordaki sayılar §2.2 tablosunun otomatik versiyonu olur.

**Faz 1: Risk kapatma (1 hafta, M).** Güvenlik ve ekonomi kaynaklı bulgular.
1. B1: 80 route'u `requireAuth`'a geçir, puan basan uçlara `['CUSTOMER']` ver, yanlış rolde 401 dönenleri 403'e çevir.
2. B3: tüketim akışını tek transaction'lı domain servisine taşı, `points_credited` ekle, idempotency anahtarı al.
3. B2: kiracı çözücüsünü yaz, admin kabul eden ama dalı olmayan 11 bayi route'undan ADMIN'i çıkar (veya açık impersonation ekle).
4. B7: LLM çağıran 12 route'a DB/Redis rate-limit ekle, 15 bellek içi admin limiter'ını `checkRateLimitDb`'ye çevir.
5. B11: sahipsiz `/api/streak` POST'u ve `/api/push/subscribe`'ı önce logla, 2 hafta sonra kaldır.
6. Admin gate'in API'de uygulanması: `guvenlik-admin-api.md` B1 ile birlikte.

**Faz 2: Çekirdek altyapı (1–2 hafta, M).**
1. `lib/server/http/` modülünü oluştur: `defineRoute` (mevcut `createApiRoute`'un genişletilmiş hali), zarf v2, `ApiError`, `ApiErrorCode`, `getRequestContext`, adlandırılmış rate-limit politikaları, `cached()` yardımcısı.
2. `ModuleKey` tipini katalogdan türet, katalog dışı anahtarları düzelt (B8).
3. `lib/api-client.ts` ve ilk alan için React Query hook'larını yaz.
4. `sessionVersion` kontrolünü `requireAuth`'a ekle (B15).

**Faz 3: Alan alan geçiş (4–8 hafta, L).** Her alan için aynı döngü uygulanır: sözleşmeyi `lib/contracts`'a çıkar → use-case'i `lib/domains`'e taşı (testiyle) → route'u `defineRoute`'a çevir → istemci ekranlarını `api-client` ve hook'lara taşı → katalog raporunda alanı yeşile çek.
Önerilen sıra (risk ve kullanım yoğunluğuna göre):
1. Puan ekonomisi uçları (gamification, streak, referral, birthday, tournament, seasonal-event, surprise-box, shop)
2. Müşteri paneli (dashboard BFF veya RSC prefetch, bildirimler tek kanal)
3. Bayi çekirdeği (consumptions, feedbacks, analytics, stats: "başarı gibi görünen fallback" temizliği burada)
4. Admin (142 route; çoğu zaten `requireAuth(['ADMIN'])` kullandığı için mekanik)
5. AI uçları (`lib/ai/gateway.ts`; `groq.ts`/`openai.ts` adaptöre indirgenir)

**Faz 4: Temizlik ve sürdürülebilirlik (1–2 hafta, M).**
1. `lib/jobs/registry.ts`: cron ve Inngest çiftlerini birleştir, kendi kendine HTTP çağrılarını kaldır, cron yetkilendirme kopyalarını sil (B11).
2. OpenAPI'yi sözleşmelerden üret, elle yazılmış `openapi.yaml`'ı kaldır (B14).
3. 389 `force-dynamic` satırını kaldır; public uçlara CDN önbellek başlığı ekle (B10).
4. Eski yardımcıları sil: `jsonOk`/`jsonError`/`apiOk`/`apiError`/`ApiResponse`, bellek içi limiter'lar, `lib/openai.ts`.
5. Partner API anahtar modelini sertleştir (B13).
6. ESLint geçici izin listesini boşalt; kural artık istisnasız çalışsın.

**Başarı ölçütleri (katalog raporundan izlenir):** doğrudan `getServerSession` 80 → 0 · `defineRoute` kapsamı 1 → 398 · Sentry'ye ulaşan route hatası 6 route → %100 · şemasız JSON gövdesi 51 → 0 · ham `fetch('/api')` 573 → <50 (yalnızca özel durumlar) · müşteri paneli açılış isteği 7+ → 1–2 · `points_credited` olmadan puan basan yol 2 → 0.
