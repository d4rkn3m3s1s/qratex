# Ek şema istekleri (güvenlik ajanlarından, Dalga 2 sırasında)

- **RemedyOffer.expiresAt DateTime?** + süresi dolan bekleyen teklifleri `expired` durumuna çeken günlük iş (`daily` cron kaydı).
  Bugün bekleyen telafi teklifi süresiz geçerli; istismar değil ama tasarım boşluğu. Kabulde `expiresAt > now` koşulu eklenmeli.
  Kaynak: 15894f1 güvenlik incelemesi.
