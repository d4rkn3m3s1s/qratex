# Kalite kapıları

Üretim: `node scripts/quality-gates.mjs` · 2026-10-11 21:24 UTC · commit `a107a6b5`

**Özet:** 6 YEŞİL · 12 KIRMIZI · 1 bilgi/atlandı

Ortam: e2e/tarama `next dev` (localhost:3000, Pixel 7 profili, 4 rol); Lighthouse üretim derlemesi
(`NEXT_DIST_DIR=.next-gates`, `next start -p 3100`, mobil profil). DB yazan akışlar bu turda koşmaz
(`E2E_WRITE=1 npx playwright test --project=gates e2e/gates/flows.spec.ts`).

| Kapı | Hedef | Ölçülen | Durum |
| --- | --- | --- | --- |
| TypeScript (tsc) | 0 hata | 0 hata | **YEŞİL** |
| Jest birim/entegrasyon | %100 geçer | %100.00 (5073/5073; 0 suite kırık) | **YEŞİL** |
| E2E (Playwright, salt-okur) | %100 geçer | %70.7 (70/99; 6 atlandı — DB yazan akışlar E2E_WRITE=1 ister) | **KIRMIZI** |
| Konsol hatası | 0 | 13 (12/79 rota) | **KIRMIZI** |
| Başarısız istek | 0 | 17 (12/79 rota) | **KIRMIZI** |
| axe kritik + ciddi | 0 | 13 (13/79 rota) | **KIRMIZI** |
| Yatay taşma (412px) | 0 rota | 0 rota | **YEŞİL** |
| Dokunma hedefi <44px | 0 | 177 (19/79 rota) | **KIRMIZI** |
| Kontrast ihlali (AA) | 0 | 3 (3/79 rota) | **KIRMIZI** |
| Lighthouse oturum aktarımı | oturumlu rotalar ölçülür | 1 rota girişe yönlendi | **KIRMIZI** |
| Lighthouse performans (mobil) | ≥90 (her rota) | en düşük 68; 4/11 rota altında | **KIRMIZI** |
| Lighthouse erişilebilirlik | ≥95 (her rota) | en düşük 96; 0/11 rota altında | **YEŞİL** |
| Lighthouse en iyi uygulamalar | ≥95 (her rota) | en düşük 96; 0/11 rota altında | **YEŞİL** |
| Lighthouse SEO (public) | ≥95 (her rota) | en düşük 69; 3/7 rota altında | **KIRMIZI** |
| LCP (mobil) | <2.5 sn | en kötü 7.07 sn | **KIRMIZI** |
| CLS | <0.1 | en kötü 0.137 | **KIRMIZI** |
| TBT (bilgi) | raporlanır (<200 ms iyi) | en kötü 612 ms | **BİLGİ** |
| /feedback/[code] JS (sıkıştırılmış) | ≤150 KB | 38 KB | **YEŞİL** |
| npm audit (üretim) kritik | 0 | 4 | **KIRMIZI** |

## Lighthouse (mobil, üretim derlemesi)

| Rota | Perf | A11y | BP | SEO | LCP sn | CLS | TBT ms | JS KB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| / | 68 | 100 | 96 | 100 | 7.07 | 0.135 | 75 | 519 |
| /auth/login | 95 | 100 | 96 | 69 | 1.53 | 0.135 | 40 | 66 |
| /auth/register | 95 | 100 | 96 | 69 | 0.94 | 0.135 | 11 | 14 |
| /neden-qratex | 94 | 100 | 96 | 100 | 1.39 | 0.137 | 79 | 10 |
| /guven | 94 | 96 | 96 | 100 | 1.44 | 0.135 | 125 | 13 |
| /blog | 95 | 100 | 96 | 100 | 1.23 | 0.135 | 56 | 26 |
| /feedback/DEMO-CAFE-002 | 95 | 100 | 96 | 92 | 1.22 | 0.135 | 9 | 38 |
| /customer (customer) | 93 | 100 | 96 | 100 | 2.04 | 0.135 | 93 | 214 |
| /customer/wallet/card (customer) | 86 | 96 | 96 | 69 | 1.03 | 0.135 | 369 | 208 |
| /customer/games (customer) | 79 | 96 | 96 | 69 | 1.06 | 0.135 | 612 | 120 |
| /dealer (dealer) | 87 | 100 | 96 | 100 | 1.23 | 0.135 | 315 | 94 |

