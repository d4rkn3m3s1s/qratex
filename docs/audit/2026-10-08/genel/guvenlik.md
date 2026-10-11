# Genel denetim — güvenlik (2026-10-12)

Dal `feat/platform-overhaul`. Ağırlık statik tarama + jest/tsc; canlı örnekleme yalnız GET (başka bayinin kaynağına yazma denemesi yapılmadı).

## 1. Bağımlılıklar (npm audit, yalnız üretim)

| Önce | Sonra |
|---|---|
| 4 kritik (next, @auth/core, @auth/prisma-adapter, protobufjs) | **0 kritik** (2 düşük, 41 orta, 35 yüksek) |

- `next` ^16.0.0 → **^16.3.8** (16.4.0 kuruldu): 35 danışma (RCE: Windows/AVIF görüntü optimizasyonu, proxy atlatma, SSRF, önbellek zehirlenmesi, CSP-nonce XSS).
- `@auth/prisma-adapter` → **^2.11.3** (@auth/core 0.41.3: homoglif e-posta, OAuth state çerez bağlama).
- `protobufjs` override **^8.6.6** (inngest → OpenTelemetry zinciri; kod enjeksiyonu/DoS).
- Kalan yüksekler: `next-pwa` zinciri (workbox/rollup/serialize-javascript — yalnız build zamanı, düzeltme major/terk edilmiş paket), `@sentry/nextjs` 10.53↑, `mailparser`, `nodemailer` ≤10.0.5, `sharp`, OpenTelemetry. Bunlar major yükseltme/kırılma riski taşıdığı için ayrı iş.
- tsc: `.next/` dışında 0 hata. `.next/types` eski build'den bayat (`PrefetchForTypeCheckInternal`) — bir sonraki `next build`/dev yeniden başlatmada yeniden üretilir.
- `prisma generate` postinstall çalışan dev sunucusunun DLL kilidi yüzünden EPERM verdi; şema değişmediği için `generated-prisma-client` geçerli (sorgu doğrulandı).

## 2. HTTP güvenlik başlıkları (curl ile doğrulandı)

Mevcut: HSTS (2 yıl, preload), X-Frame-Options DENY + `frame-ancestors 'none'`, nosniff, Referrer-Policy, Permissions-Policy, COOP same-origin, CSP + Report-Only.

Düzeltme: uygulanan CSP'de `'unsafe-eval'` **yalnız geliştirmede**; üretimde `'wasm-unsafe-eval'` (Tesseract). Kanıt: üretim paketinde (`.next/static/chunks`, 348 dosya) `eval(` / `new Function(` yok. Test: `__tests__/config/security-headers-csp-eval.test.ts`.

Kalan: `'unsafe-inline'` (nonce her sayfayı dinamik yapar, statik/ISR kaybı — bilinçli). CORP eklenmedi: e-posta logosu/açılma pikseli başka origin'lerce gömülüyor; global `same-origin` bunları kırar.

## 3. Yetki matrisi

- Mevcut `api-architecture.test.ts` (758 route: kimlik yolu, zod gövde B6, oran sınırı B7) yeşil.
- Yeni `__tests__/security/role-segment-matrix.test.ts`: `admin/**` yalnız ADMIN, `dealer/**` ve `staff/**` CUSTOMER/'public' bildiremez, `customer/**` 'public' yalnız gerekçeli listede (2 A/B ucu). İhlal: 0.
- Canlı örnekleme (localhost:3000):

| Kimlik | Uç | Sonuç |
|---|---|---|
| customer | /api/admin/users, /api/admin/settings | 403 |
| customer | /api/dealer/campaigns, /api/dealer/qr-codes/{B bayisi} | 403 |
| dealer | /api/admin/users, /api/admin/settings | 403 |
| dealer A | GET /api/dealer/qr-codes/{bayi B QR id, DB'den} | 404 (sızıntı yok) |
| oturumsuz | /api/dealer/campaigns | 401 |

## 4. Girdi / yükleme / SSRF / XSS / SQL / sır / log

- **Yükleme** (5 uç): hepsinde boyut sınırı, magic-byte veya yeniden kodlama (sharp, EXIF atılır), SVG'de script taraması; R2 anahtarları `randomBytes(18)` (tahmin edilemez). Not: boyut denetimi `formData()` gövdeyi tamponladıktan sonra — platform gövde sınırına güveniliyor.
- **SSRF**: sunucu `fetch`'leri sabit host / env URL / `safe-webhook-post` + `url-safety`; SEO denetimi kendi host listesine sınırlı, `redirect: 'manual'`.
- **Açık yönlendirme**: callbackUrl/next tümü `sanitizeCallbackPath` / `resolvePostLoginTarget` / NextAuth `redirect` geri çağrısından geçiyor.
- **XSS**: 11 `dangerouslySetInnerHTML`; JSON-LD'lerin ikisi (`components/seo/breadcrumb-json-ld.tsx`, `webpage-json-ld.tsx`) çıplak `JSON.stringify` kullanıyordu (`</script>` kaçışı yok) → `jsonLdHtml`'e geçirildi. Diğerleri sabit içerik ya da kaçışlı serializer.
- **SQL**: `$queryRawUnsafe` yok; tek `$executeRawUnsafe` sabit SAVEPOINT adı (`lib/moments/server.ts`).
- **Sırlar**: `'use client'` dosyalarında NEXT_PUBLIC_ olmayan env okuması yok; build çıktısında anahtar/bağlantı dizesi deseni yok; NEXT_PUBLIC_ sır benzeri yalnız VAPID public key.
- **Log PII**: e-posta loglayan tek yer `lib/auth.ts` signIn/signOut olayı ve yalnız development.
