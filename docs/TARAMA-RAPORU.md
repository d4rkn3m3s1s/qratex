# Detaylı Tarama Raporu – Hata, A/B Test ve Güvenlik

**Tarih:** 2025-02-19  
**Kapsam:** Kod tabanı taraması, A/B test analizi, güvenlik açıkları.

---

## 1. Genel Hata Taraması

### 1.1 Düzeltilen Hatalar

| Konu | Durum | Açıklama |
|------|--------|----------|
| **Admin Features toggle** | ✅ Düzeltildi | Admin özellikler sayfası `PATCH /api/admin/features` ile toggle yapıyordu; API’de sadece `PUT ?key=` vardı. `PATCH` handler eklendi (`body: { id, isEnabled }`). |

### 1.2 Önceki Döngüde Yapılanlar (Özet)

- Hydration: Tüm particle blokları `useParticlesMounted` ile mount sonrası render.
- List key’leri: `donut-chart`, feedback images, c/[token] benefits, admin analytics recentActivity için stable key kullanımı.
- Turbopack CSS, DATABASE_URL/client Prisma, Radix Sheet hydration daha önce düzeltildi.

---

## 2. A/B Test ve Feature Flag Analizi

### 2.1 Mevcut Yapı

- **Feature Flag (Admin):**
  - `GET/POST/PUT/PATCH/DELETE /api/admin/features` – CRUD + toggle.
  - Model: `FeatureFlag` (id, key, name, description, isEnabled, expiresAt, ownerId, metadata).
  - Seed: `gamification`, `ai_analysis`, `push_notifications`, `leaderboard` vb.

- **Gamification A/B (`lib/gamification-ab.ts`):**
  - `getVariant(userId, experimentKey)` – Settings’teki `gamification_ab_experiments` ile tutarlı varyant atar.
  - Ağırlıklı seçim: `variants`, `weights` (opsiyonel).
  - **Kullanım:** Şu an sadece dokümantasyon ve lib; spin/quest/reward API route’larında `getVariant` çağrısı yok.

### 2.2 A/B Test Önerileri

1. **Spin / quest / reward metinleri:** İlgili route’larda (örn. `app/api/gamification/spin/route.ts`) `getVariant(session.user.id, 'reward_copy')` ile metin varyantı seçilebilir; `GAMIFICATION-AB-TEST.md` ile uyumlu.
2. **İmpression/conversion loglama:** `analyticsEvent` veya benzeri ile `event: 'gamification_ab_impression'`, `data: { experiment, variant, outcome }` kaydı eklenebilir.
3. **Feature flag kullanımı:** Client’ta özellik açık/kapalı kararları için `/api/admin/features` (veya public bir “enabled keys” endpoint’i) kullanılabilir; şu an admin UI sadece yönetim için.

---

## 3. Güvenlik Taraması

### 3.1 İyiler

| Konu | Detay |
|------|--------|
| **Auth** | `requireAuth` / `getServerSession` yaygın; hassas API’ler rol kontrolü yapıyor. |
| **Şifre** | bcrypt (round 12), Zod ile uzunluk ve karmaşıklık kuralları. |
| **Rate limit** | `lib/rate-limit.ts`: register, login, feedback, feedback-per-QR, scan, admin SEO, admin mutation. |
| **Login lockout** | 5 başarısız deneme → 15 dk kilitleme. |
| **IDOR** | Örnek: `dealer/feedbacks/[id]/reply` – feedback’in `qrCode.dealerId` ile session eşleşmesi kontrol ediliyor. |
| **SQL** | Prisma kullanımı; `$queryRaw` sadece `SELECT 1` (parametresiz). |
| **Prompt injection** | `lib/prompt-injection.ts`: tehlikeli pattern tespiti ve sanitize. |
| **Feedback POST** | IP rate limit, QR başına limit, idempotency, Zod (`feedbackSchema`). |
| **Kart aktivasyonu** | Role (CUSTOMER) ve kart durumu kontrolü. |

### 3.2 Yapılan Güvenlik Düzeltmeleri

| Konu | Yapılan |
|------|--------|
| **Export PDF XSS** | `lib/export-utils.ts`: `exportToPDF` için başlık `escapeHtml` ile escape edildi; `buildAnalyticsPDFContent` içinde dinamik değerler (totalFeedbacks, avgRating, sentiment, topTopics) escape edildi. |

