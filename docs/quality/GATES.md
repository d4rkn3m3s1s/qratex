# Kalite kapıları

Üretim: `node scripts/quality-gates.mjs` · 2026-10-11 23:40 UTC · commit `4316f912`

**Özet:** 11 YEŞİL · 7 KIRMIZI · 1 bilgi/atlandı

Ortam: e2e/tarama VE Lighthouse aynı üretim derlemesine karşı (Pixel 7 profili, 4 rol):
(`NEXT_DIST_DIR=.next-gates`, `next start -p 3100`, mobil profil). DB yazan akışlar bu turda koşmaz
(`E2E_WRITE=1 npx playwright test --project=gates e2e/gates/flows.spec.ts`).

| Kapı | Hedef | Ölçülen | Durum |
| --- | --- | --- | --- |
| TypeScript (tsc) | 0 hata | 0 hata | **YEŞİL** |
| Jest birim/entegrasyon | %100 geçer | %99.92 (5085/5089; 3 suite kırık) | **KIRMIZI** |
| E2E (Playwright, salt-okur) | %100 geçer | %100.0 (99/99; 6 atlandı — DB yazan akışlar E2E_WRITE=1 ister) | **YEŞİL** |
| Konsol hatası | 0 | 0 (0/95 rota) | **YEŞİL** |
| Başarısız istek | 0 | 0 (0/95 rota) | **YEŞİL** |
| axe kritik + ciddi | 0 | 2 (1/95 rota) | **KIRMIZI** |
| Yatay taşma (412px) | 0 rota | 0 rota | **YEŞİL** |
| Dokunma hedefi <44px | 0 | 0 (0/95 rota) | **YEŞİL** |
| Kontrast ihlali (AA) | 0 | 0 (0/95 rota) | **YEŞİL** |
| Lighthouse oturum aktarımı | oturumlu rotalar ölçülür | 4 rota girişe yönlendi | **KIRMIZI** |
| Lighthouse performans (mobil) | ≥90 (her rota) | en düşük 51; 6/8 rota altında | **KIRMIZI** |
| Lighthouse erişilebilirlik | ≥95 (her rota) | en düşük 100; 0/8 rota altında | **YEŞİL** |
| Lighthouse en iyi uygulamalar | ≥95 (her rota) | en düşük 96; 0/8 rota altında | **YEŞİL** |
| Lighthouse SEO (public) | ≥95 (her rota) | en düşük 92; 1/7 rota altında | **KIRMIZI** |
| LCP (mobil) | <2.5 sn | en kötü 6.41 sn | **KIRMIZI** |
| CLS | <0.1 | en kötü 0.135 | **KIRMIZI** |
| TBT (bilgi) | raporlanır (<200 ms iyi) | en kötü 1980 ms | **BİLGİ** |
| /feedback/[code] JS (sıkıştırılmış) | ≤150 KB | 38 KB | **YEŞİL** |
| npm audit (üretim) kritik | 0 | 0 | **YEŞİL** |

## Lighthouse (mobil, üretim derlemesi)

| Rota | Perf | A11y | BP | SEO | LCP sn | CLS | TBT ms | JS KB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| / | 51 | 100 | 96 | 100 | 6.41 | 0.135 | 667 | 466 |
| /auth/login | 91 | 100 | 96 | 100 | 1.91 | 0.135 | 197 | 78 |
| /auth/register | 80 | 100 | 96 | 100 | 1.07 | 0.135 | 602 | 29 |
| /neden-qratex | 79 | 100 | 96 | 100 | 1.09 | 0.003 | 936 | 9 |
| /guven | 97 | 100 | 96 | 100 | 1.14 | 0.007 | 202 | 12 |
| /blog | 72 | 100 | 96 | 100 | 1.29 | 0.000 | 1980 | 26 |
| /feedback/DEMO-CAFE-002 | 72 | 100 | 96 | 92 | 1.23 | 0.135 | 1073 | 38 |
| /dealer (dealer) | 81 | 100 | 96 | 69 | 1.85 | 0.135 | 498 | 272 |

## Kırmızı kapıların ayrıntısı

### Jest birim/entegrasyon

- __tests__\architecture\perf-bundle-guards.test.ts —   ● perf: paket korkulukları › framer-motion'dan tam `motion` bileşeni içe aktarılmaz (LazyMotion + m)
- __tests__\design\design-guards.test.ts —   ● katman ve tipografi kuralları › yıkıcı işlem onayı native confirm() değil ConfirmAction (O3)
- __tests__\architecture\a11y-i18n-guards.test.ts —   ● a11y/i18n korkulukları › B7: framer'ın yalnız-OS useReducedMotion'ı kullanılmaz (lib/motion tek politika)

### axe kritik + ciddi

- admin /admin/users: nested-interactive[serious]×20 li:nth-child(1) > article > .items-start.gap-3.flex > .flex-1 > .qx-body.after\:absolute.after\:inset-0 · target-size[serious]×20 li:nth-child(1) > article > .items-start.gap-3.flex > .flex-1 > .qx-body.after\:absolute.after\:inset-0 > .gap-3.flex.items-center > div > .underline-offset-4.hover\:underline.focus-visible\:underline

### Lighthouse oturum aktarımı

- /customer → http://localhost:3100/auth/login?callbackUrl=http%3A%2F%2Flocalhost%3A3100%2Fcustomer
- /customer/wallet/card → http://localhost:3100/auth/login?callbackUrl=http%3A%2F%2Flocalhost%3A3100%2Fcustomer%2Fwallet%2Fcard
- /customer/games → http://localhost:3100/auth/login?callbackUrl=http%3A%2F%2Flocalhost%3A3100%2Fcustomer%2Fgames
- /admin → http://localhost:3100/auth/login?callbackUrl=http%3A%2F%2Flocalhost%3A3100%2Fadmin

### Lighthouse performans (mobil)

- /: 51
- /auth/register: 80
- /neden-qratex: 79
- /blog: 72
- /feedback/DEMO-CAFE-002: 72
- /dealer (dealer): 81

### Lighthouse SEO (public)

- /feedback/DEMO-CAFE-002: 92

### LCP (mobil)

- /: 6.41 sn

### CLS

- /: 0.135
- /auth/login: 0.135
- /auth/register: 0.135
- /feedback/DEMO-CAFE-002: 0.135
- /dealer (dealer): 0.135

## Bilgi

### TBT (bilgi)

- /: 667 ms
- /auth/login: 197 ms
- /auth/register: 602 ms
- /neden-qratex: 936 ms
- /guven: 202 ms
- /blog: 1980 ms
- /feedback/DEMO-CAFE-002: 1073 ms
- /dealer (dealer): 498 ms
