# RBAC – Endpoint Permission Matrix

Hangi rolün hangi API endpoint'inde hangi aksiyonu (read/create/update/delete/export) yapabileceği matrisi.

## Rol kısaltmaları

- **A** = ADMIN
- **D** = DEALER
- **C** = CUSTOMER

## Genel kurallar

- Tüm authenticated endpoint'lerde `requireAuth(allowedRoles)` kullanılmalı.
- Dealer kaynakları: sadece ADMIN veya ilgili dealer (resource.dealerId === session.user.id).
- Customer kaynakları: sadece ADMIN veya ilgili kullanıcı (resource.userId === session.user.id).

## API gruplarına göre matris

| Endpoint grubu | GET (read) | POST (create) | PUT/PATCH (update) | DELETE | Export |
|----------------|------------|---------------|---------------------|--------|--------|
| `/api/admin/*` | A | A | A | A | A |
| `/api/dealer/*` | D (own), A | D (own), A | D (own), A | D (own), A | D (own), A |
| `/api/customer/*` | C (own), A | C (own), A | C (own), A | C (own), A | C (own), A |
| `/api/user/*` (profile, password) | A, D, C (own) | - | A, D, C (own) | - | - |
| `/api/gamification/*` (badges, quests, rewards) | A (all), D/C (own) | A (create), D/C (claim) | A | A | A |
| `/api/feedbacks` | A (all), D (own QR), C (own) | C, D | D (reply) | A | A |
| `/api/qr-codes/*` | D (own), A | D (own), A | D (own), A | D (own), A | - |
| `/api/qr-codes/public/[code]` | Public (rate-limited) | - | - | - | - |
| `/api/auth/*` | Public (verify-email) | Public (register), Any (login) | - | - | - |

## Kaynak sahipliği (ownership)

- **Dealer scope:** Tüm dealer endpoint'lerinde `where: { dealerId: session.user.id }` (ADMIN hariç).
- **Customer scope:** Müşteri verisinde `where: { userId: session.user.id }` (ADMIN hariç).
- Yardımcı: `lib/api-auth.ts` içinde `requireDealerResource(session, resourceDealerId)` ve `requireUserResource(session, resourceUserId)` kullanın.

## Yeni endpoint eklerken

1. `requireAuth(['ADMIN'])` veya `requireAuth(['DEALER'])` vb. çağırın.
2. Liste/GET ise Prisma `where` içinde `dealerId`/`userId` filtreleyin (ADMIN hariç).
3. Tekil kaynak güncelleme/silmede `requireDealerResource` veya `requireUserResource` kullanın.