### 3.3 Bilinen / Düşük Risk

| Konu | Durum |
|------|--------|
| **dangerouslySetInnerHTML** | Sadece JSON-LD için `JSON.stringify(...)` ile kullanılıyor; kullanıcı girdisi yok → kabul edilebilir. |
| **document.write** | `export-utils.ts` içinde print penceresi; başlık ve PDF içeriği artık escape/sanitize edildi. |
| **Env / secrets** | `process.env` kullanımı; secret’lar sunucu tarafında. `.env` repo’da olmamalı (`.gitignore` kontrolü önerilir). |

### 3.4 Uygulanan Ek Kontroller (2025-02-19)

| Konu | Yapılan |
|------|--------|
| **CORS / CSP** | Middleware CSP, next.config ile uyumlu hale getirildi: `connect-src` (Supabase, Netlify, Vercel Insights, Sentry), `script-src` (vercel-insights). |
| **Sensitive API audit** | Webhook oluşturma/silme ve API key oluşturma/silme için `AuditLog` kaydı eklendi (`CREATE_WEBHOOK`, `DELETE_WEBHOOK`, `CREATE_API_KEY`, `DELETE_API_KEY`). Rate limit zaten vardı. |
| **Input uzunlukları** | `lib/input-limits.ts` eklendi (feedbackText: 2000, messageText: 2000, replyText: 2000, searchQuery: 200). Chat, feedback schema, consumption review, dealer reply ve arama sorgusu bu limitleri kullanıyor. |

---

## 4. A/B Test Uygulaması (Yapıldı)

- **Spin** (`/api/gamification/spin`): `getVariant(userId, 'reward_copy')` çağrılıyor; her çark çevirmede `analyticsEvent` ile `gamification_ab_impression` loglanıyor (experiment: `reward_copy`, variant, outcome: prize type).
- **Quest claim** (`/api/gamification/quests/[id]/claim`): Aynı experiment key ve `gamification_ab_impression` (outcome: `quest_claim`).
- **Reward claim** (`/api/gamification/rewards` PATCH): Aynı experiment key ve `gamification_ab_impression` (outcome: `reward_claim`).
- Varyant metni seçimi (A/B kopyası) ileride Settings’teki `gamification_ab_experiments.reward_copy.variants` ile mesaj şablonlarına bağlanabilir; şu an sadece impression loglama aktif.

---

## 5. Derin Tarama (Optimizasyon ve Hata)

- **Sorgu limitleri:** Kritik listelerde `take`/`pageSize` kullanılıyor (feedbacks, users cursor, voc-wall limit, vb.). Admin feedbacks’ta `takeLimit` ve type’a göre take mevcut.
- **Arama:** `/api/search` sorgu parametresi `INPUT_LIMITS.searchQuery` (200 karakter) ile kırpılıyor; uzun sorgu ile abuse azaltıldı.
- **Hata yakalama:** API route’larında try/catch ve anlamlı hata mesajları yaygın; quest/reward claim’de özel hata tipleri (QUEST_NOT_FOUND, REWARD_OUT_OF_STOCK vb.) dönülüyor.
- **Audit:** Webhook ve API key mutasyonları artık audit log’a yazılıyor; silmeden önce kayıt varlığı kontrol ediliyor (404 dönülebiliyor).

---

## 6. Özet

- **Hata:** Admin features toggle için PATCH handler eklendi.
- **A/B:** Spin, quest claim, reward claim route’larında `getVariant('reward_copy')` ve `gamification_ab_impression` analytics event’i eklendi.
- **Güvenlik:** CSP uyumluluğu, webhook/api-key audit log, merkezi input limitleri (`input-limits.ts`) ve arama sorgusu kırpma uygulandı.
- **Rapor:** Bu doküman güncel durumu yansıtıyor.

---

## 7. Ek Optimizasyon Önerileri

Aşağıdakiler uygulanmadı; öncelik sırasıyla değerlendirilebilir.

### 7.1 Backend / API

