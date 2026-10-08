# Güvenlik Denetimi — Admin API, Cron, Auth, Proxy, Gizli Kapı, Yükleme, SSRF/XSS

**Boyut:** `guvenlik-admin-api` · **Tarih:** 2026-10-08 · **Dal:** `feat/moment-engine` · **Yöntem:** salt okunur kod incelemesi (hiçbir komut, test, build, DB işlemi çalıştırılmadı)

---

## 1. Özet

**Puan: 5.5 / 10**

Qratex'in "dış kabuğu" sağlam: cron uçları fail-closed ve sabit-zamanlı Bearer doğrulaması yapıyor, Stripe webhook imzası doğrulanıyor, iç Inngest işleri Bearer ile korunuyor, şifre sıfırlama / magic-link / 2FA kurtarma kodları / partner API anahtarları **hash'lenerek** saklanıyor, kullanıcı sayımı (enumeration) bilinçli olarak engellenmiş, ham SQL'in tamamı parametreli `$queryRaw` şablonuyla yazılmış (`Unsafe` varyantı yok), gelen kutusu HTML'i `sandbox` + katı CSP'li iframe'de render ediliyor, görev ekleri magic-byte ile doğrulanıyor.

Buna karşılık **"içeride" olanlara karşı katman zayıf**. En kritik dört nokta:

1. **Admin gizli kapı (gate) fiilen dekoratif.** Proxy cookie'nin HMAC'ini doğrulamıyor (yalnız biçim kontrolü), 142 admin API route'unun hiçbiri gate'e bakmıyor, ve gate cevabı herhangi bir ADMIN'e iki farklı API'den düz metin dönüyor. Kodun kendi yorumunda vaat ettiği "rolü kazara ADMIN yapılan stajyer giremez" garantisi **sağlanmıyor**.
2. **Oturum iptali yok.** Rol, JWT'ye yalnız login anında yazılıyor; API'ler DB'ye bakmıyor. ADMIN'liği alınan, silinen ya da şifresi sıfırlanan bir hesabın token'ı 24 saat boyunca tam yetkiyle çalışmaya devam ediyor.
3. **2FA yalnız şifreli girişte zorunlu.** Google/GitHub OAuth ve magic-link yolları 2FA'yı tamamen atlıyor; üstüne `allowDangerousEmailAccountLinking: true` e-posta bazlı hesap birleştirmeye izin veriyor.
4. **Gelen e-posta ekleri, saldırganın seçtiği Content-Type ile herkese açık R2'ye `inline` yükleniyor.** Bu, şirket bucket'ını keyfi HTML/SVG barındırma noktasına çeviriyor; R2 alan adı qratex ile aynı site ise admin API'lerine karşı CSRF vektörü.

Bunların yanında: CSRF yalnız `SameSite=Lax`'a dayanıyor (Origin kontrolü yok), admin tanımlı webhook URL'lerinde SSRF koruması yok, mutasyon yapan 89 admin route'unun 44'ünde audit kaydı yok (sınırsız puan basabilen `surprise-box/send` dahil), CSP `'unsafe-inline' 'unsafe-eval'` içerdiği için XSS'e karşı fiilen etkisiz.

---

## 2. Mevcut Durum Haritası

### 2.1 Envanter

| Alan | Sayı / Dosya | Koruma deseni |
|---|---|---|
| `app/api/admin/**/route.ts` | 142 route | 124'ü `requireAuth(['ADMIN'])`; 18'i `/team/*` → `requireTeamAccess()` (ADMIN olmayan ekip üyesine açık, tasarım gereği); 2'si doğrudan `getServerSession` + rol (`insights`, `security/suspicious`) |
| `app/api/cron/*` | 10 route | Her biri kendi `validBearer()` kopyası: `timingSafeEqual`, `CRON_SECRET` yoksa 503 (fail-closed) ✅ |
| `app/api/internal/inngest/*` | 19 route | `authorizeInternalJobRequest()` — sabit-zaman Bearer (`lib/inngest/internal-http.ts:26-31`) ✅ — 19/19 kapsanmış |
| `app/api/auth/*` | 8 route | Rate limit (DB/Redis), hash'li token'lar, enumeration-safe yanıtlar |
| `app/api/webhooks/stripe` | 1 route | `constructEvent` imza doğrulaması ✅ (`app/api/webhooks/stripe/route.ts:31-44`) |
| `proxy.ts` | Next 16 middleware | Sayfa rotalarında rol + gate; `/api/*` için yalnız header (auth yok) |
| Toplam API route | 398 | `requireAuth` 248 dosyada, doğrudan `getServerSession` 80 dosyada, `createApiRoute` sarmalayıcısı yalnız 1 dosyada |
| Yükleme uçları | 2 (+ IMAP ekleri) | `admin/assets/upload`, `admin/team/tasks/[id]/attachments`, `lib/mail-inbox.ts` |
| `dangerouslySetInnerHTML` | 9 kullanım | Hepsi JSON-LD veya sabit tema script'i; veri kaynakları statik/etiketten arındırılmış ✅ |
| Ham SQL | 24 dosya | Tümü etiketli `$queryRaw\`` / `Prisma.sql`; `$queryRawUnsafe`/`$executeRawUnsafe`/`Prisma.raw` **yok** ✅ |

### 2.2 İstek akışı (bugünkü)

```
Tarayıcı ──► proxy.ts
             ├─ /api/*            → yalnız güvenlik/CORS header'ı, auth YOK, gate YOK, Origin kontrolü YOK
             └─ /admin/*          → withAuth (JWT var mı) → rol eşleşmesi → gate cookie BİÇİM kontrolü
                                     (HMAC doğrulanmıyor)
API route ──► requireAuth(roles)
             ├─ getServerSession (JWT, rol login anında donmuş)
             ├─ rol kontrolü (DB'ye gidilmiyor)
             └─ token-replay (jti ↔ IP/UA hash; Redis sıcak katman)
             (80 route bu yardımcıyı atlayıp getServerSession'ı doğrudan çağırıyor → replay kontrolü yok)
```

