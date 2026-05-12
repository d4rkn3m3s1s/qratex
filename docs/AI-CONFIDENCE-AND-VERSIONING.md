# AI Çıktısı: Confidence ve Versiyonlama

## Mevcut alanlar (Feedback)

- `intentScore` (0–1 confidence)
- `aiModelUsed`, `aiVersion` (model ve prompt versiyonu)
- `aiProcessedAt`

## Madde 26–29 uygulama notları

1. **Confidence skoru (26):** Her AI analiz cevabında `intentScore` (ve gerekirse sentiment/theme için ayrı skorlar) doldurulmalı; UI’da düşük confidence uyarısı gösterilebilir.
2. **Review kuyruğu (27):** `intentScore < 0.7` (veya eşik) olan kayıtlar admin/dealer için “manuel inceleme” listesinde filtrelenebilir; onayla/düzelt akışı eklenir.
3. **Versiyonlama (28):** Zaten `aiModelUsed` ve `aiVersion` var; her analizde set edildiğinden emin olun (AI route’larında).
4. **Fallback KPI (29):** `lib/ai-engine.ts` → `getFallbackStats()` ve `logAIUsage` ile fallback oranı izlenir. AI analizde fallback (örn. basit kural) kullanıldığında bir flag veya metrik toplanır; Sentry veya ayrı metrik ile “fallback oranı” izlenir.

Bu doküman, AI kalite ve izlenebilirlik için referanstır.
