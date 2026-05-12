# API Caching Stratejisi

Sık okunan endpoint’lerde kısa TTL cache ile yük azaltılır.

## Uygulanan (P2-24)

- **Dealer stats:** `Cache-Control: private, s-maxage=30, stale-while-revalidate=60` ([app/api/dealer/stats/route.ts](app/api/dealer/stats/route.ts)).
- **Dealer notification-badges:** `s-maxage=20, stale-while-revalidate=40` ([app/api/dealer/notification-badges/route.ts](app/api/dealer/notification-badges/route.ts)).
- **Admin dashboard:** `s-maxage=30, stale-while-revalidate=60` ([app/api/admin/dashboard/route.ts](app/api/admin/dashboard/route.ts)).
- **Customer discovery:** `s-maxage=60, stale-while-revalidate=120` ([app/api/customer/discovery/route.ts](app/api/customer/discovery/route.ts)).
- **Next.js:** `revalidate = 60` ile route segment cache (uygun route’larda).

## Önerilen hot endpoint’ler

| Endpoint | Önerilen TTL | Not |
|----------|--------------|-----|
| GET /api/dealer/stats | 30–60 sn | Zaten cache header var |
| GET /api/dealer/notification-badges | 15–30 sn | Badge sayıları |
| GET /api/admin/dashboard (varsa) | 30 sn | Özet metrikler |
| GET /api/customer/discovery | 60 sn | Keşif config |

## Uygulama

- `NextResponse` dönmeden önce `response.headers.set('Cache-Control', 'private, s-maxage=30')` ekleyin.
- Veya Next.js Route Segment Config: `export const revalidate = 60`.
