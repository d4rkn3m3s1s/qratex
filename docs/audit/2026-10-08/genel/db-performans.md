# Genel denetim — db-performans (2026-10-12)

## Ölçümler (kanıt)
- **Yerel → Neon RTT ≈ 270-290 ms** (`select 1`, 8 deneme; eu-central-1). Prod Vercel fra1'de aynı bölge → ~1-3 ms. Yerel istek süreleri bu yüzden sorgu sayısı × ~280 ms ile ölçeklenir; yerel ölçüm "kaç sıralı tur" göstergesidir, prod süresi değildir.
- **Havuz = 5 bağlantı doğrulandı:** 10 paralel `pg_sleep(0.2)` → 1428 ms (2 dalga). `connection_limit=5&pgbouncer=true&pool_timeout=20` hem `.env` hem `.env.example`'da doğru; `connection_limit=1` tuzağı yok. DIRECT_URL ayrı.
- 20 uç × 3 istek (dev sunucu, çok ajan yükü altında): 200 dönenler 2-10 sn; 404 dönen uçlar bile 0.2-5 sn → gürültü baskın. En yavaş: dealer/insights (4.3-10.4 sn), customer/home (5.9-7.3), customer/stats, dealer/heatmap, dealer/today, dealer/customers (~5 sn). customer/home zaten tek `Promise.all` turu + cache'li ayarlar kullanıyor; yavaşlık RTT + dev derleme kaynaklı.
- `pg_stat_user_tables`: büyük tablo yok (Notification 301, SessionTokenUsage 3132 satır) — seq scan'ler planlayıcının küçük tablo tercihi; index eksikliği kanıtı değil. `pg_stat_statements` kurulu değil.

## P2028 kök neden
Etkileşimli tx = BEGIN + sorgular + COMMIT, her biri yerelde ~280 ms → 4-5 sorguluk tx bağlantıyı 1.5-2 sn tutar. 5 bağlantılık havuzda çok ajanlı E2E yükünde eski 2 sn `maxWait` aşılıyordu. Zaten uygulanmış düzeltme: `lib/prisma.ts` global `transactionOptions.maxWait=10_000`. Oyun `finalizeAttempt` tx'i incelendi: içinde dış çağrı yok, yalnız gerekli yazımlar. Prod'da (RTT ~1 ms) risk düşük.

## Tx içinde dış çağrı
- `lib/billing-core.ts` createCheckoutSession: Stripe çağrıları `pg_advisory_xact_lock` altında tx içinde (bilinçli, çift abonelik yarışı için). Bağlantıyı Stripe süresince (≤ CHECKOUT_LOCK_TIMEOUT) tutar; nadir uç, kabul edilebilir. Alternatif: Redis kilidi / Stripe idempotency key ile tx dışına alma (kalan).
- Diğer 123 `$transaction(async` bloğu tarandı: fetch/AI/mail çağrısı yok; revalidateTag'ler tx sonrası.

## N+1 taraması
Sezgisel tarama 107 aday verdi; çoğu cron/seed (sınırlı BATCH, satır başına kısa tx bilinçli — idempotent/kısmi hata izolasyonu). Düzeltilen:
- **`app/api/admin/team/tasks/bulk/route.ts` tag_add:** 200 id'ye kadar satır başına sıralı `update` → aynı sonuç etiket dizisine göre gruplanıp tek batch `$transaction([updateMany...])`. Yerelde 200 satır ≈ 56 sn → tipik 1-3 grup ≈ 1 sn.

Kalan (düşük öncelik, cron): `team-daily-maintenance` review-late dalında satır başına findFirst+findUnique; `dealer-queues/maintenance.remindStaleDrafts` dedupe findFirst satır başına (BATCH sınırlı).

## Cache kapsamı
- Ayar/okuma-yoğun: module-gate, shell config, rollout flags, minigame config → `unstable_cache` + tag invalidation; Redis `cachedJson`: radar, voc-wall, game rankings (yazımda `redisDel`), places top, squads league, my-year, obs, audit facets.
- Not: `getPointsMatrix` süreç-içi 60 sn bellek cache'i; `clearPointsMatrixCache` yalnız o lambda örneğini temizler → admin değişikliği diğer örneklerde ≤60 sn gecikmeli. Ekonomi açısından kabul edilebilir; kesinlik gerekirse tag'li `unstable_cache`'e taşınmalı (kalan).
- Dev'de Prisma `log: ['query']` açık — dev konsolu ve hızı etkiler, prod'u etkilemez.

## Şema
Yeni index talebi yok (357 @@index; veri hacmi küçük, ölçülebilir kanıt yok). SCHEMA-REQUESTS-ek.md'ye ekleme yapılmadı.
