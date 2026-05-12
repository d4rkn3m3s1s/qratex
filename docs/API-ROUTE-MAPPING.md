# API ↔ Sayfa Karşılıkları

Ürün/ops planı ve mevcut route'ların hangi sayfalarda kullanıldığı ve sidebar durumu.

## Admin API'leri ve Sayfalar

| API Route | Sayfa | Sidebar |
|-----------|--------|---------|
| `GET /api/admin/onboarding/install-to-value` | `/admin` (Dashboard) | Dashboard |
| `GET /api/admin/kpis/action-completion` | `/admin` | Dashboard |
| `GET /api/admin/tenant-health` | `/admin` | Dashboard |
| `GET /api/admin/dashboard` | `/admin` | Dashboard |
| `GET/POST /api/admin/ai-quality` | `/admin/ai-quality` | AI Kalite |
| `GET /api/admin/partners`, `POST /api/admin/partners` | `/admin/partners` | Partnerler |
| `GET /api/admin/feedbacks` | `/admin/feedbacks` | Geri Bildirimler |
| `GET /api/admin/users` | `/admin/users`, `/admin/ai-learning`, `/admin/cards`, `/admin/discovery` | Kullanıcılar vb. |
| `GET /api/admin/settings` | `/admin/settings`, `/admin/themes` | Ayarlar |
| `GET /api/admin/settings/points-matrix` | `/admin/points-matrix` | Puan Matrisi |
| `GET /api/admin/features` | `/admin/features` | Özellikler |
| `GET /api/admin/analytics` | `/admin/analytics` | Analitik |
| `GET /api/admin/compliance/*` | `/admin/compliance` | KVKK & 5651 |
| `GET /api/admin/discovery` | `/admin/discovery` | Discovery |
| `GET /api/admin/dealers-ai-stats` | `/admin/ai-dashboard` | AI Kontrol Merkezi |
| `GET /api/admin/cards*` | `/admin/cards` | Kartlar |
| `GET /api/admin/segments` | `/admin/segments` | Segmentler |

## Dealer API'leri ve Sayfalar

| API Route | Sayfa | Sidebar |
|-----------|--------|---------|
| `GET /api/dealer/stats` | `/dealer` | Dashboard |
| `GET /api/dealer/next-best-actions` | `/dealer` | Dashboard |
| `GET /api/dealer/offline-sync` | `/dealer` | Dashboard |
| `GET /api/dealer/business-outcomes` | `/dealer/business-outcomes` | İş Sonuçları |
| `GET /api/dealer/incidents` | `/dealer/incidents` | Olaylar |
| `GET/PATCH /api/dealer/action-items` | `/dealer/action-items` | Aksiyonlar |
| `GET /api/dealer/churn-risk` | `/dealer/churn-risk` | Churn Risk |
| `GET /api/dealer/roi` | `/dealer/roi` | ROI |
| `GET /api/dealer/benchmark` | `/dealer/benchmark` | Benchmark |
| `GET /api/dealer/copilot-summary` | `/dealer/copilot` | Copilot |
| `GET /api/dealer/voc-wall` | `/dealer/voc-wall` | VoC Wall |
| `GET /api/dealer/heatmap` | `/dealer/heatmap` | Isı Haritası |
| `GET /api/dealer/analytics` | `/dealer/analytics` | Analitik |
| `GET /api/dealer/feedbacks/*`, `remedy` | `/dealer/feedbacks` | Geri Bildirimler |
| `GET /api/dealer/cards/scan/[token]`, consumptions | `/dealer/scan` | Kart Tara |
| `GET /api/dealer/categories`, products | `/dealer/products` | Ürünlerim |
| `GET /api/dealer/campaigns/risk-segment` | `/dealer/campaigns` | Kampanyalar |
| `GET /api/dealer/notification-badges` | Sidebar badge | - |

## Customer API'leri ve Sayfalar

| API Route | Sayfa | Sidebar |
|-----------|--------|---------|
| `GET /api/customer/journey-score` | `/customer/journey-score` | Yolculuk Skorum |
| `GET /api/customer/stats` | `/customer`, `/customer/rewards` | Dashboard |
| `GET /api/customer/discovery` | `/customer`, `/customer/nearby`, `/customer/trends` | Yakınımdakiler, Trend |
| `GET /api/customer/remedy` | `/customer/remedy`, `/customer/feedbacks` (kartlarda telafi linki) | Telafi Tekliflerim |
| `GET /api/customer/reviews` | `/customer/feedbacks` | Geri Bildirimlerim |
| `GET /api/customer/consumptions*` | `/customer/consumptions`, `[id]` | Tüketimlerim |
| `GET /api/customer/trends` | `/customer/trends` | Trend Analizi |
| `GET /api/customer/cards` | `/customer/my-card` | Kartım |
| `GET /api/customer/analytics` | `/customer/analytics` | Kişisel Analitik |
| `GET /api/customer/ai-insights`, ai-recommendations, ai-chat | `/customer/ai-insights` | AI Analizlerim |
| `GET /api/customer/donations` | `/customer/donations` | Sosyal Sorumluluk |
| `GET /api/customer/settings` | `/customer/settings` | Ayarlar |

## Analiz / KPI Sayfaları (Veri DB'den)

Aşağıdaki sayfalar veriyi ilgili API üzerinden alır; API'ler Prisma ile DB'den okur:

- **Admin:** `/admin` (install-to-value, action completion, tenant health, dashboard), `/admin/analytics`, `/admin/ai-dashboard`, `/admin/ai-quality`
- **Dealer:** `/dealer` (stats, next-best-actions), `/dealer/business-outcomes`, `/dealer/analytics`, `/dealer/roi`, `/dealer/benchmark`, `/dealer/churn-risk`, `/dealer/heatmap`, `/dealer/voc-wall`, `/dealer/copilot`
- **Customer:** `/customer/journey-score`, `/customer/analytics`, `/customer/trends`

Tüm bu endpoint'ler `requireAuth` ile korunur ve ilgili rolün kendi verisi (dealerId/userId kapsamı) döner.

## Public / Auth

| API | Sayfa |
|-----|--------|
| `GET /api/qr-codes/public/[code]` | `/feedback/[code]` (QR ile geri bildirim) |
| Auth (NextAuth) | `/auth/login`, `/auth/register` |

## Vercel Deploy Notları

- `npm run build` başarıyla tamamlanır (Vercel deploy’a hazır).
- Ortam değişkenleri: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` zorunlu.
- Inngest için `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` prod’da tanımlanmalı.
- Sentry: `SENTRY_ORG`, `SENTRY_PROJECT` opsiyonel; uyarıyı kapatmak için `SENTRY_SUPPRESS_GLOBAL_ERROR_HANDLER_FILE_WARNING=1`.

## Analiz Sayfaları – Veri Kaynağı

Tüm analiz/KPI sayfaları veriyi **API üzerinden** alır; API’ler **Prisma ile DB’den** okur. Örnekler:

- **Admin:** install-to-value, action completion, tenant health, dashboard, analytics, ai-dashboard, ai-quality.
- **Dealer:** stats, next-best-actions, business-outcomes, analytics, roi, benchmark, churn-risk, heatmap, voc-wall, copilot-summary.
- **Customer:** journey-score, analytics, trends.

Client tarafında sadece `fetch('/api/...')` kullanılır; hesaplama ve veri erişimi sunucu (API route) tarafında yapılır.
