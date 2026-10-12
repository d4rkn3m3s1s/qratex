# Kalite kapıları

Üretim: `node scripts/quality-gates.mjs` · 2026-10-12 02:31 UTC · commit `a1dfec35`

**Özet:** 10 YEŞİL · 5 KIRMIZI · 3 bilgi/atlandı

Ortam: e2e/tarama VE Lighthouse aynı üretim derlemesine karşı (Pixel 7 profili, 4 rol):
(`NEXT_DIST_DIR=.next-gates`, `next start -p 3100`, mobil profil). DB yazan akışlar bu turda koşmaz
(`E2E_WRITE=1 npx playwright test --project=gates e2e/gates/flows.spec.ts`).

| Kapı | Hedef | Ölçülen | Durum |
| --- | --- | --- | --- |
| TypeScript (tsc) | 0 hata | 0 hata (aynı gün tam koşu, çıkış 0) | **YEŞİL** |
| Jest birim/entegrasyon | %100 geçer | çıkış 0 (aynı gün tam koşu; 0 suite kırık) | **YEŞİL** |
| E2E (Playwright, salt-okur) | %100 geçer | %100.0 (99/99; 6 atlandı — DB yazan akışlar E2E_WRITE=1 ister) | **YEŞİL** |
| Konsol hatası | 0 | 0 (0/95 rota) | **YEŞİL** |
| Başarısız istek | 0 | 0 (0/95 rota) | **YEŞİL** |
| axe kritik + ciddi | 0 | 2 (2/95 rota) | **KIRMIZI** |
| Yatay taşma (412px) | 0 rota | 0 rota | **YEŞİL** |
| Dokunma hedefi <44px | 0 | 0 (0/95 rota) | **YEŞİL** |
| Kontrast ihlali (AA) | 0 | 0 (0/95 rota) | **YEŞİL** |
| Lighthouse performans (mobil) | ≥90 (her rota) | en düşük 69; 3/12 rota altında | **KIRMIZI** |
| Lighthouse erişilebilirlik | ≥95 (her rota) | en düşük 95; 0/12 rota altında | **YEŞİL** |
| Lighthouse en iyi uygulamalar | ≥95 (her rota) | en düşük 96; 0/12 rota altında | **YEŞİL** |
| Lighthouse SEO (public) | ≥95 (her rota) | en düşük 92; 2/7 rota altında | **KIRMIZI** |
| LCP (mobil) | <2.5 sn | en kötü 6.78 sn | **KIRMIZI** |
| CLS | <0.1 | en kötü 0.344 | **KIRMIZI** |
| TBT (bilgi) | raporlanır (<200 ms iyi) | en kötü 227 ms | **BİLGİ** |
| /feedback/[code] JS (sıkıştırılmış) | ≤150 KB | 41 KB | **YEŞİL** |
| npm audit (üretim) kritik | 0 | 0 | **YEŞİL** |

## Lighthouse (mobil, üretim derlemesi)

| Rota | Perf | A11y | BP | SEO | LCP sn | CLS | TBT ms | JS KB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| / | 69 | 95 | 96 | 92 | 6.78 | 0.000 | 227 | 449 |
| /auth/login | 100 | 100 | 96 | 100 | 1.30 | 0.000 | 26 | 81 |
| /auth/register | 100 | 100 | 96 | 100 | 0.79 | 0.000 | 13 | 15 |
| /neden-qratex | 100 | 100 | 96 | 100 | 1.07 | 0.000 | 10 | 8 |
| /guven | 100 | 100 | 96 | 100 | 1.07 | 0.007 | 27 | 12 |
| /blog | 83 | 100 | 96 | 100 | 1.22 | 0.344 | 81 | 36 |
| /feedback/DEMO-CAFE-002 | 100 | 100 | 96 | 92 | 1.21 | 0.000 | 9 | 41 |
| /customer (customer) | 88 | 100 | 96 | 69 | 3.93 | 0.000 | 57 | 251 |
| /customer/wallet/card (customer) | 93 | 100 | 96 | 69 | 3.18 | 0.000 | 34 | 220 |
| /customer/games (customer) | 97 | 100 | 96 | 69 | 1.67 | 0.001 | 151 | 177 |
| /dealer (dealer) | 100 | 100 | 96 | 69 | 1.74 | 0.000 | 49 | 93 |
| /admin (admin) | 98 | 100 | 96 | 69 | 0.90 | 0.000 | 81 | 41 |

## Kırmızı kapıların ayrıntısı

### axe kritik + ciddi

- customer /customer/me/badges: color-contrast[serious]×1 .text-muted-foreground\/70
- public /: image-alt[critical]×1 img[width="996"]

### Lighthouse performans (mobil)

- /: 69
- /blog: 83
- /customer (customer): 88

### Lighthouse SEO (public)

- /: 92
- /feedback/DEMO-CAFE-002: 92

### LCP (mobil)

- /: 6.78 sn
- /customer (customer): 3.93 sn
- /customer/wallet/card (customer): 3.18 sn

### CLS

- /blog: 0.344

## Bilgi

### TypeScript (tsc)

- GATES_SKIP

### Jest birim/entegrasyon

- GATES_SKIP

### TBT (bilgi)

- /: 227 ms
- /auth/login: 26 ms
- /auth/register: 13 ms
- /neden-qratex: 10 ms
- /guven: 27 ms
- /blog: 81 ms
- /feedback/DEMO-CAFE-002: 9 ms
- /customer (customer): 57 ms
- /customer/wallet/card (customer): 34 ms
- /customer/games (customer): 151 ms
- /dealer (dealer): 49 ms
- /admin (admin): 81 ms
