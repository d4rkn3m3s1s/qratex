# Backlog Maddeler 32–50 – Uygulama Rehberi

Bu doküman, plan maddeleri 32–50 için uygulama notları ve öncelik özetidir.

| # | Madde | Özet / Uygulama notu |
|---|--------|----------------------|
| 32 | QR lifecycle | QRCode modeline `expiresAt`, `revokedAt` eklenebilir; admin/dealer UI’da “aktif/pasif/iptal” ve süre sonu yönetimi. |
| 33 | Scan attribution | Feedback veya scan event’e `utm_source`, `utm_campaign`, `utm_medium`, `branch` alanları eklenir; ROI raporunda kullanılır. |
| 34 | Closed-loop feedback | Dealer yanıtı sonrası müşteriye e-posta (Resend) veya bildirim; “Geri bildiriminiz yanıtlandı” akışı. |
| 35 | Incident/kriz radarı | Negatif trend eşiği (örn. NPS/rating düşüşü) aşılınca otomatik incident kaydı, atama ve SLA takibi. |
| 36 | AI Action Engine | Analiz çıktısından “önerilen aksiyon” üretimi; sahip atama ve takip (model + UI). |
| 37 | Churn risk modeli | Kullanıcı/dealer için risk skoru (feedback sıklığı, sentiment trendi); erken uyarı. |
| 38 | Risk segmentine kampanya | Churn riski yüksek gruba otomatik kupon/telafi kampanyası tetikleme. |
| 39 | ROI paneli | Aksiyonların gelir, memnuniyet, tekrar ziyaret etkisini tek ekranda gösteren dashboard. |
| 40 | Benchmark modülü | Sektör/segment ortalamasıyla kıyaslama; kendi metriklerini karşılaştırma. |
| 41 | Sahte yorum/fraud skoru | Feedback’e fraud skoru; bot/anomali işaretleme; analitik filtreleme. |
| 42 | Gamification anti-exploit | Puan/quest kurallarında günlük/haftalık tavan; aynı davranışla sınırsız kazanımı engelleme. |
| 43 | Gamification A/B test | Ödül, görev, metin varyasyonları; varyant atama ve dönüşüm metrikleri. |
| 44 | Sesli/görselli feedback | Ses ve video yükleme; AI ile özet/kategori; transkript. |
| 45 | QR kişiselleştirme | Aynı QR’dan segment (ör. yeni/tekrarlayan) bazlı farklı deneyim/soru seti. |
| 46 | Manager Copilot | Haftalık “en kritik 3 sorun + 3 önerilen aksiyon” özeti (e-posta veya panel). |
| 47 | 1-tık telafi kampanyası | Negatif feedback sonrası tek tıkla özür/kupon/indirim akışı. |
| 48 | Şube ısı haritası | Lokasyon (şube/ masa) bazlı memnuniyet/şikayet yoğunluğu haritası. |
| 49 | Müşteri yolculuğu skoru | Tekil olaylar yerine toplam deneyim skoru; churn/loyalty tahmini. |
| 50 | Voice of Customer wall | Şube içi canlı “müşteri sesi” ekranı (son feedback’ler, özet metrikler). |

Tüm maddeler ürün ve altyapı geliştirmesi gerektirir; sıra ihtiyaca ve kaynağa göre belirlenir.

## Uygulananlar (kod + API)

- **32** QR lifecycle: `QRCode.expiresAt`, `revokedAt`; feedback POST'ta süre/iptal kontrolü; `PATCH /api/qr-codes/[id]`.
- **33** Scan attribution: `Feedback.utmSource`, `utmCampaign`, `utmMedium`, `attributionSource`; POST'ta kabul.
- **34** Closed-loop: Dealer reply'da `Notification` (FEEDBACK_REPLY) zaten oluşturuluyor.
- **35** Incident radarı: `Incident` modeli; `GET/POST /api/dealer/incidents`, `GET/PATCH /api/dealer/incidents/[id]`.
- **36** AI Action Engine: `ActionItem` modeli; `GET/POST /api/dealer/action-items`, `PATCH /api/dealer/action-items/[id]`.
- **39** ROI paneli: `GET /api/dealer/roi`.
- **41** Fraud skoru: `Feedback.fraudScore`; admin feedbacks'te `maxFraudScore` query filtresi.
- **42** Anti-exploit: `lib/points-caps.ts` günlük/haftalık tavan; feedback POST'ta `capFeedbackPoints`.
- **46** Manager Copilot: `GET /api/dealer/copilot-summary`.
- **50** VoC wall: `GET /api/dealer/voc-wall`.
- **37** Churn risk: `GET /api/dealer/churn-risk` — ortalama risk, yüksek riskli feedback listesi.
- **38** Risk segmentine kampanya: `POST /api/dealer/campaigns/risk-segment` — yüksek churn risk’lilere toplu bildirim.
- **40** Benchmark: `GET /api/dealer/benchmark` — dealer vs platform ortalama puan ve yanıt oranı.
- **43** A/B test: `docs/GAMIFICATION-AB-TEST.md`, `lib/gamification-ab.ts` — varyant atama (Settings tabanlı).
- **44** Sesli/görselli feedback: `feedbackSchema.media` — `{ url, type: 'image'|'audio'|'video' }[]` kabul edilir.
- **45** QR kişiselleştirme: `QRCode.segmentConfig`; `GET /api/qr-codes/public/[code]?segment=` ile segment deneyimi; PATCH ile segmentConfig.
- **47** 1-tık telafi: `POST /api/dealer/feedbacks/[id]/remedy` — müşteriye telafi bildirimi.
- **48** Isı haritası: `GET /api/dealer/heatmap` — QR/lokasyon bazlı memnuniyet özeti.
- **49** Yolculuk skoru: `GET /api/customer/journey-score` — müşteri toplam deneyim skoru.
