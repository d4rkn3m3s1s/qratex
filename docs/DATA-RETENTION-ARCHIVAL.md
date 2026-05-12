# Veri Saklama ve Arşivleme Politikası

Bu belge, QRATEX’te verilerin ne kadar süre saklanacağını, ne zaman arşivleneceği veya silineceğini tanımlar.

## Genel ilkeler

- **Yasal uyum:** 5651, KVKK ve sektör gereklilikleri dikkate alınır.
- **Amaçla sınırlılık:** Veri, belirtilen amaçlar için gerekli süre boyunca tutulur.
- **Anonimleştirme:** Saklama süresi sonunda tam silme yerine anonimleştirme seçenek olarak değerlendirilir.

## Saklama süreleri (önerilen)

| Veri kategorisi | Önerilen süre | Arşivleme | Silme / anonimleştirme |
|------------------|---------------|-----------|-------------------------|
| Kimlik ve hesap (User, Account, Session) | Hesap aktif + yasal zorunluluk | - | Hesap silme sonrası yasal süre (örn. 1 yıl) |
| Geri bildirim (Feedback, ConsumptionReview) | 24 ay | 24 ay sonra arşiv | 36 ay sonra anonimleştirme veya silme |
| Davranış ve gamification (UserBadge, UserQuest, AnalyticsEvent) | 24 ay | - | 24 ay sonra anonimleştirme |
| Güvenlik ve denetim (AuditLog, CardAuditLog, SuspiciousActivity) | 5651 politikasına göre (örn. 1 yıl) | - | Yasal süre sonunda |
| AI konuşma ve öğrenme (AIConversation, AIEmbedding) | 12 ay | - | 12 ay sonra silme |

## Arşivleme

- **Arşiv:** Veriyi soğuk depolama veya daha düşük maliyetli ortama taşımak; canlı sorgulardan çıkarmak.
- Uygulama: İsteğe bağlı cron job veya yönetim script’i ile belirli entity’ler `archivedAt` veya ayrı arşiv tablosuna taşınabilir.

## Silme / anonimleştirme

- **Tam silme:** Kişisel veri tamamen kaldırılır (GDPR “unutmaya hak”).
- **Anonimleştirme:** Kimlik bilgileri (email, name, userId) kaldırılır veya tokenize edilir; agregat istatistikler korunabilir.

## Uygulama notları

- Bu politika dokümanı yönetim ve uyum için referanstır (P2-19).
- Gerçek saklama süreleri ve arşiv/silme adımları yasal danışmanlık sonrası netleştirilmelidir.
- Teknik uygulama: `prisma/schema.prisma` içinde isteğe bağlı `archivedAt`, `retentionUntil` alanları ve periyodik job’lar eklenebilir.