### 2.3 Güçlü yanlar (korunmalı)

- Cron: `CRON_SECRET` yoksa 503, sabit-zaman karşılaştırma (`app/api/cron/*/route.ts`, ör. `squad-battles/route.ts:13-35`).
- Şifre sıfırlama / magic-link token'ları SHA-256 hash, tek kullanımlık, süreli (`lib/auth-email-token.ts:11-66`).
- 2FA kurtarma kodları hash'li, atomik tüketim (`lib/two-factor.ts:52-59`).
- Partner API anahtarları hash'li, scope kontrolü (`lib/partner-api-auth.ts:11-41`); admin listesi `keyHash`'i gizliyor (`app/api/admin/api-keys/route.ts:26`).
- Login'de enumeration ve zamanlama eşitleme (`lib/auth.ts:154-163`); forgot/magic-link her durumda aynı yanıt.
- Açık yönlendirme koruması (`lib/safe-callback-url.ts:8-28`).
- Gelen kutusu HTML'i `sandbox="allow-scripts"` (same-origin yok) + `default-src 'none'` meta CSP (`app/admin/inbox/page.tsx:332-337, 427-436`).
- Üretimde `NEXTAUTH_SECRET` ≥ 32 karakter zorunlu (`lib/env-validation.ts:46-62`).
- Görev eklerinde magic-byte doğrulama + metin türleri için içerik sezgisi (`app/api/admin/team/tasks/[id]/attachments/route.ts:96-116`).
- Toplu rol değişikliğinde kendini dışlama + audit (`app/api/admin/users/bulk/route.ts:47-61`).

---

## 3. Bulgular (önem sırasıyla)

> Önem: **kritik** = bugün dışarıdan istismar edilebilir ve ciddi etki · **yüksek** = iddia edilen bir güvenlik kontrolü çalışmıyor veya yetki/oturum bütünlüğü bozuk · **orta** = derinlemesine savunma eksiği, koşullu istismar · **düşük** = hijyen/tutarlılık.

---

### B1 — [YÜKSEK] Admin gizli kapı üç ayrı yoldan atlanabiliyor; vaat edilen koruma yok

**Kanıt**
- `lib/admin-gate-edge.ts:14-21` — proxy'deki kontrol yalnız `"<userId>.<64 hex>"` biçimine bakıyor; HMAC **doğrulanmıyor**. Yorum (`:10-11`) "cookie'yi elde etmenin tek yolu doğru cevabı vermek" diyor ama cookie istemci tarafında elle yazılabilir: `admin_gate=<kendi userId>.aaaa…(64 adet a)` proxy'den geçer.
- `lib/admin-gate.ts:55-62` — gerçek HMAC doğrulayıcı `verifyGateCookie` **hiçbir yerde çağrılmıyor** (tüm repo grep'i: yalnız tanımı var).
- `proxy.ts:105-119` — `/api/*` istekleri gate'ten tamamen muaf; 142 admin API route'unun hiçbiri gate'i kontrol etmiyor. Gate'i geçmemiş bir ADMIN, panel UI'ı olmadan tüm admin API'lerini doğrudan çağırabilir.
- `app/api/admin/settings/admin-gate/route.ts:19-26` — `GET` gate **cevabını** düz metin olarak herhangi bir ADMIN'e döndürüyor (gate kontrolü yok). Ayrıca `app/api/admin/settings/route.ts:41-100` filtre olmadan tüm `Settings` satırlarını (dolayısıyla `admin_gate` değerini) döndürüyor.
- `lib/admin-gate.ts:18-21` — varsayılan cevap `'7'` kaynak kodda; cevap uzayı 10 rakam, rate limit dakikada 8 deneme (`app/api/admin/gate/route.ts:47`) → en kötü ihtimalle ~2 dakikada kaba kuvvetle çözülür.
- `app/api/admin/settings/admin-gate/route.ts:31-32` yorumu "cevap değişince eski cookie'ler geçersizleşir" diyor; proxy HMAC'e bakmadığı için bu da gerçekleşmiyor.
- `lib/admin-gate.ts:41` — secret yoksa `'qratex-admin-gate-fallback-secret'` sabitine düşüyor (üretimde env doğrulaması bunu büyük ölçüde engelliyor, ama kütüphane düzeyinde fail-open bir varsayılan).

**Sorun:** Gate, tehdit modelini ("rolü yanlışlıkla/kötü niyetle ADMIN yapılmış kişi") hiçbir katmanda durdurmuyor. Daha kötüsü, ekip bu katmanın çalıştığına inanıyor; bu, başka kontrollerin gevşek bırakılmasına yol açabilecek yanlış bir güven duygusu.

**Öneri (ürün seviyesi):** Gate'i "eğlenceli bilmece"den gerçek bir **admin yükseltme (step-up / elevation)** katmanına dönüştürün:
- **Doğrulama:** Gate cevabı yerine (ya da ona ek olarak) admin'in TOTP kodu / WebAuthn passkey'i. Tek rakamlı paylaşılan sır, kişiye bağlı olmadığı için hiçbir zaman güvenlik kontrolü olamaz; eğlenceli ekran deneyimi korunabilir ama arkasındaki kanıt kişisel faktör olmalı.
- **Token:** Başarılı doğrulamada `admin_elev` cookie'si = `base64url({uid, sjti, exp, v})` + HMAC. `sjti` oturum jti'si (oturum değişince yükseltme düşer), `exp` 8–12 saat, `v` = gate config sürümü.
- **Edge doğrulaması:** Edge runtime'da `crypto.subtle.importKey/sign` (Web Crypto) mevcut; `lib/admin-gate-edge.ts` içindeki "edge'de crypto yok" varsayımı doğru değil. Proxy HMAC'i ve `exp`'i gerçekten doğrulamalı.
- **API doğrulaması:** Yeni `requireAdmin()` yardımcısı (bkz. §4) `/api/admin/*` (team hariç) için yükseltme token'ını zorunlu kılsın.
- **Sır sızıntısı:** `GET /api/admin/settings/admin-gate` cevabı asla döndürmesin (yalnız "ayarlı/ayarlı değil" + son değiştirme tarihi); genel `settings` GET'i `security` kategorisini ve bilinen sır anahtarlarını (`admin_gate`, `partnerDigest.webhookSecret` vb.) maskelesin.
- **Varsayılan:** Cevap ayarlanmamışsa gate kapalı değil, **kurulum zorunlu** olsun (fail-closed).

**Efor:** M (edge HMAC + API yardımcısı + settings maskeleme); TOTP/WebAuthn step-up ile L.

---

### B2 — [YÜKSEK] Oturum iptali yok: rol düşürme, hesap silme, şifre sıfırlama mevcut JWT'yi geçersiz kılmıyor

**Kanıt**
- `lib/auth.ts:212-269` — `role`, `dealerId`, `adminTeamRole` vb. yalnız `if (user)` bloğunda (yani login anında) token'a yazılıyor; sonraki isteklerde DB'den tazelenmiyor.
- `lib/api-auth.ts:52-80` — `requireAuth` rolü token'dan okuyor; kullanıcının hâlâ var olup olmadığına, rolüne, ban durumuna DB'den bakmıyor.
- `lib/auth.ts:31-39` — varsayılan oturum ömrü 24 saat.
- `lib/auth-email-token.ts:54-63` — şifre sıfırlama yalnız `password` alanını güncelliyor; hiçbir oturum sürümü/iptal işareti artırılmıyor.
- `app/api/admin/users/route.ts:646-690` (DELETE), `users/bulk/route.ts:42-61` (rol değiştirme) — değişiklik sonrası etkilenen kullanıcının oturumunu sonlandıran bir mekanizma yok.
- Karşı örnek (doğru desen zaten var): `lib/team-access.ts:16-21` ekip rolünü "session bayat olabilir" diyerek DB'den doğruluyor.

**Sorun:** Ele geçirilmiş ya da kötüye kullanılan bir ADMIN hesabının rolü alındığında veya hesap silindiğinde saldırgan 24 saate kadar tam admin yetkisiyle devam eder. Şifre sıfırlama, hesabı ele geçirilmiş kullanıcıyı korumaz (saldırganın token'ı yaşar). Bu, puan ekonomisi ve kişisel veri içeren bir sistemde olay müdahalesini (incident response) imkânsız kılar.

**Öneri:**
- `User` modeline `sessionVersion Int @default(0)` ekleyin; JWT'ye login'de yazın.
- Rol değişimi, silme/ban, şifre sıfırlama/değiştirme, 2FA aç/kapa, "tüm cihazlardan çık" → `sessionVersion++`.
- `requireAuth` içinde `{ role, sessionVersion, deletedAt }` değerini **Redis'te 30–60 sn TTL** ile önbellekleyip (token-replay'de kurulan "Redis sıcak katman / DB kaynak doğruluk" deseniyle aynı) token ile karşılaştırın; uyuşmazlıkta 401.
- Yetki kararı için **daima DB'den gelen rolü** kullanın (token'daki rol yalnız UI ipucu).
- Admin panelinde "Kullanıcının oturumlarını sonlandır" aksiyonu.

