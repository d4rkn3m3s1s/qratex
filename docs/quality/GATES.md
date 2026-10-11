# Kalite kapıları

Üretim: `node scripts/quality-gates.mjs` · 2026-10-11 19:47 UTC · commit `de5e551b`

**Özet:** 3 YEŞİL · 9 KIRMIZI · 7 bilgi/atlandı

Ortam: e2e/tarama `next dev` (localhost:3000, Pixel 7 profili, 4 rol); Lighthouse üretim derlemesi
(`NEXT_DIST_DIR=.next-gates`, `next start -p 3100`, mobil profil). DB yazan akışlar bu turda koşmaz
(`E2E_WRITE=1 npx playwright test --project=gates e2e/gates/flows.spec.ts`).

| Kapı | Hedef | Ölçülen | Durum |
| --- | --- | --- | --- |
| TypeScript (tsc) | 0 hata | 0 hata | **YEŞİL** |
| Jest birim/entegrasyon | %100 geçer | %99.96 (5070/5072; 1 suite kırık) | **KIRMIZI** |
| E2E (Playwright, salt-okur) | %100 geçer | %75.0 (3/4; 101 atlandı — DB yazan akışlar E2E_WRITE=1 ister) | **KIRMIZI** |
| Konsol hatası | 0 | ölçülmedi | **BİLGİ** |
| Başarısız istek | 0 | ölçülmedi | **BİLGİ** |
| axe kritik + ciddi | 0 | ölçülmedi | **BİLGİ** |
| Yatay taşma (412px) | 0 rota | ölçülmedi | **BİLGİ** |
| Dokunma hedefi <44px | 0 | ölçülmedi | **BİLGİ** |
| Kontrast ihlali (AA) | 0 | ölçülmedi | **BİLGİ** |
| Lighthouse oturum aktarımı | oturumlu rotalar ölçülür | 5 rota girişe yönlendi | **KIRMIZI** |
| Lighthouse performans (mobil) | ≥90 (her rota) | en düşük 75; 7/7 rota altında | **KIRMIZI** |
| Lighthouse erişilebilirlik | ≥95 (her rota) | en düşük 93; 1/7 rota altında | **KIRMIZI** |
| Lighthouse en iyi uygulamalar | ≥95 (her rota) | en düşük 96; 0/7 rota altında | **YEŞİL** |
| Lighthouse SEO (public) | ≥95 (her rota) | en düşük 69; 3/7 rota altında | **KIRMIZI** |
| LCP (mobil) | <2.5 sn | en kötü 7.01 sn | **KIRMIZI** |
| CLS | <0.1 | en kötü 0.003 | **YEŞİL** |
| TBT (bilgi) | raporlanır (<200 ms iyi) | en kötü 58 ms | **BİLGİ** |
| /feedback/[code] JS (sıkıştırılmış) | ≤150 KB | 506 KB | **KIRMIZI** |
| npm audit (üretim) kritik | 0 | 4 | **KIRMIZI** |

## Lighthouse (mobil, üretim derlemesi)

| Rota | Perf | A11y | BP | SEO | LCP sn | CLS | TBT ms | JS KB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| / | 77 | 100 | 96 | 100 | 5.73 | 0.000 | 39 | 538 |
| /auth/login | 80 | 100 | 96 | 69 | 5.26 | 0.000 | 2 | 535 |
| /auth/register | 79 | 100 | 96 | 69 | 5.58 | 0.000 | 2 | 552 |
| /neden-qratex | 78 | 93 | 96 | 100 | 5.27 | 0.003 | 33 | 480 |
| /guven | 78 | 96 | 96 | 100 | 5.27 | 0.000 | 58 | 476 |
| /blog | 75 | 99 | 96 | 100 | 7.01 | 0.000 | 47 | 483 |
| /feedback/DEMO-CAFE-002 | 80 | 100 | 96 | 92 | 4.86 | 0.000 | 3 | 506 |

## Kırmızı kapıların ayrıntısı

### Jest birim/entegrasyon

- __tests__\lib\push-native.test.ts —   ● sendPush cephesi › env yokken native sessizce atlanır, SSRF kaydı pasifleşir

### E2E (Playwright, salt-okur)

- giriş: admin — TimeoutError: page.waitForURL: Timeout 30000ms exceeded.

### Lighthouse oturum aktarımı

- /customer → http://localhost:3100/auth/login?callbackUrl=http%3A%2F%2Flocalhost%3A3000%2Fcustomer
- /customer/wallet/card → http://localhost:3100/auth/login?callbackUrl=http%3A%2F%2Flocalhost%3A3000%2Fcustomer%2Fwallet%2Fcard
- /customer/games → http://localhost:3100/auth/login?callbackUrl=http%3A%2F%2Flocalhost%3A3000%2Fcustomer%2Fgames
- /dealer → http://localhost:3100/auth/login?callbackUrl=http%3A%2F%2Flocalhost%3A3000%2Fdealer
- /admin → http://localhost:3100/auth/login?callbackUrl=http%3A%2F%2Flocalhost%3A3000%2Fadmin

### Lighthouse performans (mobil)

- /: 77
- /auth/login: 80
- /auth/register: 79
- /neden-qratex: 78
- /guven: 78
- /blog: 75
- /feedback/DEMO-CAFE-002: 80

### Lighthouse erişilebilirlik

- /neden-qratex: 93

### Lighthouse SEO (public)

- /auth/login: 69
- /auth/register: 69
- /feedback/DEMO-CAFE-002: 92

### LCP (mobil)

- /: 5.73 sn
- /auth/login: 5.26 sn
- /auth/register: 5.58 sn
- /neden-qratex: 5.27 sn
- /guven: 5.27 sn
- /blog: 7.01 sn
- /feedback/DEMO-CAFE-002: 4.86 sn

### npm audit (üretim) kritik

- @auth/core (<=0.41.2)
- @auth/prisma-adapter (<=2.11.2)
- next (9.3.4-canary.0 - 16.3.7)
- protobufjs (<=7.6.4 \|\| 8.0.0 - 8.6.5)
- özet: kritik 4, yüksek 49, orta 30, düşük 2 (yalnız üretim bağımlılıkları)

## Bilgi

### Konsol hatası

- rota kaydı yok (giriş kurulumu / e2e düştü)

### Başarısız istek

- rota kaydı yok (giriş kurulumu / e2e düştü)

### axe kritik + ciddi

- rota kaydı yok (giriş kurulumu / e2e düştü)

### Yatay taşma (412px)

- rota kaydı yok (giriş kurulumu / e2e düştü)

### Dokunma hedefi <44px

- rota kaydı yok (giriş kurulumu / e2e düştü)

### Kontrast ihlali (AA)

- rota kaydı yok (giriş kurulumu / e2e düştü)

### TBT (bilgi)

- /: 39 ms
- /auth/login: 2 ms
- /auth/register: 2 ms
- /neden-qratex: 33 ms
- /guven: 58 ms
- /blog: 47 ms
- /feedback/DEMO-CAFE-002: 3 ms
