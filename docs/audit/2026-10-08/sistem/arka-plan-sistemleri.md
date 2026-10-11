# Arka Plan Sistemleri Denetimi — Qratex (2026-10-08)

> Boyut: **arka-plan-sistemleri** · Kapsam: cron uçları (`app/api/cron`), Inngest işleri (`lib/inngest`, `app/api/internal/inngest`), mail (nodemailer/Resend, şablonlar, IMAP gelen kutusu, açılma takibi), bildirim sistemi (in-app, SSE, polling), web push, PWA/offline, gözlemlenebilirlik (Sentry, PostHog, Speed Insights, in-memory metrikler, loglama), yedekleme betikleri, idempotency/outbox altyapısı.
> Yöntem: Salt okunur kod incelemesi (Grep/Glob envanteri → dosya dosya okuma). Hiçbir komut, betik, build veya DB sorgusu çalıştırılmadı. Canlı ortam değişkenleri (Vercel) görülemediği için ortama bağlı iddialar **"doğrulanmadı"** olarak işaretlendi.

---

## 1. Özet

Qratex'in arka plan katmanı **iyi niyetli ve yer yer olgun parçalardan** oluşuyor: tüm cron uçları `CRON_SECRET` ile fail-closed ve `timingSafeEqual` kullanıyor, sorgular `take` ile sınırlı, ekonomi tarafındaki savaş/escrow kapanışları atomik "claim" deseniyle yarışa dayanıklı, gelen kutusu `@@unique([mailbox, uid])` ile tekrar yazmıyor, SMTP→Resend yedeği var, push'ta ölü abonelikler temizleniyor, outbox tasarımında DLQ düşünülmüş ve 2026-08 Neon duraklatmasından sonra "tek uyanış" kuralıyla maliyet bilinci kazanılmış.

Ancak sistem **bütüncül bir "iş yürütme + teslimat + izlenebilirlik" omurgasına sahip değil**. Somut sonuçları:

