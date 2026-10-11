# Genel denetim — admin-ayarlar

Tarih: 2026-10-12 · Dal: feat/platform-overhaul

## Kapsam
`/admin/settings` (genel · kimlik · güvenlik ve kapı · bakım · erişim · geçmiş), `/admin/gate-settings`; eski `/admin/ai-settings`, `/admin/gamification-settings`, `/admin/league-settings` artık kalıcı yönlendirme (AI Stüdyo / Ekonomi Stüdyosu) — kendi sahipleri ayrı denetlenir. SEO, navigasyon, özellikler kendi sunucu-sayfalarına sahip (kendi alanları).

## Bulgular ve kanıt

| # | Ayar | (a) DB yazımı | (b) Tüketici (grep) | (c) Davranış | Not |
|---|---|---|---|---|---|
| 1 | backgroundEffect | Settings, sürümlü | lib/get-background-effect.ts | jest (okuyucu testi) | canlı değer `starfield` |
| 2 | platform_registration_open | Settings, sürümlü + onay | app/api/auth/register/route.ts:54, lib/auth.ts:386, p-auth/server-data.ts | jest | satır yok → varsayılan açık |
| 3 | platform_google_auth | aynı | lib/auth.ts, p-auth/server-data.ts | jest | |
| 4 | enableMagicLink | aynı | app/api/auth/magic-link/route.ts:43, server-data.ts:46 | jest | canlı `false` |
| 5 | platform_maintenance | Settings + Redis yayını | proxy.ts, maintenance-edge.ts (message/plannedEndAt), app/bakim | jest (503, ADMIN muaf) | Redis yoksa açılamaz |
| 6 | featureVisibility / menuVisibility | access ucu, sürümlü | lib/module-gate.ts, lib/navigation/* | mevcut | |

- (d) C2/409: `platform-settings.test.ts` (okuma hatası FIRLATIR, bayat sürüm 409, sürümsüz 428) + `__tests__/api/settings-load-error-overwrite.test.ts` + `settings-dedicated-keys.test.ts` → 47/47 yeşil. İstemci `QueryState` hata durumunda formu hiç render etmez (kilit).
- Kayıt defteri ilkesi zaten testle zorlanıyor: okuyucusu olmayan anahtar deftere giremez (`platform-settings.test.ts` “her anahtarın okuyucusu var”).
- (c) canlı değiştir-gözle-geri al YAPILMADI: DATABASE_URL canlı Neon → backgroundEffect/magicLink değişikliği üretim ana sayfa/girişini anında etkiler. Davranış birim testlerle kanıtlandı.

### DB'de okuyucusuz eski satırlar (salt okuma, 49 satır)
`adminBackgroundEffect, ai_config, avatar_options, defaultTheme, emailFrom, enableGoogleAuth, enableRegistration, faviconUrl, footer_config, gamification_config, header_config, levelUpThreshold, logoUrl, maintenanceMode, openaiModel, pointsPerFeedback, pointsPerReferral, primaryColor, siteDescription, site_description, site_name, smtpHost, smtpPort` — kodda referans yok, hiçbir ekran yazmıyor/göstermiyor. Arayüzden zaten kaldırılmışlar; satırlar silinmedi (yasak kapsamı dışında, sahip kararı).

**Güvenlik notu:** `openaiApiKey` satırı DB'de hâlâ duruyor (genel uçtan gizli, `RETIRED_SECRET_SETTING_KEYS`). Değer içeriği bilinçli olarak okunmadı. Öneri: anahtarı OpenAI tarafında iptal/rotasyon + satırı sil.

## Düzeltmeler (bu tur)
1. **Bölüm değişince taslak sessizce kayboluyordu** (DirtyBar yalnız `beforeunload` yakalar). `SettingsDirtyContext` + `useReportDirty`: kimlik ve bakım bölümleri kirli durumunu bildirir, merkez bölüm değişiminde onay ister. (`shared.tsx`, `settings-center.tsx`, `section-identity.tsx`, `section-maintenance.tsx`)
2. **Varsayılana dön**: kimlik kartı (taslağa uygular, kaydetmeden etkisiz, riskli kısıtlama onayı korunur) ve arka plan kartı (`original`); varsayılanlar kayıt defterinden okunur, ikinci kaynak yok. (`section-identity.tsx`, `section-general.tsx`)
3. Test: `__tests__/admin/a-ayarlar-kapi/settings-ux-guard.test.ts`.

## Kalan
- Eski okuyucusuz satırların temizliği + `openaiApiKey` rotasyonu (sahip kararı).
- `section-security.tsx` başka bir ajanın açık değişikliği olduğu için dokunulmadı.
- Tarayıcıyla görsel doğrulama yapılmadı (sunucu yükü); tsc + jest ile ilerlendi.