## Kırmızı kapıların ayrıntısı

### E2E (Playwright, salt-okur)

- customer /customer/games — Error: /customer/games konsol hataları
- customer /customer/quests — Error: /customer/quests konsol hataları
- customer /customer/squads — Error: /customer/squads konsol hataları
- customer /customer/wallet/activity — Error: /customer/wallet/activity konsol hataları
- customer /customer/wallet/donate — Error: /customer/wallet/donate konsol hataları
- customer /customer/wallet/owned — Error: /customer/wallet/owned konsol hataları
- dealer /dealer — TimeoutError: page.goto: Timeout 120000ms exceeded.
- dealer /dealer/inbox — TimeoutError: page.goto: Timeout 120000ms exceeded.
- dealer /dealer/inbox/assigned — TimeoutError: page.goto: Timeout 120000ms exceeded.
- dealer /dealer/inbox/incidents — TimeoutError: page.goto: Timeout 120000ms exceeded.
- dealer /dealer/inbox/remedy — TimeoutError: page.goto: Timeout 120000ms exceeded.
- dealer /dealer/scan — TimeoutError: page.goto: Timeout 120000ms exceeded.
- dealer /dealer/consumptions — Error: page.goto: net::ERR_CONNECTION_RESET at http://localhost:3000/dealer/consumptions
- dealer /dealer/customers — Error: page.goto: net::ERR_CONNECTION_RESET at http://localhost:3000/dealer/customers
- dealer /dealer/products — Error: page.goto: net::ERR_CONNECTION_RESET at http://localhost:3000/dealer/products
- dealer /dealer/offers — Error: page.goto: net::ERR_CONNECTION_RESET at http://localhost:3000/dealer/offers
- dealer /dealer/campaigns — Error: page.goto: net::ERR_CONNECTION_RESET at http://localhost:3000/dealer/campaigns
- dealer /dealer/surveys — Error: page.goto: net::ERR_CONNECTION_RESET at http://localhost:3000/dealer/surveys
- dealer /dealer/automation/alerts — Error: /dealer/automation/alerts konsol hataları
- dealer /dealer/automation/remedy — Error: /dealer/automation/remedy konsol hataları
- dealer /dealer/automation/replies — Error: /dealer/automation/replies konsol hataları
- dealer /dealer/assistant — Error: /dealer/assistant konsol hataları
- dealer /dealer/innovation — Error: /dealer/innovation konsol hataları
- admin /admin — TimeoutError: page.goto: Timeout 120000ms exceeded.
- admin /admin/users — TimeoutError: page.goto: Timeout 120000ms exceeded.
- admin /admin/feedbacks — TimeoutError: page.goto: Timeout 120000ms exceeded.
- admin /admin/analytics — TimeoutError: page.goto: Timeout 120000ms exceeded.
- admin /admin/ekip — Error: /admin/ekip başarısız istekler
- admin /admin/roadmap — Error: /admin/roadmap konsol hataları

### Konsol hatası

