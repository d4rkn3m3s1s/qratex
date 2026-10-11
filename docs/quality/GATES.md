# Kalite kapıları

Üretim: `node scripts/quality-gates.mjs` · 2026-10-11 19:30 UTC · commit `0de8aadb`

**Özet:** 5 YEŞİL · 12 KIRMIZI · 1 bilgi/atlandı

Ortam: e2e/tarama `next dev` (localhost:3000, Pixel 7 profili, 4 rol); Lighthouse üretim derlemesi
(`NEXT_DIST_DIR=.next-gates`, `next start -p 3100`, mobil profil). DB yazan akışlar bu turda koşmaz
(`E2E_WRITE=1 npx playwright test --project=gates e2e/gates/flows.spec.ts`).

| Kapı | Hedef | Ölçülen | Durum |
| --- | --- | --- | --- |
| TypeScript (tsc) | 0 hata | 0 hata | **YEŞİL** |
| Jest birim/entegrasyon | %100 geçer | %100.00 (5065/5065; 0 suite kırık) | **YEŞİL** |
| E2E (Playwright, salt-okur) | %100 geçer | %80.8 (80/99; 6 atlandı — DB yazan akışlar E2E_WRITE=1 ister) | **KIRMIZI** |
| Konsol hatası | 0 | 19 (17/95 rota) | **KIRMIZI** |
| Başarısız istek | 0 | 29 (14/95 rota) | **KIRMIZI** |
| axe kritik + ciddi | 0 | 19 (16/95 rota) | **KIRMIZI** |
| Yatay taşma (412px) | 0 rota | 0 rota | **YEŞİL** |
| Dokunma hedefi <44px | 0 | 223 (25/95 rota) | **KIRMIZI** |
| Kontrast ihlali (AA) | 0 | 3 (3/95 rota) | **KIRMIZI** |
| Lighthouse performans (mobil) | ≥90 (her rota) | en düşük 76; 12/12 rota altında | **KIRMIZI** |
| Lighthouse erişilebilirlik | ≥95 (her rota) | en düşük 93; 1/12 rota altında | **KIRMIZI** |
| Lighthouse en iyi uygulamalar | ≥95 (her rota) | en düşük 96; 0/12 rota altında | **YEŞİL** |
| Lighthouse SEO (public) | ≥95 (her rota) | en düşük 69; 3/7 rota altında | **KIRMIZI** |
| LCP (mobil) | <2.5 sn | en kötü 6.56 sn | **KIRMIZI** |
| CLS | <0.1 | en kötü 0.003 | **YEŞİL** |
| TBT (bilgi) | raporlanır (<200 ms iyi) | en kötü 72 ms | **BİLGİ** |
| /feedback/[code] JS (sıkıştırılmış) | ≤150 KB | 523 KB | **KIRMIZI** |
| npm audit (üretim) kritik | 0 | 4 | **KIRMIZI** |

## Lighthouse (mobil, üretim derlemesi)

> Not: bu turda oturumlu 5 rota (/customer, /customer/wallet/card, /customer/games, /dealer, /admin) 3100 portunda oturumu taşıyamadı ve `/auth/login`'e yönlendi (callbackUrl `NEXTAUTH_URL`=3000'e işaret ediyor); bu satırlar giriş ekranını ölçer. Betik artık bu durumu ayrı "oturum aktarımı" kapısı olarak raporlayıp skorlardan çıkarıyor; yukarıdaki skor kapıları bu turda o satırlarla hesaplandı (giriş ekranı skorları public /auth/login ile aynı aralıkta).

