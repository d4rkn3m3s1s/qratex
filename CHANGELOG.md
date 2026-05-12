# Changelog

Tüm önemli değişiklikler bu dosyada listelenir.

Biçim [Keep a Changelog](https://keepachangelog.com/tr/1.0.0/) esas alınır; sürüm numaraları [Semantic Versioning](https://semver.org/lang/tr/) kullanır.

---

## [Unreleased]

### Eklenen

- **Customer Remedy**: Telafi teklifleri sayfası (görsel iyileştirme, sekmeler, LazyMotion + `m`, React Query).
- **Favori işletmeler (Ö2)**: Müşteri favorileri modeli, API ve dashboard kartı.
- **NPS (Ö6)**: Geri bildirim formunda NPS alanı, admin istatistiklerinde NPS kartı.
- **Hızlı geri bildirim seçenekleri (Ö3)**: Public feedback sayfasında hazır cümle çipleri.
- **Admin/Dealer dışa aktarma (Ö9)**: Geri bildirim listesi Excel (CSV) ve PDF.
- **Health readiness**: `GET /api/health?light=1` ile sadece DB ping (readiness probe).
- **AnalyticsEvent otomatik temizlik (P3)**: Inngest cron `analytics-event-cleanup` (günlük 03:00).
- **Liste sayfalama Zod (K1)**: `listQueryBaseSchema`, `adminCardsQuerySchema`, `api/feedbacks` GET Zod ile.
- **API health testi (S1)**: `__tests__/api/health.test.ts` (light=1 ve full, mock Prisma).

### Değiştirilen

- **Middleware → proxy**: Next.js 16 uyumu için `middleware.ts` kaldırıldı; `proxy.ts` kullanılıyor.
- **Prisma**: Tüm `(prisma as any)` kaldırıldı; doğrudan model isimleri kullanılıyor.
- **Customer dashboard**: Paralel API çağrıları dayanıklı hale getirildi; bir hata tüm veriyi düşürmüyor.
- **Bildirimler**: Header’da `fetchNotifications` hata vermeden devam ediyor; `credentials: 'same-origin'`.
- **PII log**: Feedback id ve metin parçası sadece `NODE_ENV === 'development'` iken loglanıyor.
- **Cache**: Customer stats ve trends GET yanıtlarına `Cache-Control: private, max-age=30, stale-while-revalidate=60`.

### Erişilebilirlik (a11y)

- Login: Demo butonlar ve Google buton `aria-label`; Mail/Lock ikonları `aria-hidden`; submit `aria-label`.
- Public feedback: Yıldız butonları `aria-label` (1–5 yıldız).
- Dialog/Sheet: Kapat butonu `aria-label="Kapat (Escape)"`; X ikonu `aria-hidden`. Radix ile focus trap ve Escape zaten mevcut.

---

## [1.0.0] – 2025-02-19

- İlk sürüm notları; yukarıdaki Unreleased maddeler sürüm etiketlendiğinde buraya taşınabilir.
