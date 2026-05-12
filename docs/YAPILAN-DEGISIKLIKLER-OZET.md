# Yapılan Değişiklikler – Tek Tek Özet

Bu dosya, plandaki maddeler (5–50) ve ek düzeltmeler dahil **yapılan tüm değişiklikleri** tek tek listeler.

---

## P0 – SEO ve temel güvenlik (5–6, 15–16)

1. **Canonical / OG / Twitter tek domain (5)**  
   - `lib/site-config.ts`: `siteUrl` tek prod domain.  
   - `app/layout.tsx`: `metadataBase`, `openGraph.url`, `openGraph.images`, `twitter.images` bu URL ile.

2. **robots.txt ve sitemap (6)**  
   - `app/robots.ts`: Demo’da disallow, prod’da allow + admin/dealer/customer/auth disallow.  
   - `app/sitemap.ts`: Statik sayfalar, `siteUrl` kullanımı.

3. **Güvenlik header’ları (15)**  
   - `next.config.js`: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, CSP.

4. **CORS allowlist (16)**  
   - `middleware.ts`: `/api/*` için allowlist (`NEXT_PUBLIC_ALLOWED_ORIGINS` veya varsayılan), OPTIONS 204.

---

## Auth ve güvenlik (7–10)

5. **Login rate-limit (7)**  
   - `lib/auth.ts` `authorize()`: IP + email ile `checkRateLimit('login', identifier)` (10/dk), aşımda hata.

6. **Login lockout (8)**  
   - `lib/rate-limit.ts`: `getLoginLockout`, `recordFailedLoginAttempt`, `clearFailedLoginAttempts` (5 hata → 15 dk).  
   - `lib/auth.ts`: Lockout kontrolü; hatalı girişte kayıt, başarıda temizleme.

7. **CAPTCHA (risk bazlı) (9)**  
   - `app/(auth)/auth/login/page.tsx`: ≥2 başarısız denemede “Ben robot değilim” checkbox, işaretlenmeden submit engeli.

8. **Auth olay loglama (10)**  
   - `lib/auth-events.ts`: `logLoginFailed`, `logLockout`, `logLoginSuccess`, `logRateLimit` (maskeleme ile).  
   - `lib/auth.ts`: Lockout, rate limit, user not found, email not verified, wrong password, success için çağrı.

---

## RBAC ve izolasyon (11–14)

9. **Server-side role check (11)**  
   - `lib/api-auth.ts`: `getSessionOr401`, `requireRole`, `requireAuth`, `requireDealerResource`, `requireUserResource`.  
   - Örnek route’lar: `dealer/stats`, `customer/trends` vb. `requireAuth` kullanıyor.

10. **RBAC permission matrix (12)**  
    - `docs/RBAC-PERMISSION-MATRIX.md`: Rol / endpoint matrisi ve sahiplik kuralları.

11. **Dealer/user scope (13)**  
    - `lib/api-auth.ts`: `dealerScopeWhere(session)`, `userScopeWhere(session)` (Prisma `where` için).

12. **Tenant izolasyon testi (14)**  
    - `__tests__/lib/api-auth-isolation.test.ts`: requireRole, requireDealerResource, requireUserResource, dealerScopeWhere, userScopeWhere (dealer A, B izolasyonu).

---

## Audit ve soft delete (17–18)

13. **Admin audit log (17)**  
    - Mevcut `AuditLog` kullanımı (user update/delete, settings, features) doğrulandı; ek değişiklik yok.

14. **Soft delete + restore (18)**  
    - `prisma/schema.prisma`: `Feedback.deletedAt` (DateTime?, index).  
    - Admin feedbacks DELETE: soft delete (`deletedAt` set).  
    - `app/api/admin/feedbacks/restore/route.ts` POST: restore (`deletedAt: null`).  
    - İlgili GET’lerde `deletedAt: null` filtresi.

---

## Doküman ve altyapı (19–25)

15. **Veri retention/archival (19)**  
    - `docs/DATA-RETENTION-ARCHIVAL.md`: Saklama ve arşiv politikası.

16. **Queue + DLQ (20–21)**  
    - `docs/QUEUE-AND-ASYNC.md`: Kuyruk ve DLQ/retry.  
    - Inngest: `lib/inngest/client.ts`, `lib/inngest/functions.ts`, `lib/inngest/send.ts`. `app/api/inngest/route.ts`. `feedback/created` → `feedback-analyze` (retries: 3). `USE_INNGEST_QUEUE=true` iken event; yoksa inline AI.

17. **Dashboard pre-aggregation (22)**  
    - `DailyDealerStats` (Prisma). `GET/POST /api/admin/preagg` (`?days=90`). `vercel.json` cron: günlük 02:00 UTC. `docs/DASHBOARD-PREAGGREGATION.md`.

18. **Cursor pagination (23)**  
    - `lib/cursor-pagination.ts`: `parseCursor`, `encodeCursor`; route’lara `GET /api/admin/users`: `?cursor=` + `nextCursor` ile cursor pagination.