**Efor:** M (şema alanı + `requireAuth` değişikliği + 5–6 yazma noktasında artırım). Önbellek sayesinde performans etkisi ihmal edilebilir.

---

### B3 — [YÜKSEK] 2FA yalnız şifreli girişte uygulanıyor; OAuth ve magic-link 2FA'yı atlıyor; tehlikeli e-posta birleştirme açık

**Kanıt**
- `lib/auth.ts:182-194` — 2FA kontrolü yalnız Credentials + şifre yolunda.
- `lib/auth.ts:89-107` — magic-link yolu `consumeMagicLoginToken` sonrası **2FA sormadan** kullanıcıyı döndürüyor.
- `lib/auth.ts:303-309` — `signIn` callback'i OAuth için koşulsuz `true`; 2FA etkin kullanıcı Google ile girdiğinde TOTP sorulmuyor.
- `lib/auth.ts:45, 52` — Google ve GitHub için `allowDangerousEmailAccountLinking: true`.
- `app/api/auth/register/route.ts:57-64` — kayıt, e-posta doğrulanmadan `User` satırı oluşturuyor (`emailVerified: null`).
- Admin için 2FA zorunluluğu yok (hiçbir yerde rol bazlı 2FA zorlaması bulunamadı).

**Sorun:**
1. 2FA'nın amacı "şifre/e-posta ele geçse bile hesap korunur" — e-posta kutusu ele geçen biri magic-link ile, Google hesabı ele geçen biri OAuth ile 2FA'yı devre dışı bırakmadan girer.
2. **Ön-ele geçirme (pre-account-takeover):** saldırgan kurbanın e-postasıyla şifreli kayıt açar (doğrulanmamış); kurban daha sonra Google ile girer → hesaplar birleşir; kurban gelen doğrulama mailine bir kez tıklarsa saldırganın şifresi de geçerli hâle gelir. (Kurban davranışına bağlı; somut zinciri "doğrulanmadı" olarak işaretliyorum ama kod yolu açık.)
3. GitHub sağlayıcısının birincil e-postanın doğrulanmış olmasını garanti edip etmediği bu kodda kontrol edilmiyor (doğrulanmadı).

**Öneri:**
- **2FA'yı oturum katmanına taşıyın:** her giriş yöntemi (credentials, magic-link, OAuth) sonrası, `twoFactorEnabled` kullanıcı için JWT'ye `mfa: 'pending'` yazın; proxy ve `requireAuth` `pending` durumunda yalnız `/auth/2fa` ekranına ve doğrulama ucuna izin versin. Doğrulama sonrası `mfa: 'ok'` + `amr: ['pwd'|'oauth'|'magic', 'otp']`.
- **ADMIN rolü için 2FA zorunlu** olsun (rol atanırken 2FA kurulumu tamamlanana kadar admin yetkileri `pending`).
- `allowDangerousEmailAccountLinking`'i kaldırın; bunun yerine "Bu e-posta ile hesabınız var — şifrenizle girip Google'ı bağlayın" akışı. En azından: doğrulanmamış (`emailVerified=null`) mevcut hesapla OAuth birleştirmesinde **mevcut şifreyi silin** ve kullanıcıya bildirin.

