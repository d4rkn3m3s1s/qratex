# GET /api/gamification/rewards – Karar ve Kullanım

**Tarih:** 2025-02-19  
**İlgili:** G1 (Yapılacaklar listesi)

## Karar

`GET /api/gamification/rewards` **oturum (session) olmadan** çağrılabiliyor ve tüm **aktif ödüller** listesini döndürüyor.

- **Karar:** Bu davranış **bilinçli ve kabul edilmiştir.** Endpoint, müşteri tarafında ödül kataloğunu göstermek (isim, açıklama, ikon, puan maliyeti) için public kalacaktır.
- **Dönen alanlar:** `id`, `name`, `description`, `icon`, `cost`, `stock`, `type`, `metadata`, `isActive`, `_count.users`. Cost, kullanıcının “X puanla değiştir” bilgisini göstermek için gereklidir.
- **Hassas bilgi:** `cost` ve `stock` iş kuralı gereği katalogda gösteriliyor. İleride sadece giriş yapan kullanıcıya `stock` gizlenebilir; şu an auth zorunlu **yapılmadı**.

## Kullanım

| Amaç | Çağrı |
|------|--------|
| Katalog (herkese açık) | `GET /api/gamification/rewards` (session yok) |
| Kullanıcının kendi kazandığı ödüller | `GET /api/gamification/rewards?myRewards=true` (session gerekli) |
| Admin: tüm ödüller / filtre | `GET /api/gamification/rewards?status=active|inactive` (ADMIN session gerekli) |

POST / PATCH / DELETE zaten sadece ADMIN için korumalıdır.