- admin /admin/roadmap: Failed to load resource: the server responded with a status of 404 (Not Found)
- customer /customer/games: Failed to load resource: the server responded with a status of 429 (Too Many Requests)
- customer /customer/quests: Failed to load resource: the server responded with a status of 429 (Too Many Requests)
- customer /customer/squads: Failed to load resource: the server responded with a status of 429 (Too Many Requests)
- customer /customer/wallet/activity: Failed to load resource: the server responded with a status of 429 (Too Many Requests)
- customer /customer/wallet/donate: Failed to load resource: the server responded with a status of 429 (Too Many Requests)
- customer /customer/wallet/owned: Failed to load resource: the server responded with a status of 429 (Too Many Requests)
- dealer /dealer/assistant: Failed to load resource: the server responded with a status of 429 (Too Many Requests)
- dealer /dealer/automation/alerts: Failed to load resource: the server responded with a status of 429 (Too Many Requests) · Failed to load resource: the server responded with a status of 429 (Too Many Requests)
- dealer /dealer/automation/remedy: Failed to load resource: the server responded with a status of 429 (Too Many Requests)
- dealer /dealer/automation/replies: Failed to load resource: the server responded with a status of 429 (Too Many Requests)
- dealer /dealer/innovation: [next-auth][error][CLIENT_FETCH_ERROR] 
https://next-auth.js.org/errors#client_fetch_error Failed to fetch {error: Object, url: /api/auth/session, message: Failed to fetch}

### Başarısız istek

- admin /admin/ekip: net::ERR_BLOCKED_BY_ORB GET https://lh3.googleusercontent.com/a/ACg8ocJOfIjaWP6xQZQNP31fR42TfzLc53cPNmcklTnJy5AGBmdpBg=s96-c · net::ERR_BLOCKED_BY_ORB GET https://lh3.googleusercontent.com/a/ACg8ocKGrCOOkUtFyVHw89NmxZEvYTk3wHMRhdKlEaTcg2kz3uYZfA=s96-c (+3)
- admin /admin/roadmap: 404 GET http://localhost:3000/_next/static/chunks/components_team_initiatives_initiative-dialog_tsx_1c59fc3a._.js
- customer /customer/games: 429 POST http://localhost:3000/api/consent
- customer /customer/quests: 429 POST http://localhost:3000/api/consent
- customer /customer/squads: 429 POST http://localhost:3000/api/consent
- customer /customer/wallet/activity: 429 POST http://localhost:3000/api/consent
- customer /customer/wallet/donate: 429 POST http://localhost:3000/api/consent
- customer /customer/wallet/owned: 429 POST http://localhost:3000/api/consent
- dealer /dealer/assistant: 429 GET http://localhost:3000/api/dealer/notifications/stream
- dealer /dealer/automation/alerts: 429 GET http://localhost:3000/api/dealer/notifications/stream · 429 GET http://localhost:3000/api/dealer/notifications/stream
- dealer /dealer/automation/remedy: 429 GET http://localhost:3000/api/dealer/notifications/stream
- dealer /dealer/automation/replies: 429 GET http://localhost:3000/api/dealer/notifications/stream

### axe kritik + ciddi

- admin /admin/campaigns-calendar: scrollable-region-focusable[serious]×1 .overscroll-x-contain
- admin /admin/cards: target-size[serious]×20 li:nth-child(1) > article > .items-start.gap-3.flex > .pt-0\.5.z-raised.relative > .peer.h-\[1\.125rem\].w-\[1\.125rem\]
- admin /admin/economy: list[serious]×2 .px-card.py-4.sm\:py-5:nth-child(2) > ul
- admin /admin/games: color-contrast[serious]×1 .hover\:bg-primary\/90 > .ml-1.opacity-80.tabular-nums
- admin /admin/jobs: link-in-text-block[serious]×1 .underline-offset-4
- admin /admin/navigation: scrollable-region-focusable[serious]×1 .max-h-\[60vh\]
- admin /admin/referrals: select-name[critical]×1 select
- customer /customer: scrollable-region-focusable[serious]×1 .-mx-1
- customer /customer/games: scrollable-region-focusable[serious]×1 ol
- customer /customer/leaderboard: aria-prohibited-attr[serious]×1 .items-baseline
- customer /customer/wallet: color-contrast[serious]×2 .text-brand-text
- customer /customer/wallet/card: color-contrast[serious]×2 .text-brand-text
- public /guven: color-contrast[serious]×1 .flex-wrap.justify-between.mt-4 > .text-xs.text-fg-subtle

### Dokunma hedefi <44px