**Efor:** L (oturum durum makinesi + UI ekranı + proxy kuralı).

---

### B4 — [YÜKSEK] Gelen e-posta ekleri saldırgan kontrollü Content-Type ile herkese açık R2'ye `inline` yükleniyor

**Kanıt**
- `lib/mail-inbox.ts:121-133` — `contentType = a.contentType` (göndericinin beyanı), filtre yok; `uploadToR2(key, content, contentType, 'inline; …')`.
- `lib/r2-storage.ts:49-64` — nesneler `R2_PUBLIC_URL` altında herkese açık URL ile servis ediliyor.
- Gelen kutusu harici, herkesin e-posta atabileceği bir adres (IMAP senkronu `app/api/cron/inbox-sync/route.ts`).

**Sorun:** Herhangi biri gelen kutusuna `text/html` veya `image/svg+xml` ek gönderdiğinde bu içerik şirket bucket'ında **çalıştırılabilir** biçimde barındırılır:
- Kimlik avı/zararlı içerik Qratex'e ait alan adından servis edilir (marka ve domain itibarı riski).
- `R2_PUBLIC_URL` qratex'in bir alt alan adıysa (ör. `cdn.qratex.com`) bu sayfa qratex.com ile **aynı site**dir; `SameSite=Lax` cookie'ler aynı-site isteklerde gönderilir → admin eki açtığında sayfa admin API'lerine durum değiştiren istek atabilir (bkz. B5). `R2_PUBLIC_URL`'in gerçek değeri repoda yok — **doğrulanmadı**; `r2.dev` alanıysa etki marka/phishing ile sınırlı.
- Anahtar `inbox/<uid>-<Date.now()>-<isim>` (tahmin edilmesi zor ama gizli değil); stajyer mailleri gibi kişisel içerikler kimlik doğrulamasız URL ile erişilebilir.

**Öneri:**
- Ekler için **özel (private) bucket** + kısa ömürlü imzalı URL'ler (`GetObjectCommand` + presign, 5 dk) üreten `/api/admin/inbox/[id]/attachments/[n]` uç noktası; erişim admin oturumuna bağlı.
- Content-Type'ı göndericiden değil **magic-byte**'tan türetin (görev eklerindeki `detect()` mantığını `lib/upload-policy.ts` gibi ortak bir modüle taşıyıp yeniden kullanın). Allowlist dışı her şey `application/octet-stream` + `Content-Disposition: attachment`.
- `text/html`, `image/svg+xml`, `application/xhtml+xml`, `text/xml` asla `inline` servis edilmesin; iOS Safari ihtiyacı yalnız görsel/PDF/video için `inline` ile karşılansın.
- Kullanıcı içeriği servis eden alan adı **ayrı, cookie'siz bir site** olsun (ör. `qratex-usercontent.com`), qratex.com'un alt alan adı değil.

**Efor:** M.

---

### B5 — [ORTA] CSRF koruması yalnız `SameSite=Lax`'a dayanıyor; Origin kontrolü yok; GET ile ağır mutasyon var

**Kanıt**
- `proxy.ts:105-119` — `/api/*` için Origin/`Sec-Fetch-Site` kontrolü yok; durum değiştiren isteklere ek CSRF token'ı yok.
- `app/api/admin/preagg/route.ts:176-178` — `GET` ADMIN oturumuyla `runPreagg`'ı çalıştırıyor: 8000 bayi × 365 güne kadar upsert (`:30-45`). `SameSite=Lax` cookie üst düzey GET gezinmelerinde gönderildiği için, bir admin'e tıklatılan `https://qratex…/api/admin/preagg?days=365` bağlantısı ağır bir DB yükünü tetikler.
- `proxy.ts:6-11` — `NEXT_PUBLIC_ALLOWED_ORIGINS` tanımlı değilse üretimde de `http://localhost:3000/3001` ve eski `qratex.netlify.app` kimlik bilgili (credentials) CORS'a izinli; `:40` `Access-Control-Allow-Credentials: true` koşulsuz.
- Route'lar `request.json()` ile Content-Type'a bakmadan gövdeyi parse ediyor; `text/plain` "basit istek" ile aynı-site sayfadan preflight'sız POST mümkün (B4 ile birleşince anlamlı).

**Öneri:**
- Proxy'de `/api/*` için **POST/PUT/PATCH/DELETE** isteklerinde `Origin` (yoksa `Sec-Fetch-Site`) kontrolü: yalnız kendi origin + açık allowlist. Cron, `internal/inngest`, `webhooks/*`, partner Bearer uçları muaf (bunlar cookie ile değil Bearer/imza ile doğrulanıyor).
- Durum değiştiren hiçbir işlem `GET` ile yapılmasın: `preagg` GET'i yalnız `CRON_SECRET` ile çalışsın, oturumla yalnız POST.
- JSON bekleyen uçlarda `Content-Type: application/json` zorunlu (ortak sarmalayıcıda).
- CORS varsayılanı üretimde boş liste olsun; `NEXT_PUBLIC_ALLOWED_ORIGINS` yerine sunucu tarafı `ALLOWED_ORIGINS` (NEXT_PUBLIC_ öneki istemci paketine sızdırır, gereksiz).

**Efor:** S–M.

---

### B6 — [ORTA] Admin tanımlı dış URL'lere sunucu tarafı istek: SSRF koruması yok, yanıt yansıtılıyor, webhook sırları düz metin listeleniyor

