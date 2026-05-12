# SLO ve Error Budget Politikası

## Hedefler

| Metrik        | Hedef   | Not                            |
|---------------|---------|--------------------------------|
| Uptime        | %99.9   | Aylık downtime < 43 dk         |
| p95 Latency   | < 300ms | Kritik API route'ları          |
| Error Rate    | < 0.1%  | 5xx oranı                      |

## İzleme

- **Sentry**: Hata toplama, release tracking
- **Vercel Analytics**: Web vitals, response süreleri
- **Inngest**: Background job başarı/hata oranı

## Error Budget

- Aylık error budget: %0.1 downtime (~43 dk)
- Budget tüketildiğinde: feature freeze; sadece güvenlik ve stabilite odaklı deploy

## Aylık Review

- SLO metrikleri gözden geçirilir
- Error budget kullanımı raporlanır
- Gerekirse hedefler revize edilir