| Rota | Perf | A11y | BP | SEO | LCP sn | CLS | TBT ms | JS KB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| / | 76 | 100 | 96 | 100 | 6.52 | 0.000 | 35 | 535 |
| /auth/login | 80 | 100 | 96 | 69 | 5.32 | 0.000 | 0 | 534 |
| /auth/register | 78 | 100 | 96 | 69 | 5.80 | 0.000 | 1 | 551 |
| /neden-qratex | 76 | 93 | 96 | 100 | 5.72 | 0.003 | 69 | 523 |
| /guven | 77 | 96 | 96 | 100 | 5.58 | 0.000 | 72 | 519 |
| /blog | 79 | 99 | 96 | 100 | 5.12 | 0.000 | 46 | 526 |
| /feedback/DEMO-CAFE-002 | 78 | 100 | 96 | 92 | 5.33 | 0.000 | 7 | 523 |
| /customer (customer) | 80 | 100 | 96 | 69 | 5.11 | 0.000 | 1 | 534 |
| /customer/wallet/card (customer) | 76 | 100 | 96 | 69 | 5.58 | 0.000 | 6 | 534 |
| /customer/games (customer) | 76 | 100 | 96 | 69 | 6.56 | 0.000 | 8 | 534 |
| /dealer (dealer) | 78 | 100 | 96 | 69 | 5.58 | 0.000 | 12 | 534 |
| /admin (admin) | 76 | 100 | 96 | 69 | 6.10 | 0.000 | 3 | 534 |

## Kırmızı kapıların ayrıntısı

### E2E (Playwright, salt-okur)

- public / — Error: / konsol hataları
- customer /customer/me/badges — Error: /customer/me/badges konsol hataları
- customer /customer/me/invite — Error: /customer/me/invite konsol hataları
- customer /customer/me/progress — Error: /customer/me/progress konsol hataları
- customer /customer/me/year — Error: /customer/me/year konsol hataları
- customer /customer/wallet — Error: /customer/wallet konsol hataları
- customer /customer/wallet/card — Error: /customer/wallet/card konsol hataları
- dealer /dealer/consumptions — Error: /dealer/consumptions konsol hataları
- dealer /dealer/customers — Error: /dealer/customers konsol hataları
- dealer /dealer/products — Error: /dealer/products konsol hataları
- dealer /dealer/analytics/heatmap — Error: /dealer/analytics/heatmap konsol hataları
- dealer /dealer/analytics/impact — Error: /dealer/analytics/impact konsol hataları
- dealer /dealer/analytics/insights — Error: /dealer/analytics/insights konsol hataları
- dealer /dealer/innovation — Error: /dealer/innovation konsol hataları
- dealer /dealer/team — Error: /dealer/team konsol hataları
- dealer /dealer/settings — Error: /dealer/settings konsol hataları
- admin /admin/users — Error: /admin/users başarısız istekler
- admin /admin/ekip — Error: /admin/ekip başarısız istekler
- admin /admin/roadmap — Error: /admin/roadmap konsol hataları

### Konsol hatası

- admin /admin/roadmap: Failed to load resource: the server responded with a status of 404 (Not Found)
- customer /customer/me/badges: Failed to load resource: the server responded with a status of 429 (Too Many Requests)
- customer /customer/me/invite: Failed to load resource: the server responded with a status of 429 (Too Many Requests)
- customer /customer/me/progress: Failed to load resource: the server responded with a status of 429 (Too Many Requests)
- customer /customer/me/year: pageerror: Switched to client rendering because the server rendering errored:

[next-auth]: `useSession` must be wrapped in a <SessionProvider />
- customer /customer/wallet: [next-auth][error][CLIENT_FETCH_ERROR] 
https://next-auth.js.org/errors#client_fetch_error Failed to fetch {error: Object, url: /api/auth/session, message: Failed to fetch}
- customer /customer/wallet/card: pageerror: Switched to client rendering because the server rendering errored:

