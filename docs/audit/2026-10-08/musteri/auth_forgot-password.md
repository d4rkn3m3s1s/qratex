# /auth/forgot-password

**Amaç:** Şifresini unutan kullanıcının e-posta adresine tek kullanımlık, 1 saat geçerli bir şifre sıfırlama bağlantısı göndermek ve isteğe bağlı `callbackUrl`'yi akış boyunca taşımak (girişten sonra kaldığı yere dönsün diye).
**Genel puan:** 5.5/10
**Karar:** koru-iyileştir (çekirdek akış sağlam; iki güvenlik açığı, bir veri tutarlılığı hatası ve tamamen toast'a dayanan zayıf bir başarı deneyimi var)

İncelenen dosyalar: `app/(auth)/auth/forgot-password/page.tsx`, `app/(auth)/auth/forgot-password/layout.tsx`, `app/(auth)/auth/layout.tsx`, `app/(auth)/layout.tsx`, `components/auth/auth-shell.tsx`, `lib/safe-callback-url.ts`, `app/api/auth/forgot-password/route.ts`, `lib/auth-email-token.ts`, `lib/email.ts` (`sendPasswordResetEmail`), `lib/rate-limit.ts` (`checkAuthEmailActionLimit`, `checkRateLimitDb`, `getClientIdentifier`), `lib/public-app-origin.ts`, `app/api/auth/register/route.ts`, `lib/auth.ts`, `app/(auth)/auth/login/page.tsx`, `app/(auth)/auth/reset-password/page.tsx`, `app/api/auth/reset-password/route.ts`, `prisma/schema.prisma` (`User`, `AuthEmailToken`), `messages/tr.json` ve `messages/en.json`, `components/providers.tsx`.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 6/10 | Akış uçtan uca çalışıyor, token tasarımı doğru; ama karışık harfli e-postayla kayıtlı kullanıcılar hiç sıfırlama alamıyor ve tekrar gönderim önceki linki sessizce geçersiz kılıyor. |
| UX | 4/10 | Tek geri bildirim kaybolan bir toast; "gelen kutunu kontrol et" durumu, maskeli e-posta, yeniden gönderme sayacı, doğrulanmamış hesap yönlendirmesi yok. |
| Görsel | 5/10 | Temiz ama jenerik bir shadcn kartı; marka kimliği, illüstrasyon ya da başarı anı yok; reset/magic sayfalarıyla birebir kopya. |
| Mimari | 6/10 | API'de rate-limit, zod, hash'li token, env tabanlı origin iyi; ama `safePostLoginRedirect` baypas edilebiliyor, sunucu metinleri sabit Türkçe ve sayfa iskeleti üç yerde kopyalanmış. |
| Performans | 8/10 | Hafif istemci sayfası, tek fetch; tek sorun sunucuda SMTP gönderiminin yanıtı bloklaması (hem gecikme hem zamanlama sızıntısı). |
| Erişilebilirlik + mobil | 6/10 | Label/htmlFor, skip-link, 44px tema butonu, `MotionConfig reducedMotion="user"` var; ama satır içi hata/`aria-describedby`, odak yönetimi ve kalıcı durum metni yok. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Üst bar logo → ana sayfa linki | ÇALIŞIYOR | `components/auth/auth-shell.tsx:58-100` | Logo yalnızca `mounted` sonrası çizilir; ilk karede boş header (küçük CLS). |
| 2 | Tema (açık/koyu) değiştirme | ÇALIŞIYOR | `auth-shell.tsx:43-52, 102-115` | 44px dokunma hedefi, `aria-label` var. |
| 3 | "Ana içeriğe geç" bağlantısı | ÇALIŞIYOR | `auth-shell.tsx:56, 118-121` | `#auth-main` hedefi `tabIndex=-1`. |
| 4 | Arka plan gradient mesh | ÇALIŞIYOR | `auth-shell.tsx:126-129` | Statik, hareket yok. |
| 5 | Sekme başlığı + noindex meta | ÇALIŞIYOR | `forgot-password/layout.tsx:4-6`, `app/(auth)/layout.tsx:4-6`, `app/(auth)/auth/layout.tsx:9-20` | i18n anahtarı `layoutMetadata.authForgotPassword` TR/EN mevcut (`messages/tr.json:143`). |
| 6 | Suspense yükleniyor durumu (spinner + sr-only metin) | ÇALIŞIYOR | `page.tsx:105-113, 115-120` | `useSearchParams` için zorunlu sınır. |
| 7 | Kart giriş animasyonu (fade + 8px yukarı) | ÇALIŞIYOR | `page.tsx:62` | Global `MotionConfig reducedMotion="user"` ile azaltılmış hareket destekli (`components/providers.tsx:232`). |
| 8 | Başlık ve açıklama metni (i18n) | ÇALIŞIYOR | `page.tsx:65-66`, `messages/tr.json:2342-2343` | |
| 9 | E-posta alanı (label, ikon, `type=email`, `autoComplete=email`, `required`) | ÇALIŞIYOR | `page.tsx:70-84` | `autoFocus` yok; yerel tarayıcı doğrulaması kullanılıyor. |
| 10 | Boş e-posta ön kontrolü | ÇALIŞIYOR | `page.tsx:31` | Sessizce `return`; mesaj yok (native `required` zaten yakalar). |
| 11 | Gönder butonu + yükleniyor spinner/disable | ÇALIŞIYOR | `page.tsx:85-88` | İstek bitince tekrar aktif; cooldown yok. |
| 12 | `POST /api/auth/forgot-password` çağrısı | KISMİ | `page.tsx:37-41`, `route.ts:19-92` | Çalışıyor; ancak bkz. #13, #18, #19. |
| 13 | Karışık harfli e-postayla kayıtlı hesap için sıfırlama | BOZUK | `route.ts:61-65` vs `app/api/auth/register/route.ts:40,45,60`, `lib/auth.ts:137` | Kayıt ve giriş e-postayı olduğu gibi saklar/arar; forgot-password `toLowerCase()` ile arar → eşleşme yok, sessiz "gönderildi". |
| 14 | `callbackUrl` taşıma (login → forgot → e-posta → reset → login) | KISMİ | `page.tsx:19-24, 35`, `route.ts:70-73`, `lib/safe-callback-url.ts:13` | `/\evil.com` biçimi filtreyi geçiyor (bkz. Bulgu 1). |
| 15 | Başarı geri bildirimi | KISMİ | `page.tsx:48-52` | Yalnızca toast; sunucunun Türkçe `message`'ı i18n anahtarına tercih ediliyor → EN kullanıcı TR metin görür. |
| 16 | Mail sunucusu yapılandırılmamış (503) hatası | KISMİ | `page.tsx:44-45`, `route.ts:35-44` | Son kullanıcıya "Vercel’de SMTP… RESEND_API_KEY" gibi yönetici talimatı gösteriliyor. |
| 17 | Genel/ağ hatası | ÇALIŞIYOR | `page.tsx:46-47, 53-54` | `common.error` i18n. |
| 18 | IP başına hız sınırı (8 / 15 dk) | KISMİ | `route.ts:20-33`, `lib/rate-limit.ts:345-362` | Redis-first + DB fallback doğru; ama e-posta başına sınır yok ve limit aşılınca 200 + başarı toast'ı dönüyor (kullanıcı mail gelmeyeceğini bilmiyor). |
| 19 | Hesap numaralandırma koruması (genel mesaj) | KISMİ | `route.ts:67-91` | Mesaj genel; ama zamanlama farkı ve 502 dalı varlığı sızdırıyor (bkz. Bulgu 2). |
| 20 | Token üretimi (32 bayt, SHA-256 hash, 1 saat, eski token silinir) | ÇALIŞIYOR | `lib/auth-email-token.ts:15-36`, `route.ts:68` | Güvenli tasarım; yan etkisi: her yeni istek önceki linki öldürür (bkz. Bulgu 5). |
| 21 | Sıfırlama e-postası (HTML + düz metin) | KISMİ | `lib/email.ts:91-119` | Konu ve gövde sabit Türkçe; `User.preferredLanguage` kullanılmıyor. |
| 22 | Doğrulanmamış hesap davranışı | EKSİK | `route.ts:67` | E-postası doğrulanmamış kullanıcıya hiçbir şey gitmez ve yönlendirme yapılmaz; doğrulama mailini yeniden gönderme yolu yok. |
| 23 | "Girişe dön" bağlantısı (callback korunarak) | ÇALIŞIYOR | `page.tsx:91-98` | |
| 24 | Kayıt sayfasından "şifremi unuttum" girişi | ÇALIŞIYOR | `app/(auth)/auth/register/page.tsx:455-460` | Buradan `callbackUrl` taşınmıyor. |
| 25 | Girişten e-posta ön doldurma | EKSİK | `login/page.tsx:78-81` | Login'de yazılan e-posta forgot sayfasına geçmiyor; kullanıcı tekrar yazıyor. |
| 26 | Mail yapılandırması ön kontrolü | EKSİK | `login/page.tsx:83-103` (login'de var), `page.tsx` (yok) | Kullanıcı formu doldurup gönderdikten sonra öğreniyor. |
| 27 | Kalıcı "gelen kutunu kontrol et" başarı ekranı | EKSİK | `page.tsx:48-52` | Form aynen kalıyor, toast ~4 sn sonra kayboluyor. |
| 28 | Yeniden gönderme geri sayımı / cooldown | EKSİK | `page.tsx:85` | Arka arkaya basmak mümkün; her basış önceki linki geçersiz kılar. |
| 29 | Satır içi hata metni + `aria-describedby` / `aria-invalid` | EKSİK | `page.tsx:74-82` | Hatalar yalnızca toast'ta. |
| 30 | Alternatif: sihirli bağlantıyla giriş önerisi | EKSİK | `login/page.tsx:225-262` (login'de var) | Şifresini unutanın en hızlı yolu çoğu zaman magic link; bu sayfada önerilmiyor. |
| 31 | Oturumu açık kullanıcı için davranış | EKSİK | `proxy.ts:46-74` (`/auth` kapsanmıyor) | Oturum açıkken de form gösteriliyor; "zaten giriş yaptınız / şifreyi ayarlardan değiştir" yönlendirmesi yok. |

---

## Bulgular

### 1. `callbackUrl` filtresi ters bölüyle baypas ediliyor → resmi QRATEX e-postası üzerinden açık yönlendirme
- **Önem:** yüksek · **Kategori:** güvenlik
- **Kanıt:** `lib/safe-callback-url.ts:13` (`if (s.startsWith('/') && !s.startsWith('//')) return s;`), `app/api/auth/forgot-password/route.ts:70-73`, `app/(auth)/auth/reset-password/page.tsx:22-25, 59-62`, `app/(auth)/auth/login/page.tsx:67, 125-126`
- **Sorun:** `"/\evil.com"` değeri `/` ile başlıyor ve `//` ile başlamıyor, filtreden geçiyor. WHATWG URL ayrıştırıcısı özel şemalarda `\`'yı `/` sayar; `window.location.href = '/\\evil.com'` tarayıcıda `//evil.com` yani harici bir host olur. Saldırı zinciri: saldırgan kurbanın e-postasıyla `{"email":"kurban@…","callbackUrl":"/\\evil.com"}` gönderir → sunucu aynı filtreyle doğrular (`route.ts:70`) ve **gerçek QRATEX alan adından gelen gerçek bir sıfırlama mailine** bu callback'i koyar → kurban şifresini sıfırlar → reset sayfası `/auth/login?callbackUrl=/\evil.com`'a gönderir → login başarılı olunca `login/page.tsx:126` ham değeri `window.location.href`'e yazar → kurban, yeni şifresini girdiği hemen sonra sahte "oturum süresi doldu, tekrar giriş yap" sayfasına düşer. Ayrıca login sayfası `callbackUrl`'yi hiç doğrulamıyor (`login/page.tsx:67,126`) — bu ayrı ama aynı zincirin son halkası.
- **Profesyonel öneri:** `safePostLoginRedirect`'i ayrıştırmaya dayalı hale getirin: `new URL(s, allowedOrigin)` ile çözün, `origin` eşitliğini zorunlu kılın, ham girdide `\`, kontrol karakteri (`\t\r\n`) veya `/%5C` görürseniz reddedin, çıkışı her zaman `pathname+search+hash` olarak yeniden kurun. Login sayfasında da `redirectAfterLogin` aynı fonksiyondan geçmeli. Ek savunma: callback'i e-posta linkine hiç koymayın; sunucuda token satırına `redirectPath` sütunu olarak kaydedip reset sonrası oradan okuyun (link kısalır, manipülasyon yüzeyi kapanır). Birim testi: `/\evil.com`, `/\/evil.com`, `/%5Cevil.com`, `\t//evil.com`, `https://qratex.app.evil.com`.
- **Efor:** S

### 2. Zamanlama ve 502 dalı hesabın varlığını sızdırıyor (hesap numaralandırma)
- **Önem:** yüksek · **Kategori:** güvenlik
- **Kanıt:** `app/api/auth/forgot-password/route.ts:62-82`
- **Sorun:** Var olmayan e-posta için tek `findUnique` sonrası anında 200 dönülüyor. Var olan ve doğrulanmış e-posta için bir Prisma transaction'ı (`lib/auth-email-token.ts:28-33`) **artı senkron SMTP/Resend gönderimi** bekleniyor (tipik 300 ms – 3 sn). Bu fark tek istekle bile ayırt edilebilir; yani "bu kişi QRATEX'te kayıtlı mı" sorusu IP başına 15 dakikada 8 kez yanıtlanabilir. Ayrıca gönderim başarısız olursa yalnızca var olan hesapta 502 ve ham `sent.error` metni dönüyor (`route.ts:75-80`) — hem ikinci bir varlık sinyali hem de SMTP iç hata metninin istemciye sızması.
- **Profesyonel öneri:** Yanıtı gönderimden ayırın: token'ı üretip mail gönderimini `after()` (Next.js) ya da kuyruk ile arka plana atın ve her durumda aynı 200 + aynı gövdeyi hemen döndürün. Var olmayan e-posta dalına da benzer süre için sabit bir taban gecikme (ör. 250-400 ms jitter) ekleyin. Gönderim hatasını istemciye değil log/Sentry'ye ve admin "mail sağlığı" paneline yazın. Projede `after()` deseni zaten feedback akışında kullanılıyor; aynı yaklaşım burada da uygulanabilir.
- **Efor:** S

### 3. Karışık harfli e-postayla kayıtlı kullanıcılar şifre sıfırlayamıyor (sessiz başarısızlık)
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / işlevsellik
- **Kanıt:** `app/api/auth/forgot-password/route.ts:61-65` (`parsed.data.email.toLowerCase()` ile `findUnique`), `app/api/auth/register/route.ts:40, 45, 60` (e-posta normalize edilmeden saklanıyor), `lib/validations.ts:26-29` (şemada `.toLowerCase()`/`.trim()` dönüşümü yok), `lib/auth.ts:137` (giriş de ham değerle arıyor), `prisma/schema.prisma:31` (`email String @unique`, büyük/küçük harf duyarlı)
- **Sorun:** "Ahmet@Gmail.com" diye kaydolan kullanıcı aynı yazımla giriş yapabiliyor, ama şifresini unuttuğunda forgot-password `ahmet@gmail.com`'u arıyor, bulamıyor ve yine de "bağlantı gönderildi" diyor. Kullanıcı mail beklerken hiçbir şey gelmiyor; destek talebine dönüşür. Mobil klavyeler ilk harfi otomatik büyüttüğü için bu senaryo nadir değil. Aynı nedenle "Ahmet@…" ve "ahmet@…" iki ayrı hesap olarak da açılabilir.
- **Profesyonel öneri:** Tek bir `normalizeEmail()` yardımcısı (trim + lowercase) yazıp kayıt, giriş (`authorize`), magic-link, forgot-password, OAuth bağlama ve admin kullanıcı oluşturma yollarının hepsinde kullanın; zod şemalarına `.trim().toLowerCase()` dönüşümü ekleyin. Mevcut veri için bir kerelik göç: çakışma raporu üreten salt-okunur betik → çakışmaları elle birleştir → `UPDATE "User" SET email = lower(email)` → isteğe bağlı `CREATE UNIQUE INDEX ON "User"(lower(email))`. (Not: `DATABASE_URL` canlı Neon'u gösterdiği için bu göç ayrı ve onaylı bir operasyon olmalı.)
- **Efor:** M

### 4. E-posta başına sınır yok → mail bombalama ve gönderim kotasını tüketme
- **Önem:** orta · **Kategori:** güvenlik / operasyon
- **Kanıt:** `route.ts:20-21` (yalnız IP anahtarı), `lib/rate-limit.ts:345-362` (`email_forgot_password:${clientId}`), `lib/auth-email-token.ts:29`
- **Sorun:** Sınır yalnızca IP başına 8/15 dk. Dağıtık IP'lerle tek bir kurbana sınırsız sıfırlama maili gönderilebilir; her istek de projenin SMTP/Resend kotasından yer (Gmail SMTP günlük kotası dolarsa doğrulama, stajyer ve tüm işlem mailleri birlikte durur). Ayrıca her istek kurbanın bekleyen geçerli token'ını siler (`deleteMany`), yani saldırgan kurbanın sıfırlama yapmasını sürekli engelleyebilir.
- **Profesyonel öneri:** İkinci bir kova ekleyin: `email_forgot_password:email:${sha256(email)}` → ör. 3 / saat. Limit aşıldığında mail göndermeyin ama yanıtı aynı tutun. Token'ı her istekte yeniden üretmek yerine, son 2-5 dakika içinde üretilmiş geçerli token varsa yeni mail göndermeyin (veya aynı token'ı yeniden kullanmak için plain değeri saklamadığınızdan, yeni token üretip eskisini 10 dk "grace" ile geçerli bırakın). Admin paneline "son 24 saatte en çok sıfırlama isteği alan e-postalar" sinyali eklenebilir.
- **Efor:** S

### 5. Başarı deneyimi yalnızca kaybolan bir toast; tekrar basmak önceki linki sessizce öldürüyor
- **Önem:** orta · **Kategori:** UX
- **Kanıt:** `page.tsx:48-52` (toast), `page.tsx:85` (cooldown yok), `lib/auth-email-token.ts:29` (`deleteMany` önceki token'ları siler), `app/api/auth/reset-password/route.ts:44-45` ("Geçersiz veya süresi dolmuş bağlantı")
- **Sorun:** Gönderimden sonra form aynen kalıyor; toast birkaç saniyede kayboluyor. Kullanıcı mail gecikince "gitmedi galiba" diye tekrar basıyor → ilk mail geçersiz oluyor → kullanıcı ilk gelen maildeki linke tıklıyor → "Geçersiz veya süresi dolmuş bağlantı". Bu, şifre sıfırlama akışlarında en yaygın destek talebi nedenidir.
- **Profesyonel öneri:** Sayfayı iki adımlı bir durum makinesine çevirin: `form` → `sent`. `sent` durumunda kart içeriği değişsin: zarf ikonu/küçük animasyon, "**a\*\*\*@gmail.com** adresine bağlantı gönderdik (kayıtlıysa)", "Bağlantı 1 saat geçerli", "En son gelen maildeki linki kullanın" uyarısı, "Gmail'i aç / Outlook'u aç" kısayolları (alan adından türetilmiş, `mailto:` değil web inbox URL'si), 60 sn geri sayımlı "Tekrar gönder" butonu, "Farklı e-posta dene" linki. Odak `sent` başlığına taşınsın ve bölge `aria-live="polite"` olsun. Sunucu tarafında Bulgu 4'teki grace penceresi bu UX'i tamamlar.
- **Efor:** M

### 6. Son kullanıcıya yönetici talimatı ve sabit Türkçe sunucu metinleri gösteriliyor (TR/EN karışıklığı)
- **Önem:** orta · **Kategori:** i18n / UX
- **Kanıt:** `route.ts:24, 40, 50, 56, 78, 88` (tümü sabit Türkçe), `page.tsx:44-45, 48-49` (sunucu metni i18n anahtarına tercih ediliyor), `lib/email.ts:96-114` (mail konu/gövde yalnız Türkçe), `messages/en.json:2346` (kullanılmayan EN karşılığı)
- **Sorun:** İngilizce arayüzdeki kullanıcı başarı sonrası Türkçe uzun bir cümle görüyor; mail de Türkçe geliyor. Mail yapılandırılmamışsa tüketiciye "Yönetici: Vercel’de SMTP (Gmail) veya RESEND_API_KEY + EMAIL_FROM ayarlayın" metni gösteriliyor — hem güven kırıcı hem altyapı bilgisi sızdırıyor. Zod hata mesajı (`route.ts:56`) da İngilizce varsayılanlarla ("Invalid email") dönebilir, yani tek ekranda iki dil.
- **Profesyonel öneri:** API yalnızca makine okunur kod dönsün (`{ code: 'SENT' | 'MAIL_UNAVAILABLE' | 'INVALID_EMAIL' }`), istemci `t('auth.forgotPassword.*')` ile çevirsin. Yönetici metni yalnızca loglara/admin sağlık paneline gitsin; kullanıcıya "Şu an e-posta gönderemiyoruz, sihirli bağlantı veya destek ile devam et" gibi bir kurtarma yolu gösterilsin. `sendPasswordResetEmail`'e `locale` parametresi ekleyip `User.preferredLanguage` (veya istek `Accept-Language`/locale çerezi) ile konu ve gövdeyi seçin.
- **Efor:** S

### 7. Doğrulanmamış hesap ve sosyal girişli hesap için çıkmaz sokak
- **Önem:** orta · **Kategori:** UX / işlevsellik
- **Kanıt:** `route.ts:67` (`if (user?.emailVerified)` dışında hiçbir şey yapılmıyor), `app/api/auth/register/route.ts:56-63` (kayıtta `emailVerified: null`)
- **Sorun:** Kaydolup doğrulama mailini kaçıran kullanıcı şifresini de unutursa, bu sayfa ona "gönderildi" der ama mail hiç gelmez; doğrulama mailini yeniden isteyebileceği bir yol da gösterilmez. Kullanıcı kalıcı olarak hesabının dışında kalır.
- **Profesyonel öneri:** Numaralandırmayı bozmadan çözün: doğrulanmamış hesap için arka planda **doğrulama + şifre belirleme** birleşik bir mail gönderin ("Hesabını doğrulayıp yeni şifreni belirle"). Sayfa her durumda aynı genel `sent` ekranını gösterir; farkı yalnızca mailin içeriği yaratır. Böylece kullanıcı tek tıkla hem doğrular hem şifre belirler.
- **Efor:** M

### 8. Reset sonrası mevcut oturumlar düşürülmüyor (akışın devamı, bilgi amaçlı)
- **Önem:** orta · **Kategori:** güvenlik
- **Kanıt:** `lib/auth-email-token.ts:54-63` (yalnız `password` güncellenir), `prisma/schema.prisma` içinde `passwordChangedAt`/`tokenVersion` benzeri alan yok (grep ile doğrulandı), `lib/auth-email-token.ts:43-63` (`findFirst` + koşulsuz `update`, aynı token eşzamanlı iki kez kullanılabilir)
- **Sorun:** Şifre sıfırlamanın tipik nedeni "hesabım ele geçirildi" şüphesidir; ancak JWT oturumları reset'ten sonra da geçerli kalıyor. Ayrıca token tüketimi atomik değil (`updateMany where consumedAt: null` + `count` kontrolü yok). Bu bulgu `/auth/reset-password` sayfasının denetimine aittir; zincirin parçası olduğu için burada not edildi.
- **Profesyonel öneri:** `User.sessionsValidAfter DateTime?` ekleyin; reset'te `now()` yazın; JWT callback'inde `token.iat < sessionsValidAfter` ise oturumu düşürün (mevcut Redis token-replay katmanı bunun için doğal yer). Token tüketimini `updateMany({ where: { id, consumedAt: null }, data: { consumedAt } })` + `count === 1` kontrolüyle atomik yapın. Reset sonrası kullanıcıya "şifren değişti" güvenlik bildirimi maili gönderin.
- **Efor:** M

### 9. Rate-limit aşımında kullanıcı yanlış yönlendiriliyor
- **Önem:** düşük · **Kategori:** UX
- **Kanıt:** `route.ts:22-33` (200 + `success: true` + kısa mesaj), `page.tsx:48-49`
- **Sorun:** Numaralandırmayı engellemek için başarı dönmek doğru bir tercih; ancak mesaj diğer başarı mesajından farklı ("İsteğiniz alındı." vs uzun genel metin) — bu da limit durumunu ayırt ettiriyor. Kullanıcı ise mail gelmeyeceğini bilmeden bekliyor.
- **Profesyonel öneri:** Gövdeyi diğer başarı yanıtıyla birebir aynı yapın; istemcideki 60 sn yeniden gönderme sayacı (Bulgu 5) kullanıcıyı zaten limit altında tutar. `Retry-After` başlığını istemcide okuyup sayaca yansıtmak tutarlı bir his verir.
- **Efor:** S

### 10. Sayfa iskeleti üç auth sayfasında kopyala-yapıştır
- **Önem:** düşük · **Kategori:** mimari
- **Kanıt:** `forgot-password/page.tsx:16-24, 60-101` ile `reset-password/page.tsx:16-25, 70-…` neredeyse aynı (callback hesaplama, kart, Motion sarmalayıcı, Suspense fallback); `magic/page.tsx:66` aynı "Girişe dön" deseni
- **Sorun:** Bulgu 1'deki callback düzeltmesi, i18n kodları, başarı ekranı gibi değişiklikler her sayfada ayrı ayrı yapılmak zorunda; davranış zamanla ayrışır.
- **Profesyonel öneri:** `components/auth/auth-card.tsx` (başlık, açıklama, gövde, alt bağlantı, durum slotu) + `useSafeCallback()` hook'u (`searchParams` → güvenli callback + `loginHref`) çıkarın; forgot, reset, magic, verify-email bunları kullansın.
- **Efor:** S

### 11. Küçük erişilebilirlik ve mobil eksikleri
- **Önem:** düşük · **Kategori:** erişilebilirlik / mobil
- **Kanıt:** `page.tsx:74-82` (`aria-invalid`, `aria-describedby`, `autoFocus`, `inputMode`, `enterKeyHint` yok), `page.tsx:44-54` (tüm hatalar toast), `auth-shell.tsx:62` (logo `mounted` sonrası çiziliyor)
- **Sorun:** Ekran okuyucu kullanıcısı hata mesajını alanla ilişkili duymuyor; toast kaybolduktan sonra tekrar okunamıyor. Mobilde klavye "Gönder" tuşu yerine "Git" gösteriyor. Header logo ilk karede yok (hafif layout kayması).
- **Profesyonel öneri:** Alanın altına `role="alert"` satır içi hata + `aria-describedby`; `enterKeyHint="send"`, `autoCapitalize="none"`, `spellCheck={false}`; sayfa açılışında e-posta alanına odak (yalnız masaüstünde, mobilde klavye sürprizini önlemek için `matchMedia('(pointer:fine)')` koşuluyla). Logoyu `dark:` sınıflarıyla zaten ayırdığınız için `mounted` koşulu kaldırılabilir.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

- **Kalıcı "Gelen kutunu kontrol et" ekranı + maskeli e-posta + mail uygulamasını aç kısayolları** — Monzo, Revolut, Spotify ve Duolingo'nun hepsi gönderim sonrası ayrı bir onay ekranı gösterir; QRATEX yalnızca toast gösteriyor.
- **Geri sayımlı "Tekrar gönder" ve "farklı e-posta dene"** — Revolut/Monzo standart deseni; tekrar gönderimin eski linki öldürmesi sorununu da UX tarafında yönetir.
- **Tek tıkla alternatif giriş: sihirli bağlantı veya 6 haneli kod** — Starbucks ve Monzo, şifre sıfırlamak yerine "e-postana gelen kodla giriş yap" seçeneği sunar. QRATEX'te magic-link altyapısı zaten var (`app/api/auth/magic-link`), bu sayfada önerilmiyor.
- **Uygulama içi derin link / PWA ile açılış** — Mobil uygulama hissi veren ürünlerde sıfırlama linki yüklü PWA'da açılır; şu an link her zaman tarayıcıda açılıyor (doğrulanmadı: next-pwa `scope`/`handle_links` ayarı incelenmedi).
- **Güvenlik bildirimi** — "Şifre sıfırlama istendi" ve "şifren değişti" mailleri, "bu sen değilsen hesabını kilitle" bağlantısıyla (Revolut/Monzo standardı).
- **Kullanıcının dilinde mail ve arayüz metni** — Duolingo/Spotify mailleri hesap diline göre gelir; QRATEX'te mail ve sunucu metinleri sabit Türkçe.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Şifresini unutan tüketici, puanlarını ve rozetlerini kaybetme kaygısıyla gelir. Bu sayfa 30 saniyede onu güvenle hesabına geri döndürmeli ve "bir şey ters gitti" hissini değil, "hesabım güvende" hissini bırakmalı. Oyunlaştırma burada yer almamalı; doğru ton Monzo/Revolut'un sakin, güven veren kurtarma ekranıdır.

**Yerleşim (tek kart, üç durum):**
1. **`form`** — Başlık "Hesabına geri dönelim", kısa açıklama. E-posta alanı (login'den `?email=` ile ön dolu, masaüstünde odaklı). Birincil buton "Sıfırlama bağlantısı gönder". Altta ince ayraçla ikincil seçenek: "Ya da e-postana gelen bağlantıyla şifresiz giriş yap" (magic-link aynı e-postayla tetiklenir). En altta "Girişe dön".
2. **`sent`** — Kart içeriği yumuşak bir geçişle değişir: zarf ikonu, "a\*\*\*@gmail.com adresini kontrol et", "Bağlantı 1 saat geçerli · en son gelen maili kullan", "Gmail'i aç" / "Outlook'u aç" düğmeleri (alan adından türetilir), 60 sn geri sayımlı "Tekrar gönder", "Farklı e-posta dene". Bölge `aria-live="polite"`, odak başlığa taşınır.
3. **`unavailable`** — Mail servisi kapalıysa (sayfa açılışında `/api/public/auth-features` ile önceden bilinir): form yerine "Şu an e-posta gönderemiyoruz" + destek iletişim bilgisi; yönetici talimatı asla gösterilmez.

**Motion (ölçülü):** Mevcut 8px fade-up girişi yeterli. `form → sent` geçişinde `AnimatePresence` ile 200 ms çapraz geçiş ve zarf ikonunun tek seferlik küçük "uçma" hareketi (Lottie veya SVG path; three.js gereksiz ve bu sayfa için abartılı). Global `MotionConfig reducedMotion="user"` zaten tüm bunları azaltılmış harekette kapatır.

**Veri / API değişiklikleri:**
- `normalizeEmail()` tüm auth yollarında + tek seferlik e-posta küçük harf göçü (Bulgu 3).
- `safePostLoginRedirect` sertleştirme + login'de kullanım; tercihen callback'i token satırında saklama (Bulgu 1).
- `POST /api/auth/forgot-password`: gönderim `after()` ile arka planda, yanıt her durumda aynı ve sabit süreli; yanıt gövdesi `{ code }` (Bulgu 2, 6, 9).
- E-posta başına kova + 2-5 dk içinde tekrar istekte yeni mail göndermeme / grace penceresi (Bulgu 4, 5).
- Doğrulanmamış hesaba "doğrula + şifre belirle" birleşik maili (Bulgu 7).
- `sendPasswordResetEmail(to, url, name, locale)` ve "şifren değişti" bildirimi; `User.sessionsValidAfter` ile oturum düşürme (Bulgu 6, 8).
- `components/auth/auth-card.tsx` + `useSafeCallback()` ortak katmanı (Bulgu 10).

---

## Çakışmalar / birleştirme önerisi

- **`/auth/reset-password`:** Aynı kurtarma akışının ikinci adımı ve kodun büyük kısmı kopya. Ayrı route olarak kalmalı (e-postadaki link oraya gelir), ama ortak `AuthCard` + `useSafeCallback` katmanına taşınmalı; başarı/hata metinleri aynı i18n ad alanında toplanmalı (`auth.recovery.*`).
- **`/auth/magic` ve login içindeki magic-link bölümü (`login/page.tsx:225-262`):** "Şifremi unuttum" ile amaç olarak örtüşüyor (ikisi de "e-postama link gönder"). Kaldırma önerilmez; bunun yerine forgot-password sayfası magic-link'i ikincil seçenek olarak sunmalı, böylece kullanıcı iki ayrı yerde e-posta yazmaz.
- **`/auth/verify-email`:** Doğrulanmamış hesap senaryosunda (Bulgu 7) bu akışla birleşik bir "doğrula + şifre belirle" maili, iki sayfanın kesişimini tek adımda çözer.
- Sayfanın kaldırılması veya birleştirilmesi **önerilmez**; standart ve gerekli bir hesap kurtarma adımıdır.

---

## Doğrulama (şüpheci inceleme)

Üç iddia da kod baştan okunarak çürütülmeye çalışıldı (salt okunur; DB, build, test, dev server çalıştırılmadı). Üçü de **doğrulandı**; ikincisinin pratik şiddeti iddia edilenden biraz düşük.

### 1. `safePostLoginRedirect` ters bölü baypası → resmi mail üzerinden açık yönlendirme — **DOĞRULANDI**

- `lib/safe-callback-url.ts:13`: `s.startsWith('/') && !s.startsWith('//')` → `/\evil.com` olduğu gibi döner; origin kontrolüne (satır 15-24) hiç ulaşılmaz.
- `app/api/auth/forgot-password/route.ts:16` callbackUrl'i yalnız `max(2048)` ile alır; `:70-73` filtreden geçen değeri `URLSearchParams` ile (`\` → `%5C`) resmi QRATEX mailindeki linke yazar (`lib/email.ts:91-106`).
- `app/(auth)/auth/reset-password/page.tsx:20-25` değeri decode edip aynı zayıf filtreden yine geçirir, `:59-62` başarıdan sonra `/auth/login?callbackUrl=%2F%5Cevil.com`'a gider.
- `app/(auth)/auth/login/page.tsx:67` callbackUrl'i **hiç filtrelemeden** alır, `:125-126` girişten sonra `window.location.href = callbackUrl` yapar. WHATWG URL ayrıştırıcısı özel şemalarda (`https`) `\`'yı `/` sayar → `/\evil.com` = `//evil.com` → `https://evil.com/`. `proxy.ts` callbackUrl'e dokunmuyor (grep: eşleşme yok).
- **Yeniden üretim:** `curl -X POST /api/auth/forgot-password -d '{"email":"kurban@x.com","callbackUrl":"/\evil.com"}'` → kurban gerçek QRATEX mailini alır → linke tıklar, yeni şifre belirler → login'e düşer → giriş yapar → `https://evil.com`'a gönderilir ("oturumunuz düştü, tekrar giriş yapın" phishing'i için ideal an).
- **Ek not (iddiadan geniş):** Login sayfası kendi başına da açık yönlendirme: `/auth/login?callbackUrl=https://evil.com` doğrudan çalışır (satır 67/126'da hiçbir doğrulama yok). Asıl düzeltme iki katmanlı olmalı: (a) `safePostLoginRedirect`'i `new URL(s, allowedOrigin)` ile ayrıştırıp `u.origin === allowedOrigin` şartına bağlamak (`\`, `/%5C`, kontrol karakterleri, `/\t/` gibi tüm varyantları tek yerde kapatır); (b) login'in `redirectAfterLogin` ve Google `signIn` yolunda (satır 126, 267) aynı yardımcıyı zorunlu kullanmak. Tercihen callback, kullanıcıdan gelen ham string yerine token satırında saklanmalı.

### 2. Zamanlama ve 502 yanıtıyla hesap numaralandırma — **DOĞRULANDI (şiddet: orta)**

- `route.ts:62-65`: var olmayan / doğrulanmamış e-postada tek `findUnique` ve anında 200 (satır 84-91).
- `route.ts:67-74`: doğrulanmış hesapta `createAuthEmailToken` (`lib/auth-email-token.ts:28-33`, `deleteMany` + `create` içeren interaktif `$transaction`, Neon'a ek gidiş-dönüşler) ve ardından **senkron** `await sendPasswordResetEmail` (SMTP/Resend). Fark tipik olarak yüzlerce ms – saniyeler; ağ jitter'ından kolayca ayrışır.
- `route.ts:75-81`: gönderim hatası yalnız var olan + doğrulanmış hesapta 502 ve `sent.error` (ham sağlayıcı hata metni) döndürür. Bu dal saldırganın kolayca tetikleyebileceği bir durum değil (SMTP arızası/kota gerekir), ama arıza anında kesin ayırıcıdır ve iç hata metnini sızdırır.
- **Hafifletici:** `lib/rate-limit.ts:346-347,354-361` IP başına 15 dakikada 8 istek sınırı var; sınır aşımında da sabit 200 döner (satır 21-33), yani sınır kendisi sızdırmaz. Ayrıca her "isabet" kurbana gerçek bir sıfırlama maili gönderir (gürültülü). Yine de IP rotasyonu ile hedefli listeler (ör. bayi e-postaları) doğrulanabilir.
- **Yeniden üretim:** Aynı IP'den `bilinen-doğrulanmış@…` ve `rastgele-yok@…` için ardışık POST'ların süresini ölçün; ilki belirgin biçimde yavaş döner.
- **Öneri:** Token üretimi + gönderimi `after()` ile yanıt sonrasına taşıyın (proje zaten feedback akışında `after()` kullanıyor); yanıtı her dalda aynı gövde ve 200 ile döndürün; gönderim hatasını yalnız log/izleme tarafında raporlayın. E-posta başına ikinci bir kova (ör. 3 istek/saat) ekleyin.

### 3. Karışık harfli e-postayla kayıtlı kullanıcı şifre sıfırlayamıyor — **DOĞRULANDI**

- Kayıt: `lib/validations.ts:26-29` e-postayı ne `trim` ne `toLowerCase` eder; `app/(auth)/auth/register/page.tsx:95-100` ham değeri yollar; `app/api/auth/register/route.ts:40,44-45,60` aynen yazar.
- Giriş: `lib/auth.ts:136-137` `findUnique({ where: { email: cred.email } })` — ham değerle tam eşleşme; yani `Ahmet@Gmail.com` aynı yazımla giriş yapabilir.
- Şema: `prisma/schema.prisma:32` `email String @unique` — `citext` veya `lower()` indeksi yok (prisma klasöründe grep: eşleşme yok); `lib/prisma.ts`'te e-posta normalize eden `$extends` yok. Postgres karşılaştırması büyük/küçük harf duyarlı.
- Şifre sıfırlama: `route.ts:61` `toLowerCase()` → `ahmet@gmail.com` aranır, bulunamaz, satır 84-91 yine "gönderildi" der; mail hiç gelmez. Kullanıcı formu hangi harflerle doldurursa doldursun sonuç aynıdır.
- **Yeniden üretim:** `Ahmet@Gmail.com` ile kayıt ol → maildeki linkle doğrula → `/auth/forgot-password`'a `Ahmet@Gmail.com` yaz → başarı mesajı gelir, mail gelmez (kilitli kalma; destek talebi gerektirir).
- **Öneri:** Tek bir `normalizeEmail()` (trim + lowercase) yardımcısını register, credentials authorize, magic-link, forgot/reset, verify-email ve OAuth bağlama yollarında zorunlu kullanın; canlı veride önce `lower(email)` çakışma raporu çıkarıp sonra tek seferlik göç ve `lower(email)` üzerinde benzersiz indeks (veya `citext`) ekleyin. Göç tamamlanana dek geçici olarak forgot-password'da `findFirst({ where: { email: { equals, mode: 'insensitive' } } })` kullanılabilir (çoklu eşleşmede gönderim yapılmamalı).

---

## Uygulama (Dalga 2)

Sahip: p-auth yüzeyi. A1 (ortak callback süzgeci, `after()` ile varlıktan bağımsız yanıt, e-posta başına sınır, normalize) korundu.

**Mimari:** `page.tsx` sunucu bileşeni — e-posta gönderiminin yapılandırılıp yapılandırılmadığı, bağlantıyla girişin açık olup olmadığı ve oturum durumu ilk HTML ile gelir. İki durumlu kart `forgot-password-view.tsx` (`form` → `sent`), mail kapalıysa üçüncü durum (`unavailable`).

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Logo | ÇALIŞIYOR | `mounted` kapısı kaldırıldı. |
| 2 | Tema | ÇALIŞIYOR | + TR/EN dil değiştirici. |
| 3 | İçeriğe geç | ÇALIŞIYOR | |
| 4 | Gradient zemin | KALDIRILDI | Ops kaydı. |
| 5 | Sekme başlığı + noindex | ÇALIŞIYOR | |
| 6 | Suspense yedeği | KALDIRILDI | Sunucu render. |
| 7 | Kart animasyonu | ÇALIŞIYOR | Tek CSS girişi. |
| 8 | Başlık ve açıklama | ÇALIŞIYOR | `h1`, "Şifreni sıfırla". |
| 9 | E-posta alanı | ÇALIŞIYOR | `enterKeyHint=send`, `autocapitalize=none`; girişte yazılan e-posta ön doldurulur. |
| 10 | Boş e-posta kontrolü | ÇALIŞIYOR | Satır içi mesaj. |
| 11 | Gönder butonu | ÇALIŞIYOR | |
| 12 | API çağrısı | ÇALIŞIYOR | İstemci sunucunun Türkçe cümlesini değil `code`'u okur (EN kullanıcıya TR metin yok). |
| 13 | Karışık harfli e-posta | ÇALIŞIYOR | A1 normalize. |
| 14 | callbackUrl taşıma | ÇALIŞIYOR | A1 süzgeci + istemci güvenli yol. |
| 15 | Başarı geri bildirimi | ÇALIŞIYOR | Kalıcı "Gelen kutunu kontrol et" kartı (odak başlığa taşınır, `aria-live`). |
| 16 | Mail yapılandırılmamış (503) | ÇALIŞIYOR | Sayfa açılışında bilinir; form yerine dürüst "şu an gönderemiyoruz" kartı, yönetici talimatı yok. |
| 17 | Genel/ağ hatası | ÇALIŞIYOR | Kalıcı bant. |
| 18 | Hız sınırı | ÇALIŞIYOR | A1 e-posta başına kova; `Retry-After` varsa yeniden gönder geri sayımına yansır. |
| 19 | Hesap sayımı koruması | ÇALIŞIYOR | A1 `after()`; doğrulanmamış hesap dalı da aynı yanıtı verir. |
| 20 | Token üretimi | ÇALIŞIYOR | |
| 21 | Sıfırlama e-postası dili | KALAN | Şablon TR; dile göre şablon ortak `lib/email.ts` + `User.preferredLanguage` işi (birden çok yüzeyi etkiler). |
| 22 | Doğrulanmamış hesap | ÇALIŞIYOR | Çıkmaz kapandı: sıfırlama yerine yeni doğrulama bağlantısı gönderilir; ekrandaki metin bunu söyler. |
| 23 | Girişe dön | ÇALIŞIYOR | 44px, callback korunur. |
| 24 | Kayıttan şifremi unuttum | ÇALIŞIYOR | "Zaten kayıtlı" bandından, callback + e-posta taşınır. |
| 25 | Girişten e-posta ön doldurma | ÇALIŞIYOR | sessionStorage (URL'de kişisel veri yok, 10 dk). |
| 26 | Mail yapılandırması ön kontrolü | ÇALIŞIYOR | Sunucuda. |
| 27 | Kalıcı "gelen kutunu kontrol et" | ÇALIŞIYOR | Gmail/Outlook kısayolları, "1 saat geçerli · en son geleni kullan" ipucu. |
| 28 | Yeniden gönderme geri sayımı | ÇALIŞIYOR | 60 sn (sunucu `Retry-After` verirse o). |
| 29 | Satır içi hata + aria | ÇALIŞIYOR | |
| 30 | Bağlantıyla giriş alternatifi | ÇALIŞIYOR | Açıksa "gönderildi" kartında aynı e-postaya tek dokunuşla giriş bağlantısı. |
| 31 | Oturumu açık kullanıcı | ÇALIŞIYOR | "X hesabıyla oturumun açık; şifreni ayarlardan değiştirebilirsin" bilgi bandı, başka hesap için form kullanılabilir. |

**Kapanan bulgular:** 1, 2, 3 (A1), 4 (A1), 5 (kalıcı ekran + geri sayım), 6 (kodlar; yönetici metni kaldırıldı), 7 (doğrulanmamış hesap dalı), 8 (A1 oturum iptali; sıfırlama sonrası "şifren değiştirildi" e-postası + denetim kaydı bu dalgada), 9, 10 (ortak AuthCard), 11 → 11/11.
**Kalanlar:** E-posta şablonlarının kullanıcının diline göre seçilmesi (ortak `lib/email.ts`).
**Doğrulama:** `__tests__/api/auth-p-auth.test.ts` (doğrulanmamış hesap → doğrulama bağlantısı, yanıt doğrulanmış hesapla aynı; askıdaki hesaba gönderim yok) + `__tests__/api/auth-email-routes.test.ts` yeşil.
