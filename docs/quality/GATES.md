# Kalite kapıları

Üretim: `node scripts/quality-gates.mjs` · 2026-10-12 12:56 UTC · commit `35c72ea1`

**Özet:** 14 YEŞİL · 3 KIRMIZI · 1 bilgi/atlandı

Ortam: e2e/tarama VE Lighthouse aynı üretim derlemesine karşı (Pixel 7 profili, 4 rol):
(`NEXT_DIST_DIR=.next-gates`, `next start -p 3100`, mobil profil). DB yazan akışlar bu turda koşmaz
(`E2E_WRITE=1 npx playwright test --project=gates e2e/gates/flows.spec.ts`).

| Kapı | Hedef | Ölçülen | Durum |
| --- | --- | --- | --- |
| TypeScript (tsc) | 0 hata | 0 hata | **KIRMIZI** |
| Jest birim/entegrasyon | %100 geçer | %100.00 (5129/5129; 0 suite kırık) | **YEŞİL** |
| E2E (Playwright, salt-okur) | %100 geçer | %100.0 (99/99; 6 atlandı — DB yazan akışlar E2E_WRITE=1 ister) | **YEŞİL** |
| Konsol hatası | 0 | 0 (0/95 rota) | **YEŞİL** |
| Başarısız istek | 0 | 0 (0/95 rota) | **YEŞİL** |
| axe kritik + ciddi | 0 | 0 (0/95 rota) | **YEŞİL** |
| Yatay taşma (412px) | 0 rota | 0 rota | **YEŞİL** |
| Dokunma hedefi <44px | 0 | 0 (0/95 rota) | **YEŞİL** |
| Kontrast ihlali (AA) | 0 | 0 (0/95 rota) | **YEŞİL** |
| Lighthouse performans (mobil) | ≥90 (her rota) | en düşük 74; 6/12 rota altında | **KIRMIZI** |
| Lighthouse erişilebilirlik | ≥95 (her rota) | en düşük 100; 0/12 rota altında | **YEŞİL** |
| Lighthouse en iyi uygulamalar | ≥95 (her rota) | en düşük 96; 0/12 rota altında | **YEŞİL** |
| Lighthouse SEO (public) | ≥95 (her rota) | en düşük 100; 0/6 rota altında | **YEŞİL** |
| LCP (mobil) | <2.5 sn | en kötü 6.56 sn | **KIRMIZI** |
| CLS | <0.1 | en kötü 0.000 | **YEŞİL** |
| TBT (bilgi) | raporlanır (<200 ms iyi) | en kötü 773 ms | **BİLGİ** |
| /feedback/[code] JS (sıkıştırılmış) | ≤150 KB | 41 KB | **YEŞİL** |
| npm audit (üretim) kritik | 0 | 0 | **YEŞİL** |

## Lighthouse (mobil, üretim derlemesi)

| Rota | Perf | A11y | BP | SEO | LCP sn | CLS | TBT ms | JS KB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| / | 74 | 100 | 96 | 100 | 6.56 | 0.000 | 41 | 463 |
| /auth/login | 100 | 100 | 96 | 100 | 1.22 | 0.000 | 53 | 81 |
| /auth/register | 100 | 100 | 96 | 100 | 0.81 | 0.000 | 26 | 15 |
| /neden-qratex | 100 | 100 | 96 | 100 | 1.07 | 0.000 | 29 | 8 |
| /guven | 100 | 100 | 96 | 100 | 1.08 | 0.000 | 26 | 12 |
| /blog | 100 | 100 | 96 | 100 | 1.23 | 0.000 | 45 | 36 |
| /feedback/DEMO-CAFE-002 | 100 | 100 | 96 | 92 | 1.06 | 0.000 | 29 | 41 |
| /customer (customer) | 87 | 100 | 96 | 69 | 4.00 | 0.000 | 57 | 251 |
| /customer/wallet/card (customer) | 80 | 100 | 96 | 69 | 3.34 | 0.000 | 458 | 222 |
| /customer/games (customer) | 86 | 100 | 96 | 69 | 2.29 | 0.000 | 435 | 177 |
| /dealer (dealer) | 89 | 100 | 96 | 69 | 1.98 | 0.000 | 340 | 93 |
| /admin (admin) | 78 | 100 | 96 | 69 | 0.86 | 0.000 | 773 | 41 |

## Kırmızı kapıların ayrıntısı

### Lighthouse performans (mobil)

- /: 74
- /customer (customer): 87
- /customer/wallet/card (customer): 80
- /customer/games (customer): 86
- /dealer (dealer): 89
- /admin (admin): 78

### LCP (mobil)

- /: 6.56 sn
- /customer (customer): 4.00 sn
- /customer/wallet/card (customer): 3.34 sn

## Bilgi

### TBT (bilgi)

- /: 41 ms
- /auth/login: 53 ms
- /auth/register: 26 ms
- /neden-qratex: 29 ms
- /guven: 26 ms
- /blog: 45 ms
- /feedback/DEMO-CAFE-002: 29 ms
- /customer (customer): 57 ms
- /customer/wallet/card (customer): 458 ms
- /customer/games (customer): 435 ms
- /dealer (dealer): 340 ms
- /admin (admin): 773 ms
