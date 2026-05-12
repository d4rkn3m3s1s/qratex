# Yeni Özellikler – Nerede, Hangi Sayfadan Test?

Bu doküman, eklenen API’lerin **dosya konumlarını** ve **hangi sayfadan / nasıl deneyebileceğinizi** tek tek listeler.

---

## 1. 1-tık telafi (Remedy) – Madde 47

| Ne | Detay |
|----|--------|
| **API** | `POST /api/dealer/feedbacks/[id]/remedy` |
| **Dosya** | `app/api/dealer/feedbacks/[id]/remedy/route.ts` |
| **Body** | `{ "message": "isteğe bağlı özür mesajı", "sendNotification": true }` |
| **Ne yapar** | Müşteriye “Telafi Fırsatı” bildirimi oluşturur, analytics’e `remedy_campaign_triggered` yazar. |
| **Nereden test** | **Dealer → Geri Bildirimler** (`/dealer/feedbacks`). QR sekmesinde her kartta **「Telafi gönder」** → modalda mesaj yazıp gönder. Müşteriye bildirim gider; müşteri **Telafi Tekliflerim** veya bildirimden **「Telafiyi seç」** ile teklife gidip **tür** (indirim/puan/ücretsiz ürün) ve **miktar** seçip kabul eder. |

---

## 2. Incident (Kriz) radarı – Madde 35

| Ne | Detay |
|----|--------|
| **API** | `GET /api/dealer/incidents`, `POST /api/dealer/incidents`, `GET/PATCH /api/dealer/incidents/[id]` |
| **Dosyalar** | `app/api/dealer/incidents/route.ts`, `app/api/dealer/incidents/[id]/route.ts` |
| **Nereden test** | Şu an **sadece API** (Postman / curl). Dealer panelde ayrı bir “Olaylar” sayfası yok. |

---

## 3. AI Action Engine (Aksiyon öğeleri) – Madde 36

| Ne | Detay |
|----|--------|
| **API** | `GET/POST /api/dealer/action-items`, `PATCH /api/dealer/action-items/[id]` |
| **Dosyalar** | `app/api/dealer/action-items/route.ts`, `app/api/dealer/action-items/[id]/route.ts` |
| **Nereden test** | **Sadece API**. UI’da aksiyon listesi sayfası yok. |

---

## 4. Churn risk – Madde 37

| Ne | Detay |
|----|--------|
| **API** | `GET /api/dealer/churn-risk` |
| **Dosya** | `app/api/dealer/churn-risk/route.ts` |
| **Nereden test** | **Sadece API**. Dashboard’da churn widget’ı yok. |

---

## 5. Risk segmentine kampanya – Madde 38

| Ne | Detay |
|----|--------|
| **API** | `POST /api/dealer/campaigns/risk-segment` |
| **Dosya** | `app/api/dealer/campaigns/risk-segment/route.ts` |
| **Body** | `{ "minChurnRisk": 0.7, "maxNotifications": 50, "message": "..." }` |
| **Nereden test** | **Dealer → Kampanyalar** (`/dealer/campaigns`). "Risk segmentine kampanya" kartında bildirim gönder. |

---

## 6. ROI paneli – Madde 39

| Ne | Detay |
|----|--------|
| **API** | `GET /api/dealer/roi` |
| **Dosya** | `app/api/dealer/roi/route.ts` |
| **Nereden test** | **Dealer → ROI** (`/dealer/roi`). Bu ay metrikleri. |

---

## 7. Benchmark – Madde 40

| Ne | Detay |
|----|--------|
| **API** | `GET /api/dealer/benchmark` |
| **Dosya** | `app/api/dealer/benchmark/route.ts` |
| **Nereden test** | **Dealer → Benchmark** (`/dealer/benchmark`). Siz vs platform. |

---

## 8. Manager Copilot özeti – Madde 46

| Ne | Detay |
|----|--------|
| **API** | `GET /api/dealer/copilot-summary` |
| **Dosya** | `app/api/dealer/copilot-summary/route.ts` |
| **Nereden test** | **Dealer → Copilot** (`/dealer/copilot`). Kritik sorunlar + önerilen aksiyonlar. |