**Kanıt**
- `app/api/admin/webhooks/route.ts:51-56` + `lib/validations-admin.ts:79-83` — URL yalnız `new URL()` ile ayrıştırılıyor; şema/host/özel IP kısıtı yok.
- `lib/webhook-dispatch.ts:43-52` — `fetch(webhook.url)` (yönlendirme takibi varsayılan açık).
- `app/api/internal/inngest/partner-digest-webhook/route.ts:16-34` — `partnerDigest.webhookUrl`'e POST ve `responsePreview: text.slice(0, 200)` ile **yanıtı geri döndürüyor** (okuma primitive'i).
- `app/api/admin/seo/health/route.ts:17-31` — `redirect: 'follow'` ile SEO ayarlarındaki URL'ye istek.
- `app/api/admin/webhooks/route.ts:16-21` — `findMany` tüm alanları (HMAC `secret` dahil) admin'e geri döndürüyor; `prisma/schema.prisma:1218` sır düz metin saklanıyor.
- İmza başlığında zaman damgası yok (`lib/webhook-dispatch.ts:42-48`) → alıcı tarafta tekrar oynatma (replay) koruması kurulamıyor.

**Sorun:** Admin hesabını ele geçiren (bkz. B1–B3) iç ağ/metadata uç noktalarına istek attırabilir; Vercel'de etki sınırlı olsa da `127.0.0.1`, `169.254.169.254`, iç servisler ve yönlendirme zincirleri kapsam dışı bırakılmalı. Webhook sırrının tekrar tekrar ekrana gelmesi, sırrın ekran görüntüsü/log yoluyla sızma yüzeyini büyütür.

**Öneri:**
- Ortak `lib/safe-outbound-fetch.ts`: yalnız `https:`, DNS çözümleyip özel/loopback/link-local/CGNAT aralıklarını reddet, `redirect: 'manual'` (en fazla 1–2 yönlendirme, her adımda yeniden doğrula), 5–8 sn timeout, yanıt gövdesi boyut sınırı. Webhook, partner digest ve SEO health bu yardımcıyı kullansın.
- URL kayıt anında da aynı doğrulama (zod refine).
- Webhook sırrını yalnız oluşturma anında bir kez gösterin; listede `secret: '••••'+son4`. Saklamada uygulama düzeyi şifreleme (ör. `WEBHOOK_SECRET_KEY` ile AES-GCM).
- İmzaya `t=<unix>` ekleyin (`X-Qratex-Signature: t=…,v1=…`, Stripe şeması) ve dokümante edin.
- `responsePreview` yalnız durum kodu döndürsün.

**Efor:** M.

---

### B7 — [ORTA] Login kaba kuvvet kilidi yalnız `IP+e-posta` bazlı; hesap bazlı üst sınır yok

**Kanıt**
- `lib/auth.ts:113-123` — kilit ve rate limit anahtarı `${ip}:${email}`. IP değiştiren saldırgan (botnet/residential proxy) aynı hesaba her IP'den 5 deneme/15 dk yapabilir.
- `lib/auth.ts:184-187` — şifre doğruysa `2FA_REQUIRED` döndürülüyor → 2FA'lı hesaplarda şifre doğruluğu sızdırılıyor (bilinçli UX tercihi olabilir, ama B3 ile birlikte risk artar).
- `lib/rate-limit.ts:208-212` — IP `x-forwarded-for`'un ilk değerinden; Vercel bu başlığı üzerine yazdığı için güvenli, ancak repoda `netlify.toml` da var; farklı bir platforma taşınırsa sahte IP ile limit atlatılabilir (platforma bağlı, doğrulanmadı).

**Öneri:** İki katmanlı limit: (1) mevcut `ip:email`, (2) **hesap bazlı** kayan pencere (ör. 20 hata/saat → hesap için CAPTCHA/Turnstile + kullanıcıya "şüpheli giriş denemeleri" e-postası; ADMIN için 10 hata → geçici kilit + Sentry alarmı). IP çıkarımını tek bir `getTrustedClientIp()`'e toplayıp platforma göre (`x-vercel-forwarded-for` / `x-nf-client-connection-ip`) yapılandırın.

**Efor:** S–M.

---

### B8 — [ORTA] Token-replay kontrolü tutarsız uygulanıyor ve kullanılabilirliği bozuyor

**Kanıt**
- `lib/api-auth.ts:64-78` — replay kontrolü yalnız `requireAuth` içinde.
- 80 route `getServerSession`'ı doğrudan çağırıyor (ör. `app/api/admin/insights/route.ts:13-15`, `app/api/security/suspicious/route.ts:23-24, 119-120`, `app/api/auth/set-password/route.ts:33`, müşteri oyun/puan uçlarının çoğu) → bu uçlarda replay tespiti yok.
- `lib/token-replay.ts:64, 93` — IP hash'i değişince 403. Mobilde Wi-Fi ↔ hücresel geçişinde veya kurumsal NAT'ta meşru kullanıcı "Session güvenlik ihlali" alır ve oturum fiilen kilitlenir (jti aynı kaldıkça kalıcı).
- Tespit sonrası token iptal edilmiyor; yalnız o istek reddediliyor.

**Öneri:** Replay kontrolünü IP'nin tamamı yerine **UA + IP ASN/ülke** (ya da /16 prefix) ile yapın; tutarsızlıkta 403 yerine **step-up** (yeniden giriş) isteyin ve B2'deki `sessionVersion`'ı artırarak token'ı gerçekten iptal edin. Tüm route'ları ortak sarmalayıcıya taşıyın (bkz. §4) ki kontrol her yerde aynı olsun.

**Efor:** M (80 dosyanın sarmalayıcıya taşınması mekanik ama geniş).

---

### B9 — [ORTA] Ekip modülü `/api/admin/team/*` altında ADMIN olmayan "yönetici"ye kullanıcı dizini ve yetki dağıtımı açıyor