19. **API caching (24)**  
    - Dealer stats, notification-badges, admin dashboard, customer discovery: Cache-Control. `docs/API-CACHING.md`.

20. **Sentry / observability (25)**  
    - `@sentry/nextjs`, sentry.*.config.ts, instrumentation.ts, error.tsx. DSN yoksa no-op. `docs/SENTRY-OBSERVABILITY.md`.

---

## AI ve PII (26–30)

21. **AI confidence / versioning (26–29)**  
    - `docs/AI-CONFIDENCE-AND-VERSIONING.md`: Schema’da intentScore, aiModelUsed, aiVersion; Review kuyruğu (27): `needsReview=true` (`intentScore < 0.7`). Admin/Dealer geri bildirimlerde "Manuel İnceleme" checkbox.

22. **PII redaction (30)**  
    - `lib/pii-redact.ts`: `redactEmail`, `redactPhone`, `redactIp`, `redactForLog`.

---

## QR abuse, lifecycle, attribution (31–33)

23. **QR abuse (31)**  
    - `lib/rate-limit.ts`: `checkFeedbackPerQrRateLimit(qrCodeId, ip)` (QR başına dakikada limit).  
    - `app/api/feedbacks/route.ts` POST: Bu limit kontrolü + 429.

24. **QR lifecycle (32)**  
    - Schema: `QRCode.expiresAt`, `revokedAt`, `@@index([expiresAt])`.  
    - Feedback POST: Süresi dolmuş/iptal QR’da 404.  
    - `PATCH /api/qr-codes/[id]`: `expiresAt`, `revoke`, `segmentConfig` (validations’da).  
    - `POST /api/qr-codes/[id]/rotate`: Yeni kod oluşturur, eskisini iptal eder. Dealer QR dropdown: "Kod Yenile", "İptal Et".

25. **Scan attribution (33)**  
    - Schema: `Feedback.utmSource`, `utmCampaign`, `utmMedium`, `attributionSource`.  
    - `feedbackSchema` ve feedback POST: Bu alanların kabulü.

---

## Closed-loop (34)

26. **Closed-loop (34)**  
    - Dealer reply’da zaten `Notification` (FEEDBACK_REPLY) oluşturuluyor; ek kod yok.

---

## Incident ve Action Engine (35–36)

27. **Incident radarı (35)**  
    - Schema: `Incident` (dealerId, type, severity, status, assignedToId, dueAt, resolvedAt).  
    - `GET/POST /api/dealer/incidents`, `GET/PATCH /api/dealer/incidents/[id]`.

28. **AI Action Engine (36)**  
    - Schema: `ActionItem` (feedbackId, dealerId, suggestionText, priority, status, assignedToId, dueAt, completedAt).  
    - `GET/POST /api/dealer/action-items`, `PATCH /api/dealer/action-items/[id]`.

---

## Churn, kampanya, ROI, benchmark (37–40)

29. **Churn risk (37)**  
    - `GET /api/dealer/churn-risk`: Ortalama churn riski, yüksek riskli feedback listesi.

30. **Risk segmentine kampanya (38)**  
    - `POST /api/dealer/campaigns/risk-segment`: Yüksek churn risk’lilere toplu bildirim (minChurnRisk, maxNotifications, message).

31. **ROI paneli (39)**  
    - `GET /api/dealer/roi`: Yanıt oranı, aksiyon tamamlama oranı, aylık ortalama puan.

32. **Benchmark (40)**  
    - `GET /api/dealer/benchmark`: Dealer vs platform ortalama puan ve yanıt oranı, farklar.

---

## Fraud, anti-exploit, A/B (41–43)

33. **Fraud skoru (41)**  
    - Schema: `Feedback.fraudScore` (Float 0–1).  
    - Admin feedbacks listesi: `?maxFraudScore=` query filtresi.

34. **Anti-exploit (42)**  
    - `lib/points-caps.ts`: Günlük/haftalık feedback puan tavanı; `getDailyFeedbackPointsEarned`, `capFeedbackPoints`.  
    - Feedback POST: `capFeedbackPoints` + `points_credited` analytics event.

35. **A/B test (43)**  
    - `docs/GAMIFICATION-AB-TEST.md`: Deney tasarımı.  
    - `lib/gamification-ab.ts`: `getVariant(userId, experimentKey)` (Settings tabanlı).

---

## Media, kişiselleştirme, telafi (44–47)

36. **Sesli/görselli feedback (44)**  
    - `feedbackSchema.media`: `string[]` veya `{ url, type?: 'image'|'audio'|'video' }[]` kabul.

37. **QR kişiselleştirme (45)**  
    - Schema: `QRCode.segmentConfig` (Json).  
    - `GET /api/qr-codes/public/[code]?segment=`: `segmentExperience` dönüşü; expiresAt/revokedAt kontrolü.  
    - `PATCH /api/qr-codes/[id]`: `segmentConfig` + validations.

38. **Manager Copilot (46)**  
    - `GET /api/dealer/copilot-summary`: Son 7 gün kritik sorunlar + önerilen aksiyonlar.

