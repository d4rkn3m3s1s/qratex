# /auth/reset-password

**Amaç:** "Şifremi unuttum" e-postasındaki tek kullanımlık bağlantıyla (`?token=…&callbackUrl=…`) gelen kullanıcının yeni şifre belirleyip hesabını geri kazanmasını sağlamak. Hesap kurtarma akışının ikinci ve son adımıdır.
**Genel puan:** 5.5/10
**Karar:** koru-iyileştir. Sayfa küçük ve temel akışı doğru çalıştırıyor. Asıl sorunlar sayfanın çevresinde: token'ın analitiğe sızması, şifre sıfırlandıktan sonra açık oturumların kapatılmaması, callbackUrl temizleyicisinin aşılabilmesi, dil karışıklığı ve kurtarma UX'inin eksik olması. Yeniden yazmaya gerek yok ama akış yeniden ele alınmalı (bkz. "Yeniden tasarım vizyonu").

İncelenen dosyalar: `app/(auth)/auth/reset-password/page.tsx`, `app/(auth)/auth/reset-password/layout.tsx`, `app/(auth)/auth/layout.tsx`, `app/(auth)/layout.tsx`, `app/(auth)/error.tsx`, `components/auth/auth-shell.tsx`, `components/ui/input.tsx`, `components/ui/button.tsx`, `lib/safe-callback-url.ts`, `lib/auth-email-token.ts`, `lib/password.ts`, `lib/rate-limit.ts`, `lib/auth.ts`, `lib/auth-events.ts`, `components/analytics/posthog-provider.tsx`, `sentry.client.config.ts`, `app/api/auth/reset-password/route.ts`, `app/api/auth/forgot-password/route.ts`, `app/api/auth/set-password/route.ts`, `app/(auth)/auth/login/page.tsx` (yönlendirme zinciri için), `app/(auth)/auth/forgot-password/page.tsx` (tutarlılık için), `prisma/schema.prisma` (`AuthEmailToken`), `messages/tr.json` ve `messages/en.json`.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 6/10 | Temel sıfırlama çalışıyor: token hash'li ve tek kullanımlık, süresi 1 saat, rate limit var. Ama oturum iptali, "şifren değişti" bildirimi, token ön doğrulaması ve "yeni bağlantı iste" yolu yok. |
| UX | 5/10 | Hatalar yalnızca toast olarak çıkıyor. Süresi dolmuş bağlantıda kullanıcı çıkmazda kalıyor. Başarıdan 600 ms sonra sert yönlendirme var. Şifre göster/gizle ve güç göstergesi yok. |
| Görsel | 6/10 | Forgot-password ile tutarlı, temiz bir shadcn kartı. Ama jenerik: marka ve kurtarma anı için bir his yok, ikonlar tutarsız (yalnız ilk alanda kilit var). |
| Mimari | 5/10 | Sunucu mesajları sabit Türkçe metin ve istemci i18n'ini eziyor. Token tüketiminde kontrol-sonra-yaz yarışı var. `Input`/`Button` bileşenlerinin hazır `error`/`loading` desteği kullanılmamış. |
| Performans | 8/10 | Hafif bir istemci sayfası, tek bir POST. Küçük israf: geçersiz token için bile bcrypt(12) hesaplanıyor. |
| Erişilebilirlik + mobil | 5/10 | Label bağları ve `autocomplete="new-password"` doğru. `aria-invalid` ve `aria-describedby` yok. Token yokken çıkan uyarı `role="alert"` değil. Fallback'te sr-only metin yok. "Girişe dön" butonu 36 px, 44 px dokunma hedefinin altında. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | AuthShell üst bar: logo ile ana sayfaya link | ÇALIŞIYOR | `components/auth/auth-shell.tsx:56-99` | Logo `mounted` sonrası çiziliyor, ilk karede boş alan var (CLS riski düşük). |
| 2 | Tema değiştirme butonu | ÇALIŞIYOR | `auth-shell.tsx:42-51, 101-114` | 44 px hedef ve aria-label var. |
| 3 | "İçeriğe atla" bağlantısı | ÇALIŞIYOR | `auth-shell.tsx:55, 117-124` | |
| 4 | Gradient-mesh arka plan | ÇALIŞIYOR | `auth-shell.tsx:126-129` | Statik, hareketsiz. |
| 5 | Suspense fallback spinner'ı | KISMİ | `page.tsx:132-137` | Forgot-password'daki `sr-only` "yükleniyor" metni burada yok (`forgot-password/page.tsx:106-112`). |
| 6 | Kartın giriş animasyonu (fade + y:8) | ÇALIŞIYOR | `page.tsx:72` | Global `MotionConfig reducedMotion="user"` (`components/providers.tsx:232`) sayesinde azaltılmış harekete uyuyor. |
| 7 | Başlık ve açıklama (i18n) | ÇALIŞIYOR | `page.tsx:75-76`, `messages/tr.json:2348-2349` | |
| 8 | Token'ı URL'den okuma | KISMİ | `page.tsx:19` | Çalışıyor, ama token adres çubuğunda kalıyor ve PostHog'a sızıyor (Bulgu 1). |
| 9 | Token yokken satır içi uyarı | KISMİ | `page.tsx:80-82, 110` | Buton devre dışı ama alanlar yazılabilir kalıyor. "Yeni bağlantı iste" yolu ve `role="alert"` yok. |
| 10 | Yeni şifre alanı (kilit ikonlu) | ÇALIŞIYOR | `page.tsx:83-98` | `autoComplete="new-password"`, `minLength=8` var. Göster/gizle yok. |
| 11 | Şifre tekrar alanı | ÇALIŞIYOR | `page.tsx:99-109` | İkon yok, ilk alanla görsel tutarsızlık var. |
| 12 | İstemci kontrolü: en az 8 karakter | ÇALIŞIYOR | `page.tsx:36-39` | |
| 13 | İstemci kontrolü: şifreler eşleşmeli | ÇALIŞIYOR | `page.tsx:40-43` | Yalnız gönderimde kontrol ediliyor, canlı geri bildirim yok. |
| 14 | Üst sınır (128) istemcide | EKSİK | `route.ts:13` (sunucuda `max(128)`), istemcide yok | 129 karakter ve üstü bir parola sunucudan İngilizce Zod mesajıyla dönüyor (Bulgu 6). |
| 15 | Gönder butonu: spinner ve devre dışı | KISMİ | `page.tsx:110-113, 65-66` | `finally` loading'i kapatıyor, yönlendirmeye kadar geçen 600 ms'de buton yeniden aktif oluyor (Bulgu 9). `Button`'ın hazır `loading` prop'u kullanılmamış (`components/ui/button.tsx:54-62`). |
| 16 | POST /api/auth/reset-password çağrısı | ÇALIŞIYOR | `page.tsx:46-50`, `app/api/auth/reset-password/route.ts:15-48` | |
| 17 | Rate limit: IP başına 15 dk'da 12 deneme | KISMİ | `route.ts:18-25`, `lib/rate-limit.ts:354-362` | Çalışıyor. Mesaj sabit Türkçe, `Retry-After` kullanıcıya gösterilmiyor. |
| 18 | Hata toast'ı | KISMİ | `page.tsx:52-55, 63-64` | Sunucu metni sabit Türkçe ya da İngilizce Zod mesajı geliyor, dil karışıyor. Satır içi hata yok. |
| 19 | Başarı toast'ı ve girişe yönlendirme | KISMİ | `page.tsx:56-62`, `route.ts:47` | Sunucunun sabit Türkçe `message` alanı i18n anahtarını eziyor. 600 ms okunamayacak kadar kısa. |
| 20 | callbackUrl'yi koruyup girişe taşıma | KISMİ | `page.tsx:20-25`, `lib/safe-callback-url.ts:12` | `/\evil.com` biçimindeki girdiyi geçiriyor, giriş sayfası da bunu temizlemeden yönlendiriyor (Bulgu 3). |
| 21 | "Girişe dön" linki | ÇALIŞIYOR | `page.tsx:116-123` | `size="sm"` 36 px, dokunma hedefi küçük. |
| 22 | Token tek kullanımlık, süreli, hash'li saklanıyor | ÇALIŞIYOR | `lib/auth-email-token.ts:11-36, 38-65`, `forgot-password/route.ts:68` (1 saat) | Kontrol-sonra-yaz yarışı var (Bulgu 7). |
| 23 | bcrypt ile hash (round env'den, 10-15 arası) | ÇALIŞIYOR | `lib/password.ts:9-20` | Token doğrulanmadan önce hesaplanıyor (Bulgu 10). |
| 24 | Sıfırlamadan sonra diğer oturumların iptali | EKSİK | `lib/auth.ts:60-63` (JWT 24 saat), `auth-email-token.ts:52-61` | Bulgu 2. |
| 25 | "Şifren değiştirildi" güvenlik e-postası | EKSİK | `consumePasswordResetToken`'da e-posta yok. `PasswordChanged` araması sonuç vermedi. | Bulgu 4. |
| 26 | Denetim kaydı (auth event) | EKSİK | `lib/auth-events.ts` yalnızca login, lockout ve rate-limit olaylarını kaydediyor (25-63) | Bulgu 4. |
| 27 | Sayfa açılışında token ön doğrulaması | EKSİK | Sayfada GET çağrısı yok. API'nin yalnız POST'u var (`route.ts:15`). | Bulgu 5. |
| 28 | Süresi dolmuş bağlantıda "yeni bağlantı iste" CTA'sı | EKSİK | `page.tsx:52-55` yalnızca toast gösteriyor | Bulgu 5. |
| 29 | Şifreyi göster/gizle | EKSİK | Login (`login/page.tsx:445-457`) ve register'da (`register/page.tsx:372-387`) var, burada yok | Bulgu 8. |
| 30 | Güç göstergesi ve politika ipuçları | EKSİK | Aynı mantık `app/dealer/settings/page.tsx:367, 838-846`'da yazılmış, burada kullanılmıyor | Bulgu 8. |
| 31 | Satır içi alan hataları (`aria-invalid`, `describedby`) | EKSİK | `Input`'un `error`/`errorId` desteği var (`components/ui/input.tsx:5-20`) ama kullanılmıyor | Bulgu 11. |
| 32 | Segment hata sınırı | ÇALIŞIYOR | `app/(auth)/error.tsx:11-55` | Sentry'ye gönderiyor, retry ve login butonları var. |
| 33 | noindex ve sekme başlığı | ÇALIŞIYOR | `reset-password/layout.tsx:4-6`, `(auth)/layout.tsx:4-6`, `auth/layout.tsx:9-21` | |
| 34 | Token'ı URL'den silme ve analitikte maskeleme | EKSİK | `posthog-provider.tsx:36-41` | Bulgu 1. |
| 35 | Parola yöneticisi için gizli kullanıcı adı alanı | EKSİK | Formda `autocomplete="username"` alanı yok (`page.tsx:78-115`) | Kaydedilen yeni şifre doğru hesaba bağlanamıyor. |
| 36 | Kullanıcının diğer açık e-posta token'larını (magic_login) iptal | EKSİK | `auth-email-token.ts:52-61` yalnız bu token'ı tüketiyor | Düşük risk, Bulgu 2 içinde. |

Toplam 36 özellik: ÇALIŞIYOR 16 · KISMİ 8 · BOZUK 0 · SAHTE 0 · EKSİK 12.

---

## Bulgular

### 1. Sıfırlama token'ı PostHog'a (üçüncü taraf) ve session replay'e sızıyor
- **Önem:** yüksek · **Kategori:** güvenlik / gizlilik · **Efor:** S
- **Kanıt:**
  - `components/analytics/posthog-provider.tsx:36-41`: `$pageview` olayına `pathname + '?' + searchParams` ekleniyor. `/auth/reset-password?token=<64 hex>` olduğu gibi gidiyor.
  - Aynı dosyanın 22-24. satırlarında `autocapture: true`, `capture_pageleave: true` ve session recording açık. Bu olayların hepsi `window.location.href` değerini, yani token'ı `$current_url` olarak taşıyor.
  - `page.tsx:19` token'ı okuyor ama URL'den hiç silmiyor.
  - Token 1 saat geçerli ve kullanılana kadar aktif (`forgot-password/route.ts:68`, `auth-email-token.ts:42-49`).
- **Sorun:** E-postayı açıp sayfaya gelen ama formu hemen doldurmayan kullanıcının token'ı, PostHog projesine erişimi olan herkesin göreceği yerde düz metin olarak duruyor. Bu kişiler 1 saat içinde hesabın şifresini değiştirebilir. 2FA'sı olmayan hesaplar için bu doğrudan hesap ele geçirme vektörü.
- **Not:** Lokal `.env`'de `NEXT_PUBLIC_POSTHOG_KEY` yok. Canlıda tanımlı olup olmadığı **doğrulanmadı**. Proje hafızasına göre PostHog funnel'ı canlıya alınmıştı, bu yüzden risk büyük olasılıkla gerçek.
- **Öneri:**
  1. Sayfa ilk açıldığında token'ı bellekteki state'e (ya da `sessionStorage`'a) alın ve `history.replaceState` ile URL'den `token` parametresini hemen silin. Böylece analitik, ekran görüntüsü ve tarayıcı geçmişi token'ı görmez.
  2. PostHog `init` içinde `before_send` (ya da `sanitize_properties`) ekleyin ve `$current_url`, `$referrer`, `$pathname` alanlarındaki `token|code|secret` parametrelerini redakte edin. Bu kural magic-link, verify-email ve davet sayfaları için de gerekli.
  3. `PageviewTracker` içinde bilinen hassas parametreleri bir izin-listesi/engel-listesi ile süzün.
  4. Uzun vadede token'ı sorgu dizisi yerine fragment'e (`#t=…`) taşıyın: fragment sunucuya ve Referer'a gitmez. Ama analitik maskeleme bu durumda da gerekli.

### 2. Şifre sıfırlandıktan sonra açık oturumlar geçerli kalıyor
- **Önem:** yüksek · **Kategori:** güvenlik · **Efor:** M
- **Kanıt:**
  - `lib/auth.ts:60-63`: oturum stratejisi `jwt`, `maxAge` varsayılanı 24 saat (`auth.ts:31-39`).
  - `lib/auth-email-token.ts:52-61` yalnızca `password` alanını ve token'ı güncelliyor.
  - Kodda `passwordChangedAt`, `sessionVersion` ya da `tokenVersion` benzeri bir alan yok (grep sonucu boş).
  - `jwt` callback'i DB'yi yalnızca login anında okuyor (`auth.ts:212-268`).
- **Sorun:** Şifre sıfırlamanın birincil nedeni hesabın ele geçirilmiş olması. Saldırganın elindeki JWT, kurban şifreyi değiştirdikten sonra da 24 saate kadar geçerli kalıyor. Puan, ödül ve ekonomi içeren bir sistemde bu süre puan ya da ödül kodu çalınması için yeterli. Ayrıca aynı kullanıcı için daha önce üretilmiş `magic_login` token'ları da iptal edilmiyor.
- **Öneri:**
  - `User` modeline `sessionVersion Int @default(0)` (ya da `passwordChangedAt DateTime?`) ekleyin. Değer sıfırlamada artsın, değişiklik `/api/user/password` ve `set-password` uçlarında da aynı şekilde uygulansın.
  - JWT'ye `sv` claim'ini yazın. `lib/api-auth.ts` içindeki oturum doğrulamasında Redis sıcak katmanından (token-replay desenindeki gibi `sv:{userId}`) karşılaştırın, uyuşmazlıkta 401 dönün.
  - Aynı transaction içinde `authEmailToken.deleteMany({ where: { userId, consumedAt: null } })` ile kalan magic ve reset token'larını silin.
  - Sıfırlama ekranına "Tüm cihazlardan çıkış yap" seçeneği ekleyin, varsayılan olarak işaretli olsun.

### 3. callbackUrl temizleyicisi `/\` ile aşılıyor ve sıfırlama e-postası üzerinden açık yönlendirmeye (phishing) zincirleniyor
- **Önem:** yüksek · **Kategori:** güvenlik · **Efor:** S
- **Kanıt:**
  - `lib/safe-callback-url.ts:12`: `if (s.startsWith('/') && !s.startsWith('//')) return s;`. `"/\evil.com"` ve `"/\t/evil.com"` gibi girdiler bu kontrolden geçiyor. Tarayıcılar `\` karakterini `/` olarak yorumluyor ve sekme karakterini atıyor, sonuç `//evil.com` protokolden bağımsız URL'si oluyor.
  - `app/api/auth/forgot-password/route.ts:70-73` aynı temizleyiciyle bu değeri **gerçek Qratex e-postasının** içine yazıyor.
  - Reset sayfası değeri login linkine taşıyor (`page.tsx:22-25`).
  - `app/(auth)/auth/login/page.tsx:67, 125-126`: `window.location.href = callbackUrl` hiç temizlenmeden çalıştırılıyor. Yani login sayfası `https://evil.com`'u bile kabul ediyor.
- **Sorun:** Saldırgan kurbanın e-postasına `callbackUrl=/\phish.example` içeren gerçek bir sıfırlama e-postası tetikleyebilir. Kurban şifresini sıfırlar, giriş yapar ve sahte siteye düşer. Sahte site "oturum doldu, tekrar girin" diyerek yeni şifreyi çalabilir.
- **Öneri:**
  - `safePostLoginRedirect` fonksiyonunu dize kontrolü yerine `new URL(s, allowedOrigin)` ile çözümleyin ve **origin eşitliği** üzerinden doğrulayın. Ayrıca `\`, kontrol karakterleri ve `%5C` içeren girdileri reddedin.
  - Login sayfasındaki `redirectAfterLogin` de aynı fonksiyondan geçmeli.
  - Bu bir login sayfası bulgusu ama reset akışını doğrudan etkilediği için burada da raporlanıyor.
  - `safe-callback-url` için birim testleri ekleyin: `/\`, `/%09/`, `\\`, `javascript:` ve büyük-küçük harfli şema varyantları.

### 4. Güvenlik bildirimi ve denetim kaydı yok
- **Önem:** yüksek · **Kategori:** güvenlik / ürün · **Efor:** S-M
- **Kanıt:**
  - `consumePasswordResetToken` (`auth-email-token.ts:38-65`) ve route (`route.ts:41-47`) şifre değiştikten sonra hiçbir e-posta göndermiyor ve olay kaydetmiyor.
  - `lib/auth-events.ts` yalnızca login/lockout/rate-limit kaydediyor.
- **Sorun:** Hesap sahibi şifresinin değiştiğinden haberdar olmuyor. Revolut, Monzo ve Starbucks "Şifren değiştirildi, sen değilsen buraya dokun" e-postasını standart olarak gönderir. Destek ve dolandırıcılık incelemesi için de iz kalmıyor.
- **Öneri:**
  - `lib/email`'e `sendPasswordChangedEmail(email, { when, ip, ua, revokeUrl })` ekleyin. Mevcut marka mail şablonunu kullanın, logo için HTTPS URL verin (data-URI kullanmayın).
  - `revokeUrl` ayrı bir kısa ömürlü token'la "Bu ben değildim → tüm oturumları kapat ve hesabı kilitle" akışını açsın.
  - `logAuthEvent({ type: 'password_reset', ip, userId })` ekleyin.
  - E-posta gönderimini `after()` ile yanıttan sonra yapın, böylece kullanıcıyı bekletmez.

### 5. Süresi dolmuş ya da geçersiz bağlantı kullanıcıyı çıkmazda bırakıyor
- **Önem:** orta · **Kategori:** UX · **Efor:** M
- **Kanıt:**
  - Sayfa açılışında token kontrolü yapılmıyor (`page.tsx` içinde useEffect veya fetch yok). Kullanıcı iki şifreyi yazıp gönderdikten sonra öğreniyor (`page.tsx:52-55`).
  - Token hiç yoksa yalnızca kırmızı bir satır çıkıyor (`page.tsx:80-82`) ve alanlar yazılabilir kalıyor.
  - İki durumda da forgot-password sayfasına giden bir CTA yok.
- **Sorun:** E-postayı ertesi gün açan kullanıcı (token 1 saat geçerli) formu boşuna doldurur, sonra küçük bir toast görür, ve tek yol "Girişe dön" olur. Kurtarma akışında terk oranını en çok artıran şey bu tür çıkmazlar.
- **Öneri:**
  - `GET /api/auth/reset-password?token=` ya da `POST /api/auth/reset-password/validate` ucu ekleyin. Uç yan etkisiz olmalı, aynı IP rate limit'ine tabi olmalı ve `{ valid, expiresInSec, maskedEmail: "f***@g***.com" }` dönmeli.
  - Sayfanın üç durumu olsun: **doğrulanıyor** (iskelet), **geçerli** (form ve "f***@gmail.com hesabı için", geri sayım "bağlantı 42 dk geçerli") ve **geçersiz/süresi dolmuş** (ikonlu boş durum ve "Yeni bağlantı gönder" birincil butonu). Bu buton `/auth/forgot-password?callbackUrl=…` adresine e-posta dolu olarak gitmeli.
  - `maskedEmail`, parola yöneticisi için gizli `username` alanını doldurmayı da mümkün kılar (Özellik 35).

### 6. Dil karışıklığı: sunucu metinleri sabit Türkçe, Zod mesajları İngilizce
- **Önem:** orta · **Kategori:** i18n / mimari · **Efor:** S
- **Kanıt:**
  - `route.ts:22, 32, 38, 47` ve `auth-email-token.ts:51` sabit Türkçe metin döndürüyor.
  - İstemci bu metni i18n anahtarının önüne koyuyor: `page.tsx:53` `data.error || t(...)` ve `page.tsx:56` `data.message || t('auth.resetPasswordSuccess')`. Sonuçta İngilizce kullanıcı bile başarıda "Şifreniz güncellendi. Giriş yapabilirsiniz." görüyor.
  - `route.ts:11-14` şemasında özel mesaj yok. Zod varsayılanı ("String must contain at most 128 character(s)") Türkçe kullanıcıya İngilizce dönüyor. İstemci 128 sınırını uygulamadığı için uzun bir passphrase bu yolu tetikliyor.
- **Öneri:**
  - API'lar insan metni yerine **makine kodu** dönsün: `{ code: 'TOKEN_INVALID' | 'RATE_LIMITED' | 'PASSWORD_TOO_LONG' | 'PASSWORD_TOO_SHORT' }`. İstemci bunları `t('auth.errors.' + code)` ile çevirsin.
  - Başarıda istemci her zaman kendi i18n metnini kullansın.
  - İstemcide `maxLength={128}` ve sayaç ekleyin.
  - Aynı desen forgot-password ve set-password uçlarında da var, birlikte düzeltin.

### 7. Token tüketiminde kontrol-sonra-yaz yarışı (TOCTOU)
- **Önem:** orta-düşük · **Kategori:** veri bütünlüğü · **Efor:** S
- **Kanıt:** `auth-email-token.ts:42-61`. Önce `findFirst` ile `consumedAt: null` kontrol ediliyor, sonra koşulsuz `authEmailToken.update({ where: { id } })` çalışıyor. İki eşzamanlı istek ikisi de kontrolü geçip iki farklı şifre yazabiliyor, son yazan kazanıyor.
- **Sorun:** Pratik etkisi düşük, çünkü iki isteğin de token'a sahip olması gerekiyor. Ama "tek kullanımlık" garantisi atomik değil. Bulgu 1'deki sızıntıyla birleşince saldırgan, kurbanla aynı anda gönderim yapıp yarışı kazanabilir.
- **Öneri:** İnteraktif transaction içinde `updateMany({ where: { id, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } })` çalıştırın. `count === 1` değilse geri dönün, kullanıcı güncellemesini yalnızca o durumda yapın. Bu, proje hafızasındaki "atomik tek seferlik kredi" deseniyle aynı.

### 8. Şifre girişi ergonomisi zayıf: göster/gizle, güç göstergesi ve politika ipucu yok
- **Önem:** orta · **Kategori:** UX / tutarlılık · **Efor:** S-M
- **Kanıt:**
  - Göster/gizle login'de (`login/page.tsx:445-457`) ve register'da (`register/page.tsx:372-387`) var, burada yok (`page.tsx:87-108`).
  - Güç hesaplaması yalnızca `app/dealer/settings/page.tsx:367` içinde yerel olarak yazılmış.
  - Politika olarak sadece `min 8` var (`route.ts:13`). Sızmış parola kontrolü yok.
- **Öneri:**
  - Ortak bir `components/auth/password-field.tsx` bileşeni çıkarın: göster/gizle, canlı kural listesi (8+ karakter, harf ve rakam, "eşleşiyor ✓") ve dört segmentli güç çubuğu içersin. Dealer settings, register, set-password ve reset aynı bileşeni kullansın.
  - İsteğe bağlı olarak sunucuda HIBP k-anonymity kontrolü ekleyin: SHA-1'in ilk 5 karakteri gönderilir, `fetch` 2 sn timeout ve fail-open olmalı.
  - "Yeni şifre eski şifreyle aynı" uyarısı için mevcut hash ile `bcrypt.compare` yapın.

### 9. Başarı anı: buton yeniden aktif oluyor, yönlendirme 600 ms'de ve sert
- **Önem:** düşük-orta · **Kategori:** UX / hata · **Efor:** S
- **Kanıt:**
  - `page.tsx:57-66`: başarıda alanlar temizleniyor, `setTimeout(600)` kuruluyor, ama `finally` `loading=false` yapıyor ve buton yeniden aktifleşiyor.
  - Bu sırada tekrar tıklayan kullanıcı alanlar boş olduğu için "en az 8 karakter" toast'ı görüyor. Alanları doldurup yeniden gönderirse tüketilmiş token yüzünden "Geçersiz veya süresi dolmuş bağlantı" alıyor.
  - Başarı yalnızca bir toast, 600 ms okumak için çok kısa. `window.location.href` tam sayfa yeniden yükleme yapıyor.
- **Öneri:**
  - `status: 'idle' | 'submitting' | 'success'` state makinesi kurun.
  - Başarıda formu kartın içinde bir **başarı paneli** ile değiştirin: onay ikonu, "Şifren güncellendi", "Tüm cihazlarda oturum kapatıldı" (Bulgu 2 uygulanırsa) ve "Giriş yap" birincil butonu. İsteğe bağlı olarak 3 sn'lik görünür bir geri sayımla otomatik yönlendirme yapın.
  - `router.replace` kullanın ve login'e `?email=` ile `&reset=1` geçirin. Login bu parametrelerle e-postayı doldurup başarı bandı gösterebilir.

### 10. bcrypt, token doğrulanmadan önce çalışıyor
- **Önem:** düşük · **Kategori:** performans / DoS · **Efor:** S
- **Kanıt:** `route.ts:41-42`. `hashPassword` (12-15 round) `consumePasswordResetToken`'dan önce çağrılıyor.
- **Sorun:** Geçersiz token'lı her istek yaklaşık 250 ms ya da daha fazla CPU harcıyor. Rate limit (IP başına 12) bunu sınırlıyor ama IP rotasyonuyla serverless maliyeti büyüyebilir.
- **Öneri:** Önce token'ı salt-okunur doğrulayın. Hash'i yalnızca geçerli token için hesaplayın, sonra Bulgu 7'deki atomik tüketimi yapın.

### 11. Erişilebilirlik boşlukları
- **Önem:** düşük-orta · **Kategori:** a11y · **Efor:** S
- **Kanıt:**
  - Hatalar yalnızca toast olarak çıkıyor (`page.tsx:33-42`). `Input`'un `error`/`errorId` desteği (`components/ui/input.tsx:5-20`) kullanılmıyor, bu yüzden `aria-invalid` ve `aria-describedby` yok.
  - Token uyarısı `<p className="text-destructive">` ve `role="alert"` ya da `aria-live` taşımıyor (`page.tsx:81`).
  - Fallback'te `sr-only` metin yok (`page.tsx:134-136`). Forgot-password'da var.
  - "Girişe dön" `size="sm"` ve `h-9` (`components/ui/button.tsx:31`), yani 36 px. Mobilde önerilen 44 px'in altında.
  - İlk alana otomatik odak yok.
  - Alan id'leri `np`/`npc` anlamsız. Çalışıyorlar ama okunabilirlik zayıf.
- **Öneri:** Alan altına `<p id=… role="alert">` ile satır içi hata ekleyin ve `error`/`errorId` prop'larını bağlayın. Geçerli token durumunda ilk alana odaklanın. Footer butonunu `size="default"` yapın. Fallback'e `sr-only` "yükleniyor" ekleyin.

### 12. Görsel tutarlılık ve kimlik
- **Önem:** düşük · **Kategori:** görsel · **Efor:** S
- **Kanıt:**
  - Kilit ikonu yalnızca ilk alanda var (`page.tsx:86`), ikinci alanda yok (`page.tsx:101-108`).
  - Forgot-password footer'ında `border-t pt-4` var (`forgot-password/page.tsx:90`), burada yok (`page.tsx:116`).
  - Kart, platformun oyunlaştırılmış ve marka odaklı dilinden kopuk, jenerik bir shadcn kartı.
- **Öneri:** İki sayfayı ortak bir `AuthCard` (başlık, ikon rozeti, içerik, footer) bileşenine taşıyın. Kartın üstüne kurtarma anını anlatan küçük bir ikon rozeti koyun (kalkan + anahtar).

---

## Eksik özellikler (kıyas ürünlerle)

1. **"Şifren değiştirildi" e-postası ve "Bu ben değildim" tek tık geri alma** (Revolut, Monzo, Starbucks). Güvenliğin asgari standardı.
2. **Tüm cihazlardan çıkış** seçeneği ve bunun sonucunun gösterilmesi (Revolut, Spotify). Açık oturumlar ve cihaz listesi.
3. **Bağlantı ön doğrulaması ve "yeni bağlantı gönder" kurtarma yolu**, kalan süre göstergesi (Duolingo, Spotify).
4. **Canlı parola kuralları, güç çubuğu, sızmış parola uyarısı ve göster/gizle** (Monzo, 1Password tarzı geri bildirim).
5. **Sıfırlama sonrası pürüzsüz devam:** e-postası dolu login ve başarı bandı, ya da 2FA'ya saygılı otomatik giriş. Kullanıcıyı callbackUrl ile kaldığı QR geri bildirim akışına geri götürmek (Starbucks: sipariş ortasında şifre sıfırlayıp sepete dönme).
6. **Parola yöneticisi uyumu:** gizli `username` alanı (maskelenmiş e-posta) ve doğru `autocomplete` bağlantısı.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Hesap kurtarma kullanıcının en kaygılı olduğu andır. Sayfa sakin, güven veren ve tek amaca odaklı olmalı. Her durumda bir sonraki adımı net göstermeli ve sonunda kullanıcıyı kaldığı yere geri götürmeli: QR geri bildirimi, ödül talebi, oyun.

**Yerleşim (tek kart, üç durum):**
1. **Doğrulanıyor:** kart iskeleti ve "Bağlantın kontrol ediliyor…" yazısı. Token URL'den silinmiş olmalı (Bulgu 1).
2. **Geçerli:**
   - Üstte kalkan-anahtar rozeti, ardından "Yeni şifreni belirle".
   - Alt satırda "f\*\*\*@gmail.com hesabı için · bağlantı 42 dk geçerli".
   - Ortak `PasswordField`: göster/gizle, canlı kural listesi ve güç çubuğu.
   - Tekrar alanında canlı "eşleşiyor ✓" göstergesi.
   - "Tüm cihazlardan çıkış yap" onay kutusu, varsayılan olarak işaretli.
   - Birincil buton "Şifreyi güncelle", altında "Girişe dön".
3. **Başarılı:** form yerine başarı paneli. Onay ikonu, "Şifren güncellendi", "3 cihazda oturum kapatıldı" ve "Giriş yap" (e-posta dolu, callbackUrl korunmuş).
4. **Geçersiz/süresi dolmuş:** dostça bir boş durum, "Bu bağlantının süresi dolmuş" ve birincil "Yeni bağlantı gönder" butonu (forgot-password'a e-posta dolu gider).

**Motion (ölçülü):**
- Kartın girişi mevcut haliyle yeterli.
- Durum geçişlerinde `AnimatePresence` ile 150-200 ms'lik crossfade ve yükseklik animasyonu kullanılabilir.
- Güç çubuğu segmentleri yumuşak dolabilir. Başarıda onay ikonu tek seferlik stroke çizimiyle (`pathLength`) belirebilir.
- 3B, konfeti ya da oyunlaştırma efekti **uygun değil**: bu bir güvenlik anı, ödül anı değil.
- Global `reducedMotion="user"` zaten uygulanıyor. Ek olarak geri sayımın hareketsiz bir metin karşılığı olmalı.

**Veri/API değişiklikleri:**
- `GET /api/auth/reset-password/validate`: yan etkisiz, rate limit'li, `{ valid, expiresInSec, maskedEmail }` döner.
- `POST /api/auth/reset-password`:
  - Önce token doğrulama, sonra hash, sonra atomik `updateMany` ile tüketim.
  - Kullanıcının diğer token'larını silme ve `sessionVersion++`.
  - `after()` içinde `sendPasswordChangedEmail` ve `logAuthEvent`.
  - Yanıt yalnızca `{ code }` biçiminde makine kodu.
- `User.sessionVersion` (migration). JWT'ye `sv` claim'i eklenir. `api-auth` Redis sıcak katmanda karşılaştırır.
- `safePostLoginRedirect` origin tabanlı yeniden yazılır, login `redirectAfterLogin` da bu fonksiyondan geçer.
- PostHog `before_send` ile hassas sorgu parametreleri redakte edilir.

---

## Çakışmalar / birleştirme önerisi

- **`/auth/forgot-password`** ile neredeyse birebir aynı iskelet var (`forgot-password/page.tsx:60-101` ile `page.tsx:70-127`): aynı kart, aynı Suspense, aynı callbackUrl mantığı, aynı footer. İki sayfa ayrı rotalar olarak kalabilir, çünkü e-posta linki derin bağlantı gerektiriyor. Ama ortak bir **`components/auth/recovery/`** modülüne (`AuthCard`, `PasswordField`, `RecoveryStatusPanel`, `useSafeCallback`) taşınmalılar. Kopya kod şu an tutarsızlık üretiyor: fallback sr-only metni ve footer stili.
- **`/api/auth/set-password`** (OAuth hesabına şifre ekleme) ve **`/api/user/password`** (şifre değiştirme) aynı işi farklı kurallarla yapıyor: `max(200)` ile `max(128)`, farklı mesajlar, birinde emailVerified güvencesi var. Parola politikası ve "şifre değişti" yan etkileri (oturum iptali, bildirim, denetim) tek bir `lib/password-change.ts` servisinde toplanmalı, üç uç da bu servisi çağırmalı.
- **`/auth/magic`** de aynı token altyapısını kullanıyor. Analitik redaksiyonu (Bulgu 1) ve atomik tüketim (Bulgu 7) bu sayfaya da uygulanmalı.
- Sayfa **kaldırılmamalı**: kurtarma akışının zorunlu son adımı.

---

## Doğrulama (şüpheci inceleme)

Yöntem: ilgili kod baştan okundu (`page.tsx`, `lib/auth-email-token.ts`, `app/api/auth/{forgot,reset}-password/route.ts`, `lib/auth.ts`, `lib/api-auth.ts`, `lib/token-replay.ts`, `lib/safe-callback-url.ts`, `app/(auth)/auth/login/page.tsx`, `components/analytics/posthog-provider.tsx`, `proxy.ts`, `next.config.js`, `node_modules/next-auth` 4.24.15). Kod değiştirilmedi, veritabanına dokunulmadı. Yalnızca canlı sitenin yanıt başlıkları salt okunur `curl -I` ile kontrol edildi.

### 1. Şifre sıfırlama token'ı PostHog'a sızıyor: **ÇÜRÜTÜLDÜ (şu an istismar edilemez, gizli risk olarak kalıyor)**
- Kod tarafı doğru: `posthog-provider.tsx:37-41` `$pageview` olayına sorgu dizgisini ekliyor, `:22-24` autocapture, pageleave ve session recording açık. posthog-js her olaya zaten `$current_url = window.location.href` ekler.
- Ancak bu istekler tarayıcıdan çıkamıyor. `proxy.ts:124` matcher'ı `/auth/*` yolunu kapsamıyor. Bu yüzden `/auth/reset-password` için yalnızca `next.config.js:350-352` CSP'si geçerli ve `connect-src` listesinde `*.posthog.com` yok. Canlıda doğrulandı: `curl -I https://demoqratex.vercel.app/auth/reset-password` yanıtındaki `Content-Security-Policy` başlığında `connect-src 'self' https://*.supabase.co … https://tile.openstreetmap.org` var, PostHog yok. fetch, XHR ve `sendBeacon` çağrılarının hepsi `connect-src` ile engelleniyor. CSP belge başına uygulandığı için istemci tarafı gezinti de bu durumu değiştirmiyor.
- Sonuç: canlıda token PostHog'a ulaşamıyor. Somut bir kullanıcı ya da veri etkisi kurulamadı.
- Yan bulgu: aynı CSP nedeniyle PostHog funnel/replay büyük olasılıkla **hiçbir sayfada veri toplamıyor**. Hafızadaki "funnel canlıda" notu yalnız key'in bundle'a gömüldüğünü doğruluyor.
- Gizli risk: biri analitiği çalıştırmak için `connect-src`'ye PostHog'u eklerse sızıntı anında gerçek olur. CSP gevşetilmeden önce `before_send` / `sanitize_properties` ile `token`, `magicToken` ve `callbackUrl` parametreleri redakte edilmeli ve `/auth/*` yollarında session recording kapatılmalı. Önce bu ikisi yapılmalı, CSP ondan sonra açılmalı.

### 2. Şifre sıfırlama mevcut oturumları iptal etmiyor: **DOĞRULANDI**
- `lib/auth-email-token.ts:54-63` yalnızca `user.password` ve `consumedAt` alanlarını güncelliyor. Şemada `sessionVersion` ya da `passwordChangedAt` yok. `lib/auth.ts:60-63` stateless JWT kullanıyor. `requireAuth` (`lib/api-auth.ts:52-80`) yalnız jti + IP/UA tutarlılığına bakıyor, şifre değişimine bakmıyor.
- İddiadan daha ağır: next-auth 4.24.15 `core/routes/session.js:60-79` her `/api/auth/session` çağrısında JWT'yi yeni `exp` ile yeniden imzalıyor. Aktif kullanılan bir saldırgan oturumu bu yüzden 24 saatte değil, **süresiz** olarak yaşayabiliyor.
- Yeniden üretim:
  1. Saldırgan çalınan şifreyle kendi cihazından giriş yapar. Kendi jti'si oluşur, token-replay alarmı çalmaz.
  2. Kurban `/auth/forgot-password` → e-posta → `/auth/reset-password` ile şifresini değiştirir.
  3. Saldırgan cookie'si `/api/customer/*` çağrılarında 200 almaya devam eder ve puan/ödül işlemleri yapabilir.
- Açık `magic_login` token'larının silinmediği de doğru (`consumePasswordResetToken` dokunmuyor). Bu kısmın etkisi düşük: o token'lar zaten kurbanın e-postasına gidiyor.
- Öneri: raporun ilgili bölümündeki `sessionVersion` claim'i ve `requireAuth`/proxy kontrolü. Ek olarak sıfırlamada kullanıcının tüm `AuthEmailToken` kayıtları ve `SessionTokenUsage` jti'leri temizlenmeli.

### 3. `safePostLoginRedirect` `/\` ile aşılıyor, login callbackUrl'yi temizlemiyor: **DOĞRULANDI**
- `lib/safe-callback-url.ts:13`: `'/\phish.example'` değeri `startsWith('/') && !startsWith('//')` koşulunu geçiyor. WHATWG URL ayrıştırıcısı özel şemalarda `\` karakterini `/` sayar. Bu yüzden `location.href = '/\phish.example'` → `https://phish.example/` olur. Testlerde (`__tests__/lib/safe-callback-url.test.ts`) bu durum yok.
- Zincir:
  1. Saldırgan `POST /api/auth/forgot-password {email: kurban, callbackUrl: "/\phish.example"}` gönderir. `route.ts:70-73` değeri gerçek Qratex e-postasına gömer.
  2. `reset-password/page.tsx:22-25` aynı kusurlu fonksiyondan geçirip login linkine taşır.
  3. `login/page.tsx:67,125-126` `window.location.href = callbackUrl` ile kurbanı girişten hemen sonra harici siteye gönderir. Sahte site "oturum süresi doldu, tekrar girin" ekranıyla yeni şifreyi toplar.
- Login sayfası hiç temizleme yapmadığı için daha kısa yol da var: `/auth/login?callbackUrl=https://phish.example`.
- Ayrıca `callbackUrl=javascript:...` ile giriş sonrasında **DOM XSS** oluşuyor. CSP `script-src` içinde `'unsafe-inline'` var, `javascript:` URL'sini engellemez. Bu bulgu login sayfasının raporunda KRİTİK olarak ele alınmalı.
- Düzeltme: `new URL(s, origin)` ile çözümleyip `u.origin === origin` kontrolü yapmak, `\` ve kontrol karakterlerini reddetmek. `redirectAfterLogin` ve Google `signIn` yolu da bu fonksiyondan geçmeli. `'/\x'`, `'/\t/x'` ve `'javascript:'` test vakaları eklenmeli.

### 4. Token tüketimi atomik değil (TOCTOU): **ÇÜRÜTÜLDÜ (KRİTİK/YÜKSEK olarak; düşük öncelikli sağlamlaştırma)**
- Kod gözlemi doğru: `auth-email-token.ts:43-63` önce `findFirst`, ardından koşulsuz `update({where:{id}})` yapıyor. Eşzamanlı iki istek ikisi de geçebilir ve son yazan kazanır.
- Ancak yarışa girebilmek için token'a sahip olmak gerekir. Token sahibi tek bir istekle zaten şifreyi değiştirebilir, yarış ona ek bir yetki kazandırmaz. Sızıntı kanalı olarak gösterilen PostHog da (iddia 1) canlıda kapalı. Meşru kullanıcının çift tıklaması `disabled={loading}` (`page.tsx:110`) ile engelleniyor, iki istek gitse bile aynı kişinin şifresi yazılır.
- Somut bir kullanıcı ya da veri etkisi kurulamadı.
- Yine de `updateMany({where:{id, consumedAt:null}})` + `count === 1` deseni (puan ekonomisindeki atomik tek-seferlik kredi kuralıyla tutarlı) ucuz bir sağlamlaştırma. Aynı desen `consumeMagicLoginToken` (`:113-116`) için de uygulanmalı.
