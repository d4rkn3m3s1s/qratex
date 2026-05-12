# Dashboard Metrikleri – Pre-aggregation (P2-22)

Dashboard açılışını hızlandırmak için pahalı sorguları günlük özet tablolarla değiştirir.

## Uygulanan

- **DailyDealerStats modeli:** `dealerId`, `date`, `feedbackCount`, `avgRating`, `consumptionCount`, `consumptionReviewCount`, `scanCount`, `positiveCount`, `neutralCount`, `negativeCount`
- **POST /api/admin/preagg:** Pre-aggregation job; `?days=90` ile son N günü doldurur
- **Yetkilendirme:** ADMIN veya `Authorization: Bearer CRON_SECRET`

## Cron

Vercel Cron veya GitHub Actions ile günde bir kez çağrı:
```
POST /api/admin/preagg
Authorization: Bearer <CRON_SECRET>
```
`.env` içinde `CRON_SECRET` tanımlayın.

## Sonraki adım

`/api/dealer/stats` bu tablodan son 30 günü okuyacak şekilde güncellenebilir; bugün canlı hesaplanır.