**Kanıt**
- `lib/team-access.ts:11-33` — ekip erişimi CUSTOMER/DEALER/STAFF dahil herkese, `adminTeamRole` varsa açık; `yonetici` tüm yönetici işlemlerini yapabiliyor.
- `app/api/admin/team/members/route.ts:12-29` — `yonetici`, **tüm platform kullanıcılarını** (ekipte olmayan) isim/e-posta ile arayıp `name, email, image, role` döndürebiliyor (20'lik sayfalarla tüm kullanıcı tabanı numaralandırılabilir).
- `app/api/admin/team/members/route.ts:55-80` — `yonetici`, e-postasını bildiği herhangi bir kullanıcıyı ekibe `yonetici` olarak ekleyebiliyor (yetkinin kendiliğinden çoğalması).

**Sorun:** Müşteri rolündeki bir stajyer-yönetici, platformun tüm müşteri/bayi e-posta listesini çekebilir (KVKK açısından kişisel veri ifşası) ve yetkisini istediği kişiye dağıtabilir.

**Öneri:** Üye arama yalnız ADMIN'e veya **davet akışına** (e-posta tam eşleşme, sonuçta yalnız "bulundu/bulunamadı") daraltılsın. `yonetici` atama yetkisi yalnız ADMIN'de olsun; `yonetici` yalnız `uye` ekleyebilsin. Ekip API'leri `/api/team/*` altına taşınsın ki `/api/admin/*` için gelecekte konacak "gate + ADMIN" kuralı ekibi kırmasın.

**Efor:** S (yetki daraltma) + M (yol taşıma).

---

### B10 — [ORTA] Denetim izi boşlukları; puan basan admin uçları sınırsız ve kayıtsız

**Kanıt**
- Mutasyon yapan 89 admin route'unun **44'ünde `auditLog` yok** (otomatik tarama). Kritik olanlar:
  - `app/api/admin/surprise-box/send/route.ts:12` — `points: z.number().int().min(0)` **üst sınır yok**, 500 kullanıcıya kadar (`:18`), `auditLog` yok. Bu, puan ekonomisinin "her puan basma yolu izlenebilir ve sınırlı" invariant'ıyla çelişiyor.
  - `app/api/admin/character-test/route.ts:146-214` — canlı DB'de **herhangi bir kullanıcının** rozetlerini/yorum kategorilerini/tüketimlerini silen/değiştiren test aracı; üretimde açık, audit yok. Rozet ödül puanı ile birleşince sıfırla→yeniden kazan döngüsünün tekrar puan basıp basmadığı **doğrulanmadı**.
  - `privacy-requests/[id]` (KVKK talepleri), `compose-mail`, `cards/[id]/assign|unassign`, `donations`, `referrals`, `squads/*`, `gate` (başarısız denemeler dahil).

**Öneri:**
- `withAudit(action, entity)` sarmalayıcısı: route tanımında beyan edilir, başarılı mutasyonda otomatik `auditLog` + IP/UA. Lint kuralı: `app/api/admin/**` altında POST/PUT/PATCH/DELETE export eden ve `withAudit` kullanmayan dosya CI'da hata.
- Puan basan admin uçlarına **tavan** (ör. tek seferde ≤ 5.000 puan, toplamda günlük admin basım bütçesi) ve tavan üstü için ikinci admin onayı (4-göz). `points_credited` olayı yazılsın (`register` akışındaki desen gibi).
- `character-test` gibi araçlar `NODE_ENV !== 'production'` ya da `ENABLE_DEV_TOOLS=1` bayrağı arkasına alınsın.

**Efor:** M.

---

### B11 — [ORTA] CSP XSS'e karşı fiilen etkisiz ve iki yerde birbirinden farklı tanımlı

**Kanıt**
- `next.config.js:343-360` ve `proxy.ts:18-30` — her ikisinde `script-src 'self' 'unsafe-inline' 'unsafe-eval' …`. `'unsafe-inline'` enjekte edilmiş inline script'i engellemez.
- İki tanım farklı: proxy'deki `connect-src` `https: wss:` (her yer), `base-uri`/`form-action`/`object-src` yok; next.config'deki daha dar. Proxy eşleşen rotalarda iki CSP başlığının birlikte mi gönderildiği yoksa birinin diğerini mi ezdiği **doğrulanmadı**.

**Öneri:** Proxy'de istek başına **nonce** üretip `script-src 'self' 'nonce-…' 'strict-dynamic'` (Next 16 App Router nonce'u `headers()` üzerinden destekler); `'unsafe-eval'` yalnız Tesseract worker'ı için `worker-src blob:` ile sınırlandırılsın. Tek kaynak: CSP yalnız proxy'de üretilsin, next.config'den kaldırılsın. Önce `Content-Security-Policy-Report-Only` + Sentry raporlama ile 1–2 hafta gözlem.

**Efor:** M.

---

### B12 — [DÜŞÜK] Admin varlık yüklemesi: kara-liste SVG temizleyici ve üretimde çalışmayan dosya sistemi yazımı

**Kanıt**
- `lib/media-validation.ts:28-31` — SVG güvenliği regex kara listesi (`<script`, `javascript:`, `on…=`); HTML entity ile kodlanmış `javascript&#58;`, `<foreignObject>` içi HTML vb. ile atlatılabilir.
- `app/api/admin/assets/upload/route.ts:81-85` — `public/images/uploads` dizinine yazıyor; Vercel'de dosya sistemi salt okunur → üretimde bu uç büyük olasılıkla 500 dönüyor (işlevsel hata). Yerelde ise yüklenen SVG uygulamayla **aynı origin**'den servis edilir.

**Öneri:** SVG'yi ya tamamen reddedin (rozet/ödül görselleri PNG/WebP'ye rasterize edilsin, `sharp` zaten mevcut) ya da DOMPurify (`USE_PROFILES: { svg: true }`) ile allowlist temizleme yapın. Depolamayı R2'ye taşıyın ve kullanıcı içeriği alan adından servis edin (B4 ile aynı politika modülü).

**Efor:** S.

---

### B13 — [DÜŞÜK] Sır karşılaştırma ve iletiminde tutarsızlıklar

