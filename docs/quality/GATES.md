# Kalite kapıları

Üretim: `node scripts/quality-gates.mjs` · 2026-10-12 00:38 UTC · commit `d380cac2`

**Özet:** 13 YEŞİL · 4 KIRMIZI · 1 bilgi/atlandı

Ortam: e2e/tarama VE Lighthouse aynı üretim derlemesine karşı (Pixel 7 profili, 4 rol):
(`NEXT_DIST_DIR=.next-gates`, `next start -p 3100`, mobil profil). DB yazan akışlar bu turda koşmaz
(`E2E_WRITE=1 npx playwright test --project=gates e2e/gates/flows.spec.ts`).

| Kapı | Hedef | Ölçülen | Durum |
| --- | --- | --- | --- |
| TypeScript (tsc) | 0 hata | 0 hata | **YEŞİL** |
| Jest birim/entegrasyon | %100 geçer | %100.00 (5089/5089; 0 suite kırık) | **YEŞİL** |
| E2E (Playwright, salt-okur) | %100 geçer | %100.0 (99/99; 6 atlandı — DB yazan akışlar E2E_WRITE=1 ister) | **YEŞİL** |
| Konsol hatası | 0 | 0 (0/95 rota) | **YEŞİL** |
| Başarısız istek | 0 | 0 (0/95 rota) | **YEŞİL** |
| axe kritik + ciddi | 0 | 0 (0/95 rota) | **YEŞİL** |
| Yatay taşma (412px) | 0 rota | 0 rota | **YEŞİL** |
| Dokunma hedefi <44px | 0 | 0 (0/95 rota) | **YEŞİL** |
| Kontrast ihlali (AA) | 0 | 0 (0/95 rota) | **YEŞİL** |
| Lighthouse performans (mobil) | ≥90 (her rota) | en düşük 61; 7/12 rota altında | **KIRMIZI** |
| Lighthouse erişilebilirlik | ≥95 (her rota) | en düşük 100; 0/12 rota altında | **YEŞİL** |
| Lighthouse en iyi uygulamalar | ≥95 (her rota) | en düşük 96; 0/12 rota altında | **YEŞİL** |
| Lighthouse SEO (public) | ≥95 (her rota) | en düşük 92; 1/7 rota altında | **KIRMIZI** |
| LCP (mobil) | <2.5 sn | en kötü 6.35 sn | **KIRMIZI** |
| CLS | <0.1 | en kötü 0.344 | **KIRMIZI** |
| TBT (bilgi) | raporlanır (<200 ms iyi) | en kötü 1392 ms | **BİLGİ** |
| /feedback/[code] JS (sıkıştırılmış) | ≤150 KB | 38 KB | **YEŞİL** |
| npm audit (üretim) kritik | 0 | 0 | **YEŞİL** |

## Lighthouse (mobil, üretim derlemesi)

| Rota | Perf | A11y | BP | SEO | LCP sn | CLS | TBT ms | JS KB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| / | 61 | 100 | 96 | 100 | 6.35 | 0.000 | 515 | 466 |
| /auth/login | 95 | 100 | 96 | 100 | 1.30 | 0.000 | 256 | 78 |
| /auth/register | 98 | 100 | 96 | 100 | 1.13 | 0.000 | 173 | 15 |
| /neden-qratex | 99 | 100 | 96 | 100 | 1.09 | 0.003 | 104 | 9 |
| /guven | 96 | 100 | 96 | 100 | 1.13 | 0.007 | 222 | 12 |
| /blog | 75 | 100 | 96 | 100 | 1.25 | 0.344 | 339 | 26 |
| /feedback/DEMO-CAFE-002 | 75 | 100 | 96 | 92 | 1.23 | 0.000 | 1337 | 38 |
| /customer (customer) | 79 | 100 | 96 | 69 | 3.83 | 0.000 | 298 | 213 |
| /customer/wallet/card (customer) | 68 | 100 | 96 | 69 | 3.12 | 0.000 | 1392 | 218 |
| /customer/games (customer) | 75 | 100 | 96 | 69 | 3.02 | 0.000 | 761 | 168 |
| /dealer (dealer) | 81 | 100 | 96 | 69 | 2.46 | 0.000 | 563 | 102 |
| /admin (admin) | 91 | 100 | 96 | 69 | 0.89 | 0.000 | 300 | 41 |

## Kırmızı kapıların ayrıntısı

### Lighthouse performans (mobil)

- /: 61
- /blog: 75
- /feedback/DEMO-CAFE-002: 75
- /customer (customer): 79
- /customer/wallet/card (customer): 68
- /customer/games (customer): 75
- /dealer (dealer): 81

### Lighthouse SEO (public)

- /feedback/DEMO-CAFE-002: 92

### LCP (mobil)

- /: 6.35 sn
- /customer (customer): 3.83 sn
- /customer/wallet/card (customer): 3.12 sn
- /customer/games (customer): 3.02 sn

### CLS

- /blog: 0.344

## Bilgi

### TBT (bilgi)

- /: 515 ms
- /auth/login: 256 ms
- /auth/register: 173 ms
- /neden-qratex: 104 ms
- /guven: 222 ms
- /blog: 339 ms
- /feedback/DEMO-CAFE-002: 1337 ms
- /customer (customer): 298 ms
- /customer/wallet/card (customer): 1392 ms
- /customer/games (customer): 761 ms
- /dealer (dealer): 563 ms
- /admin (admin): 300 ms
