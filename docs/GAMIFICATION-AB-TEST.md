# Gamification A/B Test Altyapısı (Madde 43)

Ödül, görev ve metin varyasyonlarını test etmek için varyant atama ve metrik toplama.

## Tasarım

- **Varyant atama:** Kullanıcı bazlı tutarlı atama (örn. `hash(userId) % variantCount` veya Settings’teki deney konfigürasyonu).
- **Metrikler:** Her aksiyonda (spin, quest claim, reward claim) `experimentId`, `variantId` ve sonucu (conversion, points earned) AnalyticsEvent veya ayrı tabloda kaydedilir.
- **Değerlendirme:** Varyant bazlı dönüşüm oranı, ortalama kazanım karşılaştırması.

## Uygulama seçenekleri

1. **Settings tabanlı:** `Settings.key = 'gamification_ab_experiments'`, `value = { "reward_copy": { "variants": ["A", "B"], "weights": [0.5, 0.5] } }`. Spin/quest/reward route’larında `getVariant(userId, 'reward_copy')` ile A/B metni seçilir; aksiyon sırasında `event: 'gamification_ab_impression'`, `data: { experiment, variant, outcome }` loglanır.
2. **Model tabanlı:** `GamificationExperiment` (key, name, status, variants Json), `UserExperimentAssignment` (userId, experimentId, variantId). İlk temasda atama yapılır, sonraki isteklerde aynı varyant kullanılır.

Mevcut kodda spin/quest/reward route’larına `experimentKey` ve `variant` eklenerek metrik toplama genişletilebilir.