---

## 9. VoC wall (Voice of Customer) – Madde 50

| Ne | Detay |
|----|--------|
| **API** | `GET /api/dealer/voc-wall` |
| **Dosya** | `app/api/dealer/voc-wall/route.ts` |
| **Nereden test** | **Dealer → VoC Wall** (`/dealer/voc-wall`). Son geri bildirimler + özet. |

---

## 10. Isı haritası – Madde 48

| Ne | Detay |
|----|--------|
| **API** | `GET /api/dealer/heatmap` |
| **Dosya** | `app/api/dealer/heatmap/route.ts` |
| **Nereden test** | **Dealer → Isı Haritası** (`/dealer/heatmap`). QR/lokasyon bazlı memnuniyet. |

---

## 11. Müşteri yolculuk skoru – Madde 49

| Ne | Detay |
|----|--------|
| **API** | `GET /api/customer/journey-score` (müşteri oturumu gerekir) |
| **Dosya** | `app/api/customer/journey-score/route.ts` |
| **Nereden test** | **Sadece API** (müşteri token ile). Müşteri panelinde “Yolculuk skorum” sayfası yok. |

---

## 12. P2 Altyapı – Inngest, Preagg, Sentry, QR Lifecycle

| Özellik | API / Dosya | Nereden test |
|---------|-------------|--------------|
| Inngest (queue) | `app/api/inngest/route.ts`, `lib/inngest/*`. `USE_INNGEST_QUEUE=true` ile feedback POST → event. | Backend; Inngest dev UI `localhost:8288` ile event izlenir. |
| Dashboard pre-aggregation | `GET/POST /api/admin/preagg` (`?days=90`). `vercel.json` cron: 02:00 UTC. | Admin tarafında cron veya manuel `POST /api/admin/preagg?days=7`. |
| Sentry | `sentry.*.config.ts`, `instrumentation.ts`, `error.tsx`. `NEXT_PUBLIC_SENTRY_DSN` ile etkin. | Hata fırlatıldığında Sentry dashboard'da görünür; DSN yoksa no-op. |
| Manuel review kuyruğu | Admin/Dealer feedbacks: `?needsReview=true` filtre (`intentScore < 0.7`). | **Admin/Dealer → Geri Bildirimler** – "Manuel İnceleme" checkbox ile filtrele. |
| QR rotate/revoke | `POST /api/qr-codes/[id]/rotate`. Dealer QR dropdown: "Kod Yenile", "İptal Et". | **Dealer → QR Kodlar** – her kartta dropdown → "Kod Yenile" veya "İptal Et". |

---

## Özet tablo

| Özellik | API yolu | Sayfadan test? |
|---------|----------|-----------------|
| 1-tık telafi (remedy) | `POST .../feedbacks/[id]/remedy` | Evet → **Dealer → Geri Bildirimler** (QR sekmesi, “Telafi gönder”) |
| Incident | `.../dealer/incidents` | Evet → **Dealer → Olaylar** |
| Action items | `.../dealer/action-items` | Evet → **Dealer → Aksiyonlar** |
| Churn risk | `GET .../dealer/churn-risk` | Evet → **Dealer → Churn Risk** |
| Risk kampanya | `POST .../campaigns/risk-segment` | Evet → **Dealer → Kampanyalar** (risk kartı) |
| ROI | `GET .../dealer/roi` | Evet → **Dealer → ROI** |
| Benchmark | `GET .../dealer/benchmark` | Evet → **Dealer → Benchmark** |
| Copilot özet | `GET .../dealer/copilot-summary` | Evet → **Dealer → Copilot** |
| VoC wall | `GET .../dealer/voc-wall` | Evet → **Dealer → VoC Wall** |
| Heatmap | `GET .../dealer/heatmap` | Evet → **Dealer → Isı Haritası** |
| Journey score | `GET .../customer/journey-score` | Evet → **Müşteri → Yolculuk Skorum** |

Diğer tüm yeni dealer/customer API’leri şu an **sadece API** üzerinden (Postman, fetch, curl) test edilebilir; ileride ilgili sayfalara widget veya sayfa eklenebilir.
