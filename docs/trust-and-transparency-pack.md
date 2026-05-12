# Paket A: Güven + şeffaflık — veri eşlemesi

Bu paket, plandaki **şeffaf geri bildirim yolculuğu**, **telafi onay kuyruğu** ve **Trust komuta özeti** için kullanılan modelleri özetler.

## Prisma

| Özellik | Model | Alanlar / durumlar |
|--------|--------|---------------------|
| Geri bildirim gönderildi | `Feedback` | `createdAt` |
| Bayi geri bildirimi gördü | `Feedback` | `dealerFirstViewedAt` (PATCH `/api/dealer/feedbacks/[id]/viewed` veya yanıt/telafi ile dolabilir) |
| Bayi yanıtı | `Feedback` | `dealerReply`, `dealerRepliedAt` |
| Telafi taslak (müşteri görmez) | `RemedyOffer` | `status = awaiting_dealer_approval` |
| Telafi müşteriye açık | `RemedyOffer` | `status = pending` |
| Telafi reddedildi | `RemedyOffer` | `status = rejected` |
| Operasyon görevi (gelecek Agent Council bağlantısı) | `ActionItem` | `feedbackId`, `dealerId`, `status` |

## Segment / playbook

Paket B kapsamında detaylandırılacak; Paket A’da segment şart değil. İleride `User` / `Feedback` metrikleri playbook tetikleyicisi olarak kullanılabilir.

## RBAC

- Müşteri yolculuğu: yalnızca `userId` kendisi olan `Feedback` için `GET /api/customer/feedbacks/[id]/journey`.
- Telafi onayı: yalnızca `RemedyOffer.dealerId === session.user.id` (DEALER veya ADMIN).
- Trust özeti: yalnızce `ADMIN`, `GET /api/admin/trust-overview`.