**Kanıt**
- `app/api/admin/preagg/route.ts:23` — `cron_secret` **query string**'den kabul ediliyor (erişim loglarına/Referer'a sızar) ve `===` ile karşılaştırılıyor.
- `lib/internal-cron-or-admin.ts:13` — sabit-zamanlı olmayan `===`.
- `app/api/test-email/route.ts:18-21` — `?secret=` query string; `TEST_EMAIL_SECRET` yoksa tesadüfen kapalı kalıyor (açıkça fail-closed yazılmamış).
- `validBearer` fonksiyonu 10 cron dosyasında kopyala-yapıştır (`app/api/cron/*/route.ts`); `daily/route.ts:17` beklenen değeri `secret.trim()` ile, `:39` alt çağrılara `secret`'ı trim'siz geçiriyor (sırda boşluk varsa alt görevler 401 alır).
- `lib/env-validation.ts` — `CRON_SECRET` uzunluk/varlık kontrolü yok.

**Öneri:** Tek `lib/secret-auth.ts` → `verifyBearer(req, envKey)` (sabit-zaman, trim'li, fail-closed); tüm cron/internal/preagg/test-email bunu kullansın; query string sırları kaldırılsın; `CRON_SECRET` ≥ 32 karakter env doğrulamasına eklensin.

**Efor:** S.

---

### B14 — [DÜŞÜK] Kayıtta e-posta doğrulanmadan referral puanı basılıyor; e-posta normalizasyonu tutarsız

**Kanıt**
- `app/api/auth/register/route.ts:101-143` — referral bonusu (her iki tarafa) kayıt anında, `emailVerified: null` iken veriliyor. IP başına dakikada 5 kayıt (`:14`) ile tek kullanımlık e-postalarla referrer hesabına puan çiftliği kurulabilir.
- `app/api/auth/register/route.ts:40-46` e-postayı küçültmeden saklıyor/arıyor; `forgot-password/route.ts:61` ve `magic-link/route.ts:66` küçültüp arıyor → büyük harfle kayıt olan kullanıcı şifre sıfırlayamaz; ayrıca `Ali@x.com` ve `ali@x.com` iki ayrı hesap olabilir.

**Öneri:** Referral kredisini `verify-email` başarılı olduğu ana taşıyın (referral satırı `PENDING` oluşturulsun, doğrulamada `COMPLETED` + kredi, tek transaction). E-postayı tüm yazma/okuma noktalarında `trim().toLowerCase()` ile normalize edin (zod `transform`) ve mevcut veriyi tek seferlik normalize etme betiği planlayın (canlı Neon — dikkatli, ayrı onaylı iş).

**Efor:** S–M.

---

### B15 — [DÜŞÜK] Diğer hijyen bulguları

| Kanıt | Sorun | Öneri |
|---|---|---|
| `lib/auth-email-token.ts:83-116` | Magic-link tüketimi `findFirst` + koşulsuz `update` — eşzamanlı iki istek aynı token'ı kullanabilir | `updateMany({ where: { id, consumedAt: null } })` ve `count === 1` kontrolü |
| `lib/totp.ts:41-49` | Aynı TOTP kodu ±30 sn penceresinde tekrar kullanılabilir | Son kabul edilen zaman adımını kullanıcıda sakla, ≤ olanı reddet |
| `app/admin/layout.tsx` | Admin layout'ta sunucu tarafı rol kontrolü yok; tek savunma proxy (staff layout'ta var: `app/staff/layout.tsx`) | Layout'ta `requireAdminPage()` — derinlemesine savunma |
| `proxy.ts:90-92, 123-125` | `/` STAFF yönlendirmesi matcher'da `/` olmadığı için ölü kod | Ya matcher'a ekleyin ya kaldırın |
| `app/api/admin/team/tasks/[id]/attachments/route.ts:152-164` | Görev ekleri herkese açık R2 URL'sinde (`tasks/<isim>-<ms>.ext`), kimlik doğrulamasız erişilebilir; limit 50MB, hata mesajı "8MB", Vercel gövde limiti ~4.5MB | Özel bucket + imzalı URL (B4 ile aynı); limitleri tek sabitte toplayın |
| `next.config.js:272-290` | `images.remotePatterns` içinde `**.netlify.app`, `**.supabase.co`, `localhost` → herkesin barındırabildiği alanlar görsel optimizasyon kotasını tüketebilir | Yalnız fiilen kullanılan hostlar |
| `lib/auth.ts:271-281` | `session.update()` ile istemci `points/level/image` token alanlarını değiştirebiliyor; sunucuda yalnız gösterim için kullanıldığı doğrulandı (`app/api/surprise-box/[id]/open/route.ts:53` tx içinde ezilir) | Bu alanları token'dan çıkarıp `/api/user/me`'den okuyun; yanlışlıkla yetki kararında kullanılmasını önler |

---

## 4. Hedef Mimari

### 4.1 Tek giriş noktası: katmanlı route sarmalayıcısı

Bugün 398 route'un kimlik doğrulaması 3 farklı desenle (`requireAuth`, doğrudan `getServerSession`, `requireTeamAccess`) ve tek tek elle yazılıyor; `createApiRoute` sarmalayıcısı var ama yalnız 1 route kullanıyor. Hedef: **beyan edici politika**.

```ts
// lib/api/secure-route.ts (hedef)
export const POST = secureRoute({
  auth: 'admin',              // 'public' | 'user' | roles[] | 'admin' | 'team' | 'cron' | 'internal' | 'partner:<scope>'
  elevation: true,            // admin step-up token zorunlu (B1)
  mfa: 'required',            // B3
  csrf: 'origin',             // B5 (cookie-auth'lu mutasyonlarda varsayılan)
  rateLimit: { key: 'user', max: 30, windowMs: 60_000 },
  audit: { action: 'SEND_SURPRISE_BOX', entity: 'UserSurpriseBox' }, // B10
  body: sendSchema,           // zod, Content-Type: application/json zorunlu
}, async ({ session, body, request }) => { … });
```

İçeride sırasıyla: Origin kontrolü → JWT → `sessionVersion`/rol/ban için Redis-önbellekli DB doğrulaması (B2) → MFA durumu → admin yükseltme token'ı → token-replay (yumuşatılmış, B8) → rate limit → zod → handler → audit → standart hata yanıtı.