1. **Veritabanı yedekleri, herkese açık sunulan R2 kovasına tahmin edilebilir dosya adlarıyla yazılıyor** (tam DB dökümü — parola hash'leri, jetonlar, e-postalar).
2. **İki ayrı zamanlayıcı dünyası var**: Vercel'de tek günlük orkestratör ("tek uyanış") ile Inngest'te ~19 fonksiyonluk, günde ~1.100 tetiklemeli ikinci bir zamanlayıcı. Inngest canlıdaysa Neon hiç uyuyamaz (2026-08 olayının tekrarı); canlı değilse ekip tekrarlayan görevleri, SLA, haftalık özet, analitik saklama gibi 19 iş sessizce ölü.
3. **"Tekrar deneme" çoğu yerde yalnızca yorumda var**: günde tek koşuda "aynı gün sonraki cron tekrar dener" gerçekleşmiyor; başarısız hatırlatmalar kayboluyor.
4. **AI analiz hattı tekrar çalıştığında yan etkilerini tekrarlıyor**: bildirimler çoğalıyor, otomatik yanıt bayinin elle yazdığı yanıtın üstüne yazabiliyor, müşteriye tekrar e-posta gidiyor.
5. **Push ile PWA service worker'ları aynı scope'ta birbirini eziyor**; push teslimi ya da offline davranışı, hangisi son kaydolduysa ona göre bozuluyor.
6. **Gözlemlenebilirlik pratikte kör**: istemci Sentry'si build'de kapalı, sunucu hataları otomatik yakalanmıyor (398 rotanın 6'sı elle raporluyor), cron sonuçları kalıcı yazılmıyor, alarm/dead-man switch yok, metrikler instance-içi bellekte.

**Puan: 4.5 / 10**
Parçalar tek tek düşünülmüş (fail-closed, bounded, atomik claim). Puanı düşüren, bu parçaları birbirine bağlayan omurganın eksikliği: iş kaydı, bütçe, teslimat kuyruğu, dedupe ve alarm yok. Bunun üstüne açık bir veri sızıntısı riski (yedekler) var.

---

## 2. Mevcut durum haritası

### 2.1 Zamanlayıcılar ve tetikleyiciler

| Katman | Tetikleyici | Sıklık | İşler | Kanıt |
|---|---|---|---|---|
| Vercel Cron | `/api/cron/daily` | Günde 1 (03:00 UTC) | intern-deadline → team-task-due → inbox-sync → squad-battles → cleanup-counters → db-cleanup → ai-retry (sıralı) | `vercel.json:5-7`, `app/api/cron/daily/route.ts:51-59` |
| Vercel Cron (kapalı) | `/api/cron/cache-warm` | — | Bayrakla kapalı (`CACHE_WARM_ENABLED`) | `app/api/cron/cache-warm/route.ts:38-44` |
| Vercel Cron (kapalı) | `/api/cron/attachment-backfill` | — | Bayrakla kapalı | `app/api/cron/attachment-backfill/route.ts:49-55` |
| Inngest Cloud | `/api/inngest` (serve) | ~1.100/gün (aşağıda) | 19 fonksiyon, her biri `/api/internal/inngest/*`'a HTTP ile delege | `lib/inngest/functions.ts:9-224`, `app/api/inngest/route.ts:233-236` |
| Event | `feedback/created` | İstek başına | AI analizi (yalnız `USE_INNGEST_QUEUE=true` ise) | `app/api/feedbacks/route.ts:447-453`, `lib/inngest/send.ts:8-10` |
| Yerel makine | `scripts/db-backup*.mjs` | Elle / Windows Görev Zamanlayıcı | pg_dump veya Prisma JSON → R2 | `scripts/db-backup.mjs:21-23` |
| İstemci | Notification polling | 20 sn'de bir, sekme açıkken | `/api/notifications` | `components/dashboard/notification-center.tsx:147` |

Inngest cron dağılımı (canlıysa günlük tetikleme): outbox-process `*/2` (720), squad-battles-finish `*/10` (144), synthetic-monitor `*/15` (96), saatlik 6 iş — negative-feedback-sla, feature-flag-cleanup, rate-limit-cleanup, dealer-flash-offer-expiry, partner-digest-webhook, seasonal-concept-activation (144), customer-reminder-nudges `0 */6` (4), günlük 5 iş, haftalık/aylık 4 iş → **≈1.110 tetikleme/gün**.

### 2.2 Mail

| Bileşen | Rol | Kanıt |
|---|---|---|
| `lib/mail-sender.ts` | SMTP (havuzlu, modül önbellekli) → hata olursa Resend | `:79-90`, `:194-238` |
| `lib/email.ts` | Auth/KVKK işlem mailleri | `:283-404` (birleşik okuma) |
| `lib/notify-email.ts` | Olay e-postaları (bayi yanıtı, rozet), opt-out kontrollü | `:59-101`, `:107-150` |
| `lib/team-email.ts`, `lib/weekly-digest-core.ts` | Ekip ve haftalık özet mailleri | `lib/weekly-digest-core.ts:157-162` |
| `app/api/admin/intern-emails/route.ts` | Stajyer görev maili, tekli/toplu, istek içinde senkron | `:108-136`, `:166-196` |
| `lib/mail-inbox.ts` | IMAP senkronu (son 40 mail), ek → R2, thread/bounce tespiti | `:46-185` |
| `app/api/track/email-open/[token]` | Açılma pikseli | `:15-44` |

### 2.3 Bildirim ve push

| Bileşen | Rol | Kanıt |
|---|---|---|
| `Notification` modeli | In-app zil; dedupe anahtarı yok | `prisma/schema.prisma` (model `Notification`) |
| `lib/team-notify.ts` | Tercih kontrollü in-app + push (push ateşle-unut) | `:18-60` |
| `lib/push.ts` | web-push, paralel gönderim, 404/410 temizliği, toplu log | `:12-108` |
| `public/push-sw.js` | Push SW (yalnız `push` + `notificationclick`) | `:1-35` |
| `hooks/use-push-notifications.ts` | `/push-sw.js`'i `scope: "/"` ile kaydeder | `:21-23` |
| `app/api/dealer/notifications/stream` | SSE akışı — **hiçbir istemci kullanmıyor** | `:1-112` (çağrı yeri yok) |

### 2.4 PWA / offline

`next-pwa` (`register: true`, `skipWaiting: true`, `fallbacks.document: '/offline'`), runtime caching'de aynı-origin, `/api` dışındaki her şey için `NetworkFirst` + 24 saat (`next.config.js:3-12`, `:136-152`). Bayi tarafında "offline kuyruk" sunucu tablosu (`app/api/dealer/offline-sync/route.ts`) var ama istemci tarafında IndexedDB kuyruğu yok.

### 2.5 Gözlemlenebilirlik

| Araç | Durum | Kanıt |
|---|---|---|
| Sentry sunucu | Yalnız `SENTRY_DSN` varsa init; `onRequestError` yok | `instrumentation.ts:6-17` |
| Sentry istemci | Build'de `DISABLE_SENTRY_BUILD=1` → `withSentryConfig` uygulanmıyor → istemci config enjekte edilmiyor | `vercel.json:2`, `next.config.js:384-388` |
| `captureApiError` | 398 API rotasının 6'sında | grep sayımı |
| PostHog | İstemci, key varsa; varsayılan host `eu.i.posthog.com` | `components/analytics/posthog-provider.tsx:12-28` |
| Vercel Analytics + Speed Insights | Kök layout'ta | `app/layout.tsx:168-169` |
| In-memory metrikler / RUM | Instance başına bellek, serverless'ta sıfırlanır | `lib/metrics.ts:1-4`, `lib/rum-web-vitals.ts:1-4` |
| Loglama | Yalnız `console.*`; yapılandırılmış logger ve request-id yok | `lib/logger*` yok |
| Cron izi | Yalnız inbox-sync son koşusunu `Settings`'e yazıyor | `app/api/cron/inbox-sync/route.ts:37-44` |

### 2.6 Yedekleme

`scripts/db-backup.mjs` (pg_dump, gzip, R2 `backups/db/`, son 14) ve `scripts/db-backup-json.mjs` (Prisma `findMany` her model, R2 `backups/db-json/`). İkisi de uygulama yüklemeleriyle **aynı `R2_BUCKET`**'ı kullanıyor.

---

## 3. Bulgular (önem sırasıyla)

Önem: **Kritik** (veri kaybı/sızıntısı ya da kesinti) · **Yüksek** (sessiz işlev kaybı, kullanıcıya yansıyan hata) · **Orta** · **Düşük**. Efor: S (≤1 gün), M (2-4 gün), L (1-2 hafta), XL (>2 hafta).

---

### K1 — Veritabanı yedekleri herkese açık sunulan R2 kovasına, tahmin edilebilir adlarla yazılıyor · Kritik · Efor S-M

**Kanıt**
- `scripts/db-backup.mjs:40` `PREFIX = 'backups/db/'`, `:171` `stamp = new Date().toISOString()...slice(0, 19)` (saniye çözünürlüklü zaman damgası), `:196-206` `Bucket: process.env.R2_BUCKET`.
- `scripts/db-backup-json.mjs:36`, `:72`, `:131-134`: aynı desen, `backups/db-json/`.
- `lib/r2-storage.ts:8`, `:49-58`: uygulama yüklemeleri aynı `R2_BUCKET`'a yazılıyor ve `R2_PUBLIC_URL/key` olarak **herkese açık** sunuluyor (gelen kutusu ekleri, görev ekleri, ödül görselleri).
- `.env` içinde `R2_PUBLIC_URL` tanımlı (yalnız anahtar adı okundu).
- Betiğin kendi uyarısı: `scripts/db-backup.mjs:25-26` "R2 kovası herkese açık OLMAMALI" — ama aynı kova kullanılıyor.

**Sorun**
R2'de herkese açık erişim (r2.dev ya da özel domain) kova düzeyinde açılır; önek bazlı kısıt yoktur. Yani `R2_PUBLIC_URL/backups/db/qratex-2026-10-08T03-30-04.sql.gz` biçimindeki bir adres herkese açık olabilir. Zaman damgası saniye çözünürlüklü ve betik belgelendiği gibi her gün ~03:30'da çalışıyorsa, birkaç yüz denemeyle bulunabilir. Dökümde parola hash'leri, TOTP sırları, oturum/yenileme jetonları, KVKK kayıtları ve bütün kullanıcı e-postaları var. Yedekler istemci tarafında şifrelenmiyor.
*Doğrulanmadı:* Kovanın canlıda gerçekten herkese açık olup olmadığı ve `backups/` altında şu an nesne bulunup bulunmadığı (denetim kuralları gereği istek atılmadı).

**Öneri (ürün seviyesinde)**
1. **Hemen:** Cloudflare panelinden kovada `backups/` önekini listele. Nesne varsa sil ya da özel kovaya taşı. Herkese açık adresin bu öneke erişip erişemediğini kontrol et. Erişilebilir olduysa sızıntı varsayıp **sırları döndür**: NEXTAUTH secret, admin gate HMAC anahtarı, TOTP'si olan kullanıcılara yeniden kayıt, açık oturumların iptali.
2. **Ayrı, özel bir yedek kovası** (`qratex-backups`) aç. Public domain bağlama, Object Lock / retention tanımla. Yalnız bu kovaya `PutObject` yetkisi olan **ayrı bir API token'ı** (`BACKUP_R2_*`) kullan. Uygulama token'ı yedekleri ne okuyabilmeli ne silebilmeli.
3. **İstemci tarafında şifreleme:** gzip'ten sonra `age` ya da Node `crypto` AES-256-GCM kullan; anahtar R2'de değil, parola yöneticisinde dursun. Dosya adına rastgele 128-bit sonek ekle.
4. Betiklerde `R2_BUCKET`'a geri düşüşü kaldır. `BACKUP_R2_BUCKET` yoksa betik fail etsin.

---

### K2 — İki paralel zamanlayıcı: Inngest'teki ~19 iş, "tek uyanış" kuralıyla çelişiyor ya da sessizce ölü · Kritik · Efor M

**Kanıt**
- `app/api/cron/daily/route.ts:41-50`: "Neon faturası compute'un UYANIK KALDIĞI SÜREYE bakar… Yeni bir cron eklerken: ayrı bir dış tetikleyici kurma, bu listeye ekle."
- Commit `953c8fe`: "günde ~292 tetiklemeyi 1'e indir". Bu hesap Inngest'i içermiyor.
- `lib/inngest/functions.ts:24-30` outbox-process `*/2 * * * *`: her 2 dakikada `prisma.outboxEvent.findMany` (`lib/outbox.ts:32-37`). Bu, Neon'un 5 dk'lık suspend eşiğinin altında; **compute hiç uyuyamaz**.
- `:216-224` squad-battles-finish `*/10`, `:32-58` synthetic-monitor `*/15`, saatlik 6 iş (`:60-68`, `:124-152`, `:164-172`, `:194-213`).
- `lib/outbox.ts:14` `createOutboxEvent` **hiçbir yerde çağrılmıyor** (grep). Yani 2 dakikalık yoklama boş bir tabloyu sorguluyor.
- Yerel `.env`'de `INNGEST_SIGNING_KEY` / `INNGEST_EVENT_KEY` yok. `docs/API-ROUTE-MAPPING.md:88` bunların prod'da tanımlanması gerektiğini söylüyor. *Doğrulanmadı:* Vercel prod env'inde tanımlı olup olmadıkları ve uygulamanın Inngest Cloud'a sync edilip edilmediği.

**Sorun — iki dalın ikisi de ciddi**
- **Inngest canlıysa:** Günde ~1.100 tetikleme var ve 2 dakikalık outbox yoklaması Neon'u sürekli uyanık tutuyor. 2026-08'deki duraklatmanın (site + cron + mail tamamen durdu) kök nedeni hâlâ yerinde; günlük orkestratördeki optimizasyon fiilen etkisiz.
- **Inngest canlı değilse:** Şu işler **hiç çalışmıyor**: ekip tekrarlayan görev klonlama ve otomatik onay (`team-daily-maintenance`), negatif geri bildirim SLA'sı, haftalık AI özeti, Ayın İşletmesi rozeti, churn müdahalesi/playbook, CLV hesabı, flash-offer süre bitimi, dönemsel konsept aktivasyonu, partner webhook, feature-flag temizliği, **AnalyticsEvent saklama temizliği**. Memory notları ve UI bu işlerin çalıştığını varsayıyor.

**Öneri**
1. **Tek doğruluk kaynağı seç.** Önce Inngest panelinden ve Vercel env'den durumu netleştir (yarım saatlik iş).
2. Hobby + Neon free-tier kısıtında önerilen yol: **Inngest cron'larını kaldır**, Inngest'i yalnız olay tetiklemeli işler için (feedback/created, opsiyonel) tut. Periyodik işleri tek bir **iş kayıt defterine** (`lib/jobs/registry.ts`) taşı ve günlük orkestratörden bütçeli çalıştır (bkz. Hedef mimari §4.1).
3. Saatlik çalışması gerçekten gereken işler (flash-offer süre bitimi, dönemsel konsept) için **"lazy evaluation"** kullan: süre bitimini okuma anında hesapla (`expiresAt < now` filtresi), cron'a gerek kalmasın. Squad savaşları zaten okuma anında claim edilebilir.
4. Outbox yoklamasını kaldır ya da outbox'u gerçekten bağla (bkz. Y6). Boş yoklama tek başına en pahalı kalem.

---

### Y1 — Günlük orkestratör 60 sn bütçesini aşabilir; kesilince sondaki işler hiç çalışmaz ve iz kalmaz · Yüksek · Efor M

**Kanıt**
- `app/api/cron/daily/route.ts:14` `maxDuration = 60`. `:62-72` yedi iş **sıralı** ve tek tek bütçesiz.
- `app/api/cron/team-task-due/route.ts:10` `MAX_TASKS_PER_RUN = 200`, `:65-89` her görev için senkron SMTP gönderimi (bağlantı/soket zaman aşımı 15-20 sn, `lib/mail-sender.ts:82`).
- `app/api/cron/intern-deadline/route.ts:69-95` alıcı başına senkron gönderim.
- `lib/mail-inbox.ts:68-71` son 40 mailin **tam kaynağını** (`source: true`, ekler dahil) indiriyor (bkz. O1).
- `app/api/cron/ai-retry/route.ts:32` kendi bütçesi 18 sn + öğe başına 8 sn → tek başına ~26 sn.
- `:74` sonuç ne olursa olsun `{ ok: true }` ve HTTP 200 dönüyor.

**Sorun**
Yoğun bir günde (ör. 30 görev hatırlatması + birkaç ekli mail) toplam süre 60 sn'yi aşar ve Vercel fonksiyonu öldürür. Sıra sabit olduğu için **her yoğun günde aynı işler** (cleanup-counters, db-cleanup, ai-retry) aç kalır. Fonksiyon öldürüldüğünde `results` hiç dönmez, hiçbir şey kalıcı yazılmaz. Vercel cron panelinde yalnız "timeout" görünür; hangi işin bittiği bilinmez. Başarılı koşularda bile alt iş 500 dönse orkestratör 200 döndüğü için alarm kurulamaz.

**Öneri**
- Orkestratöre **global son tarih** (`deadline = start + 50s`) ver, her işe `ctx.deadline` geçir. İşler "kalan bütçe < X ise dur, imleç döndür" sözleşmesine uysun.
- **Öncelik sıralaması:** ucuz ve kritik temizlikler + savaş kapanışı önce, mail ve AI sonra. En iyisi, mail gönderimini işlerden çıkarıp teslimat kuyruğuna yazmak (Y6); orkestratör sonda kuyruğu bütçe kadar boşaltsın.
- **`JobRun` tablosu** (`name, startedAt, finishedAt, status: ok|partial|failed|skipped, stats Json, error, cursor`): her alt iş başında/sonunda yazılsın. Kesilen koşu "started ama finished yok" olarak görünür.
- Herhangi bir alt iş `failed` ise orkestratör **non-2xx** dönsün ve sonunda bir dead-man heartbeat'e (healthchecks.io / Better Stack) ping atsın; ping gelmezse alarm çalsın.

---

### Y2 — "Tekrar deneme" gerçekte yok: günde tek koşuyla başarısız hatırlatmalar kayboluyor, AI kuyruğu tıkanabilir · Yüksek · Efor S-M

**Kanıt**
- `app/api/cron/intern-deadline/route.ts:92-94`: "Hepsi başarısızsa … aynı gün sonraki cron tekrar dener." Ama artık günde **tek** koşu var (`vercel.json:6`). Ayrıca alıcılardan biri başarılıysa şablon "gönderildi" sayılıyor (`:72`, `:94`); başarısız alıcılar hiç tekrar denenmiyor.
- `app/api/cron/team-task-due/route.ts:45-51` yalnız "bugün" penceresini seçiyor. `:88` başarısız gönderim işaretlenmiyor, ertesi gün görev artık pencerede olmadığı için **hatırlatma kalıcı olarak kayboluyor**.
- `app/api/cron/ai-retry/route.ts:13` yorum "saatte 1" diyor; gerçekte günde 1. `:44` koşu başına 15 öğe. `:36-46` deneme sayacı yok. `lib/inngest/feedback-analyze-pipeline.ts:25-27` metni 5 karakterden kısa olanlar `skipped` dönüyor ve `aiProcessedAt` hiç dolmuyor. Bu yüzden "iyi", "ok" gibi kısa yorumlar **sonsuza kadar** ai-retry'ın 15 slotunu işgal eden adaylar olarak kalıyor.

**Sorun**
Hata toleransı varsayılıyor ama yürütülemiyor. Kullanıcıya yansıması: stajyerin son gün hatırlatması gelmiyor, ekip üyesi bitiş günü mailini almıyor, GROQ kesintisinden sonra biriken gerçek analizler günde 15'er erimiyor (kısa metinler slot yiyor).

**Öneri**
- Hatırlatmaları **"gönderilecek mesaj" kaydı** olarak üret (`MessageOutbox`, bkz. Y6): `dedupeKey = team-task-due:{taskId}`, `status`, `attempts`, `nextAttemptAt`. Cron yalnız kayıt üretsin; teslimat ayrı ve tekrar denenebilir olsun. Pencere dışına düşse bile kayıt yaşar.
- ai-retry için `Feedback.aiAttemptCount` + `aiLastAttemptAt` ekle, `attemptCount < 5` filtresi ve üstel geri çekilme kullan. Kısa metinlerde `aiProcessedAt`'i "skipped" işaretiyle doldur (ya da `aiSkippedReason`), sorgudan çıksınlar.
- Yorum/dokümantasyon kaymasını düzelt (`ai-retry:13`, `db-cleanup:12` "cron-job.org'dan").

---

### Y3 — AI analiz hattı tekrar çalıştığında yan etkileri tekrarlıyor; otomatik yanıt bayinin yanıtını ezebiliyor · Yüksek · Efor M

**Kanıt**
- `lib/inngest/feedback-analyze-pipeline.ts:87-116`: toksik/acil/churn bildirimleri koşulsuz `notification.create`. `:121-136` auto-remedy, embedding, adaptif güncelleme, `processAutoReplies`. Fallback yolunda (`isFallback`) da hat sonuna kadar akıyor (`:56-85`).
- `lib/auto-reply-engine.ts:74-80` `dealerReply` alanını **koşulsuz** güncelliyor (mevcut yanıt kontrolü yok). `:84-100` müşteriye bildirim + e-posta, `:103-110` yeni `Incident`.
- Hattı tekrar tetikleyen yollar: ai-retry (fallback kalıcıysa her gün, `ai-retry:36-46`), Inngest `retries: 3` (`lib/inngest/functions.ts:12`), ai-retry'daki zaman aşımı yarışı. Bu yarışta iş arkada sürüyor, sonraki koşu yeniden başlatıyor (`ai-retry:48-50`).
- `maybeCreateAutoRemedyForFeedback` kendi içinde `already_exists` kontrolüne sahip (`lib/remedy-automation-core.ts:88-92`). Bu iyi bir örnek, ama diğer yan etkilerde böyle bir kontrol yok.

**Sorun (somut senaryo)**
GROQ birkaç gün erişilemez. "Puan ≤ 2 → yanıtla" kuralı olan bir bayinin olumsuz geri bildirimi her gün ai-retry'a girer. Her koşuda (a) bayiye yine "Toksik/Acil" bildirimi düşer, (b) otomatik yanıt `dealerReply`'ı tekrar yazar; bayi bu arada elle yanıt verdiyse **onun yanıtı silinir**, (c) müşteriye her gün "Geri bildiriminize yanıt var" bildirimi ve e-postası gider, (d) her gün yeni bir Incident açılır.

**Öneri**
- Hattı **adım-idempotent** yap. `Feedback` üzerinde `sideEffectsDoneAt` (ya da adım bazlı `notifiedToxicAt`, `autoReplyAppliedAt`) tut ve her yan etkiyi `updateMany({ where: { id, autoReplyAppliedAt: null } })` claim'iyle koru.
- Otomatik yanıtı yalnız `dealerReply IS NULL` iken atomik yaz. Bayi yanıtı her zaman kazanmalı.
- `Notification`'a `dedupeKey String? @unique` ekle (`feedback:{id}:toxic`); `createMany({ skipDuplicates: true })` kullan (bkz. O5).
- Fallback sonucunda yalnız toksisite işaretini yaz, kural/yanıt/remedy adımlarını **gerçek analiz gelene kadar ertele**.

---

### Y4 — Push ve PWA service worker'ları aynı scope'ta birbirini eziyor; çıkışta abonelik temizlenmiyor · Yüksek · Efor M

**Kanıt**
- `next.config.js:3-6` next-pwa `register: true` ile `/sw.js`'i `/` scope'unda kaydediyor. Üretilen `public/sw.js` yalnız workbox + `importScripts("fallback-…js")` içeriyor; **`push` dinleyicisi yok** (dosya incelendi).
- `hooks/use-push-notifications.ts:21-23` `/push-sw.js`'i **aynı scope** (`"/"`) ile kaydediyor. Hook, ayarlar ekranı açıldığında çalışıyor (`components/settings/privacy-security.tsx:44`).
- `public/push-sw.js` içinde `fetch` dinleyicisi ve offline fallback yok.
- `public/push-sw.js:19-32`: pencere açıksa yalnız `client.focus()`, bildirimdeki URL'ye **gidilmiyor**.
- Çıkışta push aboneliği silinmiyor (`components/dashboard/header.tsx:128`, `components/dashboard/sidebar.tsx:711`, `app/customer/settings/page.tsx:491` yalnız `signOut`). `app/api/customer/push/route.ts:59-68` aynı endpoint'in başka hesaba bağlanmasını 409 ile reddediyor.

**Sorun**
Service Worker spesifikasyonunda bir scope'ta tek kayıt bulunur; farklı script URL'iyle `register()` mevcut worker'ın yerine geçer. Kullanıcı ayarlara girince `push-sw.js` devralır ve **offline fallback ile cache stratejisi kaybolur**. Bir sonraki tam sayfa yüklemesinde next-pwa `sw.js`'i yeniden kaydederse bu kez **push olayları işlenmez** ve bildirim görünmez. Paylaşılan cihazda A kullanıcısı çıkış yapıp B girdiğinde, A'nın bildirimleri B'nin ekranına düşmeye devam eder (gizlilik). B kendi aboneliğini de 409 nedeniyle açamaz.
*Doğrulanmadı:* next-pwa 5.6'nın App Router + Next 16'da `register: true` ile kayıt kodunu gerçekten enjekte edip etmediği. Memory notu (`scroll-scene-traps`) prod'da SW'nin 68 KB önbellek aldığını söylüyor, yani en az bir SW aktif.

**Öneri**
- **Tek service worker:** push/notificationclick kodunu PWA worker'ına taşı. Yol: next-pwa `customWorkerDir` ile `worker/index.js`, ya da bakımı süren `@serwist/next`'e geçip push handler'ı aynı SW'de yazmak. `use-push-notifications` `register()` çağırmasın, yalnız `navigator.serviceWorker.ready` kullansın.
- `notificationclick`'te aynı-origin pencere varsa `client.navigate(url)` + `focus()`, yoksa `openWindow(url)`. URL'yi same-origin kontrolünden geçir.
- **Çıkış akışı:** `signOut` öncesi `registration.pushManager.getSubscription()` → `DELETE /api/customer/push` → `unsubscribe()`. Sunucuda endpoint başka kullanıcıya bağlıysa 409 yerine, yeni oturum sahibine **devret** (oturum açmış kişi cihazın sahibidir).
- `/api/push/subscribe` kopya uç noktasını kaldır (bkz. D4).

---

### Y5 — Gözlemlenebilirlik kör: hatalar yakalanmıyor, iş sonuçları kaybolmuyor gibi görünse de kayıt yok, alarm yok · Yüksek · Efor M-L

**Kanıt**
- `vercel.json:2` `DISABLE_SENTRY_BUILD=1` → `next.config.js:386-388` `withSentryConfig` uygulanmıyor. `sentry.client.config.ts` derlemeye enjekte edilmediği için **istemci hataları Sentry'ye gitmiyor**. Kaynak haritaları da yüklenmiyor.
- `instrumentation.ts:6-17` `onRequestError` export'u yok. Next 15+'ta Server Component/route hatalarının otomatik yakalanması için `export const onRequestError = Sentry.captureRequestError` gerekir.
- `captureApiError` yalnız 6 dosyada (398 `route.ts`). 234 rota yalnız `console.error` ile yetiniyor.
- Yapılandırılmış logger ve request/correlation id yok (`lib/logger*` yok, `lib/request-metadata.ts`'te id üretimi yok).
- Cron/iş sonuçları kalıcı değil: yalnız `inbox-sync:37-44`. `daily:74` her zaman `ok:true`.
- Inngest synthetic monitor başarısızlıkta yalnız `{ ok: false }` **döndürüyor**, fırlatmıyor ve alarm üretmiyor (`lib/inngest/functions.ts:52-56`). `scripts/synthetic-monitor.ts` CI'da zamanlanmamış (`.github/workflows/ci.yml`'de schedule yok).
- `lib/metrics.ts:1-4` ve `lib/rum-web-vitals.ts:1-4` instance-içi bellek. Admin gözlem ekranı her istekte farklı instance'ın gürültüsünü gösteriyor; `metrics` yalnız health/vercel-status uçlarını izliyor (`app/api/admin/health/route.ts:102`).
- **PostHog / CSP:** `next.config.js:352` `connect-src` listesinde PostHog alan adı yok. Proxy CSP'si (`proxy.ts:26`, `https:` serbest) yalnız `matcher` kapsamındaki yollarda (`proxy.ts:124`: `/api`, `/admin`, `/dealer`, `/customer`) geçerli. **Landing ve QR akışı gibi herkese açık sayfalarda** varsayılan `https://eu.i.posthog.com` (`posthog-provider.tsx:19`) istekleri tarayıcı tarafından engellenir. `script-src` de PostHog recorder varlıklarını içermediğinden session replay yüklenemez. *Doğrulanmadı:* prod'da `NEXT_PUBLIC_POSTHOG_HOST`'un aynı-origin bir proxy'ye ayarlı olup olmadığı. Değilse en kritik dönüşüm hunisi (landing → kayıt → QR) ölçülmüyor demektir.

**Sorun**
Bu raporun bulduğu sorunların neredeyse hiçbiri bugün bir alarmla fark edilemez. "Mail gitmiyor", "push gelmiyor", "cron yarıda kesildi", "Inngest işleri ölü" durumları ancak kullanıcı şikâyetiyle ortaya çıkar.

**Öneri**
- Sentry build sorununu (`MODULE_NOT_FOUND 4894.js`) çöz; `instrumentation-client.ts` + `onRequestError` + `global-error.tsx`'teki `captureException`'ı etkinleştir. Sentry Cron Monitoring (check-in) ile `daily` için zamanlama monitörü kur.
- `lib/api-route.ts` üzerinde tek bir `withApiRoute(handler, { name })` sarmalayıcısı: request-id üret (`x-request-id`), süreyi ölç, yakalanmayan hatayı Sentry'ye gönder, JSON log satırı yaz (`{level, route, requestId, userId?, ms, status}`). Rotaları kademeli taşı.
- `JobRun` tablosu + `/admin/observability`'de "Arka plan işleri" paneli: son koşu, süre, durum, hata, kuyruk derinliği (outbox pending/failed/dead), son başarılı yedek zamanı.
- In-memory metrikleri ya Upstash'e (Redis `INCR` + zaman pencereli anahtarlar) taşı ya da kaldırıp Vercel Observability/Speed Insights'a yönlendir.
- CSP: herkese açık sayfalardaki `connect-src`'e PostHog host'unu ekle, ya da daha iyisi `/ingest` rewrites ile PostHog'u aynı-origin proxy'le (reklam engelleyicilere de dayanıklı). İki CSP kaynağını (next.config + proxy) tek bir `lib/security-headers.ts`'te birleştir.

---

### Y6 — Toplu mail ve push istek ömrüne bağlı, idempotent değil; teslimat sonucu kaydedilmiyor · Yüksek · Efor L

**Kanıt**
- `app/api/admin/intern-emails/route.ts:19` `maxDuration = 60`, `:21` alıcılar arası 800 ms bekleme, `:115-135` senkron döngü, `:184-189` toplu döngü. 60 sn'de gerçekçi tavan ~20-30 alıcı.
- Gönderim kaydı mail **gönderildikten sonra** oluşturuluyor (`:121-131`). Fonksiyon arada öldürülürse mail gitmiş ama kayıt yok olur. İstemci 504 alıp tekrar denerse aynı alıcılara ikinci kez gider. İstek düzeyinde idempotency anahtarı yok.
- `app/api/dealer/campaigns/[id]/send/route.ts:117-126`: 500'e kadar alıcıya `Promise.allSettled` ile **eşzamanlı** `sendPushNotification`. Her biri `findMany` + `createMany` yapıyor (`lib/push.ts:25-27`, `:97-100`). Prisma havuzu 5 bağlantı (memory: perf notu), kuyrukta beklemeler ve zaman aşımı riski var.
- `lib/weekly-digest-core.ts:124-135` önce "brief oluşturuldu" claim'i (iyi), ama `:157-162` `sendTransactionalEmail` sonucu **kontrol edilmiyor**. Başarısız mail "sent" sayılıyor ve bir daha denenmiyor (at-most-once, iz yok).
- `lib/mail-sender.ts:213-228`: SMTP DATA kabul edilip yanıt zaman aşımına düşerse Resend'e geçiliyor; alıcıya **iki kopya** gidebilir. Transactional gönderimler için genel bir `EmailLog` yok.

**Sorun**
Teslimat, isteği yapan kodun yaşam süresine ve başarı yolunun "mutlu" olmasına bağlı. Ürün açısından: admin "gönderildi" görür ama yarısı gitmemiştir, ya da tekrar basar ve stajyerler ikinci maili alır.

**Öneri**
- **`MessageOutbox` tablosu** (kanal: `email | push | inapp`; `dedupeKey @unique`; `payload Json`; `status queued|sending|sent|failed|dead|bounced`; `attempts`; `nextAttemptAt`; `provider`; `providerMessageId`; `lastError`). Üreticiler (rota, cron, AI hattı) iş kaydıyla **aynı transaction'da** yazsın.
- **Teslim edici:** (a) `after()` içinde hemen bir deneme, (b) günlük orkestratörün sonunda bütçe kadar `queued/failed` boşaltma, (c) admin ekranında "şimdi işle" düğmesi (zaman bütçeli, sayfalı).
- Toplu stajyer gönderimi bu kuyruğa yazsın; UI ilerlemeyi `MessageOutbox` durumlarından okusun (gerçek "gönderildi/bekliyor/hata/geri döndü" panosu).
- Push kampanyası: abonelikleri tek sorguda çek, `p-limit(10)` ile sınırlı eşzamanlılık uygula, logları tek `createMany` ile yaz. 500+ alıcıda kuyruğa devret.
- SMTP→Resend geçişini yalnız **bağlantı/auth aşaması** hatalarında yap. DATA sonrası belirsiz hatada `failed` işaretle ve aynı `dedupeKey` ile tekrar dene.

---

### O1 — IMAP senkronu her koşuda 40 mailin tam kaynağını indiriyor; 40'tan fazlası kayboluyor; UIDVALIDITY izlenmiyor · Orta · Efor M

**Kanıt**
- `lib/mail-inbox.ts:64-71` sıra numarasına göre `start = total - limit + 1`, `fetch(range, { uid, envelope, source: true })`. `:76-78` varlık kontrolü kaynak **indirildikten sonra** yapılıyor.
- Günde tek koşu (`daily`) ve `syncInbox(40)` (`inbox-sync:35`). 24 saatte 40'tan fazla mail gelirse aradakiler hiç çekilmez (imleç yok).
- Benzersizlik yalnız `mailbox + uid` (`prisma/schema.prisma` `InboxMessage @@unique([mailbox, uid])`). UIDVALIDITY değişirse (Gmail etiket/klasör değişimi, nadir de olsa) yeni mailler eski UID'lerle çakışır ve **sessizce atlanır**.

**Öneri**
`Settings`'te `inbox_cursor = { uidValidity, lastUid }` tut. Önce `client.mailbox.uidValidity` karşılaştır; farklıysa tam yeniden tarama yap. `fetch({ uid: \`${lastUid+1}:*\` }, { uid, envelope, bodyStructure })` ile hafif liste çek, yalnız yeni UID'ler için `source` indir. Bütçe bitene kadar 50'lik partilerle ilerle ve imleci her partide kalıcı yaz. Benzersizliğe `uidValidity`'yi ekle.

---

### O2 — Bounce tespiti gönderim kaydına bağlanmıyor; panel geri dönen maili "gönderildi" gösteriyor · Orta · Efor S-M

**Kanıt**
`lib/mail-inbox.ts:107-110` `isBounce` yalnız gönderen/konu kalıbıyla işaretleniyor. Kullanımı yalnız gelen kutusu UI'sında (`app/admin/inbox/page.tsx:248`, `app/api/admin/inbox/route.ts:41`). `InternEmailSend.status` `sent` olarak kalıyor (`app/api/admin/intern-emails/route.ts:123-131`).

**Öneri**
Bounce mesajındaki `message/delivery-status` parçasından (`Final-Recipient`, `Status: 5.x.x`) ya da `X-Failed-Recipients` başlığından alıcıyı çıkar. Son 7 gündeki `InternEmailSend` / `MessageOutbox` kaydıyla eşleştirip `status = 'bounced'` yap. Kalıcı (5.x.x) bounce'ları **`EmailSuppression`** listesine ekle; `sendTransactionalEmail` bu listeyi kontrol etsin (gönderen itibarını korur).

---

### O3 — Olay e-postalarında HTML enjeksiyonu (bayi adı ve geri bildirim metni kaçışsız) · Orta · Efor S

**Kanıt**
- `lib/notify-email.ts:113` `` `<strong>${params.dealerName}</strong> …` ``, `:116` geri bildirim metni, `:79` `bodyLines` olduğu gibi `<p>` içine.
- `lib/transactional-email.ts:99` yalnız `heading` kaçışlanıyor, `bodyHtml` ham.
- `dealerName` = bayinin kendisinin düzenlediği `businessName` (`app/api/dealer/feedbacks/[id]/reply/route.ts:15-19`, `lib/auto-reply-engine.ts:10-16`).

**Sorun**
Kötü niyetli ya da ele geçirilmiş bir bayi hesabı, işletme adına `<a href="…">Hesabınızı doğrulayın</a>` gibi bir parça koyarak QRATEX'in gönderici itibarıyla müşterilere **oltalama bağlantısı** gönderebilir.

**Öneri**
`sendEventEmail` sözleşmesini `bodyLines: Array<string | { strong: string } | …>` gibi tipli parçalara çevir ya da tüm kullanıcı kaynaklı değerleri `escapeEmailHtml` ile kaçışla. `buildTransactionalEmailHtml`'de `bodyHtml` yerine `bodyBlocks` kabul eden güvenli varsayılanlı bir API tanımla; ham HTML yalnız sabit şablonlarda kullanılsın.

---

### O4 — Ateşle-unut yan etkiler `after()` dışında; serverless'ta yanıt sonrası kaybolabilir · Orta · Efor S

**Kanıt**
`app/api/dealer/feedbacks/[id]/reply/route.ts:23-27`, `app/api/gamification/badges/[id]/unlock/route.ts:80-82`, `lib/auto-reply-engine.ts:93-100`, `lib/team-notify.ts:57` (`void sendPushNotification`), `app/api/feedbacks/route.ts:448` (`sendFeedbackAnalyze(...).catch`). Tüm API'de `after(` kullanan yalnız 3 rota var.

**Öneri**
Yanıt sonrası tüm yan etkileri `after()` (Next 15+) ile sar. Kalıcılık gerektirenleri (e-posta, push) doğrudan `MessageOutbox`'a yaz (Y6), böylece fonksiyon dondurulsa bile kayıt kalır ve sonra teslim edilir.

---

### O5 — Bildirim tekrarı ve yorgunluğu: dedupe yok, gecikmiş görevler her gün, SLA olayı çözülünce saatlik yeniden açılıyor · Orta · Efor M

**Kanıt**
- `Notification` modelinde dedupe anahtarı yok (`prisma/schema.prisma`, model `Notification`).
- `app/api/internal/inngest/team-daily-maintenance/route.ts:105-124`: 36 saat içinde biten ya da **süresi geçmiş tüm** açık görevlere her gün bildirim gidiyor, üst sınır yok. Aynı görev ayrıca `team-task-due` maili alıyor.
- `app/api/internal/inngest/negative-feedback-sla/route.ts:17-25` sınırsız `findMany` (tüm geçmiş). `:31-38` her geri bildirim için JSON-path sorgusu (N+1, indekssiz). `:34` yalnız açık durumdaki olaylar kontrol ediliyor: bayi olayı "çözüldü" yapıp yanıtlamazsa **bir saat sonra aynı olay ve bildirim yeniden** oluşuyor.

**Öneri**
- `Notification.dedupeKey String? @unique` (`{kind}:{entityId}:{periodKey}`) ekle; tüm üreticiler `createMany({ skipDuplicates: true })` kullansın. Gecikmiş görevler için seyreltme kuralı: 1., 3. ve 7. gün, sonra haftalık.
- SLA: `Incident`'e `sourceKey @unique` (`sla:{feedbackId}`) koy, durumdan bağımsız tek kayıt olsun. Sorguyu `createdAt >= now - 30g` ve `take` ile sınırla; `incident.findMany({ where: { sourceKey: { in } } })` ile tek sorguda karşılaştır.
- Kullanıcı tarafında "özet bildirimi" (5 gecikmiş görevin var) tek kalemi, 5 ayrı bildirimden daha değerli.

---

### O6 — Bildirim polling'i Neon'u sürekli uyanık tutuyor; kullanılmayan SSE ucu · Orta · Efor S-M

**Kanıt**
`components/dashboard/notification-center.tsx:145-149` her 20 sn'de `/api/notifications`. Sekme görünürlüğü kontrolü yok (`visibilitychange` yok). Uç her çağrıda `findMany` + `count` yapıyor (`app/api/notifications/route.ts:37-51`), önbellek yok. `app/api/dealer/notifications/stream/route.ts` hiçbir istemci tarafından kullanılmıyor.

**Sorun**
Bir admin ya da bayi panelinin arka planda açık kalması, Neon compute'unu 7/24 uyanık tutmaya yeter (20 sn < 5 dk suspend). K2 ile aynı maliyet sınıfında, istemciden gelen bir kaçak.

**Öneri**
Görünürlük duyarlı polling: gizli sekmede dur, görünürken 30 sn → 2 dk üstel geri çekilme. Okunmamış sayısını **Redis'te** tut: `Notification` oluşturulurken `INCR unread:{userId}` ve `SET last:{userId} ts`, okununca sıfırla. İstemci önce hafif `/api/notifications/head` (yalnız Redis) çağırsın, `last` değişmişse listeyi çeksin. Kullanılmayan SSE rotasını kaldır ya da bu Redis anahtarını izleyecek şekilde yeniden yaz.

---

### O7 — Idempotency altyapısı: hata atan handler anahtarı 24 saat kilitliyor; ekonomi rotalarında hâlâ TOCTOU deseni; outbox ölü kod · Orta · Efor S-M

**Kanıt**
- `lib/idempotency.ts:140-141` `withIdempotency`: `handler()` fırlatırsa `statusCode = 0` rezervasyonu silinmiyor. Aynı anahtarla her yeniden deneme **24 saat boyunca 409 IN_PROGRESS** alıyor.
- `lib/idempotency.ts:28` `checkIdempotency` + `storeIdempotency` (kontrol → işle → yaz) TOCTOU deseni. Kodun kendi yorumu (`:84-87`) bunu kabul ediyor, ama yedi rota hâlâ bu deseni kullanıyor: `feedbacks`, `gamification/spin`, `rewards`, `quests/[id]/claim`, `consumptions/[id]/review`, iki `remedy` rotası.
- `lib/outbox.ts:14` `createOutboxEvent` çağrılmıyor, `processOutbox` her 2 dakikada yoklanıyor (K2).

**Not:** Ekonomi rotalarında asıl çift harcama koruması DB claim'leri ile sağlanıyor (memory: points-economy-invariants). Bu yüzden risk "çift yanıt/çift yan etki" düzeyinde, puan basımı düzeyinde değil.

**Öneri**
`withIdempotency`'de `try { … } catch (e) { await prisma.idempotencyKey.deleteMany({ where: { key, statusCode: 0 } }); throw e; }`. 5xx sonuçları önbelleğe alma. Yedi rotayı rezerve-önce `withIdempotency`'ye taşı. Outbox'ı ya `MessageOutbox` tasarımına dönüştürüp bağla ya da sil.

---

### O8 — `team-task-due` gün penceresi UTC sunucuda 3 saat kaymış · Orta · Efor S

**Kanıt**
`app/api/cron/team-task-due/route.ts:41-43`: `new Date(toLocaleString(..., 'Europe/Istanbul'))` + `setHours(0,0,0,0)`. Vercel'de süreç UTC olduğundan pencere **[TR 03:00, ertesi gün TR 02:59]** oluyor. Cron 03:00 UTC'de (TR 06:00) çalışıyor.

**Sorun**
TR 00:00–02:59 arası biten görevler **bir gün önce** "bugün bitiyor" mailiyle hatırlatılıyor; mailde yazan tarih ertesi gün. TR 03:00–06:00 arası bitenlere hatırlatma **süre dolduktan sonra** gidiyor. `lib/timezone.ts` ve `docs/TIMEZONE-POLICY.md` var ama kullanılmamış.

**Öneri**
`lib/timezone.ts`'e `trDayBoundsUtc(date)` ekle (`Intl.DateTimeFormat` ile offset hesabı ya da `date-fns-tz` `fromZonedTime`). Hatırlatmayı "bugün biten" yerine **"önümüzdeki 24 saat içinde biten ve hatırlatılmamış"** semantiğine çevir; cron saatinden bağımsız ve doğru olur.

---

### O9 — Yedekleme süreci: zamanlama geliştirici makinesine bağlı, JSON yedek sessizce eksik kalabilir, geri yükleme hiç test edilmiyor · Orta · Efor M

**Kanıt**
- `scripts/db-backup.mjs:21-23` zamanlama Windows Görev Zamanlayıcı örneği. Makine kapalıysa yedek yok, bunu haber veren de yok (heartbeat yok).
- `scripts/db-backup-json.mjs:88-92` her model için sayfalamasız `findMany()`: büyük tablolar (AnalyticsEvent) belleğe tümüyle yüklenir. Tablolar arası tutarlı snapshot yok. Hata veren model "atlandı" logu ile **geçiliyor** ve betik yine başarıyla bitiyor.
- Hiçbir betik geri yükleme doğrulaması yapmıyor (boyut > 1 KB kontrolü dışında, `db-backup.mjs:179`).

**Öneri**
GitHub Actions `schedule` iş akışı: `postgres:17` imajında `pg_dump --format=custom` (paralel restore için) → şifreleme → özel kovaya yükleme → başarıda heartbeat ping. Aylık otomatik **restore tatbikatı**: Neon branch'i oluştur, `pg_restore`, satır sayısı ve kritik tablo karşılaştırması, branch'i sil. JSON betiğini yalnız acil durum aracı olarak tut: sayfalı (`cursor`) okuma, NDJSON akış yazımı ve "atlanan model varsa exit 1".

---

### O10 — SMTP havuzunun serverless'ta modül düzeyinde önbelleği ve sessiz Resend sandbox yedeği · Orta · Efor S

**Kanıt**
`lib/mail-sender.ts:77-89` `pool: true` transporter modül değişkeninde. Dondurulan/çözülen instance'ta bayat soketler hata üretir ve her seferinde Resend yedeğine düşülür. `:17` varsayılan gönderen `onboarding@resend.dev`, `:100-117` Gmail/Outlook adreslerinde de bu adrese düşülüyor. Resend'in sandbox göndereni yalnız hesap sahibinin adresine teslim eder, yani gerçek kullanıcılara giden yedek gönderim **sessizce başarısız** olur.

**Öneri**
Serverless'ta `pool: false` kullan ya da gönderim öncesi `transporter.verify()` önbelleklemesi yap (dakikada bir). `lib/env-validation.ts`'e prod kuralı ekle: Resend yapılandırılmışsa `RESEND_FROM` doğrulanmış domain olmalı, yoksa boot uyarısı ve admin sağlık ekranında kırmızı. Her gönderimin kanal/sonucunu `MessageOutbox` ya da `EmailLog`'a yaz.

---

### D1 — Gizli anahtarın sorgu parametresinde taşınması ve sabit-zamanlı olmayan karşılaştırmalar · Düşük · Efor S

`app/api/admin/preagg/route.ts:22-24` `?cron_secret=` kabul ediyor; erişim loglarına ve referer'a sızar. Ayrıca `===` ile karşılaştırma. `lib/internal-cron-or-admin.ts:13` `===`. `app/api/test-email/route.ts:18` `?secret=`. **Öneri:** Yalnız `Authorization: Bearer` kabul et. Tek `lib/cron-auth.ts` içinde `verifyCronBearer(req)` (timingSafeEqual) kullan ve on cron dosyasındaki kopya `validBearer`'ları kaldır (`app/api/cron/*/route.ts`). Ayrıca `preagg` hiçbir zamanlayıcıda yok; ön-agregasyon yalnız elle tetikleniyor (grep: çağrı yeri yok). İş kayıt defterine eklenmeli ya da kaldırılmalı.

### D2 — Saklama (retention) boşlukları ve çakışan temizlik işleri · Düşük · Efor S

`PushNotificationLog` hiç temizlenmiyor. İşlenmiş `OutboxEvent` satırları siliniyor değil. `InboxMessage` gövdeleri ve R2 ekleri süresiz. `AnalyticsEvent` temizliği yalnız Inngest'te (K2'ye bağlı). Rate-limit temizliği üç yerde ve tutarsız: `db-cleanup:38-40` `lockedUntil`'e bakmadan siliyor, `cleanup-counters:34` ve Inngest `rate-limit-cleanup` aktif kilitleri koruyor. Günlük sıra gereği `db-cleanup` sonra çalıştığı için penceresi dolmuş ama kilidi süren login kilitlerini kaldırabiliyor (`lib/rate-limit.ts:118-139`). **Öneri:** Tek `retention` işi + tablo başına politika tablosu (`docs/DATA-RETENTION-ARCHIVAL.md` ile hizalı).

### D3 — Partner "24h digest" saatlik gönderiliyor; webhook zaman aşımı ve replay koruması yok · Düşük · Efor S

`lib/inngest/functions.ts:194-202` `'15 * * * *'`, olay adı `partner.digest.24h`. `app/api/internal/inngest/partner-digest-webhook/route.ts:24-31` `fetch` için `AbortSignal.timeout` yok, imza zaman damgası içermiyor. **Öneri:** Günlük çalıştır. `X-Qratex-Timestamp` ekle ve imzayı `ts.body` üzerinden hesapla, alıcı ±5 dk dışını reddetsin. 10 sn zaman aşımı koy ve teslim kaydı (`WebhookDelivery`) tut.

### D4 — Push detayları · Düşük · Efor S

Kampanya push ikonu `/icon512_rounded.png` mevcut değil (`app/api/dealer/campaigns/[id]/send/route.ts:123`; `public/icons/` yalnız SVG içeriyor). `/api/push/subscribe` kopya uç noktası doğrulamasız (uzunluk sınırı yok) ve kullanılmıyor (`app/api/push/subscribe/route.ts:18-23`). `lib/push.ts` kullanıcı tercihlerini yalnız `team-notify` üzerinden kontrol ediyor; kampanya push'u `notificationPrefs`'i atlıyor (`campaigns/[id]/send:116-127`).

### D5 — Sağlık ucu anonim DB pingi ve hata mesajı sızıntısı · Düşük · Efor S

`app/api/health/route.ts:22` her anonim çağrıda `SELECT 1`. Dış uptime izleyicisi dakikalık çalışırsa Neon uyanık kalır. `:64-69` ham hata mesajı (`e.message`) anonim yanıta dönüyor. **Öneri:** `liveness` DB'ye dokunmasın; `readiness` (DB) secret arkasında ve düşük sıklıkta olsun. Hata mesajını yalnız yetkili yanıtta göster.

### D6 — PWA runtime cache, kimlikli panel HTML/RSC yanıtlarını 24 saat saklıyor · Düşük · Efor S

`next.config.js:136-152` (`others`, `NetworkFirst`, `/api` hariç her şey). `/admin`, `/dealer`, `/customer` sayfaları da cache'e giriyor. Paylaşılan cihazda çıkış sonrası çevrimdışıyken önceki kullanıcının panel görünümü sunulabilir. **Öneri:** Panel yollarını `NetworkOnly` yap ya da çıkışta `caches.delete('others')` çağır.

---

## 4. Hedef mimari

Ana ilke: **"Tek uyanış, bütçeli iş, kalıcı teslimat, görünür sonuç."** Neon free-tier + Vercel Hobby kısıtı altında bile güvenilir ve izlenebilir bir arka plan.

### 4.1 İş yürütme omurgası (`lib/jobs/`)

```
Vercel Cron (03:00 UTC)  ─►  /api/cron/daily  (deadline = start + 50s)
                               │
                               ├─ JobRunner.run(registry, { deadline })
                               │    ├─ her iş: JobRun(started) → run(ctx) → JobRun(ok|partial|failed, stats, cursor)
                               │    ├─ öncelik sırası: P0 ekonomi kapanışları → P1 temizlik/saklama → P2 üretim (hatırlatma kaydı üret) → P3 teslimat boşaltma → P4 AI retry
                               │    └─ bütçe biterse kalan işler "skipped(budget)" olarak yazılır, imleçler korunur
                               └─ sonuç: herhangi failed → 500 + Sentry check-in "error"; aksi halde heartbeat ping
```

- `JobDefinition = { name, priority, run(ctx: { deadline, cursor, log }) => { status, stats, cursor } }`.
- `JobRun` modeli + 30 günlük saklama. Admin "Arka plan işleri" panelinde son 14 gün, süre, durum ve hata görünür.
- Inngest yalnız olay tetiklemeli işler için (opsiyonel) kalır; **periyodik Inngest cron'u olmaz**. Saatlik ihtiyaçlar "okuma anında değerlendirme" ile çözülür.

### 4.2 Teslimat katmanı (`MessageOutbox`)

```
Üretici (rota / iş / AI hattı)
  └─ prisma.$transaction([ işKaydı, messageOutbox.createMany({ skipDuplicates }) ])   // dedupeKey @unique
        │
        ├─ after(): hemen 1 deneme (düşük gecikme)
        └─ JobRunner P3: queued/failed && nextAttemptAt<=now → bütçe kadar teslim
              ├─ email: suppression kontrolü → SMTP(pool:false) | Resend → providerMessageId
              ├─ push: tek SW, tercih kontrolü, 404/410 → abonelik sil
              └─ inapp: Notification(dedupeKey) + Redis INCR unread
        attempts>=N → dead (admin panelinde "yeniden dene")
Bounce (IMAP DSN) ─► MessageOutbox.status=bounced + EmailSuppression
```

Bu katman Y2, Y3 (kısmen), Y6, O2, O4, O5 ve O10'u tek tasarımla çözer.

### 4.3 Bildirim

- `Notification.dedupeKey @unique`, özet bildirim birleştirme kuralları.
- Okunmamış sayacı ve "son bildirim zamanı" Redis'te; istemci görünürlük duyarlı, geri çekilmeli polling yapar ve DB'ye yalnız değişiklik varken gider.
- Tek service worker (PWA + push), çıkışta abonelik silme, `notificationclick`'te gezinme.

### 4.4 Gözlemlenebilirlik

- Sentry (istemci + sunucu + `onRequestError` + Cron Monitor), kaynak haritalarıyla.
- `withApiRoute` sarmalayıcısı: request-id, süre, yapılandırılmış JSON log, hata yakalama.
- `JobRun` + `MessageOutbox` metrikleri admin panelinde; dead-man heartbeat (günlük cron + günlük yedek) ile alarm (e-posta/Telegram).
- PostHog aynı-origin proxy (`/ingest`) ve tekleştirilmiş CSP.

### 4.5 Yedekleme ve felaket kurtarma

- Özel, public erişimi kapalı, Object Lock'lu yedek kovası ve ayrı yazma-yetkili token.
- Şifreli (`age`/AES-GCM) `pg_dump -Fc`, GitHub Actions ile günlük, heartbeat ile izlenen.
- Aylık otomatik restore tatbikatı (Neon branch), sonucu `JobRun` benzeri bir kayda ve alarm kanalına.
- RPO hedefi 24 saat, RTO hedefi 1 saat; `docs/RUNBOOK.md`'ye yazılı geri yükleme prosedürü.

---

## 5. Adım adım geçiş planı

**Faz 0 — Acil (bu hafta, ~1-2 gün)**
1. K1: R2'de `backups/` önekini denetle; herkese açık erişimi doğrula; varsa nesneleri taşı/sil, gerekirse sırları döndür. Özel yedek kovası ve ayrı token oluştur; betiklerde `BACKUP_R2_*` zorunlu olsun.
2. K2: Inngest durumunu netleştir (Inngest paneli + Vercel env). Canlıysa `outbox-process`, `synthetic-monitor` ve `squad-battles-finish` cron'larını **hemen** kaldır (en büyük uyanış kaynakları). Canlı değilse kritik işlerin (team-daily-maintenance, weekly-digest, analytics-event-cleanup, business-of-month) geçici olarak `daily` listesine eklenmesini planla.
3. Y3 hızlı yama: `processAutoReplies`'ta `dealerReply IS NULL` atomik koşulu; ai-retry'da kısa metinleri sorgudan çıkar.
4. O3 hızlı yama: `notify-email.ts`'te `dealerName` ve `feedbackSnippet` için `escapeEmailHtml`.

**Faz 1 — İş omurgası (1 hafta)**
5. `JobRun` modeli + `lib/jobs/runner.ts` + registry. Mevcut 7 alt iş `run(ctx)` sözleşmesine sarılsın (önce sarmalayıcı, iç mantık aynı kalsın).
6. Global son tarih, öncelik sırası, başarısızlıkta non-2xx, dead-man heartbeat.
7. Inngest periyodik işlerinden gerekli olanları registry'ye taşı; okuma-anı değerlendirmeye çevrilebilenleri (flash-offer, seasonal-concept, squad) çevir; Inngest cron tanımlarını sil.
8. Ortak `verifyCronBearer`, `preagg` query-secret'ın kaldırılması (D1).

**Faz 2 — Teslimat katmanı (1-2 hafta)**
9. `MessageOutbox` + `EmailSuppression` modelleri; `deliverMessage()` (email/push/inapp).
10. Üreticileri sırayla taşı: team-task-due, intern-deadline (alıcı başına kayıt), stajyer toplu gönderim (UI ilerlemesi kuyruktan), weekly digest, olay e-postaları, kampanya push'u.
11. Eski `OutboxEvent` + `processOutbox` kaldırılsın ya da bu modele dönüştürülsün. `withIdempotency` hata temizliği ve 7 rotanın rezerve-önce desene geçişi (O7).

**Faz 3 — Bildirim ve PWA (3-5 gün)**
12. `Notification.dedupeKey`, gecikmiş görev seyreltme kuralı, SLA `sourceKey` (O5).
13. Redis okunmamış sayacı + görünürlük duyarlı polling; SSE rotasının kaldırılması (O6).
14. Tek service worker (push handler PWA SW'ye), çıkışta abonelik silme, `notificationclick` gezinme, panel yollarının cache dışına alınması (Y4, D6).

**Faz 4 — Gözlemlenebilirlik (1 hafta)**
15. Sentry build sorununun çözülmesi, `instrumentation-client.ts`, `onRequestError`, Cron Monitor.
16. `withApiRoute` sarmalayıcısı + JSON logger; önce yüksek trafikli ve yazma yapan rotalar.
17. Admin "Arka plan işleri" paneli (`JobRun`, kuyruk derinliği, son yedek). In-memory metriklerin kaldırılması ya da Redis'e taşınması.
18. PostHog `/ingest` proxy'si ve CSP'nin tekleştirilmesi.

**Faz 5 — Mail derinliği ve DR (1 hafta)**
19. IMAP UID imleci + UIDVALIDITY + bütçeli parti senkronu (O1); DSN parse ile bounce→gönderim eşleştirme ve suppression (O2).
20. GitHub Actions şifreli `pg_dump`, heartbeat, aylık otomatik restore tatbikatı; RUNBOOK güncellemesi (O9).
21. Saat dilimi yardımcıları ve "24 saat içinde biten" hatırlatma semantiği (O8); retention politikasının tekleştirilmesi (D2).

---

## 6. Doğrulanamayanlar (canlı ortam gerektirir)

| Konu | Neden doğrulanamadı | Nasıl doğrulanır |
|---|---|---|
| R2 kovasının `backups/` önekine herkese açık erişim | Kural gereği dış istek atılmadı | Cloudflare R2 paneli → kova → Public access + nesne listesi |
| Inngest'in prod'da sync'li ve aktif olması | Vercel env görülemiyor; yerel `.env`'de anahtar yok | Inngest paneli → Apps; Vercel → Env → `INNGEST_SIGNING_KEY` |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` prod'da tanımlı mı | Aynı | Vercel env + Sentry projesinde olay akışı |
| `NEXT_PUBLIC_POSTHOG_HOST` aynı-origin proxy mi | Aynı | Landing sayfasında tarayıcı konsolunda CSP ihlali olup olmadığına bak |
| next-pwa'nın App Router'da `sw.js`'i otomatik kaydetmesi | Çalıştırma yapılmadı | DevTools → Application → Service Workers (ayarlar sayfası öncesi/sonrası) |
| Günlük orkestratörün gerçek süresi | Log erişimi yok | Vercel → Cron Jobs → son koşuların süresi/timeout durumu |

---

## Uygulama sonrası durum (2026-10-11)

Rapordaki her bulgu `feat/platform-overhaul` üzerindeki **şimdiki koda** karşı yeniden okundu. Önceki dalgalar (P0-30/P0-40 `aa7cfbd2`, iletişim yeniden yazımı `241459ed`, gözlemlenebilirlik `3b039bcc`, güvenlik/mimari turları `0ca4bb3e`, `72eeec51`, `8ef1dd00`, `c32a32d0`, veri modeli `a331f86d`) omurganın çoğunu kurmuştu. Bu turda açık kalanlar ve dalgaların getirdiği regresyonlar kapatıldı: `f9e6aec4`, `b598158a`, `4cfc2ef8`, `28257e28`.

Doğrulama: değişen her dosya için tip denetimi 0 hata. Jest: ilgili 33 suite, 381 test geçti (yeni: `mail-sender-failover`, `mail-bounce`; genişletilen: `weekly-digest-conflict`, `health`, `inngest-no-cron`). Hiçbir komut DB'ye bağlanmadı. `__tests__/security/customer-api-surface` testinin `customer/ai-chat` ve `ai-recommendations` için kırmızısı paralel ajanın açık işi; bu boyutla ilgisi yok.

### Bulgu bulgu

| # | Durum | Kanıt (şimdiki kod) |
|---|---|---|
| **K1** yedekler herkese açık kovada | **KAPANDI (kod)** · canlı doğrulama sahipte | `scripts/db-backup-lib.mjs` `requireBackupR2Config` yalnız `BACKUP_R2_*` okuyor. `R2_*`'ye geri düşmüyor. Kova ya da erişim anahtarı uygulamanınkiyle aynıysa betik fail ediyor (`:115-137`). AES-256-GCM (QRXBK1 + AAD) ile şifreleniyor, nesne adına 128 bit rastgele sonek ekleniyor, yüklemeden önce çözülüp doğrulanıyor. `db-restore.mjs` ayrı okuma token'ı kullanıyor. **Kalan iş operasyonel:** eski `backups/` öneki uygulama kovasında hâlâ duruyor mu, Cloudflare panelinden bakılmalı (§6). |
| **K2** iki zamanlayıcı | **KAPANDI** | `lib/inngest/functions.ts:32`: `INNGEST_FUNCTIONS = [analyzeFeedbackFn]`, yalnız olay tetiklemeli. Periyodik işlerin hepsi `app/api/cron/daily/jobs.ts` kayıt defterinde (26 iş, kadans + öncelik). Okuma anında değerlendirme var (flash teklif okuyucuları `validTo >= now` filtreliyor, ör. `lib/venue-detail/detail.ts:151`). **Bu turda:** taşınmayıp tetikleyicisiz kalan `rate-limit-cleanup` ve `squad-battles-finish` iç uçları silindi. Yeni korkuluk testi: her `app/api/internal/inngest/*` ucu ya kayıt defterinde ya da Inngest olay işlevinde olmalı. |
| **Y1** bütçe aşımı, iz yok, her zaman 200 | **KAPANDI** | `lib/cron-runner.ts`: global son tarih (`GLOBAL_BUDGET_MS = 270_000`), iş başına zaman aşımı, öncelik sırası, `skipped_budget`. Durum her iş bitince `Settings[cron_daily_state]`'e yazılıyor ve "kesilen koşu" bir sonraki koşuda raporlanıyor. Sonuç HTTP koduna yansıyor: başarısızlık 500, bütçe 503 (`route.ts:134`). Dead-man heartbeat (`CRON_HEARTBEAT_URL`) ve Sentry Cron check-in var. Koşu geçmişi `/admin/jobs`'ta görünüyor. |
| **Y2** tekrar deneme yok | **KAPANDI** | `lib/cron-delivery.sendWithRetry` aynı koşu içinde geri çekilerek yeniden deniyor. `team-task-due` için 36 saatlik geri bakış penceresi var (`lib/cron-time.ts:60`); işaret yalnız gönderim başarılıysa ve koşullu yazılıyor. `ai-retry`'da `aiAttempts < MAX` ve kira süresi kullanılıyor, kısa metinler kalıcı olarak dışarıda (`:56`, `:71`). **Bu turda:** belirsiz SMTP sonucunda (`maybeDelivered`) yeniden denenmiyor, çift kopya gitmiyor. |
| **Y3** AI hattında tekrarlayan yan etkiler | **KAPANDI** | Deneme atomik claim + kira ile alınıyor. Tamamlanma `aiProcessedAt IS NULL` koşullu yazılıyor. Yan etkiler yalnız kazanan koşuda çalışıyor (`feedback-analyze-pipeline.ts:247`). Uyarılar advisory kilit + dedupeKey ile tek seferlik (`notifyDealerOnce`). Otomatik yanıt `dealerReply IS NULL` koşullu atomik yazılıyor (`auto-reply-engine.ts:200`), bayinin yanıtı ezilmiyor. Vaka açma `createIncidentOnce` ile. Kolon düzeyinde dedupe şema isteğinde. |
| **Y4** iki SW birbirini eziyor, çıkışta abonelik kalıyor | **KAPANDI** | Tek SW var: next-pwa `sw.js` + `importScripts('/push-sw.js')` (`config/pwa.js:209`). `lib/pwa/service-worker.ts` tek kayıt noktası. `notificationclick` aynı origin denetiminden geçip `navigate` + `focus` yapıyor. **Bu turda:** çıkışta ya da cihaz başka hesaba geçtiğinde `SessionDeviceGuard` tarayıcı aboneliğini `unsubscribe` ediyor (`releaseDevicePushSubscription`). Sunucudaki satır ilk gönderimde 404/410 alıp siliniyor. |
| **Y5** gözlemlenebilirlik kör | **KAPANDI** · kaynak haritaları KALDI | Sunucu: `instrumentation.ts` `onRequestError`. `defineRoute` (590/760 rota) request-id, `captureApiError` ve Upstash'te kalıcı uç metrikleri kullanıyor. Bellek içi metrik ve RUM kaldırıldı, Web Vitals kalıcı. `/admin/jobs` ve `/admin/observability` var. CSP tek kaynakta, PostHog ve Sentry dahil. **Bu turda:** `DISABLE_SENTRY_BUILD=1` yüzünden istemci Sentry'si hiç başlamıyordu. Error sınırlarındaki `captureException` boşa gidiyordu. `instrumentation-client.ts` DSN varsa SDK'yı tembel yüklüyor, DSN yoksa kod paketten düşüyor. **Kalan:** kaynak haritası yükleme (Sentry webpack eklentisi) build hatası çözülene kadar kapalı. Build doğrulaması gerektiği için bu turda dokunulmadı. |
| **Y6** toplu mail/push istek ömrüne bağlı, sonuç kaydı yok | **KAPANDI** (kuyruk tablosu yerine iş başına claim) | Stajyer toplu gönderimi bütçeli. "Yalnız yeni alıcı" seçeneği idempotent; kalan alıcılar `remaining` olarak dönüyor, ilerleme ve durdurma var. Kampanya push'u 20'lik eşzamanlılıkla gidiyor ve tercih kontrollü (`lib/marketing-delivery.ts:144`). **Bu turda:** (1) SMTP→Resend geçişi yalnız kesin teslim edilmemiş hatada yapılıyor. DATA sonrası yanıtsız kopma "belirsiz" sayılıyor; yedeğe geçilmiyor, yeniden denenmiyor (`classifySmtpFailure`). (2) Haftalık özet e-postasının sonucu okunuyor. Gidemeyen e-posta, bildirimle aynı transaction'da yazılan bekleyen işaretle sonraki koşuda AI'sız yeniden deneniyor (en fazla 3). İş bütçeyi okuyor, eksik kalırsa 500 dönüyor. (3) Ekip haftalık hatırlatmasında alıcı × hafta anahtarı başarılı gönderimden sonra yazılıyor; gidemeyen varsa 500 dönüyor ve ertesi gün yalnız kalanlara gidiyor. |
| **O1** IMAP 40 mail, imleç ve UIDVALIDITY yok | **KAPANDI** | `lib/mail-inbox.ts`: `{ uidValidity, lastUid }` imleci var. UIDVALIDITY değişince Message-ID ile tekilleştiriyor. Yalnız yeni UID'lerin kaynağını indiriyor. Parti ve süre bütçesi var. Kaydedilemeyen mail imleci durduruyor. |
| **O2** bounce gönderim kaydına bağlanmıyor | **KISMEN** | **Bu turda:** kalıcı (5.x.x) bounce, alıcıya DSN `Final-Recipient`, `X-Failed-Recipients` ya da gövdeden çözülüyor. Son 7 gündeki son başarılı stajyer gönderimi `Teslim edilemedi (geri döndü): <Status — Diagnostic>` olarak işaretleniyor; panel artık "Gitti" yerine hata gösteriyor (`lib/mail-center/bounce.ts`). Geçici ya da "Delay" bildirimleri kayda dokunmuyor. **Kalan:** `EmailSuppression` (şema isteğinde). |
| **O3** olay e-postalarında HTML enjeksiyonu | **KAPANDI** | `lib/notify-email.ts:81-90` tipli satırlar kullanıyor, her parça `escapeEmailText` ile kaçışlanıyor. `transactional-email` sözleşmesi kaçışlı gövde istiyor. |
| **O4** ateşle-unut yan etkiler | **KAPANDI** | Önceki dalgalar `after()` kullanıyordu (geri bildirim hunisi, radar, kart bulundu, masa sinyali). **Bu turda:** kalan dört nokta, yani ekip push'u, otomatik yanıt e-postası, gelen kutusu yanıt e-postası ve karakter hazır e-postası, tek yardımcıya (`lib/run-after.ts`) taşındı. `void sendPushNotification(...)` / `.then(...).catch(()=>{})` deseni API ve lib altında kalmadı. |
| **O5** bildirim tekrarı, SLA yeniden açılması | **KAPANDI** · kolon düzeyi dedupe şema isteğinde | Ekip bitiş bildirimi görev × bitiş günü başına bir kez gidiyor (`TaskActivity` işareti). **Bu turda:** SLA vakası yorum başına durumdan bağımsız tek kez açılıyor (eskiden "çözüldü" yapılan vaka ertesi koşuda yeniden açılıyordu) ve advisory kilitle korunuyor. Kapsam son 30 gün + 500 aday. Mevcut vakalar tek sorguda okunuyor (N+1 kalktı). Vaka başına bildirim yerine bayi başına koşu başına tek özet bildirimi gidiyor. |
| **O6** yoklama Neon'u uyanık tutuyor | **KAPANDI** | Gizli sekme yoklamıyor. Bayi tarafında SSE varken yoklama 5 dk'ya iniyor. **Bu turda:** görünür ama boştaki panelde aralık 20 sn'den 5 dk'ya kadar katlanarak artıyor; değişiklik, sekmeye dönüş ya da odak 20 sn'ye indiriyor. SSE'nin boştaki tavanı 5 sn'den 15 sn'ye çıktı. |
| **O7** idempotency | **KISMEN** | `withIdempotency` handler hatasında ve 5xx'te rezervasyonu serbest bırakıyor (`lib/idempotency.ts:155`). **Kalan:** `defineRoute`'un `idempotent` yolu ile `feedbacks` ve `quests/[id]/claim` hâlâ "kontrol et → işle → yaz" (TOCTOU) kullanıyor. `lib/idempotency.ts` bu tur paralel ajanın açık düzenlemesinde olduğu için dokunulmadı. Ekonomi tarafı DB claim'leriyle korunuyor; risk çift yanıt düzeyinde. `OutboxEvent` üreticisizdi, yoklaması kaldırıldı. |
| **O8** gün penceresi 3 saat kayık | **KAPANDI** | `lib/cron-time.ts` `Intl` kullanıyor, sunucunun saat diliminden bağımsız. Pencere mutlak: 24 saat ileri, 36 saat geri. Metin TR takvimine göre "bugün/yarın/geçti" diyor. |
| **O9** yedek zamanlaması makineye bağlı, restore hiç test edilmiyor | **KAPANDI (kod)** · etkinleştirme sahipte | **Bu turda:** `.github/workflows/db-backup.yml` günlük çalışıyor (runner'da pg_dump 17 + şifreli betik + heartbeat). `db-restore-drill.yml` aylık: en yeni yedek geçici `postgres:17`'ye `ON_ERROR_STOP` ile yükleniyor, kritik tablolar doğrulanıyor, sonuç heartbeat'e gidiyor; canlıya dokunmuyor. İkisi de opt-in (`vars.BACKUP_ENABLED`). JSON yedeği DMMF kimliğiyle imleç sayfalı okuyup akıtıyor; atlanan model yedeği başarısız sayıyor. |
| **O10** bayat SMTP havuzu, sessiz Resend sandbox | **KAPANDI** | **Bu turda:** 20 sn boşta kalan havuz (dondurulmuş örnek) ve hata alan havuz atılıyor. Sandbox gönderen (`onboarding@resend.dev`) boot env uyarısında, Komuta e-posta kontrolünde ve `/api/health` yetkili yanıtında `warn` olarak görünüyor. Gönderim sonucu iş başına kaydediliyor (Y6). |
| **D1** sorgu parametresinde sır, `===` | **KAPANDI** | `lib/cron-auth.verifyCronBearer` özetlerle sabit zamanlı karşılaştırıyor. Tüm cron uçları `requireCronAuth` kullanıyor. `preagg` emekli (410). **Bu turda:** iç iş yetkisi de aynı yardımcıya geçti (uzunluk erken sızmıyor). |
| **D2** saklama boşlukları, çakışan temizlik | **KAPANDI** | Rate-limit kuralı tek: aktif kilit silinmiyor (`db-cleanup` ile `cleanup-counters` aynı). `PushNotificationLog` 180 gün (`lib/pii-registry.ts:413`). Gelen kutusu saklama süresi admin ayarıyla belirleniyor ve ekler de siliniyor. AnalyticsEvent temizliği günlük kayıtta. |
| **D3** partner digest saatlik, zaman aşımı ve replay yok | **KAPANDI** | Günlük kadansla çalışıyor. `safeWebhookPost` 10 sn ve 16 KB sınırlı, SSRF denetimli. Zaman damgalı v2 imza var. Yanıt gövdesi yansıtılmıyor. |
| **D4** push ayrıntıları | **KAPANDI** | Kampanya push'u tercih grubuna ve sınırlı eşzamanlılığa bağlı. Varsayılan ikon mevcut SVG. `/api/push/subscribe` panel rolleriyle `defineRoute` + zod kullanıyor; müşteri ucu ayrı. |
| **D5** sağlık ucu DB pingi ve hata sızıntısı | **KAPANDI** | **Bu turda:** `?live=1` DB'ye dokunmayan liveness. Anonim yanıtta ham DB hatası yok (bağlantı dizesi ya da sunucu adı sızmıyor). DB hatasında sürüm, çalışma süresi ve mail ayrıntısı yalnız Bearer'lı çağrıda dönüyor. |
| **D6** panel HTML'i 24 saat önbellekte | **KAPANDI** | Yönetim ve auth yolları önbelleğe hiç girmiyor. `SessionDeviceGuard` kullanıcı değişince ya da çıkış sunucuca doğrulanınca kişisel önbellekleri (`others`, `start-url`, `next-data`, `static-data-assets`) ve kart görüntülerini siliyor. |

### Bu turda bulunan regresyonlar ve kalıntılar (hepsi kapatıldı)

1. **Sahipsiz iç uçlar:** P0-40 taşımasında kayıt defterine alınmayan `rate-limit-cleanup` ve `squad-battles-finish` uçları tetikleyicisiz biçimde Bearer'lı POST'a açık kalmıştı. Silindi ve korkuluk testi eklendi.
2. **Haftalık iş dürüstlüğü:** P0-40 sonrası işler orkestratör sonucuna bağlandı, ama `weekly-digest` ve `team-weekly-reminder` e-posta sonucunu hiç okumadan `ok:true` dönüyordu. Alarm hiç çalmıyor, gidemeyen mail kayboluyordu.
3. **İstemci Sentry ölü kod:** `app/error.tsx` ve `global-error.tsx` `Sentry.captureException` çağırıyordu ama SDK hiç başlatılmıyordu (`DISABLE_SENTRY_BUILD=1`). Güvence yanlış izlenim veriyordu.
4. **SSE ve yoklama yükü:** "tek kanal" düzeltmesi gizli sekmeyi çözmüştü. Görünür ama boştaki panel ise 20 sn yoklama ve 5 sn SSE tavanıyla Neon'u uyanık tutmaya devam ediyordu.
5. **Sağlık ucu:** anonim yanıtta ayrıntılar gizlenmişti, ama DB hata dalı ham hata metnini, sürümü ve mail özetini anonim çağrıya döndürmeye devam ediyordu. `e2e/smoke` testi de bu sızıntıyı bekler hâldeydi.

### Puan: **9 / 10** (önce 4.5)

**Gerekçe.** Raporun kurmak istediği omurganın dört ayağı da yerinde:

- **Tek uyanış, bütçeli iş:** tek kayıt defteri, öncelik ve kadans, global son tarih, telafi eden haftalık işler.
- **Görünür sonuç:** iş durumu kalıcı, başarısızlık HTTP koduna yansıyor, heartbeat ve Sentry check-in var, `/admin/jobs` paneli, sunucu ve istemci hata yakalama.
- **Teslim güvencesi:** iş başına tek-seferlik claim, belirsiz SMTP'de çift kopya yok, gidemeyen mail yeniden deneniyor ve alarm üretiyor, bounce kayda işleniyor.
- **Veri güvenliği ve felaket kurtarma:** ayrı ve şifreli yedek, CI zamanlaması, aylık geri yükleme tatbikatı.

Genel bir `MessageOutbox` tablosu yerine işe özgü claim'ler kullanılıyor. Şema değişikliği yasak olduğu için bu bilinçli bir tercih ve davranış olarak aynı güvenceleri veriyor.

**10'a kalanlar:**

1. **O7 TOCTOU:** `defineRoute`'un `idempotent` yolu ile `feedbacks` ve `quests/[id]/claim` rezerve-önce `withIdempotency` desenine geçmeli. `lib/idempotency.ts` paralel ajanla eşgüdüm bekliyor.
2. **O2 bastırma listesi:** `EmailSuppression` tablosu ve gönderim öncesi kontrol. Şema isteğine eklendi.
3. **Y5 kaynak haritaları:** Sentry webpack eklentisinin build hatası (`DISABLE_SENTRY_BUILD`) çözülmeli. Build doğrulaması gerektiriyor.
4. **Operasyonel (sahip):**
   - Uygulama kovasında eski `backups/` nesnesi kalıp kalmadığı kontrol edilmeli (K1).
   - `BACKUP_ENABLED` ve yedek sırları, `CRON_HEARTBEAT_URL`, `RESEND_FROM` (doğrulanmış alan adı) ve `NEXT_PUBLIC_SENTRY_DSN` tanımlanmalı.
   - Dış uptime izleyicisi `/api/health?live=1`'e çevrilmeli.
5. **Şema istekleri (kolon düzeyi dedupe):** `Notification.dedupeKey` ve `Incident.sourceKey` (`SCHEMA-REQUESTS.md` → arka-plan-sistemleri). Bugünkü advisory kilit + JSON-path tekilleştirmesinin DB düzeyindeki son savunması olacaklar.
