# PII Sınıflandırma Matrisi

Hangi alan hassas, kim görebilir, log/export politikası ne.

| Alan | Hassasiyet | Kim Görebilir | Log | Export |
|------|------------|---------------|-----|--------|
| email | Yüksek | Sahip, Admin | Maskele (lib/pii-redact) | Maskele veya hariç tut |
| phone | Yüksek | Sahip, Admin | Maskele | Maskele |
| ipAddress / ip | Orta | Admin | Maskele | Maskele |
| name | Orta | Sahip, Admin, Dealer (kendi müşterileri) | Tam | Tam |
| userAgent | Düşük | Admin | [REDACTED] | Hariç |
| rating | Düşük | Sahip, Admin, Dealer | Tam | Tam |
| text (feedback) | Orta | Sahip, Admin, Dealer | Tam (audit) | Tam |
| points / level | Düşük | Sahip, Admin | Tam | Tam |

## lib/pii-redact.ts Uyumu

- `redactEmail`, `redactPhone`, `redactIp`, `redactForLog` kullan.
- Yeni alanlar bu matrise göre eklenir.