[next-auth]: `useSession` must be wrapped in a <SessionProvider />
- dealer /dealer/analytics/heatmap: Failed to load resource: the server responded with a status of 429 (Too Many Requests)
- dealer /dealer/analytics/impact: Failed to load resource: the server responded with a status of 429 (Too Many Requests)
- dealer /dealer/analytics/insights: Failed to load resource: the server responded with a status of 429 (Too Many Requests)
- dealer /dealer/consumptions: Failed to load resource: the server responded with a status of 429 (Too Many Requests)
- dealer /dealer/customers: Failed to load resource: the server responded with a status of 429 (Too Many Requests) · Failed to load resource: the server responded with a status of 429 (Too Many Requests)
- dealer /dealer/innovation: [next-auth][error][CLIENT_FETCH_ERROR] 
https://next-auth.js.org/errors#client_fetch_error Failed to fetch {error: Object, url: /api/auth/session, message: Failed to fetch} · Failed to load theme: TypeError: Failed to fetch
    at loadThemeSettings (http://localhost:3000/_next/static/chunks/_32076b98._.js:8037:31)
    at ThemeColorsProvider.useEffect (http://localhost:3000/_next/static/chunks/_32076b98._.js:8055:18)
    at Object.react_stack_bottom_frame (http://localhos
- dealer /dealer/products: Failed to load resource: the server responded with a status of 429 (Too Many Requests)
- dealer /dealer/settings: Failed to load resource: the server responded with a status of 429 (Too Many Requests)
- dealer /dealer/team: Failed to load resource: the server responded with a status of 429 (Too Many Requests)
- public /: pageerror: Switched to client rendering because the server rendering errored:

[next-auth]: `useSession` must be wrapped in a <SessionProvider />

### Başarısız istek

- admin /admin/ekip: net::ERR_BLOCKED_BY_ORB GET https://lh3.googleusercontent.com/a/ACg8ocKGrCOOkUtFyVHw89NmxZEvYTk3wHMRhdKlEaTcg2kz3uYZfA=s96-c · net::ERR_BLOCKED_BY_ORB GET https://lh3.googleusercontent.com/a/ACg8ocJ5yTBmmx5jvFvqgwo8SO-wRU2680OdSwWOcS6sTNars9H1I53e=s96-c (+3)
- admin /admin/roadmap: 404 GET http://localhost:3000/_next/static/chunks/components_team_initiatives_initiative-dialog_tsx_6829ae64._.js
- admin /admin/users: net::ERR_BLOCKED_BY_ORB GET https://lh3.googleusercontent.com/a/ACg8ocJYwwrOofCz1ovVPk_FHyLPGAA1nx13mX283dM682eB3e94KQ=s96-c · net::ERR_BLOCKED_BY_ORB GET https://lh3.googleusercontent.com/a/ACg8ocIRER5O9VsbxVSeKCxsKGve9YKecNpctoqviLOFU5MureqBAA=s96-c (+8)
- customer /customer/me/badges: 429 POST http://localhost:3000/api/consent
- customer /customer/me/invite: 429 POST http://localhost:3000/api/consent
- customer /customer/me/progress: 429 POST http://localhost:3000/api/consent
- dealer /dealer/analytics/heatmap: 429 GET http://localhost:3000/api/dealer/notifications/stream
- dealer /dealer/analytics/impact: 429 GET http://localhost:3000/api/dealer/notifications/stream
- dealer /dealer/analytics/insights: 429 GET http://localhost:3000/api/dealer/notifications/stream
- dealer /dealer/consumptions: 429 GET http://localhost:3000/api/dealer/notifications/stream
- dealer /dealer/customers: 429 GET http://localhost:3000/api/dealer/notifications/stream · net::ERR_BLOCKED_BY_ORB GET https://lh3.googleusercontent.com/a/ACg8ocJXhZLg0fcJNQ8cm191tVbSItMzmwjl9BdNW7ClwucFsbDMrAOP7A=s96-c (+1)
- dealer /dealer/products: 429 GET http://localhost:3000/api/dealer/notifications/stream
- dealer /dealer/settings: 429 GET http://localhost:3000/api/dealer/notifications/stream
- dealer /dealer/team: 429 GET http://localhost:3000/api/dealer/notifications/stream

### axe kritik + ciddi

- admin /admin/campaigns-calendar: scrollable-region-focusable[serious]×1 .overscroll-x-contain
- admin /admin/cards: target-size[serious]×20 li:nth-child(1) > article > .items-start.gap-3.flex > .pt-0\.5.z-raised.relative > .peer.h-\[1\.125rem\].w-\[1\.125rem\]
- admin /admin/economy: list[serious]×2 .px-card.py-4.sm\:py-5:nth-child(2) > ul
- admin /admin/games: color-contrast[serious]×1 .hover\:bg-primary\/90 > .ml-1.opacity-80.tabular-nums
- admin /admin/jobs: link-in-text-block[serious]×1 .underline-offset-4
- admin /admin/navigation: scrollable-region-focusable[serious]×1 .max-h-\[60vh\]
- admin /admin/referrals: select-name[critical]×1 select
- admin /admin/users: nested-interactive[serious]×20 li:nth-child(1) > article > .items-start.gap-3.flex > .flex-1 > .qx-body.after\:absolute.after\:inset-0 · target-size[serious]×20 li:nth-child(1) > article > .items-start.gap-3.flex > .flex-1 > .qx-body.after\:absolute.after\:inset-0 > .gap-3.flex.items-center > div > .underline-offset-4.hover\:underline.focus-visible\:underline
- customer /customer: scrollable-region-focusable[serious]×1 .-mx-1
- customer /customer/games: color-contrast[serious]×1 span[aria-label="Yenilenmeye 1 saat 44 dakika"] > .opacity-90.font-medium[aria-hidden="true"] · scrollable-region-focusable[serious]×1 ol
- customer /customer/leaderboard: aria-prohibited-attr[serious]×1 .items-baseline
- customer /customer/quests: color-contrast[serious]×1 span[aria-label="Hafta sonuna 1 saat 44 dakika"] > .opacity-90.font-medium[aria-hidden="true"]
- customer /customer/wallet: color-contrast[serious]×2 .text-brand-text
- customer /customer/wallet/card: color-contrast[serious]×2 .text-brand-text
- public /guven: color-contrast[serious]×1 .flex-wrap.justify-between.mt-4 > .text-xs.text-fg-subtle
- public /neden-qratex: definition-list[serious]×7 .p-4.bg-surface-1\/90.rounded-card:nth-child(1) > dl · dlitem[serious]×28 .p-4.bg-surface-1\/90.rounded-card:nth-child(1) > dl > .items-start.gap-2\.5.flex:nth-child(1) > div > dt

### Dokunma hedefi <44px

- admin /admin/badges: a "Etkin" 31x18 · a "Pasif" 31x18 · button "Bu sayfadaki tüm satırları seç" 18x18 (+25)
- admin /admin/campaigns-calendar: button "Geri git" 36x36 · button "İleri git" 36x36
- admin /admin/cards: a "Aktif" 29x18 · a "Bloklu" 38x18 · button "Bu sayfadaki tüm satırları seç" 18x18 (+20)
- admin /admin/coupons: button "TESTE2E1 kodunu kopyala" 36x36
- admin /admin/dealers-health: a "Kritik" 32x18 · a "Riskli" 33x18
- admin /admin/ekip: button "Önceki hafta" 36x36 · button "Sonraki hafta" 36x36 · button#radix-_r_32_ "deneme için işlemler" 36x36 (+10)
- admin /admin/feedbacks: button "Bu sayfadaki tüm satırları seç" 18x18 · button "Satırı seç: Furkan Ulutaş, Dem" 18x18 · button "Satırı seç: Demo Customer, Dem" 18x18
- admin /admin/games: button "Zihin Hırsızı seç" 16x16 · button "Gerçek mi Sahte mi seç" 16x16 · button "Bot Avcısı seç" 16x16 (+23)
- admin /admin/navigation: button "Bugün: yukarı taşı" 36x36 · button "Bugün: aşağı taşı" 36x36 · button "Analitik grubu: yukarı taşı" 36x36 (+57)
- admin /admin/observability: input "" 16x16
- admin /admin/rewards: a "Taslak" 40x18
- admin /admin/seo: input "" 1x1 · button "QR kod kaldır" 28x28 · button "geri bildirim kaldır" 28x28 (+4)
- admin /admin/squads: a "Klan" 27x18
- admin /admin/trust: button "Bu sayfadaki tüm satırları seç" 18x18 · button "Satırı seç: Kaba kuvvet girişi" 18x18
- admin /admin/users: a "Askıda" 42x18 · button "Bu sayfadaki tüm satırları seç" 18x18 · button "Satırı seç: [TEST] Açık Müşter" 18x18 (+17)
- customer /customer/scan: input "" 1x1
- customer /customer/wallet/donate: button "Su" 42x36
- dealer /dealer/automation/alerts: button "1,0" 43x36 · button "1,5" 43x36
- dealer /dealer/campaigns: button#radix-_r_g_ "Kampanya işlemleri: [TEST] e2e" 36x36
- dealer /dealer/customers: a "Riskli" 33x18 · button "Bu sayfadaki tüm satırları seç" 18x18 · button "Satırı seç: Demo Customer" 18x18 (+4)
- dealer /dealer/inbox: button "Görünen tüm kayıtları seç" 18x18 · button "Demo Customer kaydını seç" 18x18 · button "Anonim müşteri kaydını seç" 18x18 (+1)
- dealer /dealer/products: button "[TEST] CSV Çay ürününü seç" 18x18 · button "Americano ürününü seç" 18x18 · button "Brownie ürününü seç" 18x18 (+8)
- dealer /dealer/qr-codes: button "Bu sayfadakilerin hepsini seç" 16x16 · button "aa seç" 16x16 · button "Teras QR seç" 16x16 (+1)
- dealer /dealer/settings: input#dealer-logo-input "" 1x1
- public /auth/register: input "" 1x1

### Kontrast ihlali (AA)

- customer /customer/wallet: "Tüm hareketler" 4.46
- customer /customer/wallet/card: "Tüm hareketler" 4.46
- public /guven: "Bu kontrol, sayfayı açtığın an" 4.49

### Lighthouse performans (mobil)

- /: 76
- /auth/login: 80
- /auth/register: 78
- /neden-qratex: 76
- /guven: 77
- /blog: 79
- /feedback/DEMO-CAFE-002: 78
- /customer (customer): 80
- /customer/wallet/card (customer): 76
- /customer/games (customer): 76
- /dealer (dealer): 78
- /admin (admin): 76

### Lighthouse erişilebilirlik

- /neden-qratex: 93

### Lighthouse SEO (public)

- /auth/login: 69
- /auth/register: 69
- /feedback/DEMO-CAFE-002: 92

### LCP (mobil)

- /: 6.52 sn
- /auth/login: 5.32 sn
- /auth/register: 5.80 sn
- /neden-qratex: 5.72 sn
- /guven: 5.58 sn
- /blog: 5.12 sn
- /feedback/DEMO-CAFE-002: 5.33 sn
- /customer (customer): 5.11 sn
- /customer/wallet/card (customer): 5.58 sn
- /customer/games (customer): 6.56 sn
- /dealer (dealer): 5.58 sn
- /admin (admin): 6.10 sn

### npm audit (üretim) kritik

- @auth/core (<=0.41.2)
- @auth/prisma-adapter (<=2.11.2)
- next (9.3.4-canary.0 - 16.3.7)
- protobufjs (<=7.6.4 \|\| 8.0.0 - 8.6.5)
- özet: kritik 4, yüksek 49, orta 30, düşük 2 (yalnız üretim bağımlılıkları)

## Bilgi

### TBT (bilgi)

- /: 35 ms
- /auth/login: 0 ms
- /auth/register: 1 ms
- /neden-qratex: 69 ms
- /guven: 72 ms
- /blog: 46 ms
- /feedback/DEMO-CAFE-002: 7 ms
- /customer (customer): 1 ms
- /customer/wallet/card (customer): 6 ms
- /customer/games (customer): 8 ms
- /dealer (dealer): 12 ms
- /admin (admin): 3 ms
