# Runbook

Sık karşılaşılan senaryolar için adım adım çözüm rehberi.

## DB Down

1. Vercel/hosting loglarını kontrol et.
2. Prisma connection string doğruluğunu doğrula.
3. Database provider dashboard'dan health check yap.
4. Gerekirse `prisma db push` veya migration resolve.

## Inngest Durdu

1. Inngest Dashboard: https://app.inngest.com
2. Event log ve function run durumunu incele.
3. Rate limit veya hata nedeniyle durmuş olabilir.
4. `USE_INNGEST_QUEUE=true` env kontrol et.

## Rate Limit Aşımı

1. Sentry/Vercel loglarında 429 hatalarına bak.
2. Rate limit key (IP veya user) tespit et.
3. `lib/rate-limit.ts` ve `lib/ai-cost-guard.ts` limitleri gözden geçir.
4. Geçici olarak limit artırılabilir (gerekirse).

## Login 500

1. NextAuth config: `lib/auth.ts`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
2. Prisma Session/Account tabloları erişilebilir mi?
3. JWT strategy: `jti` ve token replay kontrolü aktif mi?
4. DB migration: SessionTokenUsage tablosu var mı?

## Admin Gizli Kapı — Break-glass (acil erişim)

Kapı (`/admin-gate`, "Boyutlar Arası Geçit") ADMIN rolüne ek olarak gizli tek rakamlı cevap ister ve
hem `/admin` sayfalarında (proxy) hem bütün `/api/admin/*` uçlarında (`requireAuth`) zorunludur.
Cevap `Settings.key = 'admin_gate'` satırında **özetli** saklanır
(`HMAC-SHA256(NEXTAUTH_SECRET, tuz + cevap)`); hiçbir uç cevabı döndürmez ve DB'den geri okunamaz.

Belirtiler ve anlamları:

| Belirti | Anlamı |
|---|---|
| Kapı ekranı "Geçit kilitlendi" diyor (HTTP 423) | 1 saatte 3 yanlış → 1 saat; 24 saatte 5 yanlış → 24 saat kilit. Diğer adminlere bildirim gitti, audit'te `ADMIN_GATE_LOCKED` var. |
| Kapı ekranı "şu anda doğrulanamıyor" diyor (HTTP 503) | DB'ye ulaşılamıyor ya da `admin_gate` satırı bozuk. Kapı bilerek **kapalı** kalır (fail-closed). |
| Bütün adminler doğru cevabı girdiği hâlde reddediliyor | `NEXTAUTH_SECRET` değişti: eski özet artık doğrulanamaz. Aşağıdaki "Cevabı sıfırla" adımı. |
| API'ler `403 ADMIN_GATE_REQUIRED` dönüyor | Kapı oturumu yok/süresi doldu (12 saat) ya da cevap değişti / "tüm kapı oturumlarını sonlandır" basıldı. Kapıdan yeniden geçin. |

### 1. Bir adminin kilidini kaldır (panel çalışıyorsa)

Başka bir admin: `/admin/gate-settings` → "Kilitli hesaplar" → **Kilidi kaldır**.
Kilit, `ADMIN_GATE_UNLOCKED` kaydından sonraki yanlışlarla yeniden hesaplanır.

### 2. Kimse panele giremiyorsa: kilidi SQL ile kaldır

Neon konsolu (proje sahibi, `DIRECT_URL`), önce yedek alındığını doğrulayın:

```sql
-- <ADMIN_USER_ID>: kilidi kaldırılacak yöneticinin User.id değeri
INSERT INTO "AuditLog" (id, "userId", "actorType", action, entity, "entityId", "createdAt")
VALUES (gen_random_uuid()::text, NULL, 'system', 'ADMIN_GATE_UNLOCKED', 'AdminGate', '<ADMIN_USER_ID>', now());
```

### 3. Cevap unutuldu / `NEXTAUTH_SECRET` döndürüldü: cevabı varsayılana sıfırla

```sql
-- Satır silinince kapı varsayılan soru + varsayılan cevaba döner
-- (ADMIN_GATE_DEFAULT_ANSWER ortam değişkeni tek rakamsa o, yoksa 7).
DELETE FROM "Settings" WHERE key = 'admin_gate';
INSERT INTO "AuditLog" (id, "userId", "actorType", action, entity, "createdAt", "newData")
VALUES (gen_random_uuid()::text, NULL, 'system', 'UPDATE_ADMIN_GATE', 'Settings', now(), '{"breakGlass": true}'::jsonb);
```

Ardından **hemen**: varsayılan cevapla kapıdan geçin → `/admin/gate-settings` (sayfada kırmızı
"Cevap hâlâ varsayılan" uyarısı görünür) → mevcut cevap + yeni cevap ile değiştirin. Yeni cevap
kaydedildiğinde `cfgVer` artar ve diğer bütün kapı oturumları düşer.

Notlar:

- Redis sıcak katmanı (`admin-gate:cfgver`) en geç 60 sn içinde DB'yi izler; SQL sonrası 1 dakika bekleyin.
- Satır silinince sürüm 0'a döner; 12 saatten eski çerezler zaten geçersizdir. Şüpheli durumda
  geçtikten sonra panelden **Tüm kapı oturumlarını sonlandır**'a basın.
- `NEXTAUTH_SECRET` döndürmek bütün NextAuth oturumlarını ve kapı çerezlerini de düşürür; cevap
  özetini yeniden üretmek için yukarıdaki sıfırlama gerekir.
- Kapı, rolü yanlışlıkla ADMIN yapılan hesaba karşı bir **bilgi faktörüdür**; tek rakam olduğu için
  asıl koruma kilit politikası + bildirimdir. Gerçek ikinci faktör (TOTP/passkey) F1.2'de gelecek.

## Oturum İptali (sessionVersion)

`requireAuth` her istekte DB'deki `User.sessionVersion`, `suspendedAt`, `anonymizedAt`, güncel rol ve
`DealerStaff.isActive` değerini kontrol eder (Redis `ss:v1:<userId>` 60 sn). Bir kullanıcının bütün
oturumlarını hemen düşürmek için kodda `bumpSessionVersion(userId)` (`lib/auth/session-version.ts`; ardından `invalidateSessionState(userId)` — `lib/auth/session-state.ts`),
acil durumda SQL:

```sql
UPDATE "User" SET "sessionVersion" = "sessionVersion" + 1 WHERE id = '<USER_ID>';
```

(Redis kaydı en geç 60 sn içinde yenilenir; kullanıcı yeniden giriş yapmak zorunda kalır.)