| Öneri | Fayda | Nasıl |
|-------|--------|------|
| **Settings / points matrix önbelleği** | `getPointsMatrix()` ve `getLeagueRules()` birçok istekte Settings tablosuna gidiyor (spin, feedback, quest, reward, streak, referral, register, leaderboard). Aynı request veya kısa TTL cache ile DB yükü azalır. | `lib/points-rules.ts` ve `lib/league-rules.ts` içinde request-scoped veya `unstable_cache` (Next.js) ile 30–60 sn TTL; admin settings güncellediğinde `revalidateTag` ile temizleme. |
| **Admin analytics cevap boyutu** | Tek istekte overview, trends, dealers, cards, recentActivity hepsi dönüyor. Sadece açık tab için veri istemek veya alan seçimi (`?fields=overview,trends`) ile ilk yük hızlanır. | İsteğe bağlı `fields` veya tab bazlı ayrı endpoint’ler; veya mevcut yapıda sadece istemci tarafında lazy load (tab değişince o veriyi çek). |
| **Public / read-heavy route cache** | Bazı GET route’larında zaten `revalidate` var (voc-wall 30s, benchmark 300s, dealer stats 60s, public stats s-maxage). Benzer sayfalar için aynı pattern genişletilebilir. | Örn. leaderboard, discovery, dealer dashboard özeti için kısa s-maxage + stale-while-revalidate. |

### 7.2 Frontend / İstemci

| Öneri | Fayda | Nasıl |
|-------|--------|------|
| **Veri çekme: SWR veya React Query** | Birçok sayfa `useEffect` + `fetch` ile veri alıyor; sekme değişince veya mount’ta her seferinde yeniden istek atılıyor. Dedupe, stale-while-revalidate ve cache ile gereksiz istekler azalır. | Kritik listeler (admin analytics, dealer dashboard, customer sayfaları) için SWR/React Query ile `key` + `revalidateOnFocus: false` veya uygun staleTime. |
| **Framer Motion bundle** | Birçok sayfada `import { motion } from 'framer-motion'` var; ağır sayfalar için motion’ı lazy yüklemek bundle’ı bölümlere ayırır. | Sadece animasyon yoğun sayfalarda `dynamic(() => import('…'), { ssr: false })` ile motion kullanan bileşeni lazy load; veya mevcut kullanım kabul edilebilir kalıyorsa dokunulmayabilir. |
| **Görsel optimizasyonu** | `next.config.js` içinde `images: { unoptimized: true }` var; Next.js Image ile otomatik WebP/ boyut optimizasyonu kapalı. | Hosting uyumluysa `unoptimized: false` veya loader ile görsel optimizasyonu açmak; LCP ve bandwidth iyileşir. |

### 7.3 Veritabanı / Ölçek

| Öneri | Fayda | Nasıl |
|-------|--------|------|
| **AnalyticsEvent büyümesi** | `gamification_ab_impression`, `feedback_submitted`, `points_credited` vb. sürekli yazılıyor; tablo büyüdükçe sorgular yavaşlayabilir. | Periyodik arşiv (eski kayıtları ayrı tabloya taşıma veya silme), veya analitik sorguları zaman aralığı + limit ile sınırlama. |
| **İndeks kontrolü** | Sık kullanılan filtreler (örn. `Feedback`: userId, qrCodeId, createdAt, sentiment) zaten index’li. Yeni filtreler eklenirse ilgili sütunlara composite index düşünülebilir. | Yavaş sorgular tespit edildikçe EXPLAIN ile index kullanımı kontrol; gerekirse `@@index([a, b])` ekleme. |

### 7.4 Diğer

| Öneri | Fayda | Nasıl |
|-------|--------|------|
| **Hata sınırları (Error Boundary)** | Sayfa seviyesinde hata yakalama; bir bileşen patlarsa tüm sayfa bozulmaz. | Kritik sayfalarda `error.tsx` (Next.js App Router) veya React Error Boundary ile fallback UI. |
| **API yanıt sıkıştırma** | Büyük JSON cevaplarında gzip/brotli ile boyut azalır. | Vercel/Netlify varsayılan açıyor; kendi sunucunuzda ise middleware veya reverse proxy ile compression. |
| **Kritik sayfa önceliklendirme** | En çok kullanılan route’lar (login, ana sayfa, customer/dealer dashboard) için LCP ve TTI öncelikli: font preload, kritik CSS inline, gerekli JS’i erken yükleme. | Next.js font optimization, kritik above-the-fold bileşenleri önce render; gereksiz script’leri defer. |

---

## 8. Uygulanan Optimizasyonlar (2025-02-19)