### 4.2 Oturum modeli

```
JWT: { sub, jti, sv (sessionVersion), mfa: 'ok'|'pending', amr: [...], iat, exp }
Redis: u:<id> → { role, sv, banned, deletedAt }  (TTL 60 sn, yazma noktalarında invalidate)
Yetki kararı = Redis/DB'deki rol; JWT'deki rol yalnız UI ipucu.
```

### 4.3 Admin yükseltme (gate'in yerini alan)

- `/admin-gate` ekranı korunur (deneyim), içerik: TOTP/passkey.
- `admin_elev` cookie: `HMAC(uid|sjti|exp|cfgVer)`; proxy Web Crypto ile, API Node crypto ile **aynı** doğrulama fonksiyonunu (`lib/admin-elevation.ts`, isomorphic) kullanır.
- Hassas işlemler (rol atama, puan basma > tavan, gate/sır ayarları, API anahtarı üretimi) için ek "yeniden doğrula" (son 5 dk içinde step-up).

### 4.4 Dosya ve dış istek politikası

- `lib/upload-policy.ts`: magic-byte tespit, tür allowlist'i, `inline` yalnız görsel/PDF/video, diğerleri `attachment`; tüm yükleme noktaları (assets, görev ekleri, gelen kutusu ekleri) bunu kullanır.
- Özel R2 bucket + imzalı URL uç noktası; kamuya açık olması gerekenler (rozet görselleri) ayrı, cookie'siz kullanıcı-içeriği alan adında.
- `lib/safe-outbound-fetch.ts`: tüm sunucu tarafı dış istekler için tek kapı.

### 4.5 Gözlemlenebilirlik

- `auditLog` kapsamı %100 (lint ile zorunlu), admin panelinde "son 24 saatte kritik yetki olayları" kartı.
- Sentry alarmları: gate/step-up başarısızlık patlaması, replay tespiti, hesap bazlı login hata eşiği, admin puan basım bütçesi aşımı.

---

## 5. Adım Adım Geçiş Planı

> Her adım bağımsız olarak deploy edilebilir; canlı Neon'a dokunan şema adımları ayrı onay gerektirir.

**Faz 0 — Hızlı kapatmalar (1–2 gün, S)**
1. `GET /api/admin/settings/admin-gate` cevabı döndürmesin; genel `settings` GET'i `security` kategorisini maskelesin (B1).
2. Proxy'de gate cookie'si için Web Crypto ile gerçek HMAC doğrulaması; `verifyGateCookie`'yi API tarafında kullanan geçici `requireAdminGate()` ile `/api/admin/*` (team hariç) koruması (B1 — tam step-up'tan önce ara çözüm).
3. `preagg` GET'i yalnız Bearer; query string sırları kaldır; tek `verifyBearer()` (B5, B13).
4. `surprise-box/send` puan tavanı + `auditLog` + `points_credited` (B10).
5. Gelen kutusu eklerinde Content-Type'ı magic-byte'tan türet, aktif içerik türlerini `attachment` yap (B4 ara çözüm).
6. `character-test` uç noktasını üretimde kapat (B10).

**Faz 1 — Oturum bütünlüğü (1 hafta, M)**
7. `User.sessionVersion` (şema değişikliği — canlı Neon, ayrı onaylı migration).
8. `requireAuth` → Redis önbellekli DB rol/sv doğrulaması; rol değişimi/silme/şifre sıfırlama/2FA değişikliğinde artırım (B2).
9. Token-replay'i yumuşat ve iptal ile birleştir (B8).

**Faz 2 — CSRF, SSRF, dosya politikası (1 hafta, M)**
10. Proxy Origin kontrolü + JSON Content-Type zorunluluğu; CORS varsayılanını daralt (B5).
11. `safe-outbound-fetch` + webhook sır maskeleme/şifreleme + imzaya zaman damgası (B6).
12. Özel R2 bucket + imzalı URL uç noktası; görev ve gelen kutusu eklerini taşı (geriye dönük URL'ler için tek seferlik backfill — mevcut `attachment-backfill` cron deseni) (B4, B15).
13. Ekip üye arama/atama yetkilerini daralt (B9).

**Faz 3 — MFA ve admin yükseltme (2 hafta, L)**
14. JWT'ye `mfa`/`amr`; tüm giriş yollarında 2FA (`pending` durumu + ekran) (B3).
15. ADMIN için 2FA zorunluluğu; `allowDangerousEmailAccountLinking` kaldırma + bağlama akışı (B3).
16. Gate → step-up elevation (TOTP/passkey), hassas işlemler için yeniden doğrulama (B1).
17. Hesap bazlı login limiti + şüpheli giriş bildirimi (B7).

**Faz 4 — Konsolidasyon (sürekli, M–L)**
18. `secureRoute` sarmalayıcısını yaz; önce `/api/admin/*`, sonra doğrudan `getServerSession` kullanan 80 route'u taşı (B8, B10).
19. `withAudit` + CI lint kuralı (B10).
20. Nonce tabanlı CSP, önce Report-Only (B11).
21. Kayıt referral kredisini doğrulamaya taşı + e-posta normalizasyonu (B14).

---

## 6. Doğrulanmayanlar / Sınırlar

- `R2_PUBLIC_URL`'in gerçek alan adı (qratex alt alanı mı, `r2.dev` mi) repoda yok → B4'ün CSRF boyutu buna bağlı.
- Proxy ve `next.config.js` CSP başlıklarının aynı yanıtta nasıl birleştiği çalıştırılarak test edilmedi.
- GitHub OAuth sağlayıcısının doğrulanmamış birincil e-postayı döndürüp döndürmediği bu sürüm için kontrol edilmedi.
- `character-test` sıfırla→yeniden kazan döngüsünün rozet ödül puanını tekrar basıp basmadığı kod yolu izlenmedi.
- Hiçbir uç nokta canlı olarak çağrılmadı; tüm bulgular statik okuma ile kanıtlandı.
