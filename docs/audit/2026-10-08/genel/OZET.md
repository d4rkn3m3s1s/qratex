# Genel denetim — özet (2026-10-12)

Altı alan raporu birleştirildi: [seo](seo.md), [guvenlik](guvenlik.md), [temalar](temalar.md), [admin-ayarlar](admin-ayarlar.md), [db-performans](db-performans.md), [i18n-icerik](i18n-icerik.md). Denetim çoğunlukla kod okuma ve tsc/jest ile yapıldı; hiçbir alanda tarayıcıda uçtan uca doğrulama yapılmadı. Canlı Neon DB'de ayar değiştirilmedi.

| Alan | Bulunan | Düzeltilen | Kalan | Doğrulama |
|---|---|---|---|---|
| SEO | 2 | 2 (67f57443) | JSON-LD/hreflang/görsel alt taraması, canlı robots listesi | tsc 0, 2 suite/20 test |
| Güvenlik | 4 kritik dep + 2 XSS + CSP eval | hepsi (70e7f7ed, 6841bea4) | 35 yüksek + 41 orta dep (major), `unsafe-inline` | ilgili 3 suite; tüm jest yok |
| Temalar | 2 | 2 (408c8fac) | yıldız alanı rengi anlık güncellenmiyor | yalnız tsc; test/tarayıcı yok |
| Admin ayarları | 2 UX eksiği + 49 okuyucusuz DB satırı | 2 UX (b4fe643e) | eski satır temizliği, `openaiApiKey` | mevcut 47 test + yeni test |
| DB/performans | eksik index yok; 1 düzeltme | 1 | Stripe tx kilidi, 2 cron N+1, points-matrix cache | yalnız tsc; jest/E2E yok |
| i18n | 1 gerçek ASCII hatası; 1102 sabit TR satırı | 1 (558fbbb0) | venue-quiz, admin JSX, terim tutarlılığı | tsc 0; jest/tarayıcı yok |

## Alan alan

- **SEO:** Panel layout'larına (admin/dealer/customer/staff) noindex eklendi; varsayılan robots listesine `/staff/` ve `/api/` eklendi, robots.ts ile /admin/seo artık tek kaynak. `/admin-gate` gizli kapıyı açığa vurmamak için bilerek eklenmedi. Sitemap, meta, noindex sayfalar temiz.
- **Güvenlik:** `next` 16.4.0, `@auth/prisma-adapter` 2.11.3, `protobufjs` override → kritik 0. İki JSON-LD bileşeni kaçışlı serializer'a geçti. Üretim CSP'sinde `unsafe-eval` yok (yalnız `wasm-unsafe-eval`). Yetki matrisi testi eklendi, ihlal yok. CORP bilinçli eklenmedi (mail logosu/pikseli).
- **Temalar:** Yıldız alanı izi `--primary`'yi izliyor; admin'e kişisel erişilebilirlik ayarı eklendi. Tema SSR/istemci devri, erişilebilirlik modları, azaltılmış hareket sağlam.
- **Admin ayarları:** 5 platform ayarının hepsinin gerçek okuyucusu var; 409/428 ve yükleme-hatası kilidi testli. Bölüm değişiminde taslak kaybı uyarısı ve "varsayılana dön" eklendi.
- **DB/performans:** Havuz 5 bağlantı (ölçüldü), `connection_limit=1` tuzağı yok. P2028 kök nedeni yerel gidiş-dönüş + çok ajanlı yük; `maxWait` 10 sn zaten var. Yerel süreler prod değil.
- **i18n:** tr/en anahtar farkı 0; tarama betiği `scripts/audit/i18n-scan.mjs`. "Basarili:" → "Başarılı:" düzeltildi.

## Proje sahibinin yapması / karar vermesi gerekenler

1. **`openaiApiKey` rotasyonu (öncelikli):** Eski anahtar DB'de satır olarak duruyor (genel uçtan gizli). OpenAI panelinden iptal/yenile, sonra satırı sil.
2. **49 okuyucusuz eski ayar satırı** (siteName, smtpHost vb.): silinsin mi? Ürün/veri kararı.
3. **Canlı robots listesi:** /admin/seo'da özel liste kayıtlıysa `/staff/` ve `/api/` elle eklenmeli.
4. **Dev sunucusunu yeniden başlat:** next 16.4 ancak o zaman yüklenir; `prisma generate` kilit yüzünden atlandı, yeniden çalıştır. Bayat `.next/types` ~1000 tsc hatası build'de kendiliğinden gider.
5. **Kalan bağımlılık açıkları** (next-pwa zinciri, sentry, nodemailer, mailparser, sharp, OTel): major yükseltme ayrı iş olarak planlanmalı.
6. **Admin paneli dili:** Admin yalnız TR mi kalacak? Değilse alan başına `copy.ts` göçü gerekir.
7. **venue-quiz oyunu** EN modunda Türkçe görünüyor; copy.ts'e taşınmalı (müşteri yüzü).
8. İsteğe bağlı: Stripe checkout kilidinin tx dışına alınması, points-matrix cache'in tag'li cache'e taşınması.

## Dürüstlük notu
Tema, DB ve i18n düzeltmeleri hiçbir testten geçmedi (yalnız tsc). Tüm jest suite'i bu turda çalıştırılmadı; 2 suite önceden kırık. Ekranda görsel doğrulama yapılmadı.