- **Settings/points matrix + league rules cache:** 60 sn TTL in-memory cache; admin ayarlar güncellenince `clearPointsMatrixCache` / `clearLeagueRulesCache` çağrılıyor.
- **Admin analytics:** `?sections=overview,trends,dealers,cards,activity` ile kısmi yanıt; React Query (`useQuery`) + 60 sn staleTime.
- **Leaderboard:** Cache-Control `s-maxage=60, stale-while-revalidate=60`. Discovery’de `revalidate = 60` eklendi.
- **Framer Motion:** Admin analitik sayfasında `LazyMotion` + `domAnimation` + `m` kullanıldı (daha küçük bundle).
- **Next.js images:** `unoptimized: false` (Vercel/Netlify uyumlu).
- **AnalyticsEvent:** `lib/analytics-event-retention.ts` (saklama süresi + `deleteAnalyticsEventsOlderThan`, `countAnalyticsEventsOlderThan`); admin API `GET/POST /api/admin/analytics/cleanup-events`.
- **Error boundary:** Customer için `app/customer/error.tsx` eklendi; admin ve dealer zaten vardı.
- **Sıkıştırma:** Vercel/Netlify varsayılan gzip/brotli kullanır; ek config gerekmez.
- **Kritik sayfa önceliği:** `app/layout.tsx` içinde logo için `<link rel="preload" href="/logo/logo.png" as="image" />` eklendi.
- **React Query – Dealer dashboard:** `app/dealer/page.tsx` ana veri `/api/dealer/stats` için `useQuery` (queryKey: `['dealer','stats']`, staleTime/refetchInterval 60 sn); loading/error/refetch butonu bağlandı.
- **React Query – Customer dashboard:** `app/customer/page.tsx` stats, leaderboard, rewards, spin, discovery için tek `useQuery` (Promise.all ile 5 istek); staleTime/refetchInterval 60 sn; sonuç mevcut state’lere sync ediliyor.
- **LazyMotion:** Dealer AI İçgörüler (`app/dealer/ai-insights/page.tsx`) ve müşteri ana sayfası (`app/customer/page.tsx`) `LazyMotion` + `domAnimation` + `m` kullanacak şekilde güncellendi (bundle azaltma).

---

## 9. Derin Tarama – Ek Bulgular (2025-02-19)

Bu bölüm, kod tabanının daha derin incelenmesiyle elde edilen ek güvenlik, performans ve kod kalitesi bulgularını özetler.

### 9.1 Güvenlik

| Konu | Bulgu | Öneri |
|------|--------|--------|
| **Raw SQL** | `$queryRaw` kullanımları: (1) Health/system-status’ta `SELECT 1` (parametresiz). (2) Quest claim’de `SELECT id FROM "UserQuest" WHERE id = ${lockId} FOR UPDATE` – `lockId` DB’den gelen `userQuest.id` (UUID); kullanıcı girdisi değil → güvenli. | Mevcut kullanım kabul edilebilir. Yeni raw SQL eklenirse mutlaka parametreli şablon kullanılmalı. |
| **dangerouslySetInnerHTML** | Sadece JSON-LD (SEO) için `JSON.stringify(...)` ile kullanılıyor (public/page, neden-qratex, blog, webpage-json-ld, breadcrumb-json-ld). Kullanıcı girdisi yok. | Kabul edilebilir. |
| **document.write** | `lib/export-utils.ts` print penceresinde; içerik escape edildi. | Mevcut. |
| **PII in logs** | `lib/auth.ts`: sign-in/sign-out’ta `user.email` / `token.email` loglanıyor. `app/api/feedbacks/route.ts` ve `lib/ai-engine.ts`: feedback id ve kısa metin parçası. | Production’da log seviyesi veya PII redaksiyonu (örn. `lib/pii-redact.ts`) ile hassas alanlar kısıtlanabilir. |
| **Admin feedbacks arama** | `GET /api/admin/feedbacks?search=...` – `search` parametresi doğrudan Prisma `contains` ile kullanılıyordu. | ✅ Uygulandı: `search` için `INPUT_LIMITS.searchQuery` (200) ile `searchTrim` kullanılıyor; hem QR hem consumption filtrelerinde aynı değer kullanılıyor. |
| **Dosya yükleme** | `app/api/admin/assets/upload`: folder whitelist (badges/rewards), MIME magic doğrulama, SVG script kontrolü, PNG EXIF temizleme, dosya adı sanitize – iyi. | — |