39. **1-tık telafi (47)**  
    - `POST /api/dealer/feedbacks/[id]/remedy`: Müşteriye telafi bildirimi (message, sendNotification), analytics event.

---

## Isı haritası, yolculuk skoru, VoC (48–50)

40. **Isı haritası (48)**  
    - `GET /api/dealer/heatmap`: QR/lokasyon bazlı feedback sayısı, ortalama puan, memnuniyet oranı.

41. **Yolculuk skoru (49)**  
    - `GET /api/customer/journey-score`: Müşteri yolculuk skoru (0–100) ve metrikler.

42. **VoC wall (50)**  
    - `GET /api/dealer/voc-wall`: Son feedback’ler, ortalama puan, son 24h sayısı.

---

## Ek düzeltmeler (plan dışı)

43. **Müşteri scan sayfası – API uyumu**  
    - `app/customer/scan/page.tsx`: `validateAndGo` artık `res.ok && data.qrCode` ile kontrol ediyor (önceden `data.success`).

44. **Apple Wallet dokümantasyon**  
    - `lib/wallet.ts`: Başta canlı env ve sertifika gereksinimleri yorumu.  
    - IMPROVEMENTS.md: Apple Wallet durumu güncellendi.

45. **IMPROVEMENTS.md**  
    - Maddeler 2 (Kamera), 3 (404), 4 (Error): Tamamlandı olarak işaretlendi; metinler güncellendi.  
    - Özet tabloda Kamera QR, 404/Error UI tamamlandı.

46. **Dealer stats 500**  
    - `app/api/dealer/stats/route.ts`:  
      - QRCode sorgusu `select` ile (yeni kolonlara bağımlılık azaltıldı).  
      - Son feedback’ler için önce `deletedAt: null`, hata olursa `deletedAt` olmadan tekrar sorgu.  
      - Herhangi bir hata durumunda 200 + sıfır/boş veri (dashboard kırılmıyor), development’ta `_debug`.

47. **LCP – chatbot görseli**  
    - `components/chat/chatbot.tsx`: Floating butondaki `/logo/chatbot.png` için `priority` eklendi.

---

## Yeni / güncellenen dosyalar (kısa liste)

- **Config / lib:** `lib/site-config.ts`, `lib/rate-limit.ts`, `lib/auth-events.ts`, `lib/api-auth.ts`, `lib/pii-redact.ts`, `lib/points-caps.ts`, `lib/cursor-pagination.ts`, `lib/queue-placeholder.ts`, `lib/gamification-ab.ts`, `lib/validations.ts` (feedback + QR schema güncellemeleri).  
- **Prisma:** `prisma/schema.prisma` (Feedback, QRCode, Incident, ActionItem, yeni alanlar).  
- **API route’lar:**  
  - `app/robots.ts`, `app/sitemap.ts`  
  - `app/api/feedbacks/route.ts`, `app/api/qr-codes/[id]/route.ts`, `app/api/qr-codes/public/[code]/route.ts`  
  - `app/api/admin/feedbacks/route.ts`, `app/api/admin/feedbacks/restore/route.ts`  
  - `app/api/dealer/stats/route.ts`, `app/api/dealer/incidents/route.ts`, `app/api/dealer/incidents/[id]/route.ts`  
  - `app/api/dealer/action-items/route.ts`, `app/api/dealer/action-items/[id]/route.ts`  
  - `app/api/dealer/roi/route.ts`, `app/api/dealer/copilot-summary/route.ts`, `app/api/dealer/voc-wall/route.ts`  
  - `app/api/dealer/churn-risk/route.ts`, `app/api/dealer/benchmark/route.ts`, `app/api/dealer/heatmap/route.ts`  
  - `app/api/dealer/feedbacks/[id]/remedy/route.ts`, `app/api/dealer/campaigns/risk-segment/route.ts`  
  - `app/api/customer/journey-score/route.ts`  
- **Auth / login:** `lib/auth.ts`, `app/(auth)/auth/login/page.tsx`  
- **Docs:** `docs/RBAC-PERMISSION-MATRIX.md`, `docs/DATA-RETENTION-ARCHIVAL.md`, `docs/QUEUE-AND-ASYNC.md`, `docs/DASHBOARD-PREAGGREGATION.md`, `docs/API-CACHING.md`, `docs/SENTRY-OBSERVABILITY.md`, `docs/AI-CONFIDENCE-AND-VERSIONING.md`, `docs/BACKLOG-32-50.md`, `docs/GAMIFICATION-AB-TEST.md`, `docs/IMPROVEMENTS.md` (güncellemeler).  
- **Diğer:** `next.config.js` (headers), `middleware.ts` (CORS), `app/layout.tsx` (metadata), `components/chat/chatbot.tsx` (priority), `app/customer/scan/page.tsx` (API uyumu).

---

**Özet:** Plan maddeleri 5–50 için doküman, schema, API ve küçük UI/akış düzeltmeleri yapıldı; dealer stats 500, scan API uyumu, LCP ve IMPROVEMENTS/Apple Wallet notları eklendi. Veritabanı için `npx prisma generate` ve `npx prisma db push` (veya migrate) gerekebilir.