- admin /admin/badges: a "Etkin" 31x18 · a "Pasif" 31x18 · button "Bu sayfadaki tüm satırları seç" 18x18 (+25)
- admin /admin/campaigns-calendar: button "Geri git" 36x36 · button "İleri git" 36x36
- admin /admin/cards: a "Aktif" 29x18 · a "Bloklu" 38x18 · button "Bu sayfadaki tüm satırları seç" 18x18 (+20)
- admin /admin/coupons: button "TESTE2E1 kodunu kopyala" 36x36
- admin /admin/dealers-health: a "Kritik" 32x18 · a "Riskli" 33x18
- admin /admin/ekip: button "Önceki hafta" 36x36 · button "Sonraki hafta" 36x36 · button#radix-_r_32_ "deneme için işlemler" 36x36 (+10)
- admin /admin/games: button "Zihin Hırsızı seç" 16x16 · button "Gerçek mi Sahte mi seç" 16x16 · button "Bot Avcısı seç" 16x16 (+23)
- admin /admin/navigation: button "Bugün: yukarı taşı" 36x36 · button "Bugün: aşağı taşı" 36x36 · button "Analitik grubu: yukarı taşı" 36x36 (+57)
- admin /admin/observability: input "" 16x16
- admin /admin/rewards: a "Taslak" 40x18
- admin /admin/seo: input "" 1x1 · button "QR kod kaldır" 28x28 · button "geri bildirim kaldır" 28x28 (+4)
- admin /admin/squads: a "Klan" 27x18
- admin /admin/trust: button "Bu sayfadaki tüm satırları seç" 18x18 · button "Satırı seç: Kaba kuvvet girişi" 18x18
- customer /customer/scan: input "" 1x1
- customer /customer/wallet/donate: button "Su" 42x36
- dealer /dealer/automation/alerts: button "1,0" 43x36 · button "1,5" 43x36
- dealer /dealer/qr-codes: button "Bu sayfadakilerin hepsini seç" 16x16 · button "aa seç" 16x16 · button "Teras QR seç" 16x16 (+1)
- dealer /dealer/settings: input#dealer-logo-input "" 1x1
- public /auth/register: input "" 1x1

### Kontrast ihlali (AA)

- customer /customer/wallet: "Tüm hareketler" 4.46
- customer /customer/wallet/card: "Tüm hareketler" 4.46
- public /guven: "Bu kontrol, sayfayı açtığın an" 4.49

### Lighthouse oturum aktarımı

- /admin → http://localhost:3100/auth/login?callbackUrl=http%3A%2F%2Flocalhost%3A3100%2Fadmin

### Lighthouse performans (mobil)

- /: 68
- /customer/wallet/card (customer): 86
- /customer/games (customer): 79
- /dealer (dealer): 87

### Lighthouse SEO (public)

- /auth/login: 69
- /auth/register: 69
- /feedback/DEMO-CAFE-002: 92

### LCP (mobil)

- /: 7.07 sn

### CLS

- /: 0.135
- /auth/login: 0.135
- /auth/register: 0.135
- /neden-qratex: 0.137
- /guven: 0.135
- /blog: 0.135
- /feedback/DEMO-CAFE-002: 0.135
- /customer (customer): 0.135
- /customer/wallet/card (customer): 0.135
- /customer/games (customer): 0.135
- /dealer (dealer): 0.135

### npm audit (üretim) kritik

- @auth/core (<=0.41.2)
- @auth/prisma-adapter (<=2.11.2)
- next (9.3.4-canary.0 - 16.3.7)
- protobufjs (<=7.6.4 \|\| 8.0.0 - 8.6.5)
- özet: kritik 4, yüksek 49, orta 30, düşük 2 (yalnız üretim bağımlılıkları)

## Bilgi

### TBT (bilgi)

- /: 75 ms
- /auth/login: 40 ms
- /auth/register: 11 ms
- /neden-qratex: 79 ms
- /guven: 125 ms
- /blog: 56 ms
- /feedback/DEMO-CAFE-002: 9 ms
- /customer (customer): 93 ms
- /customer/wallet/card (customer): 369 ms
- /customer/games (customer): 612 ms
- /dealer (dealer): 315 ms