### 9.2 Performans / DoS

| Konu | Bulgu | Öneri |
|------|--------|--------|
| **Leaderboard limit** | `GET /api/leaderboard?limit=...` – `limit` sadece `parseInt(...)` ile alınıyor; üst sınır yok. `limit=999999` ile istek ağır olabilir. Ayrıca `category !== 'points'` dalında tüm CUSTOMER kullanıcılar `findMany` ile çekilip bellek içinde sıralanıp `slice(0, limit)` yapılıyor; kullanıcı sayısı büyüdükçe bellek ve CPU maliyeti artar. | `limit` için `Math.min(Math.max(1, parseInt(...) \|\| 50), 100)` gibi cap (örn. max 100). Uzun vadede “points dışı” kategoriler için DB tarafında sıralama + take düşünülebilir. |
| **Leaderboard cap (uygulandı)** | — | `limit` 1–100 aralığına çekildi. Ayrıca `category !== 'points'` dalında `findMany` için `take(MAX_LEADERBOARD_FETCH)` (5000) eklendi; böylece tek istekte en fazla 5000 kullanıcı çekilir, bellek ve DoS riski azalır. |

### 9.3 Kod Kalitesi / Bakım

| Konu | Bulgu | Öneri / Durum |
|------|--------|--------|
| **Boş catch** | `app/api/dealer/campaigns/risk-segment/route.ts`: `catch (_) {}` – hata yutuluyordu. | ✅ Uygulandı: `console.error('[risk-segment] Failed to send notification to user', userId, err)` eklendi. |
| **Prisma tip atlaması** | `(prisma as any).physicalCard`, `(prisma as any).consumptionReview`, `(prisma as any).vIPTier`, `(prisma as any).userVIPStatus` kullanımları var. Schema’da bu modeller varsa tip tanımları güncellenmeli; yoksa genişleme/ek modeller düşünülmeli. | Prisma generate ile modelleri schema’ya taşıyıp `as any` kaldırılması. |
| **GET /api/gamification/rewards** | Session yokken “tüm aktif ödüller” listesi dönüyor. Katalog amaçlı ise bilinçli; hassas alan (cost, stok vb.) dönmüyorsa kabul edilebilir. | İş kuralı olarak not edilebilir; gizlilik gerekiyorsa auth zorunlu yapılabilir. |

### 9.4 Özet

- **Güvenlik:** Raw SQL ve HTML enjeksiyon riski düşük; PII logları ve admin arama uzunluğu iyileştirilebilir.
- **Performans:** Leaderboard `limit` cap eklendi (1–100); “points dışı” kategoride tam liste çekimi ileride optimize edilebilir.
- **Kod:** Boş catch ve `as any` kullanımları bakım/refactor sırasında ele alınabilir.

---

## 10. Başka Neler Yapılabilir?

Aşağıda öncelik ve kategorilere göre yapılabilecek işler listelenmiştir. İstediğiniz maddeyi söyleyerek uygulatabilirsiniz.

### 10.1 Güvenlik / Gizlilik

| # | İş | Açıklama / Durum |
|---|-----|----------|
| 1 | **PII log azaltma** | ✅ Uygulandı: `lib/auth.ts` sign-in/sign-out event’lerinde log sadece `NODE_ENV === 'development'` iken yazılıyor; production’da email loglanmıyor. |
| 2 | **Rewards endpoint auth** | `GET /api/gamification/rewards` session olmadan ödül listesi dönüyor. Katalog public kalacaksa dokümante etmek; hassas bilgi varsa auth zorunlu yapmak. |

### 10.2 Performans / Ölçek

| # | İş | Açıklama |
|---|-----|----------|
| 3 | **Leaderboard “points dışı” DB sıralama** | ✅ Uygulandı: `category !== 'points'` dalında Prisma `orderBy: { feedbacks: { _count: 'desc' } }` (badges/referrals için benzeri) ile DB’de sıralama yapılıyor; `totalUsers` ayrı `count()` ile alınıyor. Liste hâlâ en fazla 5000 ile sınırlı, ancak sıra artık DB tarafında. |
| 4 | **Admin analytics tab bazlı istek** | İstemci hangi tab açıksa sadece o section için istek atabilir (`?sections=overview` vb. zaten var); sayfa ilk açılışta tek section ile başlayıp diğerlerini lazy isteyebilir. |
| 5 | **Read-heavy route cache** | Leaderboard, discovery gibi GET route’larda Cache-Control / revalidate zaten var; benzer public veya sık kullanılan endpoint’lere aynı pattern eklenebilir. |

