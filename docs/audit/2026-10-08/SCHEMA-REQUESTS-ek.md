# Ek şema istekleri (güvenlik ajanlarından, Dalga 2 sırasında)

- **RemedyOffer.expiresAt DateTime?** + süresi dolan bekleyen teklifleri `expired` durumuna çeken günlük iş (`daily` cron kaydı).
  Bugün bekleyen telafi teklifi süresiz geçerli; istismar değil ama tasarım boşluğu. Kabulde `expiresAt > now` koşulu eklenmeli.
  Kaynak: 15894f1 güvenlik incelemesi.

- **TeamInvite** (ekip modülü davet modeli, Dalga 1). Bugün ekip üyeliği `User.adminTeamRole` alanının doğrudan yazılmasıyla oluyor: hedef kullanıcının onayı/haberi yok, süre/geri çekme yok.
  Önerilen model: `id`, `email String` (normalize), `teamRole String` ("yonetici" | "uye"), `tokenHash String @unique` (ham token yalnız mailde), `invitedById String` (→ User, onDelete: Cascade),
  `expiresAt DateTime` (öneri 72 sa), `acceptedAt DateTime?`, `revokedAt DateTime?`, `acceptedUserId String?`, `createdAt`; `@@index([email])`, `@@index([invitedById, createdAt])`.
  Akış: davet oluştur (bekleyen davet varsa 409) → mail → kabulde oturumdaki e-posta = davet e-postası ve `expiresAt > now`, `acceptedAt/revokedAt null` koşullu updateMany (tek-kez) → `adminTeamRole` yazılır + audit. Doğrudan rol atama uçları davet akışına bağlanmalı.
  Kaynak: Dalga 1 açık madde (ekip davet modeli).

- **InboxMessage.authVerified Boolean @default(false)** + **authReason String?** (gelen kutusu, sahte From / sahte bounce düzeltmesi).
  Bugün senkron `verifyMailAuth` (en üstteki Authentication-Results, authserv-id = `MAIL_AUTHSERV_ID`, hizalı SPF/DKIM/DMARC pass) sonucunu yalnız otomatik işleri (stajyer eşleştirme, bounce) kapatmak için kullanıyor; sonuç saklanmadığı için panelde "doğrulanmamış" rozeti gösterilemiyor. Alan eklenince `lib/mail-inbox.ts` create verisine `authVerified: auth.verified, authReason: auth.reason` yazılır, listede rozet gösterilir.
  İsteğe bağlı: **InternEmailSend.bounceCount Int @default(0)** — bugün eşik sayımı `lastError` `[bounce]` önekiyle yapılıyor.
  Kaynak: mail-inbox güvenlik incelemesi (3 bulgu).
