# Kalite kapıları

Üretim: `node scripts/quality-gates.mjs` · 2026-10-12 12:14 UTC · commit `f373f058`

**Özet:** 14 YEŞİL · 3 KIRMIZI · 1 bilgi/atlandı

Ortam: e2e/tarama VE Lighthouse aynı üretim derlemesine karşı (Pixel 7 profili, 4 rol):
(`NEXT_DIST_DIR=.next-gates`, `next start -p 3100`, mobil profil). DB yazan akışlar bu turda koşmaz
(`E2E_WRITE=1 npx playwright test --project=gates e2e/gates/flows.spec.ts`).

| Kapı | Hedef | Ölçülen | Durum |
| --- | --- | --- | --- |
| TypeScript (tsc) | 0 hata | 0 hata | **YEŞİL** |
| Jest birim/entegrasyon | %100 geçer | %99.96 (5127/5129; 1 suite kırık) | **KIRMIZI** |
| E2E (Playwright, salt-okur) | %100 geçer | %100.0 (99/99; 6 atlandı — DB yazan akışlar E2E_WRITE=1 ister) | **YEŞİL** |
| Konsol hatası | 0 | 0 (0/95 rota) | **YEŞİL** |
| Başarısız istek | 0 | 0 (0/95 rota) | **YEŞİL** |
| axe kritik + ciddi | 0 | 0 (0/95 rota) | **YEŞİL** |
| Yatay taşma (412px) | 0 rota | 0 rota | **YEŞİL** |
| Dokunma hedefi <44px | 0 | 0 (0/95 rota) | **YEŞİL** |
| Kontrast ihlali (AA) | 0 | 0 (0/95 rota) | **YEŞİL** |
| Lighthouse performans (mobil) | ≥90 (her rota) | en düşük 74; 2/12 rota altında | **KIRMIZI** |
| Lighthouse erişilebilirlik | ≥95 (her rota) | en düşük 100; 0/12 rota altında | **YEŞİL** |
| Lighthouse en iyi uygulamalar | ≥95 (her rota) | en düşük 96; 0/12 rota altında | **YEŞİL** |
| Lighthouse SEO (public) | ≥95 (her rota) | en düşük 100; 0/6 rota altında | **YEŞİL** |
| LCP (mobil) | <2.5 sn | en kötü 6.36 sn | **KIRMIZI** |
| CLS | <0.1 | en kötü 0.001 | **YEŞİL** |
| TBT (bilgi) | raporlanır (<200 ms iyi) | en kötü 146 ms | **BİLGİ** |
| /feedback/[code] JS (sıkıştırılmış) | ≤150 KB | 41 KB | **YEŞİL** |
| npm audit (üretim) kritik | 0 | 0 | **YEŞİL** |

## Lighthouse (mobil, üretim derlemesi)

| Rota | Perf | A11y | BP | SEO | LCP sn | CLS | TBT ms | JS KB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| / | 74 | 100 | 96 | 100 | 6.36 | 0.000 | 38 | 449 |
| /auth/login | 100 | 100 | 96 | 100 | 1.23 | 0.000 | 31 | 81 |
| /auth/register | 100 | 100 | 96 | 100 | 0.80 | 0.000 | 19 | 15 |
| /neden-qratex | 100 | 100 | 96 | 100 | 1.07 | 0.000 | 21 | 8 |
| /guven | 100 | 100 | 96 | 100 | 1.23 | 0.000 | 22 | 12 |
| /blog | 100 | 100 | 96 | 100 | 1.08 | 0.000 | 89 | 36 |
| /feedback/DEMO-CAFE-002 | 100 | 100 | 96 | 92 | 1.21 | 0.000 | 18 | 41 |
| /customer (customer) | 87 | 100 | 96 | 69 | 3.93 | 0.000 | 77 | 251 |
| /customer/wallet/card (customer) | 90 | 100 | 96 | 69 | 3.63 | 0.000 | 36 | 220 |
| /customer/games (customer) | 98 | 100 | 96 | 69 | 1.67 | 0.001 | 146 | 177 |
| /dealer (dealer) | 95 | 100 | 96 | 69 | 1.74 | 0.000 | 101 | 93 |
| /admin (admin) | 98 | 100 | 96 | 69 | 0.82 | 0.000 | 62 | 41 |

## Kırmızı kapıların ayrıntısı

### Jest birim/entegrasyon

- __tests__\menu-visibility-catalog.test.ts —   ● Dosya sistemi ↔ kayıt (iki yönlü) › customer: panel dizinindeki her page.tsx kayıtta

### Lighthouse performans (mobil)

- /: 74
- /customer (customer): 87

### LCP (mobil)

- /: 6.36 sn
- /customer (customer): 3.93 sn
- /customer/wallet/card (customer): 3.63 sn

## Bilgi

### TBT (bilgi)

- /: 38 ms
- /auth/login: 31 ms
- /auth/register: 19 ms
- /neden-qratex: 21 ms
- /guven: 22 ms
- /blog: 89 ms
- /feedback/DEMO-CAFE-002: 18 ms
- /customer (customer): 77 ms
- /customer/wallet/card (customer): 36 ms
- /customer/games (customer): 146 ms
- /dealer (dealer): 101 ms
- /admin (admin): 62 ms