### 10.3 Kod Kalitesi / Tip Güvenliği

| # | İş | Açıklama |
|---|-----|----------|
| 6 | **Prisma `as any` kaldırma** | ✅ Kısmen uygulandı: `tsconfig` path ile `@prisma/client` → `generated-prisma-client` kullanılıyor; tipler mevcut. `(prisma as any)` kaldırıldı: `app/api/vip/route.ts` (vIPTier, userVIPStatus), `app/api/customer/stats/route.ts` (physicalCard, consumption), `app/api/dealer/stats/route.ts` (consumption), `app/api/admin/feedbacks/route.ts` (consumptionReview), `app/api/admin/analytics/route.ts` (physicalCard, consumption), `app/api/dealer/feedbacks/[id]/reply/route.ts` (consumptionReview). Kalan dosyalar (referral, streak, birthday, happy-hour, offline-sync, quick-presets, push, security, wallet, vb.) aynı şekilde `prisma.modelName` ile güncellenebilir. |
| 7 | **Arama/filtre için Zod** | ✅ Uygulandı: `lib/validations-admin.ts` içinde `adminFeedbacksQuerySchema` ve `adminUsersQuerySchema` eklendi (page, pageSize, search max 200). GET `/api/admin/feedbacks` ve GET `/api/admin/users` bu şemalarla parse ediyor. |

### 10.4 Test ve Kalite

| # | İş | Açıklama |
|---|-----|----------|
| 8 | **API birim testleri** | `__tests__/api/` ve `__tests__/lib/` mevcut; kritik route’lar (auth, feedback POST, gamification claim, dealer reply) için daha fazla route testi eklenebilir (mock session, Prisma mock veya test DB). |
| 9 | **E2E kritik akışlar** | `e2e/` ve Playwright config var; login → dashboard, feedback gönderme, dealer scan gibi akışlar için senaryo eklenebilir. |

### 10.5 Erişilebilirlik (a11y)

| # | İş | Açıklama |
|---|-----|----------|
| 10 | **Form ve buton etiketleri** | Form alanlarında `label` + `id`/`htmlFor`, butonlarda anlamlı `aria-label` veya görünür metin; görsel ikonlar için `aria-hidden` veya `alt`/`role` kontrolü. |
| 11 | **Odak ve klavye** | Modal/drawer açıldığında focus trap, kapatma için Escape; liste/tab gezinmesi klavye ile mümkün. |

### 10.6 İzleme ve Operasyon

| # | İş | Açıklama |
|---|-----|----------|
| 12 | **Health/readiness ayrımı** | `/api/health` DB + diğer bağımlılıkları kontrol ediyor; deployment’ta readiness probe için ayrı bir endpoint veya aynı endpoint’in “light” versiyonu (sadece DB ping) kullanılabilir. |
| 13 | **Kritik hata Sentry’e** | ✅ Uygulandı: `lib/capture-api-error.ts` eklendi (production’da Sentry’ye gönderir). GET/POST `/api/feedbacks`, POST `/api/auth/register`, POST `/api/dealer/feedbacks/[id]/reply`, POST/GET `/api/gamification/spin`, GET/POST/PATCH `/api/gamification/rewards`, POST `/api/gamification/quests/[id]/claim` catch bloklarında `captureApiError` çağrılıyor. |

### 10.7 Dokümantasyon ve Süreç

| # | İş | Açıklama |
|---|-----|----------|
| 14 | **API özeti / OpenAPI** | `openapi.yaml` var; güncel tutulup Postman/istemci üretimi veya internal API dokümanı olarak kullanılabilir. |
| 15 | **Changelog / release notları** | Önemli değişiklikler için CHANGELOG.md veya release notları; sürüm etiketleri ile eşleştirilebilir. |

---

**Özet:** Yukarıdaki 15 madde, rapor ve kod taramasından çıkan “yapılabilecek diğer işler” listesidir. Öncelik ihtiyacınıza göre (güvenlik → performans → test → a11y → operasyon) seçebilirsiniz; belirli bir numarayı söylerseniz o madde için somut adımlar veya patch önerilir.
