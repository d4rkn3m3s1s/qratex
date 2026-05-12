# Incident Playbook

Gece alarmı veya acil durumlarda izlenecek adımlar.

## İlk Adımlar

1. **Alarmı onayla**: Gerçek bir olay mı, false positive mı?
2. **Etkiyi değerlendir**: Hangi kullanıcılar/özellikler etkilendi?
3. **İletişim**: Ops/on-call ekibi bilgilendir.

## Senaryo: Login 500

1. Sentry'de son hataları incele.
2. Auth route'ları: `/api/auth/*` status kontrolü.
3. DB bağlantısı: `prisma db execute` veya health endpoint.
4. NEXTAUTH_SECRET ve NEXTAUTH_URL doğruluğunu kontrol et.
5. Gerekirse auth geçici bypass (riskli – sadece kritik durumlarda).

## Senaryo: API Timeout

1. Hangi endpoint timeout veriyor?
2. Vercel function timeout limiti (10s/60s).
3. DB query performansı – yavaş sorgular var mı?
4. Inngest step timeout – function retry sayısı.

## Escalation

- **P1**: Tüm sistem down → Hemen müdahale, tüm ekip bilgilendir.
- **P2**: Belirli özellik down → 1 saat içinde müdahale.
- **P3**: Degraded performance → İş saatlerinde müdahale.
